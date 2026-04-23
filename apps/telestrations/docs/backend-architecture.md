# Telestrations Web App -- Backend Architecture

**Version:** 1.0
**Date:** 2026-04-23
**Status:** Draft
**Companion to:** [Product Specification](./product-spec.md)

This document is the contract between the frontend and backend. Every event payload, every endpoint schema, and every state transition is specified here. If it is not in this document, it is not part of the API.

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [Project Structure](#2-project-structure)
3. [REST API Endpoints](#3-rest-api-endpoints)
4. [Socket.IO Events](#4-socketio-events)
5. [Game State Machine](#5-game-state-machine)
6. [Chain Rotation Algorithm](#6-chain-rotation-algorithm)
7. [Timer Management](#7-timer-management)
8. [Rate Limiting](#8-rate-limiting)
9. [Data Validation](#9-data-validation)
10. [Error Handling Strategy](#10-error-handling-strategy)
11. [Reconnection and Session Management](#11-reconnection-and-session-management)
12. [Game Cleanup and Memory Management](#12-game-cleanup-and-memory-management)
13. [TypeScript Type Definitions](#13-typescript-type-definitions)
14. [Security Considerations](#14-security-considerations)
15. [Deployment and Operations](#15-deployment-and-operations)

---

## 1. Technology Stack

| Component | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 20 LTS | Long-term support, stable WebSocket performance, single-threaded event loop suits this workload (I/O-bound, low CPU). |
| Language | TypeScript 5.x (strict mode) | Type safety across the entire backend. Catches payload mismatches at compile time. |
| HTTP Framework | Express.js 4.x | Mature, minimal, well-understood. No need for Fastify's extra throughput at this scale. |
| WebSocket | Socket.IO 4.x | Automatic reconnection, room abstraction, binary support, fallback to long-polling. Worth the overhead vs raw `ws` because reconnection handling is critical for a game where players are on flaky mobile connections. |
| State Storage | In-memory (ES `Map` objects) | Games are ephemeral. No database cost. State lives behind a `GameStore` interface so it can be swapped to Redis later without touching game logic. |
| Validation | zod | Runtime schema validation for all inbound data (REST bodies, Socket.IO payloads). Schemas double as documentation. |
| Rate Limiting | express-rate-limit + custom Socket.IO middleware | Simple token-bucket approach. No Redis dependency at this scale. |
| Testing | vitest + supertest + socket.io-client | Fast, TypeScript-native test runner. supertest for HTTP endpoints, socket.io-client for integration tests against real Socket.IO handlers. |
| Deployment | Azure App Service (B1 tier, Linux) | $13/month. Supports WebSockets natively. Single instance is sufficient for target scale. |

### Why Socket.IO over raw `ws`

The product spec requires robust reconnection (section 9.3), heartbeat (section 9.4), and room-based broadcasting (all players in a game see the same state). Socket.IO provides all of this out of the box. The protocol overhead (~2KB per connection) is negligible for 20-player games. The alternative -- implementing reconnection, heartbeat, and room management on raw `ws` -- would take weeks and produce worse results.

---

## 2. Project Structure

```
server/
├── src/
│   ├── index.ts                    # Entry point: creates HTTP server, attaches Socket.IO, starts listening
│   ├── app.ts                      # Express app setup: middleware, routes, error handler
│   ├── config.ts                   # Environment variables, constants (timer defaults, limits)
│   ├── socket/
│   │   ├── index.ts                # Socket.IO server setup, connection handler, middleware
│   │   ├── handlers/
│   │   │   ├── connection.ts       # on('connection') -- auth, join room, reconnect
│   │   │   ├── game.ts            # game:start, game:settings, game:kick, game:play-again
│   │   │   ├── round.ts           # round:submit, round:end-early
│   │   │   ├── review.ts          # review:next, review:previous
│   │   │   └── player.ts          # player:reconnect, player:leave
│   │   └── emitters.ts            # Typed helper functions for all server->client events
│   ├── game/
│   │   ├── GameManager.ts         # Orchestrates game lifecycle, owns all timers
│   │   ├── GameStore.ts           # Interface + in-memory implementation for game state CRUD
│   │   ├── ChainRotation.ts       # Chain assignment algorithm
│   │   ├── StateMachine.ts        # Valid state transitions, guards
│   │   ├── TimerService.ts        # setTimeout wrappers with cleanup tracking
│   │   └── WordList.ts            # Built-in word list for auto-prompts
│   ├── models/
│   │   ├── Game.ts                # Game, Player, Chain, ChainEntry interfaces
│   │   ├── Events.ts              # All Socket.IO event payload types (client->server and server->client)
│   │   ├── Api.ts                 # REST request/response types
│   │   └── Errors.ts              # Error code enum and error response shape
│   ├── middleware/
│   │   ├── rateLimiter.ts         # express-rate-limit config for REST endpoints
│   │   ├── validation.ts          # zod schema middleware for Express routes
│   │   └── socketRateLimiter.ts   # Per-socket event rate limiting
│   ├── utils/
│   │   ├── codeGenerator.ts       # 4-letter game code generation (excluding I, O, L)
│   │   ├── sanitize.ts            # XSS sanitization for text inputs
│   │   ├── idGenerator.ts         # UUID v4 wrapper
│   │   └── tokenGenerator.ts      # Reconnection token generation (crypto.randomBytes)
│   └── __tests__/
│       ├── api/
│       │   ├── createGame.test.ts
│       │   ├── joinGame.test.ts
│       │   └── getGame.test.ts
│       ├── game/
│       │   ├── stateMachine.test.ts
│       │   ├── chainRotation.test.ts
│       │   ├── gameManager.test.ts
│       │   └── timerService.test.ts
│       ├── socket/
│       │   ├── gameFlow.integration.test.ts
│       │   ├── reconnection.integration.test.ts
│       │   └── review.integration.test.ts
│       └── utils/
│           ├── codeGenerator.test.ts
│           └── sanitize.test.ts
├── package.json
├── tsconfig.json
└── .env.example
```

### Key design decisions

- **GameManager is the single source of truth.** All mutations go through it. Socket handlers and REST routes are thin dispatchers.
- **GameStore is an interface.** The in-memory implementation is the only one for v1, but the interface makes a Redis swap mechanical.
- **TimerService wraps all `setTimeout` calls.** Every timer is tracked and can be cleared on game cleanup. Leaked timers are a common source of memory leaks in game servers.
- **Emitters are typed functions, not raw `.emit()` calls.** This prevents payload shape mismatches between what the server sends and what the client expects.

---

## 3. REST API Endpoints

All endpoints are prefixed with `/api`. All request and response bodies are `application/json`. All error responses follow a consistent shape (see section 10).

### 3.1 POST /api/games -- Create a Game

Creates a new game in LOBBY state. The caller becomes the host.

**Request Body:**

```json
{
  "hostDisplayName": "Alice",
  "settings": {
    "drawingTimerSeconds": 60,
    "guessingTimerSeconds": 30,
    "promptTimerSeconds": 30,
    "useAllRounds": true,
    "customRoundCount": null
  }
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `hostDisplayName` | string | yes | 2-16 characters, alphanumeric + spaces, trimmed |
| `settings` | object | no | Falls back to defaults if omitted |
| `settings.drawingTimerSeconds` | number | no | One of: 30, 45, 60, 90, 120. Default: 60 |
| `settings.guessingTimerSeconds` | number | no | One of: 15, 20, 30, 45, 60. Default: 30 |
| `settings.promptTimerSeconds` | number | no | One of: 15, 20, 30, 45, 60. Default: 30 |
| `settings.useAllRounds` | boolean | no | Default: true |
| `settings.customRoundCount` | number or null | no | 2 to 19 (validated against player count at game start). Only used when `useAllRounds` is false. Default: null |

**Response: 201 Created**

```json
{
  "gameCode": "FROG",
  "gameId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "playerId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "reconnectionToken": "dGhpcyBpcyBhIHRva2VuLi4u",
  "settings": {
    "drawingTimerSeconds": 60,
    "guessingTimerSeconds": 30,
    "promptTimerSeconds": 30,
    "useAllRounds": true,
    "customRoundCount": null
  }
}
```

| Field | Type | Description |
|---|---|---|
| `gameCode` | string | 4-letter code for sharing |
| `gameId` | string | Internal UUID |
| `playerId` | string | UUID assigned to the host player |
| `reconnectionToken` | string | Opaque token for reconnection (base64-encoded 32 random bytes) |
| `settings` | object | Echoed back with defaults applied |

**Error Responses:**

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_DISPLAY_NAME` | Name fails validation |
| 400 | `INVALID_SETTINGS` | Settings values out of allowed range |
| 429 | `RATE_LIMITED` | More than 5 games created from this IP in the last hour |

---

### 3.2 POST /api/games/:code/join -- Join a Game

Adds a player to an existing game in LOBBY state.

**URL Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `code` | string | 4-letter game code (case-insensitive, server uppercases it) |

**Request Body:**

```json
{
  "displayName": "Bob"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `displayName` | string | yes | 2-16 characters, alphanumeric + spaces, trimmed. Must be unique within the game. |

**Response: 200 OK**

```json
{
  "gameCode": "FROG",
  "gameId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "playerId": "b23dc10b-58cc-4372-a567-0e02b2c3d480",
  "reconnectionToken": "YW5vdGhlciB0b2tlbi4uLg==",
  "gameState": "LOBBY",
  "players": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "displayName": "Alice",
      "isHost": true,
      "isConnected": true
    },
    {
      "id": "b23dc10b-58cc-4372-a567-0e02b2c3d480",
      "displayName": "Bob",
      "isHost": false,
      "isConnected": true
    }
  ],
  "settings": {
    "drawingTimerSeconds": 60,
    "guessingTimerSeconds": 30,
    "promptTimerSeconds": 30,
    "useAllRounds": true,
    "customRoundCount": null
  }
}
```

**Error Responses:**

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_DISPLAY_NAME` | Name fails validation |
| 400 | `INVALID_GAME_CODE` | Code is not exactly 4 valid letters |
| 404 | `GAME_NOT_FOUND` | No active game with this code |
| 409 | `GAME_ALREADY_STARTED` | Game is not in LOBBY state |
| 409 | `GAME_FULL` | Game has 20 players |
| 409 | `DISPLAY_NAME_TAKEN` | Another player in the game has this name |
| 429 | `RATE_LIMITED` | More than 20 join attempts from this IP in the last minute |

---

### 3.3 GET /api/games/:code -- Get Game Status

Returns minimal, non-sensitive information about a game. Used by the client to check if a game exists before showing the join form.

**URL Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `code` | string | 4-letter game code (case-insensitive) |

**Response: 200 OK**

```json
{
  "gameCode": "FROG",
  "state": "LOBBY",
  "playerCount": 5,
  "maxPlayers": 20,
  "canJoin": true
}
```

| Field | Type | Description |
|---|---|---|
| `gameCode` | string | Uppercased game code |
| `state` | string | Current game state enum value |
| `playerCount` | number | Number of players currently in the game |
| `maxPlayers` | number | Always 20 |
| `canJoin` | boolean | `true` only if state is `LOBBY` and playerCount < 20 |

**Error Responses:**

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_GAME_CODE` | Code is not exactly 4 valid letters |
| 404 | `GAME_NOT_FOUND` | No active game with this code |

---

### 3.4 GET /api/games/:code/results -- Download Results

Returns all chains for a completed game. Only available in REVIEW or ENDED state. Available for 10 minutes after the game ends.

**URL Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `code` | string | 4-letter game code (case-insensitive) |

**Query Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `playerId` | string | yes | The requesting player's ID (proves they were in the game) |

**Response: 200 OK**

```json
{
  "gameCode": "FROG",
  "completedAt": "2026-04-23T20:30:00.000Z",
  "players": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "displayName": "Alice"
    }
  ],
  "chains": [
    {
      "originPlayerDisplayName": "Alice",
      "entries": [
        {
          "type": "PROMPT",
          "playerDisplayName": "Alice",
          "content": "elephant",
          "wasAutoSubmitted": false
        },
        {
          "type": "DRAWING",
          "playerDisplayName": "Bob",
          "content": "data:image/png;base64,iVBORw0KGgo...",
          "wasAutoSubmitted": false
        },
        {
          "type": "GUESS",
          "playerDisplayName": "Carol",
          "content": "fat mouse",
          "wasAutoSubmitted": false
        }
      ]
    }
  ]
}
```

**Error Responses:**

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_GAME_CODE` | Code is not exactly 4 valid letters |
| 400 | `MISSING_PLAYER_ID` | No playerId query parameter |
| 403 | `NOT_A_PLAYER` | The playerId is not a participant in this game |
| 404 | `GAME_NOT_FOUND` | No active game with this code |
| 409 | `GAME_NOT_FINISHED` | Game is not in REVIEW or ENDED state |

---

## 4. Socket.IO Events

### 4.0 Connection and Authentication

When a client connects via Socket.IO, it must provide authentication data in the `auth` option of the connection:

```typescript
const socket = io("https://server.example.com", {
  auth: {
    gameCode: "FROG",
    playerId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    reconnectionToken: "dGhpcyBpcyBhIHRva2VuLi4u"
  }
});
```

The server validates these credentials in the Socket.IO middleware (`io.use()`). If valid, the socket is joined to the Socket.IO room for that game (room name = game code). If invalid, the connection is rejected with an error.

**Connection rejection errors:**

| Code | Message |
|---|---|
| `INVALID_CREDENTIALS` | "Missing or invalid authentication data" |
| `GAME_NOT_FOUND` | "Game not found or has ended" |
| `PLAYER_NOT_FOUND` | "Player not found in this game" |
| `INVALID_TOKEN` | "Reconnection token is invalid" |

After successful connection, the server emits `game:state` to the connecting socket with the full current state.

---

### 4.1 Client-to-Server Events

Each event includes its payload type and the conditions under which it is valid.

---

#### `player:reconnect`

Sent when a client reconnects after a disconnect. This is handled implicitly through Socket.IO's `auth` on connection (see 4.0), but this event exists for the case where a socket connection is already established and the player needs to re-authenticate (e.g., after a server-driven disconnect).

**Payload:**

```typescript
{
  gameCode: string;       // 4-letter game code
  playerId: string;       // Player UUID
  reconnectionToken: string; // Opaque token
}
```

**Server behavior:**
1. Validate token matches the stored token for this player.
2. Mark player as connected.
3. Join the socket to the game room.
4. If the player was disconnected mid-round and the round is still active, clear their disconnect timer.
5. Emit `game:state` to the reconnecting socket.
6. Emit `game:player-joined` to all other sockets in the room (with `isReconnect: true`).

**Error conditions:**
- Invalid token: emit `error` with code `INVALID_TOKEN`.
- Game not found: emit `error` with code `GAME_NOT_FOUND`.

---

#### `player:leave`

Player voluntarily leaves the game.

**Payload:**

```typescript
{
  // No payload needed -- server identifies the player from the socket session.
}
```

**Server behavior:**
1. If game is in LOBBY: remove the player from the player list entirely. Emit `game:player-left` to all.
2. If game is in an active round (PROMPT, DRAWING, GUESSING): mark player as disconnected, auto-submit their current entry, auto-submit all future entries. Emit `game:player-left`.
3. If game is in REVIEW or ENDED: remove the socket from the room. No game state change.
4. Mark the player's reconnection token as invalidated -- voluntary leave prevents rejoin during gameplay.
5. If the leaving player is the host, transfer host to the next player by join order (see section 5.3).

---

#### `game:start`

Host starts the game, transitioning from LOBBY to PROMPT.

**Payload:**

```typescript
{
  // No payload needed.
}
```

**Server behavior:**
1. Validate: sender is host, game is in LOBBY state, at least 4 players are connected.
2. Lock the player list.
3. Assign player order numbers (0 through N-1) based on join order.
4. Calculate total rounds: if `useAllRounds`, rounds = players - 1. Otherwise, rounds = `customRoundCount`. Validate `customRoundCount <= players - 1`.
5. Initialize empty chains (one per player).
6. Transition state to PROMPT.
7. Start the prompt timer.
8. Emit `game:started` to all players in the room.
9. Emit `round:start` to each player individually (each player gets their own instructions).

**Error conditions:**
- Not host: emit `error` with code `NOT_HOST`.
- Wrong state: emit `error` with code `INVALID_STATE`.
- Too few players: emit `error` with code `NOT_ENOUGH_PLAYERS`.

---

#### `game:settings`

Host updates game settings while in the lobby.

**Payload:**

```typescript
{
  drawingTimerSeconds?: number;   // 30 | 45 | 60 | 90 | 120
  guessingTimerSeconds?: number;  // 15 | 20 | 30 | 45 | 60
  promptTimerSeconds?: number;    // 15 | 20 | 30 | 45 | 60
  useAllRounds?: boolean;
  customRoundCount?: number | null; // 2 to 19
}
```

Only included fields are updated. Omitted fields retain their current values.

**Server behavior:**
1. Validate: sender is host, game is in LOBBY state.
2. Validate each provided field against allowed values.
3. Update settings.
4. Emit `game:state` to all players in the room (full state sync, which includes updated settings).

**Error conditions:**
- Not host: emit `error` with code `NOT_HOST`.
- Wrong state: emit `error` with code `INVALID_STATE`.
- Invalid values: emit `error` with code `INVALID_SETTINGS`.

---

#### `game:kick`

Host removes a player from the lobby.

**Payload:**

```typescript
{
  targetPlayerId: string;  // UUID of the player to remove
}
```

**Server behavior:**
1. Validate: sender is host, game is in LOBBY state, target player exists and is not the host.
2. Remove the player from the player list.
3. Emit `game:player-left` to all players with `reason: "kicked"`.
4. Emit `error` to the kicked player's socket with code `KICKED` and message "You have been removed from the game by the host."
5. Disconnect the kicked player's socket.
6. Invalidate the kicked player's reconnection token.

**Error conditions:**
- Not host: emit `error` with code `NOT_HOST`.
- Wrong state: emit `error` with code `INVALID_STATE`.
- Target is host: emit `error` with code `CANNOT_KICK_HOST`.
- Target not found: emit `error` with code `PLAYER_NOT_FOUND`.

---

#### `round:submit`

Player submits their entry for the current round.

**Payload:**

```typescript
{
  content: string;  // Text (PROMPT/GUESS) or base64 PNG data URI (DRAWING)
}
```

**Server behavior:**
1. Validate: game is in an active round state (PROMPT, DRAWING, GUESSING), player has not already submitted for this round, round timer has not expired (server-side check with 2-second grace period).
2. Sanitize text content (see section 9).
3. Validate drawing content: must be a valid `data:image/png;base64,...` string, decoded size must not exceed 500KB.
4. Store the entry in the appropriate chain.
5. Mark the player as having submitted.
6. Emit `round:player-submitted` to all players in the room.
7. If all players have now submitted, advance the round immediately (clear the timer, trigger round end).

**Error conditions:**
- Wrong state: emit `error` with code `INVALID_STATE`.
- Already submitted: emit `error` with code `ALREADY_SUBMITTED`.
- Timer expired: emit `error` with code `ROUND_EXPIRED`.
- Content too large: emit `error` with code `CONTENT_TOO_LARGE`.
- Invalid content: emit `error` with code `INVALID_CONTENT`.

---

#### `round:end-early`

Host forces the current round to end immediately. Only available when all but one player have submitted.

**Payload:**

```typescript
{
  // No payload needed.
}
```

**Server behavior:**
1. Validate: sender is host, game is in an active round state, at most one player has not submitted.
2. Auto-submit for any players who have not submitted (using the rules from product spec section 8.4).
3. Clear the round timer.
4. Trigger the round-end flow (transition screen, then next round or review).

**Error conditions:**
- Not host: emit `error` with code `NOT_HOST`.
- Wrong state: emit `error` with code `INVALID_STATE`.
- Too many unsubmitted: emit `error` with code `CANNOT_END_EARLY` with message "More than one player has not submitted yet."

---

#### `review:next`

Host advances to the next entry or next chain in the review phase.

**Payload:**

```typescript
{
  // No payload needed.
}
```

**Server behavior:**
1. Validate: sender is host, game is in REVIEW state.
2. Advance the review cursor:
   - If there are more entries in the current chain, reveal the next entry.
   - If the current chain is fully revealed and there are more chains, move to the next chain and reveal its first entry.
   - If all chains are fully revealed, transition to ENDED state.
3. Emit `review:entry` to all players with the newly revealed entry.
4. If transitioning to ENDED, emit `game:ended` to all players.

**Error conditions:**
- Not host: emit `error` with code `NOT_HOST`.
- Wrong state: emit `error` with code `INVALID_STATE`.

---

#### `review:previous`

Host goes back to the previous entry in the review phase.

**Payload:**

```typescript
{
  // No payload needed.
}
```

**Server behavior:**
1. Validate: sender is host, game is in REVIEW state.
2. Move the review cursor back:
   - If not at the first entry of the current chain, go back one entry.
   - If at the first entry and not on the first chain, go back to the last entry of the previous chain.
   - If at the very first entry of the very first chain, no-op (do nothing, no error).
3. Emit `review:entry` to all players with the current cursor position and the entries revealed up to that point.

**Error conditions:**
- Not host: emit `error` with code `NOT_HOST`.
- Wrong state: emit `error` with code `INVALID_STATE`.

---

#### `game:play-again`

Host starts a new game with the same group of connected players.

**Payload:**

```typescript
{
  // No payload needed.
}
```

**Server behavior:**
1. Validate: sender is host, game is in ENDED state.
2. Create a new game with a new game code.
3. Copy all currently connected players into the new game's lobby (same display names, same host, new player IDs, new reconnection tokens).
4. Schedule cleanup of the old game (10-minute window for result downloads still applies).
5. Emit `game:state` to all players with the full state of the new game (including the new game code, new player IDs, and new reconnection tokens).

**Error conditions:**
- Not host: emit `error` with code `NOT_HOST`.
- Wrong state: emit `error` with code `INVALID_STATE`.

---

### 4.2 Server-to-Client Events

---

#### `game:state`

Full game state synchronization. Sent on initial connection, reconnection, settings changes, and play-again.

**Payload:**

```typescript
{
  gameCode: string;
  gameId: string;
  state: "LOBBY" | "PROMPT" | "DRAWING" | "GUESSING" | "REVIEW" | "ENDED";
  hostPlayerId: string;
  settings: {
    drawingTimerSeconds: number;
    guessingTimerSeconds: number;
    promptTimerSeconds: number;
    useAllRounds: boolean;
    customRoundCount: number | null;
  };
  players: Array<{
    id: string;
    displayName: string;
    isHost: boolean;
    isConnected: boolean;
  }>;
  currentRound: number | null;       // null when in LOBBY or ENDED
  totalRounds: number | null;        // null when in LOBBY or ENDED
  // Only present during active rounds (PROMPT, DRAWING, GUESSING):
  roundData?: {
    type: "PROMPT" | "DRAWING" | "GUESSING";
    prompt?: string;                  // The text to draw (DRAWING phase) or null
    drawing?: string;                 // The drawing to guess (GUESSING phase) or null (data URI)
    timerStartedAt: string;           // ISO 8601 timestamp
    timerDurationMs: number;          // Duration in milliseconds
    submittedPlayerIds: string[];     // Players who have already submitted
    hasSubmitted: boolean;            // Whether THIS player has submitted
  };
  // Only present during REVIEW:
  reviewData?: {
    currentChainIndex: number;        // 0-based
    totalChains: number;
    chainOriginPlayerDisplayName: string;
    revealedEntries: Array<{
      type: "PROMPT" | "DRAWING" | "GUESS";
      playerDisplayName: string;
      content: string;
      wasAutoSubmitted: boolean;
    }>;
  };
  // Present when play-again creates a new game:
  newPlayerId?: string;
  newReconnectionToken?: string;
}
```

**When sent:**
- To a single socket: on connection, on reconnection, on play-again.
- To all sockets in room: on settings change.

---

#### `game:player-joined`

A new player joined the game or a disconnected player reconnected.

**Payload:**

```typescript
{
  player: {
    id: string;
    displayName: string;
    isHost: boolean;
    isConnected: boolean;
  };
  isReconnect: boolean;
  playerCount: number;
}
```

---

#### `game:player-left`

A player left, was kicked, or disconnected.

**Payload:**

```typescript
{
  playerId: string;
  displayName: string;
  reason: "left" | "kicked" | "disconnected" | "timeout";
  playerCount: number;
  // If the game is in LOBBY, the player is removed from the list.
  // If the game is active, the player remains in the list but isConnected becomes false.
  removedFromGame: boolean;
}
```

`reason` values:
- `"left"`: player voluntarily left.
- `"kicked"`: host removed the player (LOBBY only).
- `"disconnected"`: player's socket disconnected (they may reconnect within 60 seconds).
- `"timeout"`: player was disconnected for more than 60 seconds and has been permanently removed from active participation.

---

#### `game:started`

Game has transitioned from LOBBY to PROMPT. Sent once.

**Payload:**

```typescript
{
  totalRounds: number;   // Total number of rounds (excluding the initial prompt)
  playerOrder: Array<{   // Player order for the game
    id: string;
    displayName: string;
    orderIndex: number;   // 0-based position
  }>;
}
```

---

#### `round:start`

A new round is beginning. Sent to each player individually because each player receives different content.

**Payload:**

```typescript
{
  round: number;                     // Current round number (0 = prompt phase)
  totalRounds: number;               // Total rounds including prompt
  type: "PROMPT" | "DRAWING" | "GUESSING";
  timerDurationMs: number;           // Timer duration in milliseconds
  timerStartedAt: string;            // ISO 8601 timestamp (server clock)
  // Only for DRAWING phase:
  prompt?: string;                   // The text the player should draw
  promptAuthorDisplayName?: string;  // Who wrote/guessed this text
  // Only for GUESSING phase:
  drawing?: string;                  // Base64 PNG data URI to guess
  drawingAuthorDisplayName?: string; // Who drew this
}
```

Note: During the PROMPT phase, `prompt` and `drawing` are both absent -- the player writes their own prompt.

---

#### `round:player-submitted`

A player has submitted their entry for the current round. Used for progress tracking UI.

**Payload:**

```typescript
{
  playerId: string;
  displayName: string;
  submittedCount: number;   // Total number of players who have submitted
  totalPlayers: number;     // Total number of players in the game
}
```

Content of the submission is NOT included -- players should not see each other's submissions until review.

---

#### `round:ended`

The current round is over (all submitted or timer expired). A transition screen should be shown.

**Payload:**

```typescript
{
  roundCompleted: number;    // The round that just ended (0-based)
  nextRound: number | null;  // The next round number, or null if transitioning to review
  nextType: "DRAWING" | "GUESSING" | "REVIEW" | null;
  transitionDurationMs: number;  // How long the transition screen lasts (e.g., 3000ms)
}
```

After `transitionDurationMs` elapses, the server will emit either `round:start` (for the next round) or `review:entry` (for the first review entry).

---

#### `round:tick`

Periodic timer synchronization. Sent every 10 seconds during active rounds to correct for client clock drift.

**Payload:**

```typescript
{
  remainingMs: number;  // Milliseconds remaining on the server timer
}
```

---

#### `review:entry`

The next review entry has been revealed by the host.

**Payload:**

```typescript
{
  chainIndex: number;         // 0-based index of the current chain
  totalChains: number;
  chainOriginPlayerDisplayName: string;
  entryIndex: number;         // 0-based index within the chain
  totalEntries: number;       // Total entries in this chain
  entry: {
    type: "PROMPT" | "DRAWING" | "GUESS";
    playerDisplayName: string;
    content: string;           // Text or base64 PNG data URI
    wasAutoSubmitted: boolean;
  };
  isLastEntryInChain: boolean;
  isLastChain: boolean;
}
```

---

#### `game:ended`

The game is over. All chains have been reviewed.

**Payload:**

```typescript
{
  gameCode: string;
  resultsAvailableUntil: string;  // ISO 8601 timestamp (10 minutes from now)
}
```

---

#### `game:host-changed`

Host privileges have been transferred to a different player.

**Payload:**

```typescript
{
  previousHostId: string;
  previousHostDisplayName: string;
  newHostId: string;
  newHostDisplayName: string;
  reason: "left" | "disconnected" | "timeout";
}
```

---

#### `error`

An error occurred in response to a client event.

**Payload:**

```typescript
{
  code: string;           // Machine-readable error code (see section 10)
  message: string;        // Human-readable message safe to display to the user
  details?: unknown;      // Optional additional context (never contains stack traces)
}
```

---

## 5. Game State Machine

### 5.1 States

| State | Description |
|---|---|
| `LOBBY` | Players joining, host configuring settings. |
| `PROMPT` | All players writing their initial prompt. |
| `DRAWING` | All players drawing based on text they received. |
| `GUESSING` | All players guessing based on drawing they received. |
| `REVIEW` | Host-controlled reveal of completed chains. |
| `ENDED` | Game over. Results available for download. |

### 5.2 Transitions

```
LOBBY ──[game:start (host, >= 4 players)]──> PROMPT
PROMPT ──[all submitted OR timer expired]──> DRAWING
DRAWING ──[all submitted OR timer expired]──> GUESSING  (if more rounds remain and next is guess)
DRAWING ──[all submitted OR timer expired]──> REVIEW    (if this was the final round)
GUESSING ──[all submitted OR timer expired]──> DRAWING  (if more rounds remain)
GUESSING ──[all submitted OR timer expired]──> REVIEW   (if this was the final round)
REVIEW ──[host advances past last entry of last chain]──> ENDED
ENDED ──[game:play-again (host)]──> (new game in LOBBY)
```

### 5.3 Transition Guards

Each transition has preconditions that must be met. The `StateMachine` module enforces these.

| Transition | Guard |
|---|---|
| LOBBY -> PROMPT | Sender is host. At least 4 connected players. |
| PROMPT -> DRAWING | All players submitted OR timer expired (with 2s grace). Round 0 complete. |
| DRAWING -> GUESSING | All players submitted OR timer expired. More rounds remain. Next round is odd-numbered (guess). |
| DRAWING -> REVIEW | All players submitted OR timer expired. This was the final round. |
| GUESSING -> DRAWING | All players submitted OR timer expired. More rounds remain. Next round is even-numbered (draw). |
| GUESSING -> REVIEW | All players submitted OR timer expired. This was the final round. |
| REVIEW -> ENDED | Host has advanced past the last entry of the last chain. |
| ENDED -> new LOBBY | Sender is host. At least one connected player. |

### 5.4 Host Transfer Logic

When the current host is no longer available (left, kicked, or timed out after disconnect), host privileges transfer automatically:

1. Build a list of connected players, sorted by `joinOrder` ascending.
2. The first connected player in this list becomes the new host.
3. Update `game.hostPlayerId` and the player's `isHost` flag.
4. Emit `game:host-changed` to all players in the room.
5. If no connected players remain, the game enters cleanup (see section 12).

Host transfer can occur in any state: LOBBY, PROMPT, DRAWING, GUESSING, or REVIEW.

### 5.5 Round Determination

Given `currentRound` (0-based, where round 0 is the PROMPT phase):

```typescript
function getRoundType(round: number): "PROMPT" | "DRAWING" | "GUESSING" {
  if (round === 0) return "PROMPT";
  // After the prompt, rounds alternate: draw (odd), guess (even)
  return round % 2 === 1 ? "DRAWING" : "GUESSING";
}
```

Total rounds (including prompt): `totalRounds = roundCount + 1` where `roundCount` is either `players.length - 1` (if `useAllRounds`) or `customRoundCount`.

The game ends after round `totalRounds - 1` is complete, meaning after round index `roundCount`.

---

## 6. Chain Rotation Algorithm

### 6.1 Assignment

Each player is assigned an `orderIndex` from 0 to N-1 (where N is the number of players) based on join order.

In each round, the server determines which chain each player works on:

```typescript
function getChainIndexForPlayer(playerOrderIndex: number, round: number, totalPlayers: number): number {
  // Player P in round R works on the chain that originated from player (P - R + N) % N
  return ((playerOrderIndex - round) % totalPlayers + totalPlayers) % totalPlayers;
}
```

This ensures:
- In round 0 (PROMPT), player P works on chain P (their own chain -- they write the initial prompt).
- In round 1, player P works on chain (P-1) mod N (the chain from the player before them).
- By the final round, every player has contributed to every chain exactly once.
- No player sees their own chain again until review (because `round < N` always holds, and `(P - R) mod N != P` when `0 < R < N`).

### 6.2 What the Player Receives

When a round starts, the server looks up which chain this player is working on, then retrieves the last entry in that chain:

```typescript
function getInputForPlayer(game: Game, playerOrderIndex: number, round: number): { prompt?: string; drawing?: string } {
  const chainIndex = getChainIndexForPlayer(playerOrderIndex, round, game.players.length);
  const chain = game.chains[chainIndex];
  const lastEntry = chain.entries[chain.entries.length - 1];

  if (lastEntry.type === "PROMPT" || lastEntry.type === "GUESS") {
    return { prompt: lastEntry.content };  // Player will draw this text
  } else {
    return { drawing: lastEntry.content }; // Player will guess this drawing
  }
}
```

---

## 7. Timer Management

### 7.1 Architecture

The `TimerService` manages all game timers. Each game has at most one active timer at a time (the current round timer).

```typescript
interface TimerService {
  startRoundTimer(gameId: string, durationMs: number, onExpire: () => void): void;
  clearRoundTimer(gameId: string): void;
  getRemainingMs(gameId: string): number | null;
  startTransitionTimer(gameId: string, durationMs: number, onComplete: () => void): void;
  startCleanupTimer(gameId: string, durationMs: number, onExpire: () => void): void;
  clearAll(gameId: string): void;
}
```

### 7.2 Round Timer Flow

1. When a round starts, the server records `roundStartedAt = Date.now()` and calculates `roundEndsAt = roundStartedAt + durationMs`.
2. A `setTimeout` is created for `durationMs + 2000` (the 2-second grace period from product spec section 8.3).
3. Every 10 seconds, the server emits `round:tick` with the remaining time (not counting the grace period -- the client timer should reach 0 and then submissions are still accepted for 2 more seconds silently).
4. When a player submits, the server checks `Date.now() <= roundEndsAt + 2000`. If the submission is after the grace period, it is rejected.
5. When the timeout fires:
   - Auto-submit for any players who have not submitted.
   - Emit `round:ended` with transition info.
   - Start a transition timer (3000ms).
6. When all players submit before the timer: clear the timeout, emit `round:ended`, start the transition timer.

### 7.3 Transition Timer

Between rounds, a 3-second transition screen is shown. The server controls this:

1. After emitting `round:ended`, the server starts a 3-second `setTimeout`.
2. When the timeout fires, the server starts the next round (emit `round:start`) or begins review (emit `review:entry`).
3. This keeps all clients synchronized -- the server is the authority on when the next round begins.

### 7.4 Tick Synchronization

The `round:tick` event is emitted every 10 seconds to correct for client clock drift. The client should:

1. On receiving `round:start`, record `timerStartedAt` and `timerDurationMs`.
2. Compute remaining time locally each frame: `remaining = timerDurationMs - (Date.now() - timerStartedAt)`.
3. On receiving `round:tick`, adjust the local timer: `remaining = payload.remainingMs`.

This avoids per-second server messages while still correcting drift over a 60-120 second round.

### 7.5 Disconnect Timers

When a player disconnects (socket close without voluntary leave):

1. A 60-second reconnection timer is started for that player.
2. If the player reconnects within 60 seconds, the timer is cleared.
3. If the timer fires, the player is marked as permanently disconnected:
   - Their entries for all remaining rounds are auto-submitted immediately.
   - They can no longer reconnect.
   - If they were the host, host transfer occurs.

---

## 8. Rate Limiting

### 8.1 REST Endpoint Rate Limits

Implemented using `express-rate-limit` with in-memory store.

| Endpoint | Window | Max Requests | Key |
|---|---|---|---|
| `POST /api/games` | 1 hour | 5 | IP address |
| `POST /api/games/:code/join` | 1 minute | 20 | IP address |
| `GET /api/games/:code` | 1 minute | 60 | IP address |
| `GET /api/games/:code/results` | 1 minute | 10 | IP address |

**Rate limit response (429 Too Many Requests):**

```json
{
  "code": "RATE_LIMITED",
  "message": "Too many requests. Please try again later.",
  "retryAfterMs": 45000
}
```

The `Retry-After` HTTP header is also set (in seconds).

### 8.2 Socket.IO Event Rate Limits

Implemented as custom middleware on the Socket.IO server. Rate limits are per-socket (not per-IP, because all players in a household share one IP).

| Event | Window | Max Events | Action on Exceed |
|---|---|---|---|
| `round:submit` | 10 seconds | 5 | Emit `error`, ignore event |
| `game:settings` | 5 seconds | 3 | Emit `error`, ignore event |
| `review:next` | 1 second | 5 | Emit `error`, ignore event |
| `review:previous` | 1 second | 5 | Emit `error`, ignore event |
| Any event (global) | 1 second | 20 | Disconnect socket |

The global rate limit prevents abuse via any event type. If a socket exceeds 20 events per second, it is disconnected immediately.

---

## 9. Data Validation

All validation uses `zod` schemas. Validation failures return structured errors with field-level detail.

### 9.1 Display Name Validation

```typescript
const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Display name must be at least 2 characters")
  .max(16, "Display name must be at most 16 characters")
  .regex(/^[a-zA-Z0-9 ]+$/, "Display name can only contain letters, numbers, and spaces");
```

### 9.2 Game Code Validation

```typescript
const VALID_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ"; // excludes I, O, L

const gameCodeSchema = z
  .string()
  .transform(s => s.toUpperCase())
  .refine(
    s => s.length === 4 && [...s].every(c => VALID_CODE_CHARS.includes(c)),
    "Game code must be exactly 4 letters (excluding I, O, L)"
  );
```

### 9.3 Prompt and Guess Validation

```typescript
const textContentSchema = z
  .string()
  .trim()
  .min(1, "Content cannot be empty")
  .max(80, "Content must be at most 80 characters")
  .transform(sanitizeHtml); // Strips HTML tags, encodes special characters
```

### 9.4 Drawing Validation

```typescript
const drawingContentSchema = z
  .string()
  .refine(
    s => s.startsWith("data:image/png;base64,"),
    "Drawing must be a PNG data URI"
  )
  .refine(
    s => {
      const base64 = s.replace("data:image/png;base64,", "");
      const sizeInBytes = Math.ceil(base64.length * 3 / 4);
      return sizeInBytes <= 500 * 1024; // 500KB
    },
    "Drawing must be smaller than 500KB"
  );
```

### 9.5 Settings Validation

```typescript
const settingsSchema = z.object({
  drawingTimerSeconds: z.enum(["30", "45", "60", "90", "120"]).transform(Number).optional(),
  guessingTimerSeconds: z.enum(["15", "20", "30", "45", "60"]).transform(Number).optional(),
  promptTimerSeconds: z.enum(["15", "20", "30", "45", "60"]).transform(Number).optional(),
  useAllRounds: z.boolean().optional(),
  customRoundCount: z.number().int().min(2).max(19).nullable().optional(),
}).optional();
```

Note: `customRoundCount` is further validated at game start to ensure it does not exceed `players.length - 1`.

### 9.6 XSS Sanitization

The `sanitize` utility strips HTML from all text inputs. This applies to:
- Display names
- Prompts
- Guesses

Implementation approach: use a simple allowlist -- only allow alphanumeric characters, spaces, and common punctuation. Strip anything that looks like an HTML tag. Encode `<`, `>`, `&`, `"`, `'` as their HTML entities.

```typescript
function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
```

This is defense-in-depth. The frontend should also escape when rendering, but the server ensures no raw HTML is stored in game state.

### 9.7 Socket.IO Payload Validation

Every Socket.IO event handler wraps its logic in a validation layer:

```typescript
function withValidation<T>(schema: z.ZodSchema<T>, handler: (data: T, socket: Socket) => void) {
  return (rawData: unknown, socket: Socket) => {
    const result = schema.safeParse(rawData);
    if (!result.success) {
      socket.emit("error", {
        code: "VALIDATION_ERROR",
        message: "Invalid event data",
        details: result.error.flatten(),
      });
      return;
    }
    handler(result.data, socket);
  };
}
```

---

## 10. Error Handling Strategy

### 10.1 Error Shape

All errors -- REST and WebSocket -- use the same shape:

```typescript
interface AppError {
  code: string;    // Machine-readable, UPPER_SNAKE_CASE
  message: string; // Human-readable, safe to display
  details?: unknown; // Optional structured details (validation errors, etc.)
}
```

REST errors include the appropriate HTTP status code. WebSocket errors are emitted as `error` events.

### 10.2 Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `INVALID_DISPLAY_NAME` | 400 | Display name fails validation rules |
| `INVALID_GAME_CODE` | 400 | Game code format is wrong |
| `INVALID_SETTINGS` | 400 | Settings values outside allowed ranges |
| `INVALID_CONTENT` | 400 | Submission content fails validation |
| `MISSING_PLAYER_ID` | 400 | Required playerId query parameter is missing |
| `VALIDATION_ERROR` | 400 | Generic validation failure (includes field details) |
| `NOT_HOST` | 403 | Action requires host privileges |
| `NOT_A_PLAYER` | 403 | Player ID is not a participant in this game |
| `GAME_NOT_FOUND` | 404 | No active game with this code |
| `PLAYER_NOT_FOUND` | 404 | Player not found in this game |
| `GAME_ALREADY_STARTED` | 409 | Cannot join -- game is past LOBBY state |
| `GAME_FULL` | 409 | Game has reached 20-player maximum |
| `GAME_NOT_FINISHED` | 409 | Results not available -- game not in REVIEW/ENDED |
| `DISPLAY_NAME_TAKEN` | 409 | Another player already has this name |
| `INVALID_STATE` | 409 | Action not valid in the current game state |
| `ALREADY_SUBMITTED` | 409 | Player already submitted for this round |
| `CANNOT_END_EARLY` | 409 | Too many players still need to submit |
| `CANNOT_KICK_HOST` | 409 | Cannot kick the host player |
| `ROUND_EXPIRED` | 410 | Round timer has expired (including grace period) |
| `CONTENT_TOO_LARGE` | 413 | Drawing exceeds 500KB limit |
| `RATE_LIMITED` | 429 | Too many requests |
| `INVALID_CREDENTIALS` | -- | Socket auth failed |
| `INVALID_TOKEN` | -- | Reconnection token mismatch |
| `KICKED` | -- | Player was removed by host |
| `NOT_ENOUGH_PLAYERS` | -- | Fewer than 4 players to start |
| `CANNOT_END_EARLY` | -- | More than 1 player has not submitted |
| `INTERNAL_ERROR` | 500 | Unexpected server error (no details leaked) |

### 10.3 REST Error Handler

Express error-handling middleware catches all errors and formats them consistently:

```typescript
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      code: err.code,
      message: err.message,
      details: err.details,
    });
    return;
  }

  // Unexpected error -- log full details, return sanitized response
  logger.error("Unhandled error", { error: err, path: req.path, method: req.method });
  res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred. Please try again.",
  });
});
```

### 10.4 WebSocket Error Wrapping

Every Socket.IO event handler is wrapped in a try-catch. Unhandled errors are logged and a generic `error` event is emitted to the sender. Other players are never affected by one player's bad message.

```typescript
function wrapHandler(handler: (socket: Socket, data: unknown) => void) {
  return (socket: Socket, data: unknown) => {
    try {
      handler(socket, data);
    } catch (err) {
      logger.error("Socket handler error", {
        event: handler.name,
        socketId: socket.id,
        error: err,
      });
      socket.emit("error", {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      });
    }
  };
}
```

### 10.5 Graceful Degradation

- **Socket.IO falls back to long-polling** if WebSocket upgrade fails (e.g., corporate proxies). No code changes needed -- Socket.IO handles this automatically.
- **If a player's connection is too slow for drawing data**, the base64 PNG will be chunked by Socket.IO's internal buffering. The 500KB limit ensures this stays manageable.
- **If the server process crashes and restarts**, all in-memory game state is lost. All connected clients will see the connection drop and attempt to reconnect. Since the state is gone, reconnection will fail and clients will show the landing page. This is acceptable for v1 -- the product spec acknowledges in-memory state loss on restart (section 12.3).

---

## 11. Reconnection and Session Management

### 11.1 Token Generation

Reconnection tokens are generated using `crypto.randomBytes(32)` and base64-encoded. They are opaque to the client.

```typescript
import crypto from "crypto";

function generateReconnectionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
```

Using `base64url` encoding (no `+`, `/`, or `=`) makes the token safe for use in URLs and storage without escaping.

### 11.2 Token Storage

Tokens are stored in the `Player` object in the game state. There is no separate token store. Token lookup is: find the game by code, find the player by ID, compare the token.

### 11.3 Reconnection Flow

```
Client                          Server
  |                               |
  |-- connect(auth: {code, id, token}) -->
  |                               |
  |                     Validate token
  |                     Mark player connected
  |                     Clear disconnect timer
  |                     Join socket to game room
  |                               |
  |<---- game:state (full sync) --|
  |                               |
  |                     Emit game:player-joined
  |                     (isReconnect: true)
  |                     to all other players
  |                               |
```

### 11.4 Reconnection During Active Round

If a player reconnects while a round is in progress:

1. The `game:state` payload includes `roundData` with the current round info.
2. If the player has not yet submitted and the timer has not expired, they can still submit.
3. If the player has already submitted (before disconnect), `roundData.hasSubmitted` is `true` and they see the waiting screen.
4. If the timer expired while they were disconnected, their entry was auto-submitted. They see the waiting screen (or the round may have already advanced).

### 11.5 Token Invalidation

A reconnection token is invalidated when:
- The player voluntarily leaves (`player:leave`).
- The player is kicked by the host (`game:kick`).
- The game reaches ENDED state and the cleanup timer fires (10 minutes).
- A new game is started via play-again (new tokens are issued).

### 11.6 Duplicate Connection Handling

If a new socket connects with valid credentials while an existing socket for the same player is still connected:

1. The old socket receives an `error` event with code `SESSION_REPLACED` and message "Your session has been replaced by a new connection."
2. The old socket is disconnected by the server.
3. The new socket becomes the active connection for that player.

This handles the product spec requirement (section 10.4): "If the player opens the game URL in a new tab while their old session is still active, the old session is terminated and the new tab takes over."

---

## 12. Game Cleanup and Memory Management

### 12.1 Cleanup Triggers

| Trigger | Action |
|---|---|
| Game reaches ENDED state | Start a 10-minute cleanup timer. After 10 minutes, delete the game from the store and recycle the game code. |
| All players disconnect from an active game | Start a 2-minute cleanup timer. If any player reconnects, cancel the timer. If the timer fires, delete the game. |
| Game in LOBBY with no players | Delete immediately (no waiting period). |

### 12.2 Memory Budget

Worst-case memory per game (20 players, full rotation = 19 rounds, 20 rounds total including prompt):

- Game metadata: ~2KB
- Player data (20 players): ~5KB
- Chain entries (20 chains x 20 entries each = 400 entries):
  - Text entries (~100 bytes each): ~200 entries x 100 bytes = ~20KB
  - Drawing entries (~150KB each): ~200 entries x 150KB = ~30MB

**Total per game: ~30MB worst case.** On a B1 instance with 1.75GB RAM, this allows ~50 concurrent worst-case games. Realistically, games will have 6-8 players and drawings will average 80KB, yielding ~3-5MB per game and supporting hundreds of concurrent games.

### 12.3 Timer Cleanup

When a game is deleted, `TimerService.clearAll(gameId)` is called to clear all pending `setTimeout` handles for that game. This prevents orphaned timers from firing after the game state is gone.

### 12.4 Periodic Sweep

A background sweep runs every 5 minutes to find and delete stale games:

- Games in ENDED state that have been ended for more than 10 minutes.
- Games in LOBBY state with no connected players for more than 5 minutes.
- Games in any active state with no connected players for more than 2 minutes.

This is a safety net in case individual cleanup timers fail (e.g., due to a caught exception preventing timer setup).

---

## 13. TypeScript Type Definitions

These are the authoritative type definitions shared between server modules. Frontend developers should use these as the contract for event payloads.

### 13.1 Game State Types

```typescript
// -- Game States --

type GameState = "LOBBY" | "PROMPT" | "DRAWING" | "GUESSING" | "REVIEW" | "ENDED";

// -- Settings --

interface GameSettings {
  drawingTimerSeconds: 30 | 45 | 60 | 90 | 120;
  guessingTimerSeconds: 15 | 20 | 30 | 45 | 60;
  promptTimerSeconds: 15 | 20 | 30 | 45 | 60;
  useAllRounds: boolean;
  customRoundCount: number | null;
}

// -- Player --

interface Player {
  id: string;
  displayName: string;
  isHost: boolean;
  isConnected: boolean;
  reconnectionToken: string;
  joinOrder: number;
  orderIndex: number | null;  // Assigned at game start, null in lobby
  socketId: string | null;    // Current Socket.IO socket ID, null if disconnected
}

// -- Chain --

type ChainEntryType = "PROMPT" | "DRAWING" | "GUESS";

interface ChainEntry {
  type: ChainEntryType;
  playerId: string;
  playerDisplayName: string;
  content: string;
  submittedAt: number;       // Unix timestamp ms
  wasAutoSubmitted: boolean;
}

interface Chain {
  originPlayerIndex: number;
  entries: ChainEntry[];
}

// -- Review Cursor --

interface ReviewCursor {
  chainIndex: number;
  entryIndex: number;
}

// -- Game --

interface Game {
  id: string;
  code: string;
  state: GameState;
  hostPlayerId: string;
  settings: GameSettings;
  players: Player[];
  chains: Chain[];
  currentRound: number;         // 0-based. 0 = prompt phase.
  totalRounds: number;          // Total rounds including prompt.
  roundStartedAt: number | null; // Unix timestamp ms
  roundEndsAt: number | null;    // Unix timestamp ms (not including grace period)
  submittedPlayerIds: Set<string>;
  reviewCursor: ReviewCursor | null;
  createdAt: number;             // Unix timestamp ms
  endedAt: number | null;        // Unix timestamp ms
}
```

### 13.2 GameStore Interface

```typescript
interface GameStore {
  create(game: Game): void;
  getById(id: string): Game | undefined;
  getByCode(code: string): Game | undefined;
  update(game: Game): void;
  delete(id: string): void;
  isCodeInUse(code: string): boolean;
  getAll(): Game[];  // For periodic sweep
}
```

The in-memory implementation uses two `Map` objects: one keyed by `id`, one keyed by `code` (both pointing to the same `Game` reference). This gives O(1) lookup by either key.

### 13.3 Client-to-Server Event Types

```typescript
// -- Client -> Server Events --

interface ClientToServerEvents {
  "player:reconnect": (data: {
    gameCode: string;
    playerId: string;
    reconnectionToken: string;
  }) => void;

  "player:leave": () => void;

  "game:start": () => void;

  "game:settings": (data: {
    drawingTimerSeconds?: number;
    guessingTimerSeconds?: number;
    promptTimerSeconds?: number;
    useAllRounds?: boolean;
    customRoundCount?: number | null;
  }) => void;

  "game:kick": (data: {
    targetPlayerId: string;
  }) => void;

  "round:submit": (data: {
    content: string;
  }) => void;

  "round:end-early": () => void;

  "review:next": () => void;

  "review:previous": () => void;

  "game:play-again": () => void;
}
```

### 13.4 Server-to-Client Event Types

```typescript
// -- Server -> Client Events --

interface ServerToClientEvents {
  "game:state": (data: GameStatePayload) => void;
  "game:player-joined": (data: PlayerJoinedPayload) => void;
  "game:player-left": (data: PlayerLeftPayload) => void;
  "game:started": (data: GameStartedPayload) => void;
  "game:host-changed": (data: HostChangedPayload) => void;
  "game:ended": (data: GameEndedPayload) => void;
  "round:start": (data: RoundStartPayload) => void;
  "round:player-submitted": (data: PlayerSubmittedPayload) => void;
  "round:ended": (data: RoundEndedPayload) => void;
  "round:tick": (data: TickPayload) => void;
  "review:entry": (data: ReviewEntryPayload) => void;
  "error": (data: ErrorPayload) => void;
}

// Individual payload types are detailed in section 4.2.
// Refer to those definitions for the exact shape of each payload.
```

---

## 14. Security Considerations

### 14.1 No Authentication, but Authorization

There is no user authentication (no login). However, authorization is enforced per-action:

- **Game code + player ID + reconnection token** together act as a credential. The reconnection token is a 256-bit random value -- effectively unguessable.
- **Host actions** are checked: every host-only event handler verifies that the sender's player ID matches `game.hostPlayerId`.
- **Player actions** are checked: `round:submit` verifies the sender is a player in the game and has not already submitted.

### 14.2 Input Sanitization

All text inputs (display names, prompts, guesses) are sanitized on ingress (see section 9.6). This is server-side defense-in-depth -- the frontend must also escape when rendering.

### 14.3 Drawing Abuse Prevention

- Drawings are validated as PNG data URIs.
- Maximum size: 500KB per drawing.
- Drawings are stored as-is (base64 string) and served back to clients as-is. They are rendered in `<img>` tags, not injected as HTML, so there is no XSS vector from drawing content.

### 14.4 Game Code Unpredictability

Game codes are randomly selected from 22^4 = 234,256 possibilities. They are not sequential. An attacker trying to guess a valid game code would need to try ~117,128 codes on average, which the rate limiter (20 joins per minute per IP) makes infeasible.

### 14.5 No Sensitive Data

No passwords, emails, or PII are collected or stored. Display names are transient and discarded when the game is cleaned up. There is nothing to leak in a breach.

### 14.6 CORS Configuration

```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "*",  // Restrict in production
  methods: ["GET", "POST"],
  credentials: false,
}));
```

In production, `ALLOWED_ORIGIN` should be set to the frontend domain. For local development, `*` is acceptable.

### 14.7 Request Size Limits

Express body parser is configured with a size limit to prevent memory abuse:

```typescript
app.use(express.json({ limit: "1mb" }));
```

Socket.IO is configured with a max buffer size:

```typescript
const io = new Server(httpServer, {
  maxHttpBufferSize: 1e6,  // 1MB max per message
});
```

---

## 15. Deployment and Operations

### 15.1 Azure App Service Configuration

| Setting | Value | Rationale |
|---|---|---|
| Tier | B1 (Linux) | 1.75GB RAM, 1 CPU core. Sufficient for target scale. |
| Node version | 20 LTS | Set via `WEBSITE_NODE_DEFAULT_VERSION` or engine config. |
| WebSockets | Enabled | Must be explicitly enabled in App Service configuration. |
| Always On | Enabled | Prevents the app from being unloaded after idle periods (which would lose all game state). Required on B1 tier. |
| Health check path | `/api/health` | Azure pings this endpoint to determine instance health. |

### 15.2 Health Check Endpoint

```
GET /api/health
```

**Response: 200 OK**

```json
{
  "status": "ok",
  "uptime": 3600,
  "activeGames": 3,
  "activePlayers": 18,
  "memoryUsageMB": 85
}
```

Not rate-limited. Used by Azure health probes and operational monitoring.

### 15.3 Environment Variables

```
PORT=8080                          # Azure sets this automatically
NODE_ENV=production                # Disables dev-only middleware
ALLOWED_ORIGIN=https://example.com # CORS origin for production
LOG_LEVEL=info                     # info | debug | warn | error
```

No secrets are needed -- there is no database, no external API keys, no auth provider.

### 15.4 Logging

Structured JSON logs via a lightweight logger (pino or winston):

```json
{
  "level": "info",
  "timestamp": "2026-04-23T20:00:00.000Z",
  "message": "Game created",
  "gameCode": "FROG",
  "gameId": "a1b2c3d4-...",
  "hostDisplayName": "Alice",
  "requestId": "req-1234"
}
```

**What is logged:**
- Game lifecycle events (created, started, ended, deleted).
- Player join/leave events.
- Errors (with stack traces for server-side logs, never sent to clients).
- Rate limit hits.
- Reconnection attempts (success and failure).

**What is NOT logged:**
- Prompt/guess content (unnecessary, transient).
- Drawing content (too large, unnecessary).
- Reconnection tokens (secrets).

### 15.5 Graceful Shutdown

On `SIGTERM` (sent by Azure during deployments and restarts):

1. Stop accepting new HTTP connections and Socket.IO connections.
2. Emit `error` to all connected sockets with code `SERVER_SHUTTING_DOWN` and message "Server is restarting. Your game state may be lost."
3. Wait up to 5 seconds for in-flight requests to complete.
4. Close all Socket.IO connections.
5. Exit the process.

```typescript
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, starting graceful shutdown");
  
  io.emit("error", {
    code: "SERVER_SHUTTING_DOWN",
    message: "Server is restarting. Your game state may be lost.",
  });

  httpServer.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn("Forced shutdown after timeout");
    process.exit(1);
  }, 5000);
});
```

### 15.6 Build and Start

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  }
}
```

Production runs the compiled JavaScript. Development uses `tsx` for fast iteration with TypeScript.

---

*End of backend architecture document.*
