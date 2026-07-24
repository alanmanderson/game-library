// Dittle AI — alpha-beta minimax lookahead over a linear evaluation function
// whose weights are learned by self-play (see ai/train.js). Pure ES module,
// runs in Node and the browser.
//
// The two variants reward completely different play, so each has its OWN feature
// vector and its OWN learned weights:
//   - clash: race a single die across while capturing — material and a lone goal
//     threat dominate.
//   - traditional: get ALL seven dice across showing high faces, with no capturing —
//     what matters is how many dice are across and the up-face total they show.

import {
  legalMoves, applyMove, countDice, rowOf, colOf, idx,
  SIZE, goalRow, progress, inBounds, jumpLandings,
  normalizeVariant,
} from './engine.js';

// ---- Clash weights: per-die advantage, racing a single die to the goal. ----
export const DEFAULT_WEIGHTS_CLASH = {
  material: 100,       // per-die advantage
  advance: 6,          // total forward progress advantage
  lead: 14,            // most-advanced die (racing toward the goal)
  strength: 3,         // sum of up-faces (higher = wins clashes)
  goalThreat: 40,      // a die one tilt/jump away from the goal row
  vulnerability: -12,  // own dice that are surroundable next turn
  center: 1,           // mild preference for central files
};

// ---- Traditional weights: get ALL dice across showing high faces; no capturing. ----
export const DEFAULT_WEIGHTS_TRADITIONAL = {
  across: 90,          // (my dice in the goal row) - (opp dice in the goal row)
  acrossScore: 30,     // (my up-face total in goal row) - (opp's) — the actual win metric
  advance: 8,          // total forward progress advantage
  lead: 4,             // most-advanced die
  nearGoal: 18,        // dice one move from entering the goal row
  strength: 2,         // overall up-face sum (prefer keeping high faces while travelling)
  center: 1,           // mild preference for central files
};

// Back-compat alias (older callers imported DEFAULT_WEIGHTS).
export const DEFAULT_WEIGHTS = DEFAULT_WEIGHTS_CLASH;

export function defaultWeights(variant) {
  return normalizeVariant(variant) === 'clash'
    ? DEFAULT_WEIGHTS_CLASH
    : DEFAULT_WEIGHTS_TRADITIONAL;
}

const WIN = 1_000_000;

// ---------- Clash feature vector ----------
export function featuresClash(board, player) {
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
      if (oneMoveFromRow(d, i, myGoal, board, true)) myGoalThreat++;
      if (isVulnerable(board, i)) myVuln++;
    } else {
      oppCount++;
      oppAdvance += p;
      if (p > oppLead) oppLead = p;
      oppStrength += d.up;
      oppCenter += centerBias;
      if (oneMoveFromRow(d, i, oppGoal, board, true)) oppGoalThreat++;
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

// ---------- Traditional feature vector ----------
export function featuresTraditional(board, player) {
  const opp = 1 - player;
  const myGoal = goalRow(player);
  const oppGoal = goalRow(opp);

  let myAcross = 0, oppAcross = 0;
  let myAcrossScore = 0, oppAcrossScore = 0;
  let myAdvance = 0, oppAdvance = 0;
  let myLead = 0, oppLead = 0;
  let myNear = 0, oppNear = 0;
  let myStrength = 0, oppStrength = 0;
  let myCenter = 0, oppCenter = 0;

  for (let i = 0; i < board.length; i++) {
    const d = board[i];
    if (!d) continue;
    const p = progress(d, i);
    const centerBias = 3 - Math.abs(colOf(i) - 3);
    if (d.player === player) {
      myAdvance += p;
      if (p > myLead) myLead = p;
      myStrength += d.up;
      myCenter += centerBias;
      if (rowOf(i) === myGoal) { myAcross++; myAcrossScore += d.up; }
      else if (oneMoveFromRow(d, i, myGoal, board, false)) myNear++;
    } else {
      oppAdvance += p;
      if (p > oppLead) oppLead = p;
      oppStrength += d.up;
      oppCenter += centerBias;
      if (rowOf(i) === oppGoal) { oppAcross++; oppAcrossScore += d.up; }
      else if (oneMoveFromRow(d, i, oppGoal, board, false)) oppNear++;
    }
  }

  return {
    across: myAcross - oppAcross,
    acrossScore: myAcrossScore - oppAcrossScore,
    advance: myAdvance - oppAdvance,
    lead: myLead - oppLead,
    nearGoal: myNear - oppNear,
    strength: myStrength - oppStrength,
    center: myCenter - oppCenter,
  };
}

// Can the die at index i reach `targetRow` in a single move — a forward tilt onto the
// row, or a forward jump landing on it? When `allowCapture` (clash), the tilt target
// may be an enemy; otherwise (traditional) the tilt target must be empty.
function oneMoveFromRow(d, i, targetRow, board, allowCapture) {
  const fdir = d.player === 0 ? 'N' : 'S';
  const step = d.player === 0 ? 1 : -1;
  const r = rowOf(i);
  // forward tilt
  if (r + step === targetRow) {
    const occ = board[idx(r + step, colOf(i))];
    if (!occ) return true;
    if (allowCapture && occ.player !== d.player) return true; // an enemy we might beat
  }
  // forward jump (lands on an empty square on the goal row)
  for (const land of jumpLandings(board, i, fdir)) {
    if (rowOf(land) === targetRow) return true;
  }
  return false;
}

// A die is "vulnerable" if an enemy currently sits orthogonally adjacent AND at
// least one more adjacent square is open for an enemy to move into (a cheap
// surround-risk proxy used only for clash evaluation, not rules).
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

export function evaluate(state, player, weights) {
  if (state.status === 'won') {
    return state.winner === player ? WIN : -WIN;
  }
  if (state.status === 'draw') return 0;
  const variant = normalizeVariant(state.variant);
  const w = weights || defaultWeights(variant);
  const f = variant === 'clash'
    ? featuresClash(state.board, player)
    : featuresTraditional(state.board, player);
  let score = 0;
  for (const k in w) score += w[k] * (f[k] || 0);
  return score;
}

// Order moves to improve alpha-beta pruning: try promising moves first.
function orderedMoves(state) {
  const variant = normalizeVariant(state.variant);
  const moves = legalMoves(state);
  const goal = goalRow(state.turn);
  const scored = moves.map((m) => {
    let s = 0;
    if (variant === 'clash') {
      if (state.board[m.to]) s += 5;               // clashes first
      if (rowOf(m.to) === goal) s += 100;          // winning moves first
    } else {
      if (rowOf(m.to) === goal) s += 6;            // entering the goal row (not an instant win)
    }
    if (m.dir === 'N' || m.dir === 'S') s += 3;    // forward progress
    if (m.jump) s += 2;                            // jumps cover ground / break lines
    return { m, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.m);
}

// Thrown to unwind the recursion when a search runs past its deadline.
const SEARCH_TIMEOUT = Symbol('search-timeout');

// Alpha-beta minimax. Returns { score, move }. `rootPlayer` is the perspective we
// maximize for; the search alternates between maximizing (rootPlayer to move) and
// minimizing (opponent to move). If `deadline` (a Date.now() timestamp) is given and
// passes, the search throws SEARCH_TIMEOUT so the caller can fall back to a shallower
// completed result.
export function search(state, depth, rootPlayer, weights = null,
  alpha = -Infinity, beta = Infinity, deadline = 0) {
  if (deadline && Date.now() > deadline) throw SEARCH_TIMEOUT;
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
      const { score } = search(child, depth - 1, rootPlayer, weights, alpha, beta, deadline);
      if (score > best) { best = score; bestMove = m; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break; // prune
    }
    return { score: best, move: bestMove };
  } else {
    let best = Infinity;
    for (const m of moves) {
      const child = applyMove(state, m);
      const { score } = search(child, depth - 1, rootPlayer, weights, alpha, beta, deadline);
      if (score < best) { best = score; bestMove = m; }
      if (best < beta) beta = best;
      if (alpha >= beta) break; // prune
    }
    return { score: best, move: bestMove };
  }
}

// Public entry point: pick the best move for the player to move in `state`.
// `maxDepth` is the deepest lookahead in plies; `timeBudgetMs` caps wall-clock time
// via iterative deepening (0 disables the cap). Depth 1 always completes so a move is
// always returned. `weights` defaults to the state's variant's learned/default set.
export function bestMove(state, maxDepth = 3, weights = null, timeBudgetMs = 1200) {
  if (state.status !== 'playing') return { move: null, score: 0 };
  const w = weights || defaultWeights(state.variant);
  const deadline = timeBudgetMs > 0 ? Date.now() + timeBudgetMs : 0;
  let best = search(state, 1, state.turn, w); // always complete the shallowest ply
  for (let d = 2; d <= maxDepth; d++) {
    let result;
    try {
      result = search(state, d, state.turn, w, -Infinity, Infinity, deadline);
    } catch (e) {
      if (e === SEARCH_TIMEOUT) break; // out of time — keep the deepest completed result
      throw e;
    }
    best = result;
    if (Math.abs(best.score) >= WIN) break; // forced win/loss found; no need to go deeper
  }
  return best;
}
