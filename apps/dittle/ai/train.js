// Self-play training for the Dittle AI (self-play coordinate-ascent policy search).
//
// The AI scores a position with a LINEAR function  value = w · features, and picks
// moves by alpha-beta search over that value. This script LEARNS the weight vector
// w by optimizing actual PLAYING STRENGTH via self-play:
//
//   fitness(w) = win rate of an AI using w against a fixed benchmark AI (the
//   hand-tuned defaults), measured over many self-play games with predetermined
//   opening seeds (same seeds for every candidate -> fair, low-variance signal),
//   playing both colors on each opening.
//
// Starting from the defaults, it does coordinate ascent: nudge one weight at a
// time, keep the nudge if it raises the win rate. Steps anneal as it converges.
// Finally it validates on a DISJOINT set of openings and only ships the learned
// weights if they still beat the defaults on unseen games; otherwise it falls back
// to the defaults so training can never regress.
//
// BOTH variants are trained (each has its own features + weights). Output:
// ai/weights.json = { traditional: {weights, meta}, clash: {weights, meta} }.
//
// Usage:
//   node ai/train.js [sweeps]                 # train both variants
//   node ai/train.js [sweeps] traditional     # train one variant
//   node ai/train.js [sweeps] clash
// Env knobs (handy for quick runs): DITTLE_TRAIN_SEEDS, DITTLE_VAL_SEEDS,
//   DITTLE_RESTARTS, DITTLE_MAX_PLIES.

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initialState, applyMove, legalMoves } from '../shared/engine.js';
import { search, defaultWeights } from '../shared/ai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'weights.json');

const NUM = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const TRAIN_SEEDS = NUM(process.env.DITTLE_TRAIN_SEEDS, 32);
const VAL_SEEDS = NUM(process.env.DITTLE_VAL_SEEDS, 20);
const RESTARTS = NUM(process.env.DITTLE_RESTARTS, 2);
// Cap self-play game length so training stays fast; games that hit it are decided by
// the engine's positional adjudication.
const GAME_PLY_CAP = NUM(process.env.DITTLE_MAX_PLIES, 160);

// Known sign of each feature weight, so learned weights stay sensible.
const SIGN = {
  material: 'pos1', vulnerability: 'neg',
  advance: 'pos', lead: 'pos', strength: 'pos', goalThreat: 'pos', center: 'any',
  across: 'pos', acrossScore: 'pos', nearGoal: 'pos',
};
function clampSigns(w) {
  const o = { ...w };
  for (const k in o) {
    if (SIGN[k] === 'pos1') o[k] = Math.max(1, o[k]);
    else if (SIGN[k] === 'pos') o[k] = Math.max(0, o[k]);
    else if (SIGN[k] === 'neg') o[k] = Math.min(0, o[k]);
  }
  return o;
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Play one game of `variant`: white uses wWhite, black uses wBlack. Returns winner
// (0/1/-1). A few random opening plies (seeded) diversify the games.
function playGame(wWhite, wBlack, seed, depth, variant) {
  const rng = makeRng(seed);
  let state = initialState(variant);
  for (let ply = 0; ply < GAME_PLY_CAP && state.status === 'playing'; ply++) {
    const w = state.turn === 0 ? wWhite : wBlack;
    let mv;
    if (ply < 6 && rng() < 0.5) { const lm = legalMoves(state); mv = lm[Math.floor(rng() * lm.length)]; }
    else mv = search(state, depth, state.turn, w).move;
    if (!mv) return 1 - state.turn; // stuck -> loses
    state = applyMove(state, mv);
  }
  if (state.status === 'draw' || state.status === 'playing') return -1;
  return state.winner;
}

// Win rate of `w` vs `benchmark` over a seed panel, playing both colors per seed.
function winRate(w, benchmark, seeds, depth, variant) {
  let score = 0, games = 0;
  for (const seed of seeds) {
    for (let color = 0; color < 2; color++) {
      const winner = color === 0 ? playGame(w, benchmark, seed, depth, variant)
                                 : playGame(benchmark, w, seed, depth, variant);
      games++;
      if (winner === -1) { score += 0.5; continue; }
      const wWasWhite = color === 0;
      if ((winner === 0) === wWasWhite) score += 1;
    }
  }
  return score / games;
}

function trainVariant(variant, sweeps, seed) {
  const t0 = Date.now();
  const DEFAULTS = defaultWeights(variant);
  const KEYS = Object.keys(DEFAULTS);
  const benchmark = { ...DEFAULTS };
  const TRAIN_DEPTH = 2; // fast, many games -> low-variance fitness
  const VAL_DEPTH = 3;   // measure final strength at the runtime default depth
  const trainSeeds = Array.from({ length: TRAIN_SEEDS }, (_, i) => (seed + i * 7919) >>> 0);
  const valSeeds = Array.from({ length: VAL_SEEDS }, (_, i) => (seed + 900000 + i * 6151) >>> 0);
  const MARGIN = 0.015; // require a real gain to accept a nudge (beat the noise)
  const rng = makeRng((seed ^ 0x9e3779b9) >>> 0);

  console.log(`\n=== Training '${variant}' (${KEYS.length} weights) ===`);
  const startFit = winRate(DEFAULTS, benchmark, trainSeeds, TRAIN_DEPTH, variant);
  console.log(`start: win rate vs defaults = ${(startFit * 100).toFixed(1)}% (self-play baseline ~50%)`);

  // Coordinate ascent from a starting weight vector.
  function hillClimb(start) {
    let w = clampSigns({ ...start });
    let fit = winRate(w, benchmark, trainSeeds, TRAIN_DEPTH, variant);
    let step = 0.4;
    for (let s = 0; s < sweeps; s++) {
      let improved = false;
      for (const k of KEYS) {
        const base = w[k];
        const mag = Math.max(2, Math.abs(base));
        for (const val of [base * (1 + step), base * (1 - step), base + step * mag, base - step * mag]) {
          const cand = clampSigns({ ...w, [k]: val });
          const f = winRate(cand, benchmark, trainSeeds, TRAIN_DEPTH, variant);
          if (f > fit + MARGIN) { w = cand; fit = f; improved = true; }
        }
      }
      step *= 0.72;
      if (!improved) break;
    }
    return { w, fit };
  }

  // First climb from the hand-tuned defaults, then random restarts (perturbations of
  // the defaults) to escape local optima. Keep the global best by training fitness.
  let best = hillClimb(DEFAULTS);
  console.log(`restart 0 (from defaults): train ${(best.fit * 100).toFixed(1)}%`);
  for (let r = 0; r < RESTARTS; r++) {
    const start = {};
    for (const k of KEYS) {
      const mag = Math.max(2, Math.abs(DEFAULTS[k]));
      start[k] = DEFAULTS[k] + (rng() * 2 - 1) * 0.5 * mag;
    }
    const res = hillClimb(start);
    console.log(`restart ${r + 1}/${RESTARTS}: train ${(res.fit * 100).toFixed(1)}%`);
    if (res.fit > best.fit) best = res;
  }
  const w = best.w;
  const bestFit = best.fit;

  // Held-out validation at runtime depth.
  const learnedVal = winRate(w, benchmark, valSeeds, VAL_DEPTH, variant);
  const accepted = learnedVal > 0.5 + MARGIN;
  let finalWeights = w;
  if (!accepted) {
    console.log(`Validation: learned ${(learnedVal * 100).toFixed(1)}% vs defaults on unseen openings — not a clear win, keeping defaults.`);
    finalWeights = { ...DEFAULTS };
  } else {
    console.log(`Validation: learned weights beat defaults ${(learnedVal * 100).toFixed(1)}% on unseen openings (depth ${VAL_DEPTH}) — accepted.`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`'${variant}' trained in ${elapsed}s. Final weights:`, finalWeights);
  return {
    weights: finalWeights,
    meta: {
      variant,
      method: 'self-play coordinate-ascent policy search',
      sweeps,
      trainSeeds: trainSeeds.length,
      valSeeds: valSeeds.length,
      restarts: RESTARTS,
      gamePlyCap: GAME_PLY_CAP,
      trainDepth: TRAIN_DEPTH,
      valDepth: VAL_DEPTH,
      startWinRateVsDefault: Number(startFit.toFixed(3)),
      trainWinRateVsDefault: Number(bestFit.toFixed(3)),
      validationWinRateVsDefault: Number(learnedVal.toFixed(3)),
      accepted,
      seed,
      trainedSeconds: Number(elapsed),
      trainedAt: new Date().toISOString(),
    },
  };
}

function main() {
  const sweeps = Number(process.argv[2]) || 5;
  const only = process.argv[3]; // optional: 'traditional' | 'clash'
  const t0 = Date.now();

  // Preserve any existing trained entry for a variant we are not training this run
  // (only the known per-variant keys — never legacy/stray top-level fields).
  const payload = {};
  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT, 'utf8'));
      for (const v of ['traditional', 'clash']) {
        if (prev?.[v]?.weights) payload[v] = prev[v];
      }
    } catch { /* ignore malformed existing file */ }
  }

  const variants = only === 'traditional' || only === 'clash' ? [only] : ['traditional', 'clash'];
  for (const variant of variants) {
    payload[variant] = trainVariant(variant, sweeps, 12345);
  }

  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nAll done in ${((Date.now() - t0) / 1000).toFixed(1)}s. Wrote ${OUT}`);
}

main();
