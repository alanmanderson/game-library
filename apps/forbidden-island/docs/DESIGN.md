# Forbidden Island Web Application - Design Document

## Context

We are building a web application version of the cooperative board game **Forbidden Island** by Gamewright (Matt Leacock, 2010). This is a greenfield project — the repo is empty aside from a `.mcp.json` with Playwright configured. The goal is a real-time multiplayer (2-4 player) web app with server-authoritative game logic, a rich visual UI, and full rule fidelity.

---

## Game Rules Summary

### Overview
- **Players:** 2-4, cooperative (all win or all lose)
- **Objective:** Collect 4 sacred treasures from a sinking island, then escape by helicopter
- **Play time:** ~30 minutes

### The 24 Island Tiles

Arranged in a diamond/cross pattern (rows of 2-4-6-6-4-2 = 24 tiles). Each tile has 3 states: **normal** -> **flooded** (flipped) -> **sunk** (removed permanently).

#### Treasure Tiles (8) — 2 per treasure
| Treasure | Tile 1 | Tile 2 |
|---|---|---|
| The Earth Stone | Temple of the Moon | Temple of the Sun |
| The Statue of the Wind | Howling Garden | Whispering Garden |
| The Crystal of Fire | Cave of Embers | Cave of Shadows |
| The Ocean's Chalice | Coral Palace | Tidal Palace |

#### Gate Tiles (5) — adventurer starting positions
| Tile | Role |
|---|---|
| Bronze Gate | Engineer (red) |
| Copper Gate | Explorer (green) |
| Gold Gate | Navigator (yellow) |
| Iron Gate | Diver (black) |
| Silver Gate | Messenger (white) |

#### Special Tile (1)
- **Fools' Landing** — Helicopter pad / escape point. Pilot (blue) starts here. If it sinks, the game is lost.

#### Other Tiles (10) — no special function
Breakers Bridge, Cliffs of Abandon, Crimson Forest, Dunes of Deception, Lost Lagoon, Misty Marsh, Observatory, Phantom Rock, Twilight Hollow, Watchtower

### Setup
1. Shuffle 24 tiles, lay face-up in diamond pattern on a 6x6 grid
2. Set treasure figurines aside
3. Draw 6 flood cards — flip those tiles to flooded side
4. Deal each player a random role + matching pawn on starting tile
5. Deal 2 treasure cards per player (redraw any Waters Rise!)
6. Set water meter to chosen difficulty

### Turn Structure (3 phases)
1. **Take up to 3 actions:** Move, Shore Up, Give Treasure Card, Capture Treasure
2. **Draw 2 treasure cards** (resolve Waters Rise! immediately)
3. **Draw flood cards** equal to current water level (2-5 cards)

### Actions
- **Move:** Move to adjacent tile (up/down/left/right). Cannot move to sunk tiles.
- **Shore Up:** Flip one flooded tile back to normal (your tile or adjacent)
- **Give Treasure Card:** Give 1 treasure card to a player on the same tile (1 action per card)
- **Capture Treasure:** Discard 4 matching cards while on a corresponding treasure tile

### Special Cards (in Treasure Deck)
- **Helicopter Lift (3):** Move 1+ pawns from same tile to any tile. Playable anytime, no action cost. Also used to escape and win.
- **Sandbags (2):** Shore up any tile anywhere. Playable anytime, no action cost.
- **Waters Rise! (3):** Immediately raise water level by 1, shuffle flood discard pile onto TOP of flood draw pile.

### 6 Adventurer Roles
| Role | Color | Special Ability |
|---|---|---|
| Explorer | Green | Move and shore up diagonally |
| Diver | Black | Move through flooded/sunk tiles to reach distant tile |
| Engineer | Red | Shore up 2 tiles for 1 action |
| Pilot | Blue | Fly to any tile once per turn (1 action) |
| Messenger | White | Give treasure cards to any player regardless of location |
| Navigator | Yellow | Move another player up to 2 tiles for 1 action |

### Water Meter
| Level | Flood Cards Drawn |
|---|---|
| 1-2 | 2 |
| 3-4 | 3 |
| 5-6 | 4 |
| 7-8 | 5 |
| 9 | Skull — instant loss |

### Difficulty (starting water level)
- Novice: 1, Normal: 2, Elite: 3, Legendary: 4

### Win Condition
All 3 must be true: (1) All 4 treasures captured, (2) All players on Fools' Landing, (3) A Helicopter Lift card is played

### Lose Conditions (any one)
1. Both tiles for an uncaptured treasure sink
2. Fools' Landing sinks
3. A player drowns (tile sinks, no adjacent tile to swim to)
4. Water meter reaches skull (level 9)

### Other Rules
- Hand limit: 5 cards (must discard immediately if exceeded)
- Treasure deck exhaustion: reshuffle discard into new draw pile
- Special cards cannot be traded via Give action
- Captured treasures are permanent even if both tiles later sink

---

## Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Runtime** | Node.js 20 | LTS, good WS support |
| **Backend framework** | Fastify | Fast, native TS, `@fastify/websocket` plugin |
| **WebSocket** | ws (via @fastify/websocket) | Battle-tested, low overhead |
| **Frontend framework** | React 18 | Industry standard, rich ecosystem |
| **Build tool** | Vite | Fast dev server, native TS |
| **State management** | Zustand | Minimal boilerplate, ideal for server-pushed state |
| **Styling** | CSS Modules + CSS custom properties | Scoped, no runtime overhead |
| **Animation** | Framer Motion | Declarative tile/card/pawn animations |
| **Validation** | Zod | Runtime validation of WS payloads |
| **IDs** | nanoid | Short, URL-safe IDs |
| **Testing** | Vitest + Playwright | Unit + E2E |
| **Monorepo** | npm workspaces + Turborepo | Simple, no extra tooling |

---

## Project Structure

```
/app/
├── package.json                    # Root workspace config
├── tsconfig.base.json              # Shared TS config
├── turbo.json                      # Turborepo pipeline
├── packages/
│   └── shared/                     # Shared types & constants
│       └── src/
│           ├── types/
│           │   ├── game.ts         # GameState, ClientGameState, phases
│           │   ├── cards.ts        # TreasureCard, FloodCard, deck types
│           │   ├── tiles.ts        # Tile, TileName, TileState, GridPosition
│           │   ├── players.ts      # Player, Role, RoleName
│           │   ├── actions.ts      # All game action types (discriminated union)
│           │   ├── lobby.ts        # LobbyState, GameListEntry
│           │   └── protocol.ts     # ClientMessage, ServerMessage (WS protocol)
│           ├── constants/
│           │   ├── board.ts        # BOARD_MASK, tile names, treasure mapping
│           │   ├── roles.ts        # Role definitions, starting tiles
│           │   ├── cards.ts        # Deck composition
│           │   └── rules.ts        # Water meter, difficulty levels
│           └── validation/
│               └── actions.ts      # Shared action validation (client + server)
├── apps/
│   ├── server/
│   │   └── src/
│   │       ├── index.ts            # Entry: HTTP + WS server
│   │       ├── server.ts           # Fastify setup
│   │       ├── ws/
│   │       │   ├── handler.ts      # WebSocket connection handler
│   │       │   └── rooms.ts        # Room/session management
│   │       ├── lobby/
│   │       │   └── routes.ts       # REST: GET /api/games, POST /api/games
│   │       └── engine/
│   │           ├── game-engine.ts       # Core state machine
│   │           ├── action-validator.ts  # Rule enforcement
│   │           ├── action-executor.ts   # State mutation
│   │           ├── flood-engine.ts      # Flood card logic
│   │           ├── treasure-engine.ts   # Treasure capture logic
│   │           ├── win-loss-checker.ts  # Win/loss evaluation
│   │           ├── deck-manager.ts      # Shuffle, draw, discard, reshuffle
│   │           ├── board-setup.ts       # Initial board generation
│   │           └── role-abilities.ts    # Role-specific modifiers
│   └── client/
│       ├── vite.config.ts
│       ├── index.html
│       ├── public/assets/          # Tile, card, role, treasure images
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── hooks/
│           │   ├── useWebSocket.ts
│           │   ├── useGameState.ts
│           │   ├── useActions.ts
│           │   └── useAnimationQueue.ts
│           ├── store/
│           │   └── store.ts             # Zustand store
│           ├── screens/
│           │   ├── HomeScreen.tsx
│           │   ├── LobbyScreen.tsx
│           │   ├── GameScreen.tsx
│           │   └── GameOverScreen.tsx
│           └── components/
│               ├── board/
│               │   ├── IslandGrid.tsx   # Diamond grid container
│               │   ├── Tile.tsx         # Single tile w/ flood animation
│               │   ├── PlayerPawn.tsx
│               │   └── TileOverlay.tsx  # Action target highlights
│               ├── cards/
│               │   ├── PlayerHand.tsx
│               │   ├── TreasureCard.tsx
│               │   └── FloodCard.tsx
│               ├── players/
│               │   ├── PlayerPanel.tsx
│               │   └── PlayerInfo.tsx
│               ├── actions/
│               │   └── ActionBar.tsx    # Move/ShoreUp/Give/Capture/EndTurn
│               ├── status/
│               │   ├── WaterMeter.tsx
│               │   ├── TreasureTracker.tsx
│               │   ├── TurnIndicator.tsx
│               │   └── GameLog.tsx
│               └── lobby/
│                   ├── CreateGameForm.tsx
│                   ├── GameList.tsx
│                   └── WaitingRoom.tsx
└── e2e/
    └── tests/                      # Playwright E2E tests
```

---

## Backend Architecture

### Core Data Models (TypeScript Interfaces)

**Tile:**
```typescript
type TileName = 'Breakers Bridge' | 'Bronze Gate' | 'Cave of Embers' | ... // all 24
type TileState = 'normal' | 'flooded' | 'sunk';
interface GridPosition { row: number; col: number; }
interface Tile { name: TileName; state: TileState; position: GridPosition; treasure: TreasureType | null; }
```

**Cards:**
```typescript
type TreasureType = 'earth_stone' | 'statue_of_wind' | 'crystal_of_fire' | 'oceans_chalice';
type TreasureCardType = TreasureType | 'helicopter_lift' | 'waters_rise' | 'sandbags';
interface TreasureCard { id: string; type: TreasureCardType; }
interface FloodCard { id: string; tileName: TileName; }
interface DeckState<T> { drawPile: T[]; discardPile: T[]; }
```

**Game State (server-side, single source of truth):**
```typescript
type GamePhase = 'waiting' | 'setup' | 'action' | 'draw_treasure' | 'draw_flood'
               | 'discard' | 'swim' | 'special_card' | 'won' | 'lost';

interface GameState {
  id: string; phase: GamePhase; difficulty: Difficulty;
  waterLevel: number; tiles: Tile[]; players: Player[];
  currentPlayerIndex: number; actionsRemaining: number;
  treasureDeck: DeckState<TreasureCard>; floodDeck: DeckState<FloodCard>;
  capturedTreasures: TreasureType[];
  pilotUsedAbility: boolean; engineerShoreUpCount: number;
  discardingPlayerId: string | null; swimmingPlayerId: string | null;
  lossReason: LossReason | null; turnNumber: number; log: GameLogEntry[];
}
```

**Client Game State (hidden info stripped):**
```typescript
interface ClientGameState {
  // Same as GameState but: treasure deck draw pile is count-only,
  // other players' hands are count-only, includes myPlayerId
}
```

### Game Engine Design

The engine uses **pure functions** (no side effects, no mutation of input state). Every action produces a new `GameState` plus a list of `ServerMessage` events to broadcast.

```
GameEngine.processAction(state, playerId, action) -> { newState, events[] }
  1. ActionValidator.validate() — throws if illegal
  2. ActionExecutor.execute() — returns new state
  3. GameEngine.processCascades() — handle flooding -> sinking -> swimming chains
  4. WinLossChecker.check() — evaluate end conditions
```

**Turn phase state machine:**
```
[action] --(3 actions or end_actions)--> [draw_treasure]
[draw_treasure] --(2 cards drawn)--> [draw_flood]
  (may interrupt with [discard] if hand > 5, or process [waters_rise])
[draw_flood] --(all flood cards drawn)--> [action] (next player)
  (may interrupt with [swim] if tile sinks under a player)

Special: [discard] and [swim] are interrupt phases that return to the previous phase
Special: Helicopter Lift and Sandbags can be played by ANY player at ANY time
```

**Deck Manager** handles: shuffle (Fisher-Yates), draw (auto-reshuffle if empty), discard, and the critical Waters Rise! mechanic (shuffle flood discard onto TOP of flood draw pile).

### WebSocket Protocol

**Client -> Server:**
- `lobby:create`, `lobby:join`, `lobby:leave`, `lobby:start`, `lobby:set_difficulty`, `lobby:select_role`
- `game:action` (payload: the discriminated union `GameAction`)
- `game:reconnect` (payload: gameId + playerId + secret)

**Server -> Client:**
- `lobby:identity`, `lobby:created`, `lobby:updated`, `lobby:error`, `lobby:game_list_updated`
- `game:started`, `game:state` (full personalized state after every action)
- `game:flood_reveal`, `game:tile_sunk`, `game:waters_rise` (animation events)
- `game:treasure_captured`, `game:player_must_swim`, `game:player_must_discard`
- `game:turn_changed`, `game:won`, `game:lost`
- `game:player_disconnected`, `game:player_reconnected`

**Design decision — full state after every action (not diffs):** Game state is small (~10-20KB). Full snapshots guarantee sync correctness. Animation events are sent separately so the client can animate sequentially before applying final state.

### REST Endpoints (Lobby)
- `GET /api/games` — list open games
- `POST /api/games` — create a game
- `GET /api/games/:id` — get lobby state

### Disconnection/Reconnection
- On disconnect: player's `isConnected` = false, game continues, turn skipped after 60s timeout
- Client stores `{ gameId, playerId, secret }` in sessionStorage
- On reconnect: client sends credentials, server re-associates WS, sends full state
- If all players disconnect: game preserved 10 minutes, then garbage collected

### State Storage
- In-memory `Map<gameId, GameState>` — sufficient for short-lived game sessions
- No database needed for MVP. GameState is already JSON-serializable for future persistence.

---

## Frontend Architecture

### Screen Flow
`HomeScreen` -> `LobbyScreen` (waiting room) -> `GameScreen` (gameplay) -> `GameOverScreen`

### Game Screen Layout (CSS Grid, 3 columns)
```
+-------------------+----------------------------+--------------------+
| LEFT SIDEBAR      | CENTER                     | RIGHT SIDEBAR      |
|                   |                            |                    |
| PlayerPanel       | TurnIndicator              | PlayerHand         |
|   PlayerInfo x N  |                            |   TreasureCard x N |
|                   | IslandGrid (diamond)       |                    |
| TreasureTracker   |   Tile x 24                | TreasureDeck       |
|   4 treasure icons|     PlayerPawn x N         | FloodDeck          |
|                   |     TileOverlay            |                    |
| WaterMeter        | ActionBar                  | GameLog            |
|                   |   [Move][Shore][Give]      |                    |
|                   |   [Capture][EndTurn]       |                    |
+-------------------+----------------------------+--------------------+
```

Tablet (< 1024px): 2-column layout, cards/log move below the board.

### Diamond Grid Rendering
The diamond is a 6x6 grid with a mask (rows of 2-4-6-6-4-2). Rendered as **centered flex rows** — each row is a flex container with `justify-content: center`. Short rows naturally create the diamond shape. Tile size scales with viewport: `--tile-size: clamp(60px, 8vw, 100px)`.

### Action Flow
1. Player clicks action button (e.g., "Move") -> `activeActionMode = 'move'`
2. Client computes valid targets using shared validation logic -> highlights tiles
3. Player clicks a highlighted tile
4. Client sends `game:action` via WebSocket
5. Server validates, executes, broadcasts new state
6. Client updates store, animates pawn movement via Framer Motion

### Animation Queue
Server events arrive in sequence. Some need animations before the next is processed (flood -> sink -> swim). An animation queue processes events one at a time with appropriate delays.

### Zustand Store Structure
```typescript
{
  // Connection: ws, myPlayerId, mySecret, connectionStatus
  // Lobby: currentLobby, gameList
  // Game: gameState (ClientGameState)
  // UI: selectedTile, selectedCard, activeActionMode, validTargets, animationQueue
}
```

---

## Complete User Flow

This section documents every screen, interaction, and state transition a player experiences from first opening the app through completing a game.

### Flow Diagram

```
[1. Home Screen]
    ├── Click "Create Game" ──> [2. Create Game]
    │                               └── ──> [3. Waiting Room (as host)]
    └── Click a game in list ──> [4. Join Game]
                                    └── ──> [3. Waiting Room (as guest)]

[3. Waiting Room]
    └── Host clicks "Start" ──> [5. Board Setup Animation]
                                    └── ──> [6. Game Screen - Action Phase]

[6. Game Screen]
    └── Turn Loop:
        [6a. Action Phase] ──> [6b. Draw Treasure Phase] ──> [6c. Draw Flood Phase]
            │                       │                             │
            │ (interrupts)          │ (interrupts)                │ (interrupts)
            │ Helicopter Lift       │ Waters Rise!                │ Tile sinks under player
            │ Sandbags              │ Hand > 5 → Discard          │   → [6e. Swim Phase]
            │                       │   → [6d. Discard Phase]     │ Hand > 5 → Discard
            │                       │                             │   → [6d. Discard Phase]
            └───────────────────────┴─────────────────────────────┘
                                    │
                              Win or Lose detected
                                    │
                                    v
                            [7. Game Over Screen]
                                ├── "Play Again" ──> [3. Waiting Room]
                                └── "Back to Home" ──> [1. Home Screen]
```

---

### 1. Home Screen

**URL:** `/`

**What the player sees:**
- App title/logo: "Forbidden Island"
- A text input for their display name (pre-filled from localStorage if returning)
- A "Create Game" button
- A list of open games waiting for players (fetched via `GET /api/games`)
  - Each entry shows: host name, player count (e.g., "2/4"), difficulty, and a "Join" button
  - List auto-refreshes via WebSocket (server pushes `lobby:game_list_updated` when games are created/filled/removed)
- If no open games exist: "No games available. Create one!"

**What happens on load:**
1. Client establishes WebSocket connection to the server
2. Server responds with `lobby:identity` containing `{ playerId, secret }`
3. Client stores `playerId` and `secret` in sessionStorage (for reconnection)
4. Client fetches open game list via `GET /api/games`

**Interactions:**
- **Enter name** — typed into text field, stored in localStorage for future sessions
- **Click "Create Game"** — navigates to Create Game screen
- **Click "Join" on a game** — sends `lobby:join` via WS, navigates to Waiting Room

**Validation:**
- Name must be 1-20 characters, trimmed
- "Create Game" and "Join" buttons disabled until name is entered

---

### 2. Create Game Screen

**URL:** `/create` (or modal overlay on Home Screen)

**What the player sees:**
- Their name displayed (from step 1)
- Difficulty selector: 4 buttons — Novice, Normal (default selected), Elite, Legendary
  - Each shows a brief description: "Novice — Relaxed pace, great for learning" / "Normal — Standard challenge" / "Elite — For experienced players" / "Legendary — Near-impossible odds"
  - Shows starting water level visually (1/2/3/4 on a mini water meter)
- "Create Game" confirmation button
- "Back" button to return to Home Screen

**Interactions:**
- **Select difficulty** — highlights the chosen option
- **Click "Create Game"** — sends `lobby:create { playerName, difficulty }` via WS
  - Server creates game in `waiting` phase, assigns this player as host
  - Server responds with `lobby:created { gameId, lobbyState }`
  - Client navigates to Waiting Room

---

### 3. Waiting Room

**URL:** `/game/:gameId/lobby`

**What the player sees:**
- Game ID / invite code displayed prominently with a "Copy Link" button (copies the join URL)
- Difficulty badge (e.g., "Normal")
- 4 player slots in a vertical list:
  - **Filled slots** show: player name, a colored player icon, "Host" badge if applicable, a "Ready" checkmark
  - **Empty slots** show: "Waiting for player..." with a pulsing animation
  - The host's slot is always first
- **Role selection area** (below the player slots):
  - 6 role cards laid out horizontally: Explorer, Diver, Engineer, Pilot, Messenger, Navigator
  - Each card shows: role name, color swatch, pawn icon, and a brief ability description
  - Players click a role card to claim it — the card becomes highlighted with their player color and shows their name
  - Already-claimed roles show the claiming player's name and are not clickable by others
  - If a player hasn't chosen a role, they see "Choose your role!" prompt
  - Option: "Random" button to get a random unclaimed role
- **Host controls** (visible only to host):
  - Difficulty dropdown (can change while waiting)
  - "Start Game" button — enabled only when: 2-4 players present AND all players have selected a role
- **All players:**
  - "Leave Game" button — returns to Home Screen
- Chat/message area (optional stretch goal — simple text chat)

**What happens when another player joins:**
- Server sends `lobby:updated` to all players in the room
- A new player slot fills in with animation
- Toast notification: "Alice has joined!"

**What happens when a player leaves:**
- Server sends `lobby:updated`
- Their slot empties, their claimed role is released
- If the host leaves: host role transfers to the next player, or game is dissolved if only one player remains

**Role selection flow:**
1. Player clicks an unclaimed role card
2. Client sends `lobby:select_role { role: 'explorer' }` via WS
3. Server validates (role not taken), updates lobby state
4. Server broadcasts `lobby:updated` — all clients see the role claimed
5. Player can click a different role to switch (releases the previous one)

**What happens when host clicks "Start Game":**
1. Client sends `lobby:start` via WS
2. Server validates: 2-4 players, all have roles selected
3. Server calls `GameEngine.setupGame(lobbyState)` — generates the full initial GameState
4. Server broadcasts `game:started { clientGameState }` to all players
5. All clients navigate to the Game Screen and play the setup animation

---

### 4. Join Game (via game list or direct link)

**Via game list (Home Screen):**
1. Player clicks "Join" on an open game
2. Client sends `lobby:join { gameId, playerName }` via WS
3. Server validates: game exists, is in `waiting` phase, not full
4. On success: server responds with `lobby:updated`, client navigates to Waiting Room
5. On failure: error toast ("Game is full" / "Game not found" / "Game already started")

**Via direct link (`/game/:gameId/lobby`):**
1. Player lands on the URL, enters their name in an inline prompt (if not already set)
2. Client sends `lobby:join` automatically
3. Same validation and navigation as above

---

### 5. Board Setup Animation

**URL:** `/game/:gameId` (same as Game Screen, but in setup phase)

This is a ~5-second animated sequence that plays before the first turn. It mirrors the physical board game setup experience.

**Animation sequence:**
1. **Island appears** (1.5s) — 24 tiles fly in one by one (or fade in row by row) into the diamond pattern. Each tile shows its name and art. Treasure tiles have a subtle treasure icon.
2. **Initial flooding** (1.5s) — 6 flood cards are revealed one at a time in the center of the screen. As each card is shown, the corresponding tile flips to its flooded state (blue tint wash animation).
3. **Players placed** (1s) — Each player's colored pawn drops onto their role's starting tile with a bounce animation. A brief role card tooltip shows for each player.
4. **Cards dealt** (1s) — 2 treasure cards animate from the deck into each player's hand area. The current player sees their actual cards; other players see card backs flying to the sidebar.
5. **Water meter set** (0.5s) — The water meter animates up to the starting level for the chosen difficulty.
6. **"Your turn!" or "Waiting for [name]..."** — Turn indicator appears, game transitions to action phase.

**What the player sees after setup completes:**
The full Game Screen layout (described in the architecture section) with all elements populated.

---

### 6. Game Screen — Turn Loop

**URL:** `/game/:gameId`

Each turn has 3 mandatory phases. The current player is indicated by a glowing highlight on their name in the PlayerPanel and a banner at the top: "Your Turn — 3 Actions Remaining" or "Alice's Turn — Waiting..."

---

#### 6a. Action Phase — "Take up to 3 actions"

**What the current player sees:**
- **Action bar** (bottom center) with 5 buttons:
  - **Move** — enabled if there is at least 1 valid adjacent tile
  - **Shore Up** — enabled if there is at least 1 flooded tile in range
  - **Give Card** — enabled if another player is on the same tile (or always for Messenger) and current player has treasure cards
  - **Capture Treasure** — enabled only if player has 4 matching treasure cards and is on a corresponding treasure tile. Button glows/pulses when available.
  - **End Turn** — always enabled (skips remaining actions)
- **Actions remaining counter:** "3 actions remaining" (decrements as actions are used)
- **Special card buttons** (always visible, not tied to action count):
  - Helicopter Lift and Sandbags cards in hand are playable via right-click or a dedicated "Play Special" button

**What non-current players see:**
- Action bar is grayed out / hidden
- Banner says "Alice's Turn — Waiting..."
- They CAN still play Helicopter Lift or Sandbags from their hand (these are free actions playable on any turn)

**Move action flow:**
1. Player clicks "Move" button — it highlights/activates
2. Valid destination tiles glow green (adjacent tiles that aren't sunk; diagonal also for Explorer; any tile for Pilot's fly ability)
3. Player clicks a highlighted tile
4. Client sends `game:action { type: 'move', targetPosition: {row, col} }`
5. Server validates and executes. Broadcasts new state.
6. All clients see the pawn animate smoothly to the new tile (Framer Motion layout animation)
7. Actions remaining decrements (banner updates to "2 actions remaining")
8. If Pilot used fly: "Pilot Flight Used" indicator appears

**Shore Up action flow:**
1. Player clicks "Shore Up"
2. Flooded tiles in range glow yellow (current tile + adjacent; +diagonal for Explorer)
3. Player clicks a flooded tile
4. Client sends `game:action { type: 'shore_up', targetPosition }`
5. Tile animates from flooded (blue) back to normal (dry). Water recedes animation.
6. Actions remaining decrements
7. Engineer special: after shoring up 1 tile, if engineer has actions remaining, the same action continues — a second flooded tile can be selected for free (UI shows "Shore Up 1/2" for Engineer)

**Give Card action flow:**
1. Player clicks "Give Card"
2. Their hand highlights — clickable cards glow
3. Player clicks a card in their hand to select it (card lifts/enlarges)
4. If multiple eligible recipients: recipient player names highlight in the PlayerPanel. Player clicks a recipient.
5. If only one eligible recipient (common): auto-selects that player
6. Client sends `game:action { type: 'give_card', cardId, targetPlayerId }`
7. Card animates from giver's hand to recipient's area. Recipient sees the card appear.
8. Actions remaining decrements

**Capture Treasure action flow:**
1. Button only enabled when valid (4 matching cards + on treasure tile) — it pulses gold
2. Player clicks "Capture Treasure"
3. No further target selection needed — server knows which treasure based on position
4. Client sends `game:action { type: 'capture_treasure', treasureType }`
5. Dramatic animation: 4 cards fly from hand to center, treasure figurine appears with glow effect, treasure icon in TreasureTracker fills in with color
6. All players see a momentary banner: "The Earth Stone has been captured!"
7. Actions remaining decrements

**End Turn:**
1. Player clicks "End Turn" (or uses all 3 actions)
2. Client sends `game:action { type: 'end_actions' }` (if ending early)
3. Phase transitions to Draw Treasure

**Playing Special Cards (any player, any time):**
1. Player clicks a Helicopter Lift or Sandbags card in their hand
2. **Sandbags:** Any flooded tile on the entire board glows. Player clicks one. Card is discarded, tile is shored up. No action cost.
3. **Helicopter Lift:** Player selects which pawns to move (checkboxes on pawns sharing a tile), then clicks a destination tile (any tile). All selected pawns move. No action cost.
   - Special case: if all 4 treasures are captured and all players are on Fools' Landing, playing Helicopter Lift triggers the **win sequence** (see section 7).

---

#### 6b. Draw Treasure Phase — "Draw 2 treasure cards"

This phase is mostly automatic. The current player draws 2 cards from the treasure deck.

**What all players see:**
1. Banner: "Drawing treasure cards..."
2. First card draws: card flips from deck with animation
   - **If treasure/special card:** Card flies to the current player's hand. Current player sees the card face; others see a card back fly to that player's hand area and their hand count increment.
   - **If Waters Rise!:** Card flips face-up in the center with dramatic effect (see Waters Rise! interrupt below). Card is discarded (does not go to hand).
3. Second card draws: same process
4. After both draws, phase transitions to Draw Flood

**Waters Rise! interrupt:**
1. Card revealed in center with red warning flash
2. Water meter animates up one level — the red marker slides up with a splash effect
3. The current flood draw rate updates if it crossed a threshold (e.g., "Now drawing 3 flood cards!")
4. Flood discard pile shuffles (card-shuffle animation) and stacks on top of draw pile
5. Banner: "Waters Rise! Water level is now [X]"
6. If water meter hits skull (level 9): immediately triggers loss (see section 7)
7. After the animation resolves, the draw phase continues (draw next card, or proceed to flood phase)

**Hand limit interrupt (Discard Phase):**
If drawing a card brings any player above 5 cards, the game enters the Discard Phase before continuing.

---

#### 6c. Draw Flood Phase — "Draw flood cards"

The server draws N flood cards (based on current water level). These are revealed one at a time.

**What all players see:**
1. Banner: "Drawing [N] flood cards..."
2. For each flood card:
   - Card flips from flood deck, showing the tile name
   - **If tile is normal:** Tile flips to flooded state. Blue water wash animation over the tile. The flood card goes to the flood discard pile.
   - **If tile is already flooded:** Tile SINKS. Dramatic sinking animation — tile cracks, water rushes in, tile descends and disappears. The flood card is removed from the game. An empty ocean space remains.
     - If a player was on the sinking tile: triggers **Swim interrupt** (see below)
     - If both tiles for an uncaptured treasure are now sunk: triggers **loss**
     - If Fools' Landing sinks: triggers **loss**
3. After all flood cards are resolved: turn passes to next player, phase resets to Action

**Swim interrupt:**
1. Banner: "[Player name] must swim to safety!"
2. The stranded player's valid swim destinations glow (adjacent non-sunk tiles; special rules for Explorer diagonal, Diver through water, Pilot fly anywhere)
3. If the stranded player is the current user: they click a destination tile
4. If the stranded player is someone else: that player sees the prompt, others wait
5. Client sends `game:action { type: 'swim', targetPosition }`
6. Pawn animates to new tile with a swimming/splashing effect
7. If NO valid destinations exist: that player drowns — triggers **loss**
8. After swim resolves, flood phase continues with remaining cards

---

#### 6d. Discard Phase (interrupt)

Triggered whenever any player exceeds 5 cards in hand.

**What the player who must discard sees:**
1. Modal overlay: "You have [N] cards. Discard down to 5."
2. Their full hand is displayed. Cards are clickable.
3. Clicking a card discards it (card flies to discard pile)
4. Alternatively, if the card is a Helicopter Lift or Sandbags, a "Play" option appears — they can use the special card instead of discarding it
5. Repeats until hand is at 5 cards
6. Modal closes, game returns to the interrupted phase

**What other players see:**
1. Banner: "[Player name] must discard cards..."
2. Waiting state — no actions available

---

#### 6e. Special Interrupt — Navigator Moving Another Player

When the Navigator uses their ability to move another player:
1. Navigator clicks "Move Other Player" action (special option in their action bar)
2. Other players' pawns become clickable. Navigator clicks a pawn to select which player to move.
3. Valid destinations for that player glow (up to 2 tiles away, using normal movement rules — NOT the target player's special ability)
4. Navigator clicks a first destination. If the navigator wants to move the player a second tile, valid destinations from the new position glow. Navigator clicks again or clicks "Done."
5. This costs the Navigator 1 action.

---

### 7. Game Over Screen

**URL:** `/game/:gameId/results`

#### Win Scenario
**Trigger:** A player plays Helicopter Lift while all 4 treasures are captured and all players are on Fools' Landing.

**What all players see:**
1. Helicopter animation — a helicopter descends onto Fools' Landing
2. All player pawns hop into the helicopter
3. The island crumbles and sinks into the ocean as the helicopter flies away
4. Victory screen with golden border:
   - "Victory! You escaped Forbidden Island!"
   - Shows all 4 captured treasure icons
   - Game stats: total turns played, tiles remaining, final water level, difficulty
   - Player roster with roles
   - "Play Again" button (returns to Waiting Room with same players)
   - "Back to Home" button

#### Loss Scenarios
**What all players see:**

The loss animation depends on the reason:
- **Fools' Landing sinks:** The escape tile dramatically sinks. Banner: "Fools' Landing has sunk! There is no escape!"
- **Both treasure tiles sunk:** The two tile locations flash red. Banner: "Both temples of [treasure name] have sunk! The [treasure] is lost forever!"
- **Player drowned:** The player's pawn sinks below the waves. Banner: "[Player name] has drowned!"
- **Water meter at skull:** The water meter fills completely, waves crash across the entire board. Banner: "The island has been consumed by the sea!"

Then the defeat screen appears:
- "Defeat. The island has claimed its treasures."
- Loss reason prominently displayed
- Game stats: total turns, treasures captured (X/4), tiles remaining, final water level
- "Play Again" button
- "Back to Home" button

---

### 8. Edge Case Flows

#### Disconnection During Game
1. Player's browser tab closes or connection drops
2. Server detects WS close, broadcasts `game:player_disconnected { playerId }`
3. Other players see: that player's name dims, a "Disconnected" badge appears
4. If it's the disconnected player's turn: a 60-second countdown timer appears. "Waiting for [name] to reconnect... 0:45"
5. If timer expires: that player's turn is skipped (0 actions taken, cards drawn automatically, flood cards drawn automatically)
6. Game continues with remaining connected players
7. If the disconnected player reconnects:
   - Client sends `game:reconnect { gameId, playerId, secret }` from sessionStorage
   - Server re-associates WS, sends full `game:state`
   - Other players see: "Alice has reconnected!" toast, badge removed
   - If it was their turn and timer hasn't expired: they resume with remaining actions

#### Returning to an In-Progress Game
1. Player opens the app and has `{ gameId, playerId, secret }` in sessionStorage
2. Home Screen shows a "Rejoin Game" banner at the top: "You have a game in progress. Rejoin?"
3. Clicking it sends `game:reconnect` and navigates directly to Game Screen

#### Game Dissolved
- If all players disconnect and 10 minutes pass, the game is garbage collected
- If a reconnecting player's game no longer exists: error message, redirect to Home Screen

---

### 9. Lobby-to-Game WebSocket Message Sequence

Complete message flow for a 2-player game from creation through first turn:

```
Player A (Host)                    Server                     Player B
     |                               |                            |
     |--- lobby:create ------------->|                            |
     |<-- lobby:created -------------|                            |
     |    (gameId, lobbyState)       |                            |
     |                               |                            |
     |--- lobby:select_role -------->|                            |
     |    (role: 'pilot')            |                            |
     |<-- lobby:updated -------------|                            |
     |                               |                            |
     |                               |<--- lobby:join ------------|
     |                               |     (gameId, playerName)   |
     |<-- lobby:updated -------------|--- lobby:updated --------->|
     |    (2 players now)            |    (2 players now)         |
     |                               |                            |
     |                               |<--- lobby:select_role -----|
     |                               |     (role: 'explorer')     |
     |<-- lobby:updated -------------|--- lobby:updated --------->|
     |                               |                            |
     |--- lobby:start -------------->|                            |
     |    (host starts game)         |                            |
     |                               |-- GameEngine.setupGame() --|
     |                               |                            |
     |<-- game:started --------------|--- game:started ---------->|
     |    (ClientGameState,          |    (ClientGameState,       |
     |     sees own hand)            |     sees own hand)         |
     |                               |                            |
     |  [Player A is currentPlayer]  |                            |
     |                               |                            |
     |--- game:action -------------->|                            |
     |    {type:'move', pos:{1,2}}   |                            |
     |                               |-- GameEngine.process() ----|
     |<-- game:state ----------------|--- game:state ------------>|
     |    (updated state)            |    (updated state)         |
     |                               |                            |
     ... (2 more actions or end_actions) ...
     |                               |                            |
     |--- game:action -------------->|                            |
     |    {type:'end_actions'}       |                            |
     |                               |-- draw 2 treasure cards ---|
     |<-- game:treasure_draw --------|--- game:treasure_draw ---->|
     |<-- game:treasure_draw --------|--- game:treasure_draw ---->|
     |                               |                            |
     |                               |-- draw N flood cards ------|
     |<-- game:flood_reveal ---------|--- game:flood_reveal ----->|
     |    (tile X now flooded)       |    (tile X now flooded)    |
     |<-- game:flood_reveal ---------|--- game:flood_reveal ----->|
     |                               |                            |
     |<-- game:turn_changed ---------|--- game:turn_changed ----->|
     |    (now Player B's turn)      |    (now Player B's turn)   |
     |<-- game:state ----------------|--- game:state ------------>|
```

---

## Implementation Sequence

### Phase 1: Foundation
1. Set up monorepo (npm workspaces, Turborepo, tsconfig)
2. Create `packages/shared` with all types and constants
3. Scaffold Fastify server with health check
4. Scaffold Vite + React client with routing

### Phase 2: Lobby
5. WebSocket connection infrastructure
6. Lobby REST endpoints + WS events
7. Lobby UI (create, join, waiting room)

### Phase 3: Core Engine
8. DeckManager (shuffle, draw, discard, reshuffle) + tests
9. Board setup (tile placement, role assignment, initial deal/flood)
10. ActionValidator for all actions + role abilities + tests
11. ActionExecutor for all actions
12. Turn phase state machine
13. Waters Rise! handling
14. Win/loss checker + tests

### Phase 4: Game Board UI
15. IslandGrid + Tile with diamond layout
16. PlayerHand + card components
17. ActionBar with mode selection + target highlighting
18. WebSocket message handling in Zustand
19. Action dispatch (click -> highlight -> click -> send)

### Phase 5: Polish
20. Framer Motion animations (flood, sink, pawn move, card draw)
21. Special cards (Helicopter Lift, Sandbags) with interrupt handling
22. Discard and swim interrupt phases
23. All 6 role abilities fully implemented
24. WaterMeter, TreasureTracker, GameLog components
25. Responsive tablet layout
26. GameOverScreen

### Phase 6: Testing
27. Playwright E2E tests for full game flow
28. Disconnection/reconnection testing
29. Edge case testing (all loss conditions, all role abilities, special card timing)

---

## Verification Plan

1. **Unit tests:** Run `npm test` across all packages — engine tests cover all actions, all role abilities, all win/loss conditions, deck mechanics, Waters Rise! reshuffling
2. **Dev server:** `npm run dev` starts both server and client with hot reload. Open 2-4 browser tabs to simulate multiplayer.
3. **Manual play-through:** Create a game, join with 2+ tabs, play a complete game verifying:
   - Tile flooding and sinking animations
   - All 4 action types work correctly
   - Waters Rise! reshuffles flood discard onto draw pile
   - Treasure capture with 4 matching cards
   - Special cards (Helicopter Lift, Sandbags) playable anytime
   - Win condition (all treasures + Fools' Landing + Helicopter Lift)
   - Each loss condition triggers correctly
4. **Playwright E2E:** Automated tests for lobby flow, game setup, core turn sequence, win/loss scenarios
5. **Disconnection test:** Close a browser tab mid-game, verify other players continue, reconnect and verify state recovery
