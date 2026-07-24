# Dittle — Web Edition

A web-based, two-player version of **Dittle: Dice Battle** with online rooms and a
machine-learning AI opponent that uses look-ahead search.

Two people can play head-to-head by sharing a 4-letter room code, or a single
player can battle a computer opponent whose evaluation function was **trained by
self-play** and which searches several moves ahead with alpha-beta pruning.

```
┌─────────────┐    WebSocket    ┌──────────────────────────┐
│  Browser    │ ◄─────────────► │  Node server (authoritative)│
│  (public/)  │                 │  rooms · game state · AI    │
└─────────────┘                 └──────────┬──────────────┘
        ▲  imports                          │ imports
        └───────────  shared/engine.js  ◄───┘   (one rules engine, server + client)
                      shared/ai.js
```

## Quick start

```bash
npm install
npm run train      # optional: (re)learn AI weights via self-play -> ai/weights.json
npm start          # serve on http://localhost:3000
```

Open `http://localhost:3000`:

- **Play vs Computer** — pick a difficulty (search depth) and play immediately.
- **Create Online Room** — get a 4-letter code, share it, opponent clicks **Join Room**.

## How the game works

A faithful digital adaptation of **Dittle: Dice Battle**, with **both official
variants**. You choose the variant when you create a game. See **[Rules.md](Rules.md)**
for the complete rules of each.

Shared basics — **7×7 board**, **7 dice** each on your home row (6 face-up, 3 facing
you). One die moves per turn, always **forward or sideways, never backward or
diagonal**. A **tilt** rolls a die one square, changing its top number (the *only* way a
number changes).

**Traditional Dittle** — the full game:

- **Goal:** get **all seven** of your dice into the opponent's home row. The game ends
  the moment one player has all seven across.
- **Winner:** whoever's dice in the home row show the **higher total** of top numbers
  (a tie is a draw). Filling first does **not** guarantee the win — arrival *numbers*
  matter as much as arrival *speed*, and you can keep tilting a die up once it's across.
- **Jumps allowed:** leap a die over one or more dice (yours or the enemy's) to the
  empty square beyond; jumps keep the top number and never capture. Pure jumps go
  **straight**; a **tilt + jump** may turn (an “L-shape”). **No dice are ever removed.**

**Dittle Clash** — the fast, aggressive variant:

- **Goal:** get **any one** die onto the opponent's home row and you win immediately.
- **No jumping** — tilts only. **Direct clash:** tilt onto an enemy die → the **lower**
  top number is removed (a tie removes both). **Surround clash:** a die adjacent to
  **two or more** enemies compares its number to their **sum**; the lower side is wiped
  out (resolved repeatedly until stable).
- You also win by **elimination** (opponent has no dice) or if the opponent is **stuck**.

Both variants fall back to a **positional adjudication** if a game stalls or hits the
move-limit safety cap.

## The AI

`shared/ai.js` chooses moves with **alpha-beta minimax look-ahead**. Depth is the
difficulty setting (Easy = 2 plies … Brutal = 7 plies). Move ordering (captures,
forward tilts, and winning moves first) makes the pruning effective, so even 7-ply
search returns in well under a second.

Positions are scored by a **linear evaluation function** over hand-designed
features, and **each variant has its own features and its own learned weights**
(they reward very different play):

- **Clash:** material advantage, advancement, most-advanced die, pip strength,
  one-move-from-goal threat, surround vulnerability, central control.
- **Traditional:** dice already across, the up-face *total* across (the actual win
  metric), advancement, dice one move from crossing, pip strength, central control.

### Machine learning: self-play weight training

The evaluation's feature weights are **learned**, not hand-set. `ai/train.js` runs an
evolutionary self-play loop:

1. A champion weight vector starts from sensible defaults.
2. Each generation, a mutated **challenger** is scored by its **win rate against a
   fixed benchmark** over many games with predetermined opening seeds (same seeds
   for every candidate → fair, low-variance fitness), playing both colors.
3. A challenger that scores higher becomes the new champion. Mutation size anneals
   over the run.
4. Finally the champion is checked on a **disjoint validation set** of openings; the
   learned weights are only written to `ai/weights.json` if they beat the benchmark
   on unseen games — otherwise it falls back to the safe defaults, so training can
   never ship a regression.

`ai/train.js` trains **both variants** and writes them to `ai/weights.json` as
`{ traditional: { weights, meta }, clash: { weights, meta } }`. The server loads the
right set per room variant (falling back to defaults for anything absent). Each entry
records training metadata including train and held-out validation win rates; if the
learned weights don't clearly beat the defaults on unseen openings, the safe defaults
are kept so training can never ship a regression.

```bash
npm run train            # train both variants (5 sweeps each)
node ai/train.js 8 clash # train just one variant, deeper
```

## Project layout

| Path | Purpose |
|------|---------|
| `Rules.md` | Complete rules for both variants (Traditional + Clash). |
| `shared/engine.js` | Pure, variant-aware rules engine (board, moves, clashes, win/score). Runs in Node **and** the browser. |
| `shared/ai.js` | Evaluation features + alpha-beta search. |
| `ai/train.js` | Self-play trainer → `ai/weights.json`. |
| `ai/weights.json` | Learned evaluation weights + training metadata. |
| `server/server.js` | Express static host + WebSocket rooms + AI opponent. |
| `server/rooms.js` | Room manager (create/join by code). |
| `public/` | Front-end: home screen, interactive board, hints. |
| `test/engine.test.js` | Engine unit tests (`npm test`). |
| `test/e2e.mjs` | End-to-end WebSocket smoke test (server must be running). |

## Tests

```bash
npm test               # engine unit tests
node test/e2e.mjs      # end-to-end (start `npm start` first)
```
