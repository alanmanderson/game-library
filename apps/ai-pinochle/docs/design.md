# Pinochle Multiplayer Game: Architecture & Implementation

## 1. High-Level Architecture

The system uses a **thin client, authoritative server** model. The server validates all moves, calculates scores, and controls information visibility (each player only sees their own hand).

### Clients

- **React Web App** (`web/`) — browser-based client.
- **React Native App** (`mobile/`) — iOS and Android.

Both clients share TypeScript types and constants via the `shared/` package.

### Server (`server/app/`)

- **FastAPI** application with async SQLAlchemy (PostgreSQL).
- **REST API** (`api/`) — authentication and game creation/joining.
- **WebSocket** (`websocket/`) — real-time game play. One persistent connection per player per game.
- **Game Engine** (`engine/`) — pure-logic modules for dealing, bidding, meld calculation, trick play, and scoring. No I/O or database dependencies.

### Data Persistence

All state lives in **PostgreSQL**. There is no Redis layer. Active game state is stored as a JSONB blob in `games.current_state_json` and updated after every valid action.

---

## 2. Database Schema (PostgreSQL)

Only two tables exist. All per-hand state (bidding, tricks, melds, scores) lives inside `current_state_json` rather than normalized tables.

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID, PK | Default `gen_random_uuid()` |
| `username` | VARCHAR, UNIQUE, NOT NULL | Set to email on registration |
| `email` | VARCHAR, UNIQUE, Nullable | |
| `password_hash` | VARCHAR, Nullable | bcrypt hash; null for Google-only accounts |
| `google_auth_id` | VARCHAR, UNIQUE, Nullable | Google OAuth subject ID |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `deleted_at` | TIMESTAMP, Nullable | Soft delete |

### `games`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID, PK | Default `gen_random_uuid()` |
| `room_code` | VARCHAR(6), UNIQUE, NOT NULL | 4 uppercase letters (e.g., `"ABCD"`) |
| `status` | ENUM: `IN_PROGRESS`, `COMPLETED`, `ABANDONED` | |
| `north_player_id` | UUID, FK → `users.id`, Nullable | |
| `east_player_id` | UUID, FK → `users.id`, Nullable | |
| `south_player_id` | UUID, FK → `users.id`, Nullable | |
| `west_player_id` | UUID, FK → `users.id`, Nullable | |
| `ns_total_score` | INT, Default 0 | |
| `ew_total_score` | INT, Default 0 | |
| `current_state_json` | JSON, Nullable | Full game state snapshot |
| `started_at` | DATETIME, Nullable | Set when first hand is dealt |
| `ended_at` | DATETIME, Nullable | |

---

## 3. Game Engine State Machine

### Phases

| Phase | Description | Advances When |
|-------|-------------|---------------|
| `LOBBY_WAITING` | Room created, players selecting seats | Host sends `START_GAME` with all 4 seats filled |
| `BIDDING` | Players bid clockwise, starting left of dealer | 3 players pass |
| `NAMING_TRUMP` | Bid winner declares trump suit | `DECLARE_TRUMP` received |
| `PASSING_CARDS` | Bidding team partners swap 3 cards each | Both partners submit |
| `SHOWING_MELD` | Server calculates melds; all players acknowledge | All 4 send `ACKNOWLEDGE_MELD` |
| `TRICK_PLAYING` | 12-trick loop with legal card enforcement | All 12 tricks complete |
| `HAND_COMPLETE` | Hand scored; awaiting acknowledgment | All 4 send `ACKNOWLEDGE_HAND_RESULT` |

After `HAND_COMPLETE`, the game loops back to `BIDDING` with a new dealer (one seat clockwise).

### `current_state_json` Structure

```json
{
  "room_code": "ABCD",
  "phase": "TRICK_PLAYING",
  "game_scores": { "NS": 85, "EW": 62 },
  "player_hands": {
    "NORTH": ["AH", "10H", "KS", ...],
    "EAST": [...],
    "SOUTH": [...],
    "WEST": [...]
  },
  "current_hand": {
    "hand_number": 4,
    "dealer_seat": "EAST",
    "bidding": {
      "winning_bid": 25,
      "winning_seat": "SOUTH",
      "is_shoot_the_moon": false,
      "next_to_act_seat": "WEST",
      "passed_seats": ["NORTH", "EAST", "WEST"]
    },
    "trump_suit": "HEARTS",
    "card_passing": {
      "bidding_team": "NS",
      "bidder_seat": "SOUTH",
      "partner_seat": "NORTH",
      "submitted": {
        "SOUTH": ["9S", "JD", "QC"],
        "NORTH": ["9H", "10D", "AC"]
      }
    },
    "player_melds": {
      "NORTH": {
        "melds": [
          { "name": "Run", "cards": ["AH", "10H", "KH", "QH", "JH"], "points": 15 }
        ],
        "total": 15
      },
      "EAST": { "melds": [], "total": 0 },
      "SOUTH": { "melds": [...], "total": 10 },
      "WEST": { "melds": [...], "total": 0 }
    },
    "team_meld": { "NS": 25, "EW": 0 },
    "meld_acknowledged_seats": ["NORTH", "EAST", "SOUTH", "WEST"],
    "trick_play": {
      "trick_number": 7,
      "led_seat": "SOUTH",
      "next_to_act_seat": "WEST",
      "cards_played": [
        { "seat": "SOUTH", "card": "AS" },
        { "seat": "WEST", "card": "9S" }
      ],
      "tricks_taken": { "NS": 4, "EW": 2 },
      "trick_scores": { "NS": 15, "EW": 6 }
    },
    "score_deltas": { "NS": 40, "EW": 6 },
    "hand_result_acknowledged_seats": []
  }
}
```

Fields are added progressively — `card_passing` exists only during/after `PASSING_CARDS`, `trick_play` only during/after `TRICK_PLAYING`, etc.

### Card Notation

Format: `{Rank}{Suit}` — e.g., `"AH"`, `"10S"`, `"9C"`, `"KD"`.

- **Ranks:** `A`, `10`, `K`, `Q`, `J`, `9`
- **Suits:** `H` (hearts), `S` (spades), `D` (diamonds), `C` (clubs)

### Scoring Rules

**Trick card points:** A = 1, 10 = 1, K = 1, Q = 0, J = 0, 9 = 0. Last trick (trick 12) earns +1 bonus. Total available per hand: 25 points.

**Hand scoring:**
- **Bidding team:** if they took zero tricks, score negative bid (set). Otherwise, total = meld + trick points. If total ≥ bid, score the total. If total < bid, score negative bid (set).
- **Non-bidding team:** if they took any tricks, score their meld + trick points. If zero tricks, score 0.

### Meld Types

| Meld | Cards | Points | Double Points |
|------|-------|--------|---------------|
| Run | A-10-K-Q-J of trump | 15 | 150 (Double Run) |
| Aces Around | A of each suit | 10 | 100 |
| Kings Around | K of each suit | 8 | 80 |
| Queens Around | Q of each suit | 6 | 60 |
| Jacks Around | J of each suit | 4 | 40 |
| Pinochle | JD + QS | 4 | 30 (Double Pinochle) |
| Royal Marriage | K + Q of trump | 4 | — |
| Marriage | K + Q of non-trump | 2 | — |
| Dix | 9 of trump | 1 each | — |

"Double" versions require two of every card in the meld.

### Legal Card Rules (Trick Play)

1. **Must follow suit** if able.
2. **If can't follow suit, must trump** if able.
3. **If neither, play anything.**
4. **Must head the trick** — if any legal candidate would win the current trick, you must play one that wins.

---

## 4. API & WebSocket Contracts

### REST API

#### `POST /auth/register`

```json
// Request
{ "email": "alice@example.com", "password": "s3cr3t!" }

// 201 Created
{ "id": "uuid", "username": "alice@example.com", "email": "alice@example.com",
  "access_token": "eyJ...", "token_type": "bearer" }

// 409 Conflict
{ "detail": "email already taken" }
```

#### `POST /auth/login`

```json
// Request
{ "email": "alice@example.com", "password": "s3cr3t!" }

// 200 OK — same AuthResponse shape as register

// 401 Unauthorized
{ "detail": "invalid email or password" }
```

#### `POST /auth/google`

```json
// Request
{ "token": "<Google OAuth token>" }

// 200 OK — same AuthResponse shape (creates account on first login)

// 401 Unauthorized
{ "detail": "invalid Google token" }
```

#### `POST /games/create` (authenticated)

```json
// 201 Created
{ "room_code": "ABCD" }
```

#### `POST /games/{room_code}/join` (authenticated)

```json
// 200 OK
{
  "room_code": "ABCD",
  "game_id": "uuid",
  "phase": "LOBBY_WAITING",
  "seats": {
    "north": "alice@example.com",
    "east": null,
    "south": null,
    "west": null
  }
}
```

### WebSocket Connection

Connect to `ws://<host>/ws/{room_code}?token=<jwt>`.

On connect, server sends `LOBBY_STATE_UPDATED` with current seats and replays phase-appropriate state for reconnecting players (see Section 5).

### WebSocket Actions (Client → Server)

All client messages: `{ "action": "<ACTION>", "payload": { ... } }`

#### `SELECT_SEAT`

```json
{ "action": "SELECT_SEAT", "payload": { "seat": "NORTH" } }
```

Phase: `LOBBY_WAITING`. Unseats the player from any other seat first. If the seat is already occupied by someone else, sends `SEAT_CLAIM_FAILED` to the requester.

#### `START_GAME`

```json
{ "action": "START_GAME", "payload": {} }
```

Phase: `LOBBY_WAITING`. Requires all 4 seats occupied. Shuffles, deals 12 cards per player, picks random dealer, sets first bidder to dealer's left.

#### `SUBMIT_BID`

```json
{ "action": "SUBMIT_BID", "payload": { "amount": 26 } }
// or pass:
{ "action": "SUBMIT_BID", "payload": { "amount": null } }
```

Phase: `BIDDING`. Minimum bid is 25. Each bid must exceed the previous by at least 1. Dealer cannot pass if all others passed and no bid exists yet.

#### `DECLARE_TRUMP`

```json
{ "action": "DECLARE_TRUMP", "payload": { "suit": "HEARTS", "shoot_the_moon": false } }
```

Phase: `NAMING_TRUMP`. Only the bid winner can declare. Valid suits: `HEARTS`, `DIAMONDS`, `CLUBS`, `SPADES`.

#### `PASS_CARDS`

```json
{ "action": "PASS_CARDS", "payload": { "cards": ["9S", "JD", "QC"] } }
```

Phase: `PASSING_CARDS`. Only bidding team members. Exactly 3 cards from the player's hand. After both partners submit, cards are swapped and melds are calculated.

#### `ACKNOWLEDGE_MELD`

```json
{ "action": "ACKNOWLEDGE_MELD", "payload": {} }
```

Phase: `SHOWING_MELD`. Each player sends once. After all 4 acknowledge, trick play begins.

#### `PLAY_CARD`

```json
{ "action": "PLAY_CARD", "payload": { "card": "AH" } }
```

Phase: `TRICK_PLAYING`. Only the player whose turn it is. Card must be in the legal cards list.

#### `ACKNOWLEDGE_HAND_RESULT`

```json
{ "action": "ACKNOWLEDGE_HAND_RESULT", "payload": {} }
```

Phase: `HAND_COMPLETE`. Each player sends once. After all 4, a new hand is dealt and bidding restarts.

### WebSocket Events (Server → Client)

All server messages: `{ "event": "<EVENT>", "payload": { ... } }`

#### `ERROR`

```json
{ "event": "ERROR", "payload": { "message": "It is not your turn to bid" } }
```

Personal. Sent when an action fails validation.

#### `LOBBY_STATE_UPDATED`

```json
{
  "event": "LOBBY_STATE_UPDATED",
  "payload": {
    "seats": {
      "NORTH": "alice@example.com",
      "EAST": null,
      "SOUTH": "bob@example.com",
      "WEST": null
    }
  }
}
```

Broadcast. Sent after `SELECT_SEAT` and on initial WebSocket connect. Seat values are usernames or `null`.

#### `SEAT_CLAIM_FAILED`

```json
{
  "event": "SEAT_CLAIM_FAILED",
  "payload": {
    "message": "The North seat was claimed by another player.",
    "requested_seat": "NORTH"
  }
}
```

Personal.

#### `HAND_DEALT`

```json
{ "event": "HAND_DEALT", "payload": { "cards": ["AH", "10H", "KS", ...] } }
```

Personal. 12 cards. Sent after `START_GAME`, after all 4 acknowledge hand result, and on reconnect.

#### `BIDDING_TURN`

```json
{
  "event": "BIDDING_TURN",
  "payload": {
    "current_highest_bid": null,
    "highest_bidder_seat": null,
    "next_to_act_seat": "EAST",
    "minimum_valid_bid": 25
  }
}
```

Broadcast. Sent after each bid/pass and at game start.

#### `BIDDING_COMPLETED`

```json
{
  "event": "BIDDING_COMPLETED",
  "payload": {
    "winning_seat": "SOUTH",
    "winning_bid": 25,
    "is_shoot_the_moon": false
  }
}
```

Broadcast. Sent when 3 players have passed.

#### `TRUMP_NAMED`

```json
{
  "event": "TRUMP_NAMED",
  "payload": {
    "trump_suit": "HEARTS",
    "declared_by_seat": "SOUTH",
    "bidding_team": "NS",
    "winning_bid": 25,
    "is_shoot_the_moon": false
  }
}
```

Broadcast.

#### `PASSING_PHASE_STARTED`

```json
{
  "event": "PASSING_PHASE_STARTED",
  "payload": {
    "trump_suit": "HEARTS",
    "bidding_team": "NS",
    "bidder_seat": "SOUTH",
    "partner_seat": "NORTH"
  }
}
```

Broadcast. Sent immediately after `TRUMP_NAMED`.

#### `CARDS_PASSED`

```json
{
  "event": "CARDS_PASSED",
  "payload": {
    "seat": "SOUTH",
    "submitted_seats": ["SOUTH"]
  }
}
```

Broadcast. Sent after each partner submits their 3 cards (so sent twice total).

#### `CARDS_RECEIVED`

```json
{
  "event": "CARDS_RECEIVED",
  "payload": {
    "cards_received": ["9H", "10D", "AC"],
    "new_hand": ["AH", "10H", "KH", "QH", "JH", "9H", "10D", "AC", ...]
  }
}
```

Personal. Sent to each bidding-team partner after the swap.

#### `MELD_BROADCAST`

```json
{
  "event": "MELD_BROADCAST",
  "payload": {
    "trump_suit": "HEARTS",
    "winning_bid": 25,
    "is_shoot_the_moon": false,
    "bidding_team": "NS",
    "team_meld": { "NS": 25, "EW": 4 },
    "player_melds": {
      "NORTH": {
        "melds": [
          { "name": "Run", "cards": ["AH", "10H", "KH", "QH", "JH"], "points": 15 }
        ],
        "total": 15
      },
      "EAST": { "melds": [], "total": 0 },
      "SOUTH": { "melds": [...], "total": 10 },
      "WEST": { "melds": [...], "total": 4 }
    }
  }
}
```

Broadcast. Sent after card swap completes.

#### `MELD_ACKNOWLEDGED`

```json
{
  "event": "MELD_ACKNOWLEDGED",
  "payload": {
    "seat": "NORTH",
    "acknowledged_seats": ["NORTH"]
  }
}
```

Broadcast. Sent for the 1st, 2nd, and 3rd acknowledgments.

#### `MELD_PHASE_COMPLETED`

```json
{
  "event": "MELD_PHASE_COMPLETED",
  "payload": {
    "team_meld": { "NS": 25, "EW": 4 },
    "first_to_act_seat": "SOUTH"
  }
}
```

Broadcast. Sent when the 4th player acknowledges meld.

#### `YOUR_TURN`

```json
{
  "event": "YOUR_TURN",
  "payload": {
    "seat": "SOUTH",
    "legal_cards": ["AS", "10S", "KS"],
    "trick_number": 3,
    "led_suit": "S",
    "cards_played": [
      { "seat": "NORTH", "card": "9S" }
    ],
    "currently_winning": { "seat": "NORTH", "card": "9S" }
  }
}
```

Personal. `led_suit` is `null` and `currently_winning` is `null` when leading. `cards_played` is `[]` when leading.

#### `CARD_PLAYED`

```json
{
  "event": "CARD_PLAYED",
  "payload": {
    "seat": "SOUTH",
    "card": "AS",
    "next_to_act_seat": "WEST"
  }
}
```

Broadcast. `next_to_act_seat` is `null` when the trick is complete (4th card played).

#### `TRICK_COMPLETED`

```json
{
  "event": "TRICK_COMPLETED",
  "payload": {
    "trick_number": 3,
    "winner_seat": "SOUTH",
    "cards_played": [
      { "seat": "NORTH", "card": "9S" },
      { "seat": "EAST", "card": "JS" },
      { "seat": "SOUTH", "card": "AS" },
      { "seat": "WEST", "card": "KS" }
    ],
    "trick_points": 3,
    "tricks_taken": { "NS": 2, "EW": 1 },
    "trick_scores": { "NS": 8, "EW": 3 }
  }
}
```

Broadcast.

#### `TRICK_STATE`

```json
{
  "event": "TRICK_STATE",
  "payload": {
    "trick_number": 7,
    "tricks_taken": { "NS": 4, "EW": 2 },
    "trick_scores": { "NS": 15, "EW": 6 },
    "led_seat": "SOUTH"
  }
}
```

Personal. Sent on reconnect during `TRICK_PLAYING` phase.

#### `HAND_COMPLETED`

```json
{
  "event": "HAND_COMPLETED",
  "payload": {
    "trick_scores": { "NS": 15, "EW": 10 },
    "team_meld": { "NS": 25, "EW": 4 },
    "bid": 25,
    "bidding_team": "NS",
    "score_deltas": { "NS": 40, "EW": 14 },
    "game_scores": { "NS": 125, "EW": 76 }
  }
}
```

Broadcast.

#### `HAND_RESULT_ACKNOWLEDGED`

```json
{
  "event": "HAND_RESULT_ACKNOWLEDGED",
  "payload": {
    "seat": "NORTH",
    "acknowledged_seats": ["NORTH"]
  }
}
```

Broadcast. Sent for the 1st, 2nd, and 3rd acknowledgments.

---

## 5. State Persistence & Reconnect

### Persistence

Game state is stored in `games.current_state_json` and updated after every valid WebSocket action:

```python
game.current_state_json = state
await db.flush()
```

The database commit happens once per message in the WebSocket route handler (`await db.commit()`).

### Reconnect

When a player connects to the WebSocket, the server sends `LOBBY_STATE_UPDATED` with current seats, then calls `_send_game_state_on_reconnect` which replays phase-appropriate events:

| Phase | Events Sent |
|-------|-------------|
| `LOBBY_WAITING` / `None` | Nothing (lobby state already sent) |
| `BIDDING` | `HAND_DEALT`, `BIDDING_TURN` |
| `NAMING_TRUMP` | `HAND_DEALT`, `BIDDING_COMPLETED` |
| `PASSING_CARDS` | `HAND_DEALT`, `TRUMP_NAMED`, `PASSING_PHASE_STARTED`, `CARDS_PASSED` (if any submitted) |
| `SHOWING_MELD` | `HAND_DEALT`, `MELD_BROADCAST`, `MELD_ACKNOWLEDGED` (if any acknowledged) |
| `TRICK_PLAYING` | `HAND_DEALT`, `MELD_PHASE_COMPLETED`, `TRICK_STATE`, `CARD_PLAYED` (for each card in current trick), `YOUR_TURN` (if it's this player's turn) |
| `HAND_COMPLETE` | `HAND_DEALT`, `HAND_COMPLETED`, `HAND_RESULT_ACKNOWLEDGED` (if any acknowledged) |

All reconnect events are sent as personal messages to the reconnecting player only.

---

## 6. Lobby Concurrency

### The Problem

Simultaneous `SELECT_SEAT` requests for the same seat could cause a race condition where one player's seat claim silently overwrites another's.

### The Solution

The `handle_select_seat` handler checks the seat column's current value before writing:

1. Load game from DB with `populate_existing=True` to bypass the SQLAlchemy identity map cache.
2. If the seat column is not null and the occupant is not the requesting player, send `SEAT_CLAIM_FAILED`.
3. Otherwise, set the column and flush.

If the player already occupies a different seat, they are unseated from it first (allowing seat-switching).
