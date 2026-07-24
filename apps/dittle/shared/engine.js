// Dittle — game engine (pure, no I/O). Works in Node and the browser as an ES module.
//
// Faithful digital adaptation of "Dittle: Dice Battle", supporting BOTH official
// variants. A game's `state.variant` is either:
//
//   'traditional' — race ALL SEVEN of your dice into the opponent's base row. The game
//     ends the moment one player has all seven across; the winner is whoever's dice in
//     the base row show the HIGHER TOTAL of up-faces (a tie is a draw). Jumps are
//     allowed. Dice NEVER capture each other.
//
//   'clash' — get ANY ONE die into the opponent's base row to win immediately. NO
//     jumping (tilts only). Dice CLASH and eliminate each other (direct + surround).
//
// See Rules.md for the full rules of both variants. Shared to both:
//
//  - Board: 7x7. Each player starts with 7 dice on their base row (6 up, 3 facing
//    the owning player).
//  - Directions: forward (toward the opponent) or sideways. NEVER backward, never
//    diagonal — this holds for both tilts and jumps.
//  - Tilt: roll a die one square. The die physically rolls, so its up-face changes.
//    A tilt is the ONLY thing that changes a die's up-face.
//
// Traditional-only:
//  - Tilt lands on an EMPTY square only (no capturing).
//  - Jump: leap over one or more dice (friendly OR enemy) in a STRAIGHT line, landing
//    on the empty square just beyond each jumped die. Consecutively jumped dice must
//    have a gap between them. A PURE jump does not turn.
//  - Tilt + jump (mixed): tilt once onto an EMPTY square, then jump one or more dice;
//    the jump portion MAY turn (an "L-shape"). The up-face changes only from the tilt.
//
// Clash-only:
//  - Tilts only (no jumps).
//  - Direct clash: a TILT onto an enemy die -> the die showing the LOWER up-value is
//    removed; a tie removes both. You may not tilt onto your own die.
//  - Surround clash (resolved after every move, repeated to stability): a die
//    orthogonally adjacent to >= 2 enemy dice compares its up-value to the SUM of
//    those enemies' up-values; the lower side is removed (tie removes all involved).

export const SIZE = 7;
export const DICE_PER_PLAYER = SIZE;
export const VARIANTS = ['traditional', 'clash'];
export const DEFAULT_VARIANT = 'traditional';

// If no one wins naturally by this many plies, the game is adjudicated by position.
// Traditional games (all seven across) run longer than clash games, so the cap is
// generous; it only exists to guard against endless over-cautious play.
export const MAX_PLIES = 200;

// Board index helpers. row 0 = player 0 base (bottom). row 6 = player 1 base (top).
export const idx = (r, c) => r * SIZE + c;
export const rowOf = (i) => Math.floor(i / SIZE);
export const colOf = (i) => i % SIZE;
export const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

// A die orientation is { player, up, north, east }.
// Derived faces: down = 7-up, south = 7-north, west = 7-east.
// "Forward" for player 0 is +row (north); for player 1 it is -row (south).

export function baseRow(player) {
  return player === 0 ? 0 : SIZE - 1;
}
export function goalRow(player) {
  // opponent's base row — the row this player is racing toward
  return player === 0 ? SIZE - 1 : 0;
}
export function forwardDir(player) {
  return player === 0 ? 'N' : 'S';
}

export function normalizeVariant(variant) {
  return variant === 'clash' ? 'clash' : 'traditional';
}

// Create the initial position for the given variant ('traditional' | 'clash').
export function initialState(variant = DEFAULT_VARIANT) {
  const board = new Array(SIZE * SIZE).fill(null);
  for (let c = 0; c < SIZE; c++) {
    // Player 0 on row 0. Start: up=6, facing player (south)=3 => north=4.
    board[idx(0, c)] = { player: 0, up: 6, north: 4, east: 2 };
    // Player 1 on row 6. Start: up=6, facing player (north)=3 => south=4 => north=3.
    board[idx(SIZE - 1, c)] = { player: 1, up: 6, north: 3, east: 2 };
  }
  return {
    variant: normalizeVariant(variant),
    board,
    turn: 0,            // whose turn (0 or 1)
    status: 'playing',  // 'playing' | 'won' | 'draw'
    winner: null,       // 0 | 1 | null
    lastMove: null,     // canonical move (see makeMove) | null
    moveCount: 0,
    // traditional: 'filled' | 'score' | null.  clash: 'breakthrough' | 'elimination'
    // | 'stuck' | 'score' | null.
    endReason: null,
  };
}

// Roll a die one step in a compass direction, returning a NEW orientation.
// Only the tilt result matters; position is handled by the caller.
export function rollDie(die, dir) {
  const { up, north, east } = die;
  switch (dir) {
    case 'N': return { player: die.player, up: 7 - north, north: up, east };
    case 'S': return { player: die.player, up: north, north: 7 - up, east };
    case 'E': return { player: die.player, up: 7 - east, north, east: up };
    case 'W': return { player: die.player, up: east, north, east: 7 - up };
    default: throw new Error('bad dir ' + dir);
  }
}

const DIR_DELTA = { N: [1, 0], S: [-1, 0], E: [0, 1], W: [0, -1] };

function stepIndex(i, dir) {
  const [dr, dc] = DIR_DELTA[dir];
  const nr = rowOf(i) + dr, nc = colOf(i) + dc;
  if (!inBounds(nr, nc)) return -1;
  return idx(nr, nc);
}

// Directions a given player is allowed to move (tilt or jump): forward + both
// sideways, never backward (keeps the race moving forward).
function allowedDirs(player) {
  return player === 0 ? ['N', 'E', 'W'] : ['S', 'E', 'W'];
}

// Straight-line jump landings reachable from `i` in `dir` (leap a die, land on the
// empty square beyond, and continue in the SAME direction). Kept for the AI's cheap
// goal-threat heuristic; full move generation lives in legalMoves.
export function jumpLandings(board, i, dir) {
  const [dr, dc] = DIR_DELTA[dir];
  let r = rowOf(i), c = colOf(i);
  const lands = [];
  while (true) {
    const midR = r + dr, midC = c + dc;           // the die to leap over
    if (!inBounds(midR, midC) || !board[idx(midR, midC)]) break;
    const landR = midR + dr, landC = midC + dc;   // the square just past it
    if (!inBounds(landR, landC) || board[idx(landR, landC)]) break;
    lands.push(idx(landR, landC));
    r = landR; c = landC;                          // continue chaining
  }
  return lands;
}

// Build the canonical move object from a start square, an optional tilt direction,
// and a sequence of jump-hop directions. `path` lists the squares visited after
// `from` (tilt landing, then each jump landing) for UI highlighting.
export function makeMove(from, tilt, jumps) {
  const js = jumps ? jumps.slice() : [];
  const path = [];
  let pos = from;
  if (tilt) { pos = stepIndex(from, tilt); path.push(pos); }
  for (const d of js) { pos = stepIndex(stepIndex(pos, d), d); path.push(pos); }
  const to = path.length ? path[path.length - 1] : from;
  return {
    from,
    to,
    tilt: tilt || null,
    jumps: js,
    jump: js.length > 0,
    dir: tilt || js[0] || null,          // first step — used for move ordering / UI
    kind: tilt ? (js.length ? 'tilt-jump' : 'tilt') : 'jump',
    path,
  };
}

// A stable string identity for a move: same key <=> same tilt + same jump path from
// the same origin. Used to validate a client-submitted move against the legal set
// (two different paths can share a start and end square, so from/to is not enough).
export function moveKey(m) {
  const mm = normalizeMove(m);
  return `${mm.from}#${mm.tilt || ''}#${mm.jumps.join('')}`;
}

// Accept either a canonical move ({tilt, jumps}) or a legacy single-step move
// ({dir, jump, to}) and return the canonical form.
export function normalizeMove(move) {
  if (move && (move.jumps !== undefined || move.tilt !== undefined)) {
    return makeMove(move.from, move.tilt || null, move.jumps || []);
  }
  if (move && move.jump) {
    // Legacy single-`dir` jump (possibly multi-hop, straight): rebuild the hops.
    const jumps = [];
    let pos = move.from;
    while (pos !== move.to) {
      jumps.push(move.dir);
      const mid = stepIndex(pos, move.dir);
      pos = mid === -1 ? move.to : stepIndex(mid, move.dir);
      if (pos === -1) break;
      if (jumps.length > SIZE) break; // safety
    }
    return makeMove(move.from, null, jumps);
  }
  return makeMove(move.from, move ? move.dir || null : null, []);
}

// Enumerate every TURNING jump chain from `pos`, appending complete moves to `out`.
// The chain may change direction at each hop (used for tilt+jump "L-shape" moves).
// `bd` is the board with the moving die already lifted off (so it can't be jumped).
function enumerateTurningJumps(bd, from, pos, dirs, tilt, jumpsSoFar, visited, out) {
  for (const dir of dirs) {
    const mid = stepIndex(pos, dir);
    if (mid === -1 || !bd[mid]) continue;          // must leap over a die
    const land = stepIndex(mid, dir);
    if (land === -1 || bd[land] || visited.has(land)) continue; // land on empty, no revisits
    const jumps = jumpsSoFar.concat(dir);
    out.push(makeMove(from, tilt, jumps));
    const nv = new Set(visited); nv.add(land);
    enumerateTurningJumps(bd, from, land, dirs, tilt, jumps, nv, out);   // chain (may turn)
  }
}

// Enumerate STRAIGHT jump chains from `pos` in a single direction (no turning),
// appending complete moves to `out`. Used for pure jumps in traditional Dittle.
function enumerateStraightJumps(bd, from, pos, dir, jumpsSoFar, out) {
  const mid = stepIndex(pos, dir);
  if (mid === -1 || !bd[mid]) return;              // must leap over a die
  const land = stepIndex(mid, dir);
  if (land === -1 || bd[land]) return;             // land on the empty square beyond
  const jumps = jumpsSoFar.concat(dir);
  out.push(makeMove(from, null, jumps));
  enumerateStraightJumps(bd, from, land, dir, jumps, out); // continue straight only
}

// All legal moves for the player to move in `state`.
export function legalMoves(state) {
  return normalizeVariant(state.variant) === 'clash'
    ? legalMovesClash(state)
    : legalMovesTraditional(state);
}

// Clash: tilts only. A tilt lands on an empty square OR clashes onto an enemy die.
function legalMovesClash(state) {
  const { board, turn } = state;
  const dirs = allowedDirs(turn);
  const moves = [];
  for (let from = 0; from < board.length; from++) {
    const die = board[from];
    if (!die || die.player !== turn) continue;
    for (const dir of dirs) {
      const to = stepIndex(from, dir);
      if (to === -1) continue;
      const occ = board[to];
      if (occ && occ.player === turn) continue; // cannot tilt onto own die
      moves.push(makeMove(from, dir, []));       // empty square or an enemy (clash)
    }
  }
  return moves;
}

// Traditional: tilts land on EMPTY squares (no capturing), plus straight pure jumps
// and turning tilt+jumps.
function legalMovesTraditional(state) {
  const { board, turn } = state;
  const dirs = allowedDirs(turn);
  const moves = [];
  for (let from = 0; from < board.length; from++) {
    const die = board[from];
    if (!die || die.player !== turn) continue;

    // Board with the mover lifted off — it must not be jumpable during its own move.
    const lifted = board.slice();
    lifted[from] = null;

    // 1) Tilt-only (terminal): one square onto an EMPTY square (no capturing).
    for (const dir of dirs) {
      const to = stepIndex(from, dir);
      if (to === -1 || board[to]) continue; // must land on an empty square
      moves.push(makeMove(from, dir, []));
    }

    // 2) Pure jumps: STRAIGHT chains only (no turning) in each allowed direction.
    for (const dir of dirs) {
      enumerateStraightJumps(lifted, from, from, dir, [], moves);
    }

    // 3) Tilt + jump: tilt onto an EMPTY square, then jump one or more dice; the jump
    //    portion MAY turn (covers the vertical / horizontal / mixed "L-shape" cases).
    for (const dir of dirs) {
      const t = stepIndex(from, dir);
      if (t === -1 || board[t]) continue; // the tilt leg of a mixed move must land empty
      enumerateTurningJumps(lifted, from, t, dirs, dir, [], new Set([from, t]), moves);
    }
  }
  return moves;
}

// Deep-copy board (dice are small plain objects).
function cloneBoard(board) {
  const b = new Array(board.length);
  for (let i = 0; i < board.length; i++) {
    b[i] = board[i] ? { ...board[i] } : null;
  }
  return b;
}

const ORTHO = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

// Resolve surround clashes on `board` in place, repeating to stability. (Clash only.)
function resolveSurrounds(board) {
  let changed = true;
  while (changed) {
    changed = false;
    const remove = new Set();
    for (let i = 0; i < board.length; i++) {
      const die = board[i];
      if (!die) continue;
      const r = rowOf(i), c = colOf(i);
      let sum = 0, count = 0;
      for (const [dr, dc] of ORTHO) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const nb = board[idx(nr, nc)];
        if (nb && nb.player !== die.player) { sum += nb.up; count++; }
      }
      if (count >= 2) {
        if (sum > die.up) {
          remove.add(i); // the surrounded die is overwhelmed
        } else if (die.up > sum) {
          // the surrounded die overwhelms all its attackers
          for (const [dr, dc] of ORTHO) {
            const nr = r + dr, nc = c + dc;
            if (!inBounds(nr, nc)) continue;
            const j = idx(nr, nc);
            const nb = board[j];
            if (nb && nb.player !== die.player) remove.add(j);
          }
        } else {
          // tie: all involved removed
          remove.add(i);
          for (const [dr, dc] of ORTHO) {
            const nr = r + dr, nc = c + dc;
            if (!inBounds(nr, nc)) continue;
            const j = idx(nr, nc);
            const nb = board[j];
            if (nb && nb.player !== die.player) remove.add(j);
          }
        }
      }
    }
    if (remove.size) {
      for (const i of remove) board[i] = null;
      changed = true;
    }
  }
}

export function countDice(board, player) {
  let n = 0;
  for (const d of board) if (d && d.player === player) n++;
  return n;
}

// Sum of up-faces of `player`'s dice sitting on `row` (the traditional score).
export function sumUpInRow(board, player, row) {
  let s = 0;
  for (let c = 0; c < SIZE; c++) {
    const d = board[idx(row, c)];
    if (d && d.player === player) s += d.up;
  }
  return s;
}

// How many of `player`'s dice are on `row`.
export function countInRow(board, player, row) {
  let n = 0;
  for (let c = 0; c < SIZE; c++) {
    const d = board[idx(row, c)];
    if (d && d.player === player) n++;
  }
  return n;
}

// Are ALL of `player`'s (surviving) dice on `row`? In traditional there is no
// elimination, so this is true exactly when all seven have crossed.
export function allDiceOnRow(board, player, row) {
  let total = 0, onRow = 0;
  for (let i = 0; i < board.length; i++) {
    const d = board[i];
    if (d && d.player === player) { total++; if (rowOf(i) === row) onRow++; }
  }
  return total > 0 && total === onRow;
}

// A player's positional score, used to ADJUDICATE games that stall / hit the move
// limit. Rewards advancement toward the goal most, then dice count, then pip strength.
export function scoreSide(board, player) {
  let s = 0;
  for (let i = 0; i < board.length; i++) {
    const d = board[i];
    if (!d || d.player !== player) continue;
    s += progress(d, i) * 10 + 3 + d.up * 0.5;
  }
  return s;
}

// Apply a move to a state, returning a NEW state. Does not mutate input. Accepts a
// canonical move ({from, tilt, jumps}) or a legacy single-step move.
export function applyMove(state, move) {
  if (state.status !== 'playing') throw new Error('game over');
  const variant = normalizeVariant(state.variant);
  const m = normalizeMove(move);
  const board = cloneBoard(state.board);
  const mover = board[m.from];
  if (!mover || mover.player !== state.turn) throw new Error('illegal: no own die at from');
  if (variant === 'clash' && m.jumps.length > 0) throw new Error('illegal: no jumping in clash');

  board[m.from] = null;
  let die = mover;
  let pos = m.from;

  if (m.tilt) {
    const to = stepIndex(pos, m.tilt);
    if (to === -1) throw new Error('illegal: tilt off board');
    die = rollDie(die, m.tilt); // the tilt is the only thing that changes the up-face
    if (m.jumps.length === 0) {
      // Terminal tilt.
      const occ = board[to];
      if (!occ) {
        board[to] = die;
      } else if (variant === 'clash') {
        // Direct clash: stronger up-value wins the square.
        if (occ.player === die.player) throw new Error('illegal: tilt onto own die');
        if (die.up > occ.up) board[to] = die;       // stronger mover wins the square
        else if (die.up < occ.up) board[to] = occ;   // mover destroyed, defender stays
        else board[to] = null;                        // tie: both removed
      } else {
        // Traditional never captures — a tilt must land on an empty square.
        throw new Error('illegal: tilt onto an occupied square (no capturing in traditional)');
      }
      return finalize(state, board, m, variant);
    }
    // Mixed move (traditional): the tilt leg must land on an empty square before jumping.
    if (board[to]) throw new Error('illegal: tilt+jump must tilt onto an empty square');
    pos = to;
  }

  // Jump hops (up-face unchanged). Each hop leaps one die to the empty square beyond.
  for (const dir of m.jumps) {
    const mid = stepIndex(pos, dir);
    if (mid === -1 || !board[mid]) throw new Error('illegal: jump must leap over a die');
    const land = stepIndex(mid, dir);
    if (land === -1) throw new Error('illegal: jump off board');
    if (board[land]) throw new Error('illegal: jump must land on an empty square');
    pos = land;
  }
  board[pos] = die;
  return finalize(state, board, m, variant);
}

// Shared post-move resolution: variant-specific clash + win detection + next state.
function finalize(state, board, m, variant) {
  const me = state.turn;
  const opp = 1 - me;
  if (variant === 'clash') resolveSurrounds(board);

  let status = 'playing';
  let winner = null;
  let endReason = null;
  let score;

  if (variant === 'clash') {
    // Breakthrough: any of my dice reached the opponent's base row.
    const myGoal = goalRow(me);
    for (let c = 0; c < SIZE; c++) {
      const d = board[idx(myGoal, c)];
      if (d && d.player === me) { status = 'won'; winner = me; endReason = 'breakthrough'; break; }
    }
    // Elimination: opponent has no dice left.
    if (status === 'playing' && countDice(board, opp) === 0) {
      status = 'won'; winner = me; endReason = 'elimination';
    }
  } else {
    // Traditional: the game ends the moment one player has ALL of their dice across.
    // Only the mover can newly complete this (dice can't leave the goal row and no
    // capturing happens), so check the mover's side.
    if (allDiceOnRow(board, me, goalRow(me))) {
      const dec = decideTraditional(board);
      status = dec.status; winner = dec.winner; score = dec.score; endReason = 'filled';
    }
  }

  const next = {
    variant,
    board,
    turn: opp,
    status,
    winner,
    lastMove: {
      from: m.from,
      to: m.to,
      dir: m.dir,
      tilt: m.tilt,
      jumps: m.jumps.slice(),
      jump: m.jump,
      path: m.path.slice(),
      kind: m.kind,
    },
    moveCount: state.moveCount + 1,
    endReason,
  };
  if (score) next.score = score;

  // If the next player has no legal move on their turn, the game ends.
  if (next.status === 'playing' && legalMoves(next).length === 0) {
    if (variant === 'clash') {
      // The stuck player loses.
      next.status = 'won';
      next.winner = me;
      next.endReason = 'stuck';
    } else {
      // Traditional: adjudicate by position (official rules leave this undefined).
      adjudicateByPosition(next, board);
    }
  }

  // Move-limit adjudication by position (safety net against endless play).
  if (next.status === 'playing' && next.moveCount >= MAX_PLIES) {
    adjudicateByPosition(next, board);
  }

  return next;
}

// Decide a finished traditional game by base-row up-face totals. Either player may win
// (filling first does not guarantee victory); an equal total is a draw.
function decideTraditional(board) {
  const s0 = sumUpInRow(board, 0, goalRow(0));
  const s1 = sumUpInRow(board, 1, goalRow(1));
  const score = { 0: s0, 1: s1 };
  if (s0 === s1) return { status: 'draw', winner: null, score };
  return { status: 'won', winner: s0 > s1 ? 0 : 1, score };
}

// Adjudicate a stalled game by each side's positional score; mutate `next` in place.
function adjudicateByPosition(next, board) {
  const s0 = scoreSide(board, 0);
  const s1 = scoreSide(board, 1);
  if (s0 === s1) { next.status = 'draw'; next.winner = null; }
  else { next.status = 'won'; next.winner = s0 > s1 ? 0 : 1; }
  next.endReason = 'score';
  next.score = { 0: Math.round(s0), 1: Math.round(s1) };
}

// Serialize / deserialize (structuredClone-friendly plain object already).
export function cloneState(state) {
  return {
    variant: normalizeVariant(state.variant),
    board: cloneBoard(state.board),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    lastMove: state.lastMove ? { ...state.lastMove, jumps: state.lastMove.jumps ? state.lastMove.jumps.slice() : [], path: state.lastMove.path ? state.lastMove.path.slice() : [] } : null,
    moveCount: state.moveCount,
    endReason: state.endReason || null,
    score: state.score ? { ...state.score } : undefined,
  };
}

// Forward progress (0..SIZE-1) of a die toward its goal row.
export function progress(die, i) {
  const r = rowOf(i);
  return die.player === 0 ? r : (SIZE - 1 - r);
}
