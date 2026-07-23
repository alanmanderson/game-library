// Dittle AI — alpha-beta minimax lookahead over a linear evaluation function
// whose weights are learned by self-play (see ai/train.js). Pure ES module,
// runs in Node and the browser.

import {
  legalMoves, applyMove, countDice, rowOf, colOf, idx,
  SIZE, goalRow, progress, inBounds, jumpLandings,
} from './engine.js';

// Default weights (used until self-play training overwrites them). These are the
// feature multipliers for the evaluation function below, from the perspective of
// the player being scored.
export const DEFAULT_WEIGHTS = {
  material: 100,       // per-die advantage
  advance: 6,          // total forward progress advantage
  lead: 14,            // most-advanced die (racing toward the goal)
  strength: 3,         // sum of up-faces (higher = wins clashes)
  goalThreat: 40,      // a die one tilt away from the goal row
  vulnerability: -12,  // own dice that are surroundable next turn
  center: 1,           // mild preference for central files
};

const WIN = 1_000_000;

// Feature vector for `player` given a board. Returns an object keyed like weights.
export function features(board, player) {
  const opp = 1 - player;
  const myGoal = goalRow(player);
  const oppGoal = goalRow(opp);

  let myCount = 0, oppCount = 0;
  let myAdvance = 0, oppAdvance = 0;
  let myLead = 0, oppLead = 0;
  let myStrength = 0, oppStrength = 0;
  let myGoalThreat = 0, oppGoalThreat = 0;
  let myCenter = 0, oppCenter = 0;
  let myVuln = 0;

  for (let i = 0; i < board.length; i++) {
    const d = board[i];
    if (!d) continue;
    const p = progress(d, i);
    const centerBias = 3 - Math.abs(colOf(i) - 3); // 3 at center file, 0 at edges
    if (d.player === player) {
      myCount++;
      myAdvance += p;
      if (p > myLead) myLead = p;
      myStrength += d.up;
      myCenter += centerBias;
      if (oneMoveFromRow(d, i, myGoal, board)) myGoalThreat++;
      if (isVulnerable(board, i)) myVuln++;
    } else {
      oppCount++;
      oppAdvance += p;
      if (p > oppLead) oppLead = p;
      oppStrength += d.up;
      oppCenter += centerBias;
      if (oneMoveFromRow(d, i, oppGoal, board)) oppGoalThreat++;
    }
  }

  return {
    material: myCount - oppCount,
    advance: myAdvance - oppAdvance,
    lead: myLead - oppLead,
    strength: myStrength - oppStrength,
    goalThreat: myGoalThreat - oppGoalThreat,
    vulnerability: myVuln,
    center: myCenter - oppCenter,
  };
}

// Can the die at index i reach `targetRow` in a single move — either a forward
// tilt into an empty/capturable square, or a forward jump landing on that row?
// (Jump-awareness matters now that a die can win by jumping onto the goal row.)
function oneMoveFromRow(d, i, targetRow, board) {
  const fdir = d.player === 0 ? 'N' : 'S';
  const step = d.player === 0 ? 1 : -1;
  const r = rowOf(i);
  // forward tilt
  if (r + step === targetRow) {
    const occ = board[idx(r + step, colOf(i))];
    if (!occ || occ.player !== d.player) return true; // empty or an enemy we might beat
  }
  // forward jump
  for (const land of jumpLandings(board, i, fdir)) {
    if (rowOf(land) === targetRow) return true;
  }
  return false;
}

// A die is "vulnerable" if an enemy currently sits orthogonally adjacent AND at
// least one more adjacent square is open for an enemy to move into (a cheap
// surround-risk proxy used only for evaluation, not rules).
function isVulnerable(board, i) {
  const d = board[i];
  const r = rowOf(i), c = colOf(i);
  let enemyAdj = 0, openAdj = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const nb = board[idx(nr, nc)];
    if (!nb) openAdj++;
    else if (nb.player !== d.player) enemyAdj++;
  }
  return enemyAdj >= 1 && openAdj >= 1 && enemyAdj + openAdj >= 2;
}

export function evaluate(state, player, weights = DEFAULT_WEIGHTS) {
  if (state.status === 'won') {
    return state.winner === player ? WIN : -WIN;
  }
  if (state.status === 'draw') return 0;
  const f = features(state.board, player);
  let score = 0;
  for (const k in weights) score += weights[k] * (f[k] || 0);
  return score;
}

// Order moves to improve alpha-beta pruning: try captures / forward tilts first.
function orderedMoves(state) {
  const moves = legalMoves(state);
  const goal = goalRow(state.turn);
  const scored = moves.map((m) => {
    let s = 0;
    const occ = state.board[m.to];
    if (occ) s += 5;                       // clashes first
    if (m.dir === 'N' || m.dir === 'S') s += 3; // forward progress
    if (m.jump) s += 2;                    // jumps cover ground / break lines
    if (rowOf(m.to) === goal) s += 100;    // winning moves first
    return { m, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.m);
}

// Alpha-beta minimax. Returns { score, move }. `rootPlayer` is the perspective we
// maximize for; the search alternates between maximizing (rootPlayer to move) and
// minimizing (opponent to move).
export function search(state, depth, rootPlayer, weights = DEFAULT_WEIGHTS,
  alpha = -Infinity, beta = Infinity) {
  if (state.status !== 'playing' || depth === 0) {
    // Bias toward faster wins / slower losses by folding depth into terminal scores.
    let score = evaluate(state, rootPlayer, weights);
    if (state.status === 'won') score += (score > 0 ? depth : -depth);
    return { score, move: null };
  }

  const maximizing = state.turn === rootPlayer;
  const moves = orderedMoves(state);
  if (moves.length === 0) {
    return { score: evaluate(state, rootPlayer, weights), move: null };
  }

  let bestMove = moves[0];
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      const child = applyMove(state, m);
      const { score } = search(child, depth - 1, rootPlayer, weights, alpha, beta);
      if (score > best) { best = score; bestMove = m; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break; // prune
    }
    return { score: best, move: bestMove };
  } else {
    let best = Infinity;
    for (const m of moves) {
      const child = applyMove(state, m);
      const { score } = search(child, depth - 1, rootPlayer, weights, alpha, beta);
      if (score < best) { best = score; bestMove = m; }
      if (best < beta) beta = best;
      if (alpha >= beta) break; // prune
    }
    return { score: best, move: bestMove };
  }
}

// Public entry point: pick the best move for the player to move in `state`.
// `depth` is the lookahead in plies. Returns { move, score }.
export function bestMove(state, depth = 3, weights = DEFAULT_WEIGHTS) {
  if (state.status !== 'playing') return { move: null, score: 0 };
  return search(state, depth, state.turn, weights);
}
