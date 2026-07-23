// Dittle — game engine (pure, no I/O). Works in Node and the browser as an ES module.
//
// This is a faithful digital adaptation of "Dittle: Dice Battle":
//  - 7x7 board. Each player starts with 7 dice on their base row.
//  - Start orientation: 6 up, 3 facing toward the owning player.
//  - On your turn you make ONE move, either a TILT or a JUMP:
//    * Tilt: roll a die one square forward (toward the opponent) or sideways
//      (left/right). The die rolls, so its up-facing number changes. No backward
//      tilts, no diagonals.
//    * Jump: lift a die and leap in a straight line (forward or sideways) over one
//      or more dice — friendly OR enemy — landing on the empty square just past a
//      jumped die. Consecutive jumped dice must be separated by an empty square. A
//      jumped die is unaffected, and the jumper's up-face does NOT change.
//  - Direct clash: tilt onto an enemy die -> the die showing the LOWER up-value is
//    removed; a tie removes both. You may not tilt onto your own die. (Jumps land
//    on empty squares, so they never clash directly — but can trigger surrounds.)
//  - Surround clash (resolved after every move, repeated to stability): a die
//    orthogonally adjacent to >= 2 enemy dice compares its up-value to the SUM of
//    those enemies' up-values; the lower side is removed (tie removes all involved).
//  - Win: get any one of your dice onto the opponent's base row. You also win if
//    your opponent has no dice, or no legal move on their turn.

export const SIZE = 7;
export const DICE_PER_PLAYER = SIZE;

// If no one breaks through by this many plies (60 moves each), the game is decided
// by score — faithful to Dittle's "score by the dice that get across" spirit and a
// guard against stalemates from over-cautious defensive play.
export const MAX_PLIES = 120;

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

// Create the initial position.
export function initialState() {
  const board = new Array(SIZE * SIZE).fill(null);
  for (let c = 0; c < SIZE; c++) {
    // Player 0 on row 0. Start: up=6, facing player (south)=3 => north=4.
    board[idx(0, c)] = { player: 0, up: 6, north: 4, east: 2 };
    // Player 1 on row 6. Start: up=6, facing player (north)=3 => south=4 => north=3.
    board[idx(SIZE - 1, c)] = { player: 1, up: 6, north: 3, east: 2 };
  }
  return {
    board,
    turn: 0,            // whose turn (0 or 1)
    status: 'playing',  // 'playing' | 'won'
    winner: null,       // 0 | 1 | null
    lastMove: null,     // { from, to, dir } | null
    moveCount: 0,
    endReason: null,    // 'breakthrough' | 'elimination' | 'stuck' | 'score' | null
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

// Landing squares reachable by jumping from `i` in `dir`. A jump leaps over a die
// to the empty square just beyond it, and may chain: from that landing it can leap
// the next die, and so on. Consecutive jumped dice are therefore separated by the
// (empty) landing square between them. Returns 0+ landing indices.
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

// All legal moves for the player to move in `state`.
export function legalMoves(state) {
  const { board, turn } = state;
  const moves = [];
  const dirs = allowedDirs(turn);
  for (let i = 0; i < board.length; i++) {
    const die = board[i];
    if (!die || die.player !== turn) continue;
    for (const dir of dirs) {
      // Tilt: one square, unless blocked by own die.
      const to = stepIndex(i, dir);
      if (to !== -1) {
        const occ = board[to];
        if (!(occ && occ.player === turn)) moves.push({ from: i, dir, to, jump: false });
      }
      // Jumps: leap over dice (friendly or enemy) along this line.
      for (const land of jumpLandings(board, i, dir)) {
        moves.push({ from: i, dir, to: land, jump: true });
      }
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

// Resolve surround clashes on `board` in place, repeating to stability.
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

// A player's positional score, used to adjudicate games that hit the move limit.
// Rewards advancement toward the goal most, then dice count, then pip strength.
export function scoreSide(board, player) {
  let s = 0;
  for (let i = 0; i < board.length; i++) {
    const d = board[i];
    if (!d || d.player !== player) continue;
    s += progress(d, i) * 10 + 3 + d.up * 0.5;
  }
  return s;
}

// Apply a move to a state, returning a NEW state. Does not mutate input.
export function applyMove(state, move) {
  if (state.status !== 'playing') throw new Error('game over');
  const board = cloneBoard(state.board);
  const mover = board[move.from];
  if (!mover || mover.player !== state.turn) throw new Error('illegal: no die/own die at from');
  const to = move.to !== undefined ? move.to : stepIndex(move.from, move.dir);
  if (to === -1) throw new Error('illegal: off board');
  const occ = board[to];

  if (move.jump) {
    // Jump: lift the die over others and set it down unchanged on an empty square.
    if (occ) throw new Error('illegal: jump must land on an empty square');
    board[move.from] = null;
    board[to] = { ...mover };
  } else {
    if (occ && occ.player === mover.player) throw new Error('illegal: blocked by own die');
    const rolled = rollDie(mover, move.dir);
    board[move.from] = null;
    if (!occ) {
      board[to] = rolled;
    } else {
      // direct clash: lower up-value removed; tie removes both
      if (rolled.up > occ.up) board[to] = rolled;
      else if (rolled.up < occ.up) board[to] = occ; // mover destroyed, defender stays
      else board[to] = null;                        // tie: both gone
    }
  }

  resolveSurrounds(board);

  const mePlayer = state.turn;
  const opp = 1 - mePlayer;

  let status = 'playing';
  let winner = null;

  // Win: any of my dice reached the opponent's base row.
  const myGoal = goalRow(mePlayer);
  for (let c = 0; c < SIZE; c++) {
    const d = board[idx(myGoal, c)];
    if (d && d.player === mePlayer) { status = 'won'; winner = mePlayer; break; }
  }

  // Elimination: opponent has no dice left.
  if (status === 'playing' && countDice(board, opp) === 0) {
    status = 'won'; winner = mePlayer;
  }

  const next = {
    board,
    turn: opp,
    status,
    winner,
    lastMove: { from: move.from, to, dir: move.dir, jump: !!move.jump },
    moveCount: state.moveCount + 1,
    endReason: status === 'won' ? (countDice(board, opp) === 0 ? 'elimination' : 'breakthrough') : null,
  };

  // If the next player has no legal move on their turn, they lose.
  if (next.status === 'playing' && legalMoves(next).length === 0) {
    next.status = 'won';
    next.winner = mePlayer;
    next.endReason = 'stuck';
  }

  // Move-limit adjudication by score.
  if (next.status === 'playing' && next.moveCount >= MAX_PLIES) {
    const s0 = scoreSide(board, 0);
    const s1 = scoreSide(board, 1);
    if (s0 === s1) { next.status = 'draw'; next.winner = null; }
    else { next.status = 'won'; next.winner = s0 > s1 ? 0 : 1; }
    next.endReason = 'score';
    next.score = { 0: Math.round(s0), 1: Math.round(s1) };
  }

  return next;
}

// Serialize / deserialize (structuredClone-friendly plain object already).
export function cloneState(state) {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    status: state.status,
    winner: state.winner,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
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
