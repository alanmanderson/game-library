# Dittle

Web-based two-player **Dittle: Dice Battle** with online rooms (4-letter codes) and a
self-play-trained AI opponent. Node 20 + Express + `ws`, with a static vanilla-JS
frontend served from `public/`. No database — all state is in memory.

Deployed at `dittle.games.alanmanderson.com`.

## Quick start

```bash
npm install
npm run train      # optional: (re)learn AI weights via self-play -> ai/weights.json
npm start          # serve on http://localhost:3000
```

Open `http://localhost:3000` and either play the computer or create/join an online room.

## Running tests

```bash
npm test               # engine unit tests (test/engine.test.js)
node test/e2e.mjs      # end-to-end WebSocket smoke test (start `npm start` first)
```

The engine tests are pure and need no server or network. The e2e test connects to a
running server over WebSocket.

## Project structure

| Path | Purpose |
|------|---------|
| `shared/engine.js` | Pure rules engine (board, moves, clashes, win/score). Runs in Node **and** the browser. |
| `shared/ai.js` | Evaluation features + alpha-beta look-ahead search. |
| `ai/train.js` | Self-play evolutionary trainer → `ai/weights.json`. |
| `ai/weights.json` | Learned evaluation weights + training metadata. |
| `server/server.js` | Express static host + WebSocket rooms + AI opponent + `/health`. |
| `server/rooms.js` | In-memory room manager (create/join by 4-letter code). |
| `server/logservice.js` | Centralized log-service SDK (WARNING+ → `LOG_SERVICE_URL`). |
| `public/` | Frontend: home screen, interactive board, hints. |
| `test/` | `engine.test.js` (unit) and `e2e.mjs` (WebSocket smoke). |

## Architecture

- **Authoritative server.** The Node server owns all game state. Clients send intents
  (`move`, `hint`, `rematch`); the server validates against `legalMoves` and broadcasts
  the resulting state to both seats. Clients never mutate state locally.
- **One shared engine.** `shared/engine.js` is imported by the server and served to the
  browser at `/shared/engine.js`, so client and server run identical rules.
- **AI opponent.** In `mode: 'ai'` rooms the server computes the computer's reply with
  `bestMove` (alpha-beta minimax over learned weights) after each human move.
- **Rooms** are keyed by a 4-letter code (ambiguous characters excluded) and deleted
  when both seats disconnect. There is no persistence — a restart clears all rooms.

### WebSocket protocol

Single `ws` endpoint on the same HTTP server. Client → server messages (JSON, keyed by
`type`): `create` (`mode`, `aiDepth`, `name`), `join` (`code`, `name`), `move` (`move`),
`hint`, `rematch`. Server → client: `created`, `joined`, `state` (authoritative state
plus that seat's `legalMoves` and `yourTurn`), `hint`, `error`, `opponentLeft`.

A **move** is a path: `{ from, tilt, jumps }` where `tilt` is a single tilt direction
(`'N'|'S'|'E'|'W'`) or `null`, and `jumps` is an array of jump-hop directions (each hop
leaps one die, and the chain may turn). This encodes all move kinds — a plain tilt
(`jumps: []`), a jump chain (`tilt: null`), or a tilt-then-jump. The server validates a
submitted move by `moveKey` identity against `legalMoves` (two different paths can share
a start/end square, so matching on `from`/`to` alone is insufficient).

## Environment variables

| Var | Description |
|-----|-------------|
| `PORT` | Listen port. Defaults to `3000` locally; the container runs on `8080`. |
| `LOG_SERVICE_URL` | Centralized log-service ingest endpoint. Unset locally. |
| `LOG_SERVICE_API_KEY` | Bearer key for the log service. Unset locally. |

## Conventions

- **ES modules, plain JavaScript** (`"type": "module"`). No build step and no
  TypeScript — `public/` is served as-is.
- **Engine purity:** `shared/engine.js` has no I/O and no server/browser assumptions so
  it stays testable and shareable. Keep new rules logic there, not in `server.js`.
- **Server is authoritative:** never trust a client move; always re-derive `legalMoves`
  and match the intent before applying it.
- **Logging:** use `logService.warn/error/fatal` for anything that should reach the
  centralized log service; plain `console.log` is fine for local/dev startup notes.
