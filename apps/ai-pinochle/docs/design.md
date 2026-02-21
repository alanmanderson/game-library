# Pinochle Multiplayer Mobile Game: Architecture Specification

## 1. High-Level Architecture

The system uses a **thin client, authoritative server** model to ensure competitive integrity, prevent cheating, and handle asynchronous mobile connectivity.

### Client-Side (Mobile App)

- **Auth & Profile UI:** Handles login (UN/PW, Google Auth) and displays user statistics.
- **Matchmaking & Lobby UI:** Manages game creation/joining via 4-6 letter (no numbers) Game IDs and seat selection (North, East, South, West).
- **Game Board UI (Asset Manager):** The image-based rendering engine for the 48-card deck, avatars, and animations.
- **Network Synchronization Client:** Wraps REST API calls for out-of-game actions and manages the WebSocket connection for real-time game state updates.

### Server-Side (Backend)

- **API Gateway / Auth Service:** Handles REST requests, validates tokens, and serves historical stats.
- **Lobby & Room Manager:** Generates unique Room IDs and manages concurrent seat selection.
- **WebSocket Pub/Sub Manager:** Maintains persistent TCP connections, routing client actions to game instances and broadcasting state updates.
- **Pinochle Game Engine (Source of Truth):** Validates all moves, calculates scores, limits information sent to clients (only sending a player's own hand), and drives the state machine.

### Data Persistence

- **In-Memory Store (Redis):** Holds the active, real-time game state for lightning-fast reads/writes during active play.
- **Relational Database (PostgreSQL):** The permanent system of record for users, match history, deep analytics, and paused game states.

---

## 2. Database Schema (PostgreSQL)

The database is normalized to support deep statistical queries (e.g., win rates, trick-taking success, bid history) and allows games to be paused and resumed days later via State Hydration.

### `users`
Authentication and profiles.

| Column | Type |
|--------|------|
| `id` | UUID, PK |
| `username` | VARCHAR, Unique |
| `email` | VARCHAR, Unique, Nullable |
| `password_hash` | VARCHAR, Nullable |
| `google_auth_id` | VARCHAR, Unique, Nullable |
| `created_at` | TIMESTAMP |
| `updated_at` | TIMESTAMP |
| `deleted_at` | TIMESTAMP, Nullable (soft deletes) |

### `games`
Tracks overall match data.

| Column | Type |
|--------|------|
| `id` | UUID, PK |
| `room_code` | VARCHAR(6) |
| `status` | ENUM: `IN_PROGRESS`, `COMPLETED`, `ABANDONED` |
| `north_player_id` | UUID, FK |
| `east_player_id` | UUID, FK |
| `south_player_id` | UUID, FK |
| `west_player_id` | UUID, FK |
| `ns_total_score` | INT |
| `ew_total_score` | INT |
| `current_state_json` | JSONB — stores active state to resume paused games |
| `started_at` | TIMESTAMP |
| `ended_at` | TIMESTAMP |

### `hands`
High-level summary of each round.

| Column | Type |
|--------|------|
| `id` | UUID, PK |
| `game_id` | UUID, FK |
| `hand_number` | INT |
| `winning_bidder_id` | UUID, FK |
| `winning_bid_amount` | INT |
| `is_shoot_the_moon` | BOOLEAN, Default False |
| `trump_suit` | ENUM |
| `ns_meld_score` | INT |
| `ew_meld_score` | INT |
| `ns_trick_score` | INT |
| `ew_trick_score` | INT |
| `is_set` | BOOLEAN |

### `bids`
Tracks the bidding war for a specific hand.

| Column | Type |
|--------|------|
| `id` | UUID, PK |
| `hand_id` | UUID, FK |
| `player_id` | UUID, FK |
| `bid_amount` | INT, Nullable (null = pass) |
| `is_shoot_the_moon` | BOOLEAN, Default False |
| `bid_sequence` | INT |

### `tricks`
Tracks the individual 12 rounds of card-playing per hand.

| Column | Type |
|--------|------|
| `id` | UUID, PK |
| `hand_id` | UUID, FK |
| `trick_number` | INT (1–12) |
| `led_by_player_id` | UUID, FK |
| `won_by_player_id` | UUID, FK |
| `north_card` | VARCHAR(2) |
| `east_card` | VARCHAR(2) |
| `south_card` | VARCHAR(2) |
| `west_card` | VARCHAR(2) |
| `trick_points` | INT |

---

## 3. Game Engine State Machine

The core loop ensuring all actions adhere to Pinochle rules. State lives in Redis while active and flushes to Postgres (`current_state_json`) when players disconnect.

1. **`LOBBY_WAITING`** — Room created. Host triggers `START_GAME` once all 4 seats are occupied.
2. **`DEALING`** — Server instantaneous state. Shuffles and assigns 12 cards per player.
3. **`BIDDING`** — Players submit bids, pass, or declare a "Shoot the Moon" bid. Ends when 3 players pass, or immediately on a successful Shoot the Moon bid.
4. **`NAMING_TRUMP`** — Winning bidder declares the trump suit.
5. **`SHOWING_MELD`** — Server calculates and broadcasts all melds. Players must send `ACKNOWLEDGE_MELD` before gameplay begins.
6. **`TRICK_PLAYING`** — The core 12-trick loop. Server determines legal cards, awaits a valid `PLAY_CARD` action, and determines the trick winner.
7. **`HAND_SCORING`** — Server tallies points. Applies Shoot the Moon win/loss condition if applicable, or checks if the bidding team was set. Updates game score. Transitions to `GAME_OVER` if a team hits the winning threshold, else loops to `DEALING`.
8. **`GAME_OVER`** — Match complete. Permanent data finalized in PostgreSQL.

---

## 4. API & WebSocket Contracts

### REST API (Out-of-game)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Creates a new user account, returns JWT |
| `POST` | `/auth/login` | Returns JWT |
| `POST` | `/auth/google` | Returns JWT |
| `GET` | `/users/{user_id}/stats` | Returns historical win/loss/trick records |
| `POST` | `/games/create` | Initializes a game, returns `{ room_id: "A7BX" }` |
| `POST` | `/games/{room_id}/join` | Validates room |

#### `POST /auth/register`

```json
// Request body
{ "username": "alice", "password": "s3cr3t!", "email": "alice@example.com" }

// 201 Created
{ "id": "uuid", "username": "alice", "email": "alice@example.com",
  "access_token": "eyJ...", "token_type": "bearer" }

// 409 Conflict — username or email already taken
{ "detail": "username already taken" }
```

### WebSocket Protocol (In-game JSON Payloads)

#### Lobby & Setup

```json
// Client -> Server
{ "action": "SELECT_SEAT", "payload": { "seat": "NORTH" } }

// Client -> Server (Host only)
{ "action": "START_GAME", "payload": {} }

// Server -> Client
{ "event": "LOBBY_STATE_UPDATED", "payload": { "host_id": "...", "seats": { ... } } }
```

#### Dealing & Bidding

```json
// Server -> Client (Private)
{ "event": "HAND_DEALT", "payload": { "cards": ["AH", "TH", ...] } }

// Server -> Client
{
  "event": "BIDDING_TURN",
  "payload": {
    "current_highest_bid": 25,
    "highest_bidder_seat": "NORTH",
    "next_to_act_seat": "EAST",
    "minimum_valid_bid": 26
  }
}

// Client -> Server
{ "action": "SUBMIT_BID", "payload": { "amount": 26, "shoot_the_moon": false } }
```

#### Trump Naming & Meld

```json
// Client -> Server
{ "action": "DECLARE_TRUMP", "payload": { "suit": "HEARTS" } }

// Server -> Client
{
  "event": "MELD_BROADCAST",
  "payload": {
    "trump_suit": "HEARTS",
    "winning_bid": 26,
    "is_shoot_the_moon": false,
    "bidding_team": "NS",
    "team_scores": { ... },
    "player_hands": { ... }
  }
}

// Client -> Server
{ "action": "ACKNOWLEDGE_MELD", "payload": {} }
```

#### Trick Playing

```json
// Server -> Client
{
  "event": "YOUR_TURN",
  "payload": {
    "trick_number": 1,
    "led_suit": "SPADES",
    "currently_winning_card": "TS",
    "currently_winning_seat": "NORTH",
    "legal_cards": ["AS", "KS", "QS"]
  }
}

// Client -> Server
{ "action": "PLAY_CARD", "payload": { "card": "KS" } }

// Server -> Client
{ "event": "CARD_PLAYED", "payload": { "seat": "SOUTH", "card": "KS" } }

// Server -> Client
{
  "event": "TRICK_COMPLETED",
  "payload": {
    "winner_seat": "NORTH",
    "trick_points_earned": 20,
    "ns_trick_score_total": 20,
    "ew_trick_score_total": 0,
    "next_to_lead": "NORTH"
  }
}
```

#### Scoring

```json
// Server -> Client
{
  "event": "HAND_COMPLETED",
  "payload": {
    "bidding_team": "NS",
    "bid_amount": 0,
    "is_shoot_the_moon": true,
    "ns_total_hand_points": 250,
    "ew_total_hand_points": 0,
    "bid_successful": true,
    "new_game_score": { "NS": 1500, "EW": 140 },
    "game_over": true
  }
}
```

---

## 5. Redis State Hydration

When a game sits idle for 30 minutes, it is evicted from Redis. The `current_state_json` in Postgres serves as the persistent backup, allowing games to be seamlessly resumed days later.

### Hydration Flow

When a client sends `{"action": "RESUME_GAME", "payload": {"room_code": "A7BX"}}`:

1. **Redis Check** — WebSocket Manager checks for key `game:A7BX` in Redis.
2. **Cache Hit (Active Game)** — Game is already awake. Server subscribes the user to the WebSocket room and sends a state sync event.
3. **Cache Miss (Sleeping Game)** — Server initiates the Hydration protocol:
   - **Acquire Lock** — Server runs `SETNX lock:A7BX` in Redis to prevent duplicate hydration if two players reconnect simultaneously.
   - **Fetch from DB** — `SELECT current_state_json FROM games WHERE room_code = 'A7BX' AND status = 'IN_PROGRESS';`
   - **Hydrate Redis** — Writes the JSON blob to `game:A7BX` with a 30-minute TTL.
   - **Release Lock** — Lock is removed.
4. **Engine Initialization** — Game Engine instantiates a new state machine in memory from the hydrated JSON.
5. **Client Sync** — Server broadcasts `STATE_RESTORED` to the reconnecting client.

### `current_state_json` Structure

Updated asynchronously in Postgres after every valid move during active gameplay.

```json
{
  "room_code": "A7BX",
  "phase": "TRICK_PLAYING",
  "game_scores": { "NS": 850, "EW": 620 },
  "current_hand": {
    "hand_number": 4,
    "dealer_seat": "EAST",
    "trump_suit": "SPADES",
    "bidding": {
      "winning_bid": 30,
      "winning_seat": "SOUTH",
      "is_shoot_the_moon": false
    },
    "team_meld": { "NS": 120, "EW": 40 }
  },
  "player_hands": {
    "NORTH": ["AH", "TH", "KS"],
    "EAST": ["AD", "TD", "KD"],
    "SOUTH": ["AS", "TS", "QS"],
    "WEST": ["AC", "TC", "KC"]
  },
  "current_trick": {
    "trick_number": 10,
    "led_by_seat": "NORTH",
    "led_suit": "HEARTS",
    "next_to_act_seat": "EAST",
    "cards_on_table": {
      "NORTH": "AH",
      "EAST": null,
      "SOUTH": null,
      "WEST": null
    }
  }
}
```

### `STATE_RESTORED` WebSocket Event

The server scrubs `player_hands` for the other three seats before sending, maintaining the rule of never exposing opponent cards.

```json
// Server -> Client (Private Sync Message)
{
  "event": "STATE_RESTORED",
  "payload": {
    "phase": "TRICK_PLAYING",
    "my_seat": "SOUTH",
    "scores": { "NS": 850, "EW": 620 },
    "trump_suit": "SPADES",
    "my_hand": ["AS", "TS", "QS"],
    "cards_on_table": {
      "NORTH": "AH",
      "EAST": null,
      "SOUTH": null,
      "WEST": null
    },
    "is_my_turn": false,
    "next_to_act_seat": "EAST",
    "legal_cards": []
  }
}
```

---

## 6. Lobby Concurrency: The Read-Modify-Write Trap

### The Problem

A naive implementation allows a race condition on seat selection:

1. Thread A (Player 1) reads: "Is North empty?" → YES
2. Thread B (Player 2) reads: "Is North empty?" → YES
3. Thread A writes Player 1 to North.
4. Thread B writes Player 2 to North, overwriting Player 1. *(Chaos ensues.)*

### The Solution: `HSETNX`

Use Redis's atomic `HSETNX` (Hash Set If Not Exists) command: *"Write my name into this seat ONLY IF it is currently empty."* Because Redis is single-threaded, it is physically impossible for two `HSETNX` commands to execute simultaneously.

### Concurrency Flow

When two players send `{"action": "SELECT_SEAT", "payload": {"seat": "NORTH"}}` simultaneously:

- **Player 1 (microsecond faster):** `HSETNX room:A7BX:seats NORTH player-uuid-1` → Returns `1` (Success). Server broadcasts updated lobby to all:

```json
{
  "event": "LOBBY_STATE_UPDATED",
  "payload": {
    "seats": { "NORTH": "player-uuid-1", "EAST": null, "SOUTH": null, "WEST": null }
  }
}
```

- **Player 2 (microsecond later):** `HSETNX room:A7BX:seats NORTH player-uuid-2` → Returns `0` (Failure). Server sends private error only to Player 2:

```json
{
  "event": "SEAT_CLAIM_FAILED",
  "payload": {
    "message": "The North seat was claimed by another player.",
    "requested_seat": "NORTH"
  }
}
```
