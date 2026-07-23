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
// Because it optimizes win rate directly (not outcome-correlation, which distorts
// a linear value model — e.g. it over-values central control), the result is
// weights that genuinely play better. Finally it validates on a DISJOINT set of
// openings and only ships the learned weights if they still beat the defaults on
// unseen games; otherwise it falls back to the defaults so training can never
// regress. Output: ai/weights.json (loaded by the server).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initialState, applyMove, legalMoves } from '../shared/engine.js';
import { search, DEFAULT_WEIGHTS } from '../shared/ai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'weights.json');

const KEYS = Object.keys(DEFAULT_WEIGHTS);

function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Keep learned weights sensible: rewards non-negative, penalties non-positive.
function clampSigns(w) {
  const o = { ...w };
  o.material = Math.max(1, o.material);
  o.advance = Math.max(0, o.advance);
  o.lead = Math.max(0, o.lead);
  o.goalThreat = Math.max(0, o.goalThreat);
  o.vulnerability = Math.min(0, o.vulnerability);
  return o;
}

// Play one game: white uses wWhite, black uses wBlack. Returns winner (0/1/-1).
// A few random opening plies (seeded) diversify the games.
function playGame(wWhite, wBlack, seed, depth) {
  const rng = makeRng(seed);
  let state = initialState();
  for (let ply = 0; ply < 200 && state.status === 'playing'; ply++) {
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
function winRate(w, benchmark, seeds, depth) {
  let score = 0, games = 0;
  for (const seed of seeds) {
    for (let color = 0; color < 2; color++) {
      const winner = color === 0 ? playGame(w, benchmark, seed, depth)
                                 : playGame(benchmark, w, seed, depth);
      games++;
      if (winner === -1) { score += 0.5; continue; }
      const wWasWhite = color === 0;
      if ((winner === 0) === wWasWhite) score += 1;
    }
  }
  return score / games;
}

function train(sweeps = 6, seed = 12345) {
  const t0 = Date.now();
  const benchmark = { ...DEFAULT_WEIGHTS };
  const TRAIN_DEPTH = 2; // fast, many games -> low-variance fitness
  const VAL_DEPTH = 3;   // measure final strength at the runtime default depth
  const trainSeeds = Array.from({ length: 60 }, (_, i) => (seed + i * 7919) >>> 0);
  const valSeeds = Array.from({ length: 40 }, (_, i) => (seed + 900000 + i * 6151) >>> 0);
  const MARGIN = 0.015; // require a real gain to accept a nudge (beat the noise)
  const rng = makeRng((seed ^ 0x9e3779b9) >>> 0);

  const startFit = winRate(DEFAULT_WEIGHTS, benchmark, trainSeeds, TRAIN_DEPTH);
  console.log(`start: win rate vs defaults = ${(startFit * 100).toFixed(1)}% (self-play baseline ~50%)`);

  // Coordinate ascent from a starting weight vector. Slow annealing lets it keep
  // finding gains for several sweeps before shrinking the step.
  function hillClimb(start) {
    let w = clampSigns({ ...start });
    let fit = winRate(w, benchmark, trainSeeds, TRAIN_DEPTH);
    let step = 0.4;
    for (let s = 0; s < sweeps; s++) {
      let improved = false;
      for (const k of KEYS) {
        const base = w[k];
        const mag = Math.max(2, Math.abs(base));
        for (const val of [base * (1 + step), base * (1 - step), base + step * mag, base - step * mag]) {
          const cand = clampSigns({ ...w, [k]: val });
          const f = winRate(cand, benchmark, trainSeeds, TRAIN_DEPTH);
          if (f > fit + MARGIN) { w = cand; fit = f; improved = true; }
        }
      }
      step *= 0.72;
      if (!improved) break;
    }
    return { w, fit };
  }

  // First climb from the hand-tuned defaults, then several random restarts
  // (perturbations of the defaults) to escape local optima. Keep the global best
  // by training fitness; the held-out validation below is the final gatekeeper.
  let best = hillClimb(DEFAULT_WEIGHTS);
  console.log(`restart 0 (from defaults): train ${(best.fit * 100).toFixed(1)}%`);
  const RESTARTS = 4;
  for (let r = 0; r < RESTARTS; r++) {
    const start = {};
    for (const k of KEYS) {
      const mag = Math.max(2, Math.abs(DEFAULT_WEIGHTS[k]));
      start[k] = DEFAULT_WEIGHTS[k] + (rng() * 2 - 1) * 0.5 * mag;
    }
    const res = hillClimb(start);
    console.log(`restart ${r + 1}/${RESTARTS}: train ${(res.fit * 100).toFixed(1)}%`);
    if (res.fit > best.fit) best = res;
  }
  const w = best.w;
  const bestFit = best.fit;

  // Held-out validation at runtime depth.
  const learnedVal = winRate(w, benchmark, valSeeds, VAL_DEPTH);
  const accepted = learnedVal > 0.5 + MARGIN;
  let finalWeights = w;
  if (!accepted) {
    console.log(
      `\nValidation: learned ${(learnedVal * 100).toFixed(1)}% vs defaults on unseen openings — not a clear win, keeping defaults.`);
    finalWeights = { ...DEFAULT_WEIGHTS };
  } else {
    console.log(
      `\nValidation: learned weights beat defaults ${(learnedVal * 100).toFixed(1)}% on unseen openings (depth ${VAL_DEPTH}) — accepted.`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const payload = {
    weights: finalWeights,
    meta: {
      method: 'self-play coordinate-ascent policy search',
      sweeps,
      trainSeeds: trainSeeds.length,
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
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nTrained in ${elapsed}s.`);
  console.log('Final weights:', finalWeights);
  console.log('Wrote', OUT);
}

const sweeps = Number(process.argv[2]) || 6;
train(sweeps);
