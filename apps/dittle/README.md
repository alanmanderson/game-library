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

A faithful digital adaptation of Dittle (Clash-style rules):

- **Board:** 7×7. Each player starts with **7 dice** on their home row, **6 face-up**,
  the 3 facing toward them.
- **A move** is a **tilt** or a **jump** (no backward moves, no diagonals):
  - **Tilt** one die one square **forward** (toward the far side) or **sideways**.
    The die physically rolls, so its top number changes.
  - **Jump** a die in a straight line over one or more dice — **yours or the
    enemy's** — landing on the empty square just past a jumped die. Jumps chain when
    dice are separated by a gap. A jump does **not** change the die's number and does
    **not** capture. Jumping over the opponent's home-row wall is often the way to
    break through.
- **Direct clash:** tilt onto an enemy die → the die showing the **lower** top number
  is removed; a tie removes both. You cannot land on your own die. (Jumps land on
  empty squares, so they never clash directly — but landing can trigger a surround.)
- **Surround clash:** after every move, any die orthogonally adjacent to **two or more**
  enemies compares its number to the **sum** of those enemies; the lower side is wiped
  out (a tie removes all involved). This resolves repeatedly until stable.
- **Winning:**
  1. **Breakthrough** — get any one die onto the opponent's home row.
  2. **Elimination** — capture all of the opponent's dice.
  3. **Stuck** — the opponent has no legal move on their turn.
  4. **Score** — if no one breaks through within 60 moves each (120 plies), the
     player who has advanced further wins (Dittle's scoring spirit; guards against
     defensive stalemates).

## The AI

`shared/ai.js` chooses moves with **alpha-beta minimax look-ahead**. Depth is the
difficulty setting (Easy = 2 plies … Brutal = 7 plies). Move ordering (captures,
forward tilts, and winning moves first) makes the pruning effective, so even 7-ply
search returns in well under a second.

Positions are scored by a **linear evaluation function** over hand-designed
features (material advantage, total advancement, most-advanced die, pip strength,
one-move-from-goal threats, surround vulnerability, central control).

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

The server loads `ai/weights.json` at startup (falling back to defaults if absent).
`weights.json` records training metadata including train and held-out validation win
rates. Note: across repeated runs the hand-tuned default weights proved to already
generalize best for this feature set — candidates that beat them on training openings
consistently failed on held-out ones (classic overfitting), so the validation guard
retains the defaults. The AI still fully accounts for jumps: the search enumerates
jump moves and the evaluation's goal-threat feature is jump-aware (it counts dice one
**jump** away from the goal row, not just one tilt).

```bash
npm run train 300     # 300 generations (default 40)
```

## Project layout

| Path | Purpose |
|------|---------|
| `shared/engine.js` | Pure rules engine (board, moves, clashes, win/score). Runs in Node **and** the browser. |
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
