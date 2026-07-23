import {
  initialState, legalMoves, applyMove, rollDie, idx, countDice,
  SIZE, goalRow, jumpLandings,
} from '../shared/engine.js';

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.error('FAIL:', msg); }
}
function eq(a, b, msg) { ok(a === b, `${msg} (got ${a}, want ${b})`); }

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

// Initial state: 14 dice, 7 each, player 0 to move.
{
  const s = initialState();
  eq(countDice(s.board, 0), 7, 'player 0 has 7 dice');
  eq(countDice(s.board, 1), 7, 'player 1 has 7 dice');
  eq(s.turn, 0, 'player 0 to move');
  // Each base-row die can go forward + at most 2 sideways; edges have 1 sideways.
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

// Direct clash: stronger up-value wins the square.
{
  const s = initialState();
  s.board = new Array(SIZE * SIZE).fill(null);
  // player 0 die with up=5 at (3,3); player 1 die with up=2 at (4,3) directly north.
  s.board[idx(3, 3)] = { player: 0, up: 5, north: 4, east: 2 }; // rolling N -> up = 7-4 = 3
  s.board[idx(4, 3)] = { player: 1, up: 2, north: 3, east: 2 };
  s.turn = 0;
  // rolled up = 3 > 2 -> mover wins
  const ns = applyMove(s, { from: idx(3, 3), dir: 'N', to: idx(4, 3) });
  const d = ns.board[idx(4, 3)];
  ok(d && d.player === 0, 'stronger mover captures the square');
  eq(ns.board[idx(3, 3)], null, 'origin cleared after move');
}

// Win: reaching the opponent base row wins immediately.
{
  const s = initialState();
  s.board = new Array(SIZE * SIZE).fill(null);
  s.board[idx(SIZE - 2, 0)] = { player: 0, up: 6, north: 4, east: 2 };
  s.board[idx(0, 6)] = { player: 1, up: 6, north: 3, east: 2 }; // give p1 a die so not elimination
  s.turn = 0;
  const ns = applyMove(s, { from: idx(SIZE - 2, 0), dir: 'N', to: idx(SIZE - 1, 0) });
  eq(ns.status, 'won', 'reaching goal row ends game');
  eq(ns.winner, 0, 'player 0 wins by reaching goal row');
  eq(goalRow(0), SIZE - 1, 'goal row for player 0 is top');
}

// Surround clash: a die flanked by two stronger enemies is removed.
{
  const s = initialState();
  s.board = new Array(SIZE * SIZE).fill(null);
  // player 1 die (weak, up=1) at (3,3); player 0 dice up=5 at (3,2) and up=5 at (3,4).
  s.board[idx(3, 3)] = { player: 1, up: 1, north: 3, east: 2 };
  s.board[idx(3, 2)] = { player: 0, up: 5, north: 4, east: 2 };
  // A player-0 die that moves to complete the surround from the south.
  s.board[idx(2, 4)] = { player: 0, up: 6, north: 4, east: 5 };
  s.turn = 0;
  // Move (2,4) -> (3,4): now p1 die at (3,3) is flanked west(5)+east(rolled) => sum>1 -> removed.
  const ns = applyMove(s, { from: idx(2, 4), dir: 'N', to: idx(3, 4) });
  eq(ns.board[idx(3, 3)], null, 'surrounded weak die is removed');
}

// Jump: leap forward over one die (friendly or enemy) to the empty square beyond.
{
  const board = new Array(SIZE * SIZE).fill(null);
  board[idx(1, 3)] = { player: 0, up: 5, north: 4, east: 2 }; // jumper
  board[idx(2, 3)] = { player: 1, up: 6, north: 3, east: 2 }; // enemy to leap over
  // (3,3) empty -> a valid landing
  const lands = jumpLandings(board, idx(1, 3), 'N');
  ok(lands.includes(idx(3, 3)), 'jump leaps over a die to the empty square beyond');
  eq(lands.length, 1, 'single jump when only one die in a row (gap after)');
}

// Jump chains over two dice separated by an empty square.
{
  const board = new Array(SIZE * SIZE).fill(null);
  board[idx(1, 0)] = { player: 0, up: 5, north: 4, east: 2 }; // jumper
  board[idx(2, 0)] = { player: 0, up: 6, north: 4, east: 2 }; // own die
  // (3,0) empty landing #1
  board[idx(4, 0)] = { player: 1, up: 2, north: 3, east: 2 }; // enemy die
  // (5,0) empty landing #2
  const lands = jumpLandings(board, idx(1, 0), 'N');
  ok(lands.includes(idx(3, 0)) && lands.includes(idx(5, 0)), 'jump chains to both landings');
  eq(lands.length, 2, 'two chained landings');
}

// Jump does NOT change the die's up-face and does NOT capture the jumped die.
{
  const s = initialState();
  s.board = new Array(SIZE * SIZE).fill(null);
  s.board[idx(1, 3)] = { player: 0, up: 5, north: 4, east: 2 };
  s.board[idx(2, 3)] = { player: 1, up: 6, north: 3, east: 2 };
  s.board[idx(0, 6)] = { player: 1, up: 6, north: 3, east: 2 }; // keep p1 alive
  s.turn = 0;
  const move = legalMoves(s).find((m) => m.jump && m.to === idx(3, 3));
  ok(move, 'a jump move is generated');
  const ns = applyMove(s, move);
  const landed = ns.board[idx(3, 3)];
  ok(landed && landed.player === 0 && landed.up === 5, 'jumped die keeps its up-face (5)');
  ok(ns.board[idx(2, 3)] && ns.board[idx(2, 3)].player === 1, 'jumped-over die is unharmed');
  eq(ns.board[idx(1, 3)], null, 'jumper leaves its origin');
}

// Cannot jump backward (player 0 cannot jump south).
{
  const s = initialState();
  s.board = new Array(SIZE * SIZE).fill(null);
  s.board[idx(4, 3)] = { player: 0, up: 5, north: 4, east: 2 };
  s.board[idx(3, 3)] = { player: 1, up: 6, north: 3, east: 2 };
  s.turn = 0;
  const backJump = legalMoves(s).find((m) => m.jump && m.to === idx(2, 3));
  ok(!backJump, 'no backward jump for player 0');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
