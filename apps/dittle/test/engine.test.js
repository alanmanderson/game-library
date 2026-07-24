import {
  initialState, legalMoves, applyMove, rollDie, idx, countDice,
  SIZE, goalRow, jumpLandings, makeMove, moveKey, normalizeMove, rowOf,
  sumUpInRow, countInRow, allDiceOnRow,
} from '../shared/engine.js';

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.error('FAIL:', msg); }
}
function eq(a, b, msg) { ok(a === b, `${msg} (got ${a}, want ${b})`); }
function throws(fn, msg) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  ok(threw, msg);
}

// Empty board helper for a given variant.
function emptyState(variant, turn = 0) {
  const s = initialState(variant);
  s.board = new Array(SIZE * SIZE).fill(null);
  s.turn = turn;
  return s;
}

// ============================ Shared: dice orientation ============================

// Die faces are self-consistent (opposite faces sum to 7) through any roll sequence.
{
  let d = { player: 0, up: 6, north: 4, east: 2 };
  const seq = ['N', 'E', 'W', 'S', 'E', 'N', 'S', 'W'];
  for (const dir of seq) {
    d = rollDie(d, dir);
    ok(d.up >= 1 && d.up <= 6, 'up in range after ' + dir);
    ok(d.north >= 1 && d.north <= 6, 'north in range');
    ok(d.east >= 1 && d.east <= 6, 'east in range');
  }
}

// Rolling east then west returns to the original orientation.
{
  const d0 = { player: 0, up: 6, north: 4, east: 2 };
  const d1 = rollDie(rollDie(d0, 'E'), 'W');
  eq(d1.up, d0.up, 'E then W restores up');
  eq(d1.north, d0.north, 'E then W restores north');
  eq(d1.east, d0.east, 'E then W restores east');
}

// Tilt forward from start (up=6, north=4): new up = 7 - north = 3.
{
  const d0 = { player: 0, up: 6, north: 4, east: 2 };
  const d = rollDie(d0, 'N');
  eq(d.up, 3, 'tilt forward from 6/north4 gives up=3');
}

// ============================ Shared: setup + directions ============================

// Default variant is traditional; initial state: 14 dice, 7 each, player 0 to move.
{
  const s = initialState();
  eq(s.variant, 'traditional', 'default variant is traditional');
  eq(countDice(s.board, 0), 7, 'player 0 has 7 dice');
  eq(countDice(s.board, 1), 7, 'player 1 has 7 dice');
  eq(s.turn, 0, 'player 0 to move');
  const lm = legalMoves(s);
  ok(lm.length > 0, 'there are legal moves');
  ok(lm.every(m => ['N', 'E', 'W'].includes(m.dir)), 'player 0 never tilts backward (S)');
}

// Player 1 never tilts backward (N).
{
  const s = initialState();
  s.turn = 1;
  const lm = legalMoves(s);
  ok(lm.every(m => ['S', 'E', 'W'].includes(m.dir)), 'player 1 never tilts backward (N)');
}

// applyMove does not mutate the input state.
{
  const s = initialState();
  const before = JSON.stringify(s);
  applyMove(s, legalMoves(s)[0]);
  eq(JSON.stringify(s), before, 'applyMove is pure (no mutation)');
}

// ============================ CLASH variant ============================

// Clash — only tilt moves are generated; no jumps of any kind.
{
  const s = emptyState('clash');
  s.board[idx(1, 3)] = { player: 0, up: 5, north: 4, east: 2 };
  s.board[idx(2, 3)] = { player: 1, up: 6, north: 3, east: 2 }; // jumpable if jumps existed
  const lm = legalMoves(s);
  ok(lm.length > 0, 'clash has legal tilt moves');
  ok(lm.every(m => !m.jump && m.jumps.length === 0), 'clash generates no jump moves');
}

// Clash — direct clash: stronger up-value wins the square, weaker is removed.
{
  const s = emptyState('clash');
  s.board[idx(3, 3)] = { player: 0, up: 5, north: 4, east: 2 }; // rolling N -> up = 7-4 = 3
  s.board[idx(4, 3)] = { player: 1, up: 2, north: 3, east: 2 };
  const ns = applyMove(s, { from: idx(3, 3), tilt: 'N', jumps: [] });
  const d = ns.board[idx(4, 3)];
  ok(d && d.player === 0, 'stronger mover captures the square');
  eq(ns.board[idx(3, 3)], null, 'origin cleared after clash');
}

// Clash — a tie clash removes both dice.
{
  const s = emptyState('clash');
  // p0 die rolling N: up becomes 7-north = 7-3 = 4. Defender up = 4 -> tie.
  s.board[idx(3, 3)] = { player: 0, up: 6, north: 3, east: 2 };
  s.board[idx(4, 3)] = { player: 1, up: 4, north: 3, east: 2 };
  s.board[idx(0, 0)] = { player: 1, up: 6, north: 3, east: 2 }; // keep p1 alive (no elimination win)
  const ns = applyMove(s, { from: idx(3, 3), tilt: 'N', jumps: [] });
  eq(ns.board[idx(4, 3)], null, 'tie clash removes the defender');
  eq(ns.board[idx(3, 3)], null, 'tie clash removes the mover');
}

// Clash — reaching the opponent base row wins immediately (single die).
{
  const s = emptyState('clash');
  s.board[idx(SIZE - 2, 0)] = { player: 0, up: 6, north: 4, east: 2 };
  s.board[idx(0, 6)] = { player: 1, up: 6, north: 3, east: 2 }; // p1 alive -> not elimination
  const ns = applyMove(s, { from: idx(SIZE - 2, 0), tilt: 'N', jumps: [] });
  eq(ns.status, 'won', 'clash: reaching goal row ends game');
  eq(ns.winner, 0, 'clash: player 0 wins by breakthrough');
  eq(ns.endReason, 'breakthrough', 'clash: endReason is breakthrough');
}

// Clash — elimination: capturing the opponent's last die wins.
{
  const s = emptyState('clash');
  s.board[idx(2, 3)] = { player: 0, up: 6, north: 3, east: 2 }; // rolling N -> up = 4
  s.board[idx(3, 3)] = { player: 1, up: 2, north: 3, east: 2 }; // p1's only die
  const ns = applyMove(s, { from: idx(2, 3), tilt: 'N', jumps: [] });
  eq(countDice(ns.board, 1), 0, 'opponent has no dice left');
  eq(ns.status, 'won', 'clash: elimination ends game');
  eq(ns.endReason, 'elimination', 'clash: endReason is elimination');
}

// Clash — surround: a die flanked by two stronger enemies is removed.
{
  const s = emptyState('clash');
  s.board[idx(3, 3)] = { player: 1, up: 1, north: 3, east: 2 };
  s.board[idx(3, 2)] = { player: 0, up: 5, north: 4, east: 2 };
  s.board[idx(2, 4)] = { player: 0, up: 6, north: 4, east: 5 };
  // Move (2,4) -> (3,4): p1 die at (3,3) is flanked west(5)+east(rolled) => sum>1 -> removed.
  const ns = applyMove(s, { from: idx(2, 4), tilt: 'N', jumps: [] });
  eq(ns.board[idx(3, 3)], null, 'clash: surrounded weak die is removed');
}

// ============================ Shared: jump landing geometry ============================

// jumpLandings: leap forward over one die to the empty square beyond.
{
  const board = new Array(SIZE * SIZE).fill(null);
  board[idx(1, 3)] = { player: 0, up: 5, north: 4, east: 2 };
  board[idx(2, 3)] = { player: 1, up: 6, north: 3, east: 2 };
  const lands = jumpLandings(board, idx(1, 3), 'N');
  ok(lands.includes(idx(3, 3)), 'jump leaps over a die to the empty square beyond');
  eq(lands.length, 1, 'single jump when only one die in a row (gap after)');
}

// jumpLandings: chains over two dice separated by an empty square.
{
  const board = new Array(SIZE * SIZE).fill(null);
  board[idx(1, 0)] = { player: 0, up: 5, north: 4, east: 2 };
  board[idx(2, 0)] = { player: 0, up: 6, north: 4, east: 2 };
  board[idx(4, 0)] = { player: 1, up: 2, north: 3, east: 2 };
  const lands = jumpLandings(board, idx(1, 0), 'N');
  ok(lands.includes(idx(3, 0)) && lands.includes(idx(5, 0)), 'jump chains to both landings');
  eq(lands.length, 2, 'two chained landings');
}

// ============================ TRADITIONAL variant: movement ============================

// Traditional — a pure jump keeps the up-face and never captures the jumped die.
{
  const s = emptyState('traditional');
  s.board[idx(1, 3)] = { player: 0, up: 5, north: 4, east: 2 };
  s.board[idx(2, 3)] = { player: 1, up: 6, north: 3, east: 2 };
  const move = legalMoves(s).find((m) => m.jump && m.to === idx(3, 3));
  ok(move, 'traditional: a forward jump is generated');
  const ns = applyMove(s, move);
  const landed = ns.board[idx(3, 3)];
  ok(landed && landed.player === 0 && landed.up === 5, 'jumped die keeps its up-face (5)');
  ok(ns.board[idx(2, 3)] && ns.board[idx(2, 3)].player === 1, 'jumped-over die is unharmed');
  eq(ns.board[idx(1, 3)], null, 'jumper leaves its origin');
}

// Traditional — NO capturing: a tilt onto an enemy die is not legal and is rejected.
{
  const s = emptyState('traditional');
  s.board[idx(3, 3)] = { player: 0, up: 5, north: 4, east: 2 };
  s.board[idx(4, 3)] = { player: 1, up: 2, north: 3, east: 2 }; // directly north
  const ms = legalMoves(s).filter((m) => m.from === idx(3, 3));
  ok(!ms.some((m) => m.to === idx(4, 3) && !m.jump), 'traditional: no tilt onto an enemy square');
  throws(() => applyMove(s, { from: idx(3, 3), tilt: 'N', jumps: [] }),
    'traditional: tilting onto an occupied square is rejected');
}

// Traditional — a PURE jump cannot turn; only a tilt+jump may form an L-shape.
{
  const s = emptyState('traditional');
  s.board[idx(2, 2)] = { player: 0, up: 5, north: 4, east: 2 }; // jumper
  s.board[idx(3, 2)] = { player: 1, up: 6, north: 3, east: 2 }; // leaped going N -> land (4,2)
  s.board[idx(4, 3)] = { player: 1, up: 6, north: 3, east: 2 }; // would be leaped going E
  const all = legalMoves(s).filter((m) => m.from === idx(2, 2));
  ok(!all.some((m) => !m.tilt && m.jumps.join('') === 'NE'),
    'traditional: a pure jump does not turn (no untilted N->E chain)');
  ok(all.some((m) => !m.tilt && m.jumps.join('') === 'N'),
    'traditional: the straight pure jump N is still generated');
}

// Traditional — tilt + jump MAY turn (L-shape): tilt E onto empty, then jump N.
{
  const s = emptyState('traditional');
  s.board[idx(2, 0)] = { player: 0, up: 6, north: 4, east: 2 }; // tilt E -> up = 7-2 = 5
  s.board[idx(3, 1)] = { player: 1, up: 6, north: 3, east: 2 }; // leaped after the tilt
  const mixed = legalMoves(s).find((m) => m.from === idx(2, 0) && m.tilt === 'E' && m.jumps.join('') === 'N');
  ok(mixed, 'traditional: a tilt-then-jump (L-shape) is generated');
  eq(mixed.to, idx(4, 1), 'tilt+jump ends past the jumped die');
  const ns = applyMove(s, mixed);
  const landed = ns.board[idx(4, 1)];
  ok(landed && landed.up === 5, 'tilt+jump face changes only from the tilt (5), not the jump');
  ok(ns.board[idx(3, 1)], 'jumped die survives a tilt+jump');
}

// Traditional — a straight multi-hop jump chain (NN) is generated and keeps its face.
{
  const s = emptyState('traditional');
  s.board[idx(1, 0)] = { player: 0, up: 4, north: 4, east: 2 };
  s.board[idx(2, 0)] = { player: 0, up: 6, north: 4, east: 2 }; // own die, leaped
  s.board[idx(4, 0)] = { player: 1, up: 2, north: 3, east: 2 }; // enemy, leaped
  const chain = legalMoves(s).find((m) => m.from === idx(1, 0) && m.jumps.join('') === 'NN');
  ok(chain, 'traditional: a two-hop straight jump chain is generated');
  eq(chain.to, idx(5, 0), 'two-hop chain lands two squares past');
  const ns = applyMove(s, chain);
  ok(ns.board[idx(5, 0)] && ns.board[idx(5, 0)].up === 4, 'multi-jump keeps up-face');
}

// Traditional — the tilt leg of a tilt+jump must land on an EMPTY square.
{
  const s = emptyState('traditional');
  s.board[idx(2, 0)] = { player: 0, up: 6, north: 4, east: 2 };
  s.board[idx(2, 1)] = { player: 1, up: 3, north: 3, east: 2 }; // enemy blocks the tilt square
  const ms = legalMoves(s).filter((m) => m.from === idx(2, 0));
  ok(!ms.some((m) => m.tilt === 'E' && m.jumps.length > 0), 'no tilt+jump when the tilt square is occupied');
  ok(!ms.some((m) => m.tilt === 'E' && m.jumps.length === 0), 'traditional: no terminal tilt onto an enemy either');
}

// Traditional — no backward hops anywhere (player 0 never uses S).
{
  const s = emptyState('traditional');
  s.board[idx(3, 3)] = { player: 0, up: 5, north: 4, east: 2 };
  s.board[idx(4, 3)] = { player: 1, up: 6, north: 3, east: 2 };
  s.board[idx(2, 3)] = { player: 1, up: 6, north: 3, east: 2 };
  const all = legalMoves(s).filter((m) => m.from === idx(3, 3));
  const dirsUsed = new Set(all.flatMap((m) => [m.tilt, ...m.jumps]).filter(Boolean));
  ok(!dirsUsed.has('S'), 'player 0 never tilts or jumps backward (S)');
  ok(all.some((m) => m.jumps.join('') === 'N'), 'a forward jump over the north enemy exists');
}

// ============================ TRADITIONAL variant: winning + scoring ============================

// Traditional — the game ends when one player has all 7 dice across; winner is by
// the higher up-face total in the base row. Here the filler WINS.
{
  const s = emptyState('traditional');
  for (let c = 0; c < 6; c++) s.board[idx(6, c)] = { player: 0, up: 6, north: 4, east: 2 }; // 6 across, sum 36
  s.board[idx(5, 6)] = { player: 0, up: 6, north: 4, east: 2 }; // the 7th, on row 5
  s.board[idx(0, 0)] = { player: 1, up: 2, north: 3, east: 2 }; // p1 across, sum 2
  s.board[idx(3, 3)] = { player: 1, up: 6, north: 3, east: 2 }; // p1 die not across
  const ns = applyMove(s, { from: idx(5, 6), tilt: 'N', jumps: [] });
  eq(ns.status, 'won', 'traditional: all-7-across ends the game');
  eq(ns.endReason, 'filled', 'traditional: endReason is filled');
  eq(ns.winner, 0, 'traditional: higher base-row total wins (filler)');
  ok(allDiceOnRow(ns.board, 0, goalRow(0)), 'all of player 0 is on the goal row');
  eq(sumUpInRow(ns.board, 1, goalRow(1)), 2, 'p1 base-row score counts only dice in the row');
  ok(ns.score && ns.score[0] > ns.score[1], 'score object reflects the totals');
}

// Traditional — FILLING FIRST DOES NOT WIN: a filler with low faces loses to an
// opponent showing higher faces in the base row.
{
  const s = emptyState('traditional');
  for (let c = 0; c < 6; c++) s.board[idx(6, c)] = { player: 0, up: 1, north: 3, east: 2 }; // 6 across, sum 6
  s.board[idx(5, 6)] = { player: 0, up: 1, north: 2, east: 2 };  // arrives low
  for (let c = 0; c < 4; c++) s.board[idx(0, c)] = { player: 1, up: 6, north: 3, east: 2 }; // p1 sum 24
  const ns = applyMove(s, { from: idx(5, 6), tilt: 'N', jumps: [] });
  eq(ns.status, 'won', 'traditional: game still ends on fill');
  eq(ns.winner, 1, 'traditional: opponent wins on score despite not filling');
}

// Traditional — an equal base-row total is a draw.
{
  const s = emptyState('traditional');
  for (let c = 0; c < 6; c++) s.board[idx(6, c)] = { player: 0, up: 3, north: 4, east: 2 }; // sum 18
  s.board[idx(5, 6)] = { player: 0, up: 6, north: 5, east: 2 };  // tilt N -> up = 7-5 = 2; total 20
  for (let c = 0; c < 4; c++) s.board[idx(0, c)] = { player: 1, up: 5, north: 3, east: 2 }; // sum 20
  const ns = applyMove(s, { from: idx(5, 6), tilt: 'N', jumps: [] });
  eq(sumUpInRow(ns.board, 0, goalRow(0)), 20, 'p0 base-row total is 20');
  eq(sumUpInRow(ns.board, 1, goalRow(1)), 20, 'p1 base-row total is 20');
  eq(ns.status, 'draw', 'traditional: equal totals is a draw');
  eq(ns.winner, null, 'draw has no winner');
}

// Traditional — no elimination: both sides always keep all 7 dice.
{
  let s = initialState('traditional');
  for (let i = 0; i < 12 && s.status === 'playing'; i++) {
    s = applyMove(s, legalMoves(s)[0]);
    eq(countDice(s.board, 0) + countDice(s.board, 1), 14, 'traditional keeps all 14 dice');
  }
}

// ============================ Shared: move identity + legacy ============================

// moveKey distinguishes different paths that could share a start square.
{
  const a = moveKey(makeMove(idx(2, 2), null, ['N', 'E']));
  const b = moveKey(makeMove(idx(2, 2), 'N', ['E']));
  ok(a !== b, 'a pure jump and a tilt+jump from the same square are distinct moves');
  eq(moveKey({ from: idx(2, 2), tilt: null, jumps: ['N', 'E'] }), a, 'moveKey is stable for equivalent moves');
}

// Legacy single-step move objects still apply (traditional tilt onto an empty square).
{
  const s = emptyState('traditional');
  s.board[idx(3, 3)] = { player: 0, up: 6, north: 4, east: 2 };
  s.board[idx(0, 0)] = { player: 1, up: 6, north: 3, east: 2 };
  const ns = applyMove(s, { from: idx(3, 3), dir: 'N', to: idx(4, 3) }); // legacy tilt
  ok(ns.board[idx(4, 3)] && ns.board[idx(4, 3)].player === 0, 'legacy {from,dir,to} tilt still works');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
