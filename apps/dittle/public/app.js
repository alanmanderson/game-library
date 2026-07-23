import { SIZE, countDice } from '/shared/engine.js';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const homeEl = $('home');
const gameEl = $('game');
const boardEl = $('board');
const statusEl = $('status');
const homeError = $('home-error');

// ---------- State ----------
let ws = null;
let me = 0;                 // my seat
let mode = 'pvp';
let current = null;         // latest state message
let selectedFrom = null;    // index of my selected die (start of the move being built)
let pathTilt = null;        // the single tilt direction chosen so far, or null
let pathJumps = [];         // jump-hop directions chosen so far
let currentPos = null;      // current end square of the partial move
let hintCells = null;       // { from, to, path } to highlight

function resetSelection() {
  selectedFrom = null; pathTilt = null; pathJumps = []; currentPos = null;
}

// ---------- Move-path helpers (build tilt / jump-chain / tilt+jump moves) ----------
const DELTA = { N: [1, 0], S: [-1, 0], E: [0, 1], W: [0, -1] };
function stepIdx(i, dir) {
  const [dr, dc] = DELTA[dir];
  const r = Math.floor(i / SIZE) + dr, c = (i % SIZE) + dc;
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return -1;
  return r * SIZE + c;
}
// A move's ordered steps: [tilt?] then each jump hop.
function stepSeq(m) {
  const s = [];
  if (m.tilt) s.push({ t: 'tilt', d: m.tilt });
  for (const d of (m.jumps || [])) s.push({ t: 'jump', d });
  return s;
}
function partialSteps() {
  const s = [];
  if (pathTilt) s.push({ t: 'tilt', d: pathTilt });
  for (const d of pathJumps) s.push({ t: 'jump', d });
  return s;
}
function isPrefix(p, seq) {
  if (p.length > seq.length) return false;
  for (let i = 0; i < p.length; i++) if (p[i].t !== seq[i].t || p[i].d !== seq[i].d) return false;
  return true;
}
// Legal moves that still match the path built so far.
function reachableMoves() {
  const p = partialSteps();
  return (current?.legalMoves || []).filter((m) => m.from === selectedFrom && isPrefix(p, stepSeq(m)));
}
// Map of next reachable square -> { type, dir, capture } from the current partial.
function nextStepMap() {
  const p = partialSteps();
  const map = new Map();
  for (const m of reachableMoves()) {
    const seq = stepSeq(m);
    if (seq.length <= p.length) continue;
    const step = seq[p.length];
    const land = m.path[p.length];
    if (map.has(land)) continue;
    const capture = step.t === 'tilt' && seq.length === p.length + 1 && !!current.state.board[land];
    map.set(land, { type: step.t, dir: step.d, capture });
  }
  return map;
}
// The partial path is itself a complete, legal move.
function canCommit() {
  const p = partialSteps();
  if (p.length === 0) return false;
  return reachableMoves().some((m) => stepSeq(m).length === p.length);
}
// Squares visited after `from` in the partial path (for highlighting).
function partialPathSquares() {
  const sq = [];
  let pos = selectedFrom;
  if (pathTilt) { pos = stepIdx(pos, pathTilt); sq.push(pos); }
  for (const d of pathJumps) { pos = stepIdx(stepIdx(pos, d), d); sq.push(pos); }
  return sq;
}
function commitMove() {
  sendMsg({ type: 'move', move: { from: selectedFrom, tilt: pathTilt, jumps: pathJumps.slice() } });
  resetSelection();
}

// ---------- Networking ----------
function connect() {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) return resolve();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(e);
    ws.onmessage = onMessage;
    ws.onclose = () => { statusEl.textContent = 'Disconnected.'; };
  });
}

function sendMsg(m) { ws.send(JSON.stringify(m)); }

function onMessage(ev) {
  const msg = JSON.parse(ev.data);
  switch (msg.type) {
    case 'created':
    case 'joined':
      me = msg.you; mode = msg.mode;
      showGame();
      break;
    case 'state':
      me = msg.you; mode = msg.mode;
      current = msg;
      resetSelection();
      render();
      break;
    case 'hint':
      if (msg.move) {
        hintCells = { from: msg.move.from, to: msg.move.to, path: msg.move.path || [] };
        render();
      }
      break;
    case 'error':
      if (!gameEl.classList.contains('hidden')) {
        flashStatus(msg.message);
      } else {
        homeError.textContent = msg.message;
      }
      break;
    case 'opponentLeft':
      flashStatus('Opponent left the room.');
      break;
  }
}

// ---------- Screen switching ----------
function showGame() {
  homeEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
}
function showHome() {
  gameEl.classList.add('hidden');
  homeEl.classList.remove('hidden');
  if (ws) { try { ws.close(); } catch {} ws = null; }
  current = null;
}

let statusTimer = null;
function flashStatus(text) {
  const prev = statusEl.textContent;
  const prevClass = statusEl.className;
  statusEl.textContent = text;
  statusEl.className = 'status';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { if (current) render(); }, 1600);
}

// ---------- Board display mapping ----------
// Map a screen cell (sr,sc; screen row 0 = top) to a real board index, so that
// "you" always sit at the bottom and move up the screen.
function realIndex(sr, sc) {
  if (me === 0) return (6 - sr) * SIZE + sc;      // real (6-sr, sc)
  return sr * SIZE + (6 - sc);                    // real (sr, 6-sc)
}

// Build the 49 cells once.
const cells = [];
function buildBoard() {
  boardEl.innerHTML = '';
  cells.length = 0;
  for (let sr = 0; sr < SIZE; sr++) {
    for (let sc = 0; sc < SIZE; sc++) {
      const real = realIndex(sr, sc);
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.real = real;
      const r = Math.floor(real / SIZE);
      if (r === 0) cell.classList.add('home0');
      if (r === SIZE - 1) cell.classList.add('home1');
      cell.addEventListener('click', () => onCellClick(real));
      boardEl.appendChild(cell);
      cells.push(cell);
    }
  }
}

// Pip layout classes for each die value.
const PIPS = {
  1: ['p-mc'],
  2: ['p-tl', 'p-br'],
  3: ['p-tl', 'p-mc', 'p-br'],
  4: ['p-tl', 'p-tr', 'p-bl', 'p-br'],
  5: ['p-tl', 'p-tr', 'p-mc', 'p-bl', 'p-br'],
  6: ['p-tl', 'p-tr', 'p-ml', 'p-mr', 'p-bl', 'p-br'],
};
function dieEl(die) {
  const d = document.createElement('div');
  d.className = `die p${die.player}`;
  for (const pos of PIPS[die.up]) {
    const pip = document.createElement('div');
    pip.className = `pip ${pos}`;
    d.appendChild(pip);
  }
  return d;
}

// ---------- Render ----------
function render() {
  if (!current) return;
  const { state, legalMoves, yourTurn, occupied, names } = current;

  // Waiting for opponent (pvp, seat filled but no opponent)?
  const waiting = mode === 'pvp' && (!occupied[0] || !occupied[1]);
  $('waiting').classList.toggle('hidden', !waiting);
  if (waiting) {
    $('waiting-code').textContent = current.code;
  }

  // Room label
  $('room-label').textContent = mode === 'ai' ? 'VS COMPUTER' : `ROOM ${current.code}`;

  // Build cells if needed (once, or if orientation changed)
  if (cells.length === 0 || cells[0].dataset.built !== String(me)) {
    buildBoard();
    cells.forEach((c) => (c.dataset.built = String(me)));
  }

  // Which of my dice can start a move.
  const movableFrom = new Set((legalMoves || []).map((m) => m.from));

  // Path being built: next-step targets, traversed squares, and whether it can commit.
  const nexts = selectedFrom !== null ? nextStepMap() : new Map();
  const pathSquares = selectedFrom !== null ? new Set(partialPathSquares()) : new Set();
  const commitReady = selectedFrom !== null && canCommit();

  for (const cell of cells) {
    const real = Number(cell.dataset.real);
    cell.className = 'cell';
    const r = Math.floor(real / SIZE);
    if (r === 0) cell.classList.add('home0');
    if (r === SIZE - 1) cell.classList.add('home1');

    // last move highlight (origin, destination, and any intermediate path squares)
    if (state.lastMove) {
      if (state.lastMove.from === real) cell.classList.add('lastfrom');
      if (state.lastMove.to === real) cell.classList.add('lastto');
      if ((state.lastMove.path || []).includes(real) && state.lastMove.to !== real) {
        cell.classList.add('path');
      }
    }
    // hint highlight
    if (hintCells && (hintCells.from === real || hintCells.to === real || (hintCells.path || []).includes(real))) {
      cell.classList.add('hint');
    }
    // squares already traversed in the move being built
    if (pathSquares.has(real)) cell.classList.add('path');

    cell.innerHTML = '';
    const die = state.board[real];
    if (die) {
      const de = dieEl(die);
      if (real === selectedFrom) de.classList.add('selected');
      cell.appendChild(de);
      // your movable dice are selectable on your turn (before a move is started)
      if (yourTurn && die.player === me && selectedFrom === null && movableFrom.has(real)) {
        cell.classList.add('selectable');
      }
    }
    // next-step targets of the move being built
    if (nexts.has(real)) {
      const t = nexts.get(real);
      cell.classList.add('target');
      if (t.type === 'jump') cell.classList.add('jump');
      else if (t.capture) cell.classList.add('capture');
    }
    // the current end square, when the built move is complete and confirmable
    if (commitReady && real === currentPos) cell.classList.add('confirm');
  }

  // Status text
  statusEl.className = 'status';
  if (state.status === 'won') {
    const iWon = state.winner === me;
    statusEl.textContent = iWon ? 'You win! 🎉' : 'You lose.';
    statusEl.classList.add(iWon ? 'you' : 'opp');
  } else if (state.status === 'draw') {
    statusEl.textContent = "It's a draw.";
  } else if (waiting) {
    statusEl.textContent = '';
  } else if (yourTurn) {
    if (selectedFrom !== null && partialSteps().length > 0) {
      statusEl.textContent = commitReady
        ? (nexts.size > 0 ? 'Tap the glowing square to confirm, or keep jumping' : 'Tap the glowing square to confirm')
        : 'Continue the jump';
    } else if (selectedFrom !== null) {
      statusEl.textContent = 'Choose where to tilt or jump';
    } else {
      statusEl.textContent = 'Your turn';
    }
    statusEl.classList.add('you');
  } else {
    statusEl.textContent = mode === 'ai' ? 'Computer is thinking…' : "Opponent's turn";
    statusEl.classList.add('opp');
  }

  // Scores (dice remaining). Dot colors follow each seat's actual die color.
  const oppSeat = 1 - me;
  $('score-you').textContent = `You — ${countDice(state.board, me)} dice`;
  $('score-opp').textContent = `${mode === 'ai' ? 'Computer' : (names?.[oppSeat] || 'Opponent')} — ${countDice(state.board, oppSeat)} dice`;
  document.querySelector('.score.you .dot').style.background = `var(--p${me})`;
  document.querySelector('.score.opp .dot').style.background = `var(--p${oppSeat})`;

  // Game over panel
  const go = $('game-over');
  if (state.status === 'won' || state.status === 'draw') {
    go.classList.remove('hidden');
    const draw = state.status === 'draw';
    const iWon = state.winner === me;
    go.classList.toggle('win', !draw && iWon);
    go.classList.toggle('lose', !draw && !iWon);
    const reasonText = {
      breakthrough: 'reached the home row',
      elimination: 'captured every die',
      stuck: 'left the opponent with no move',
      score: 'led on score at the move limit',
    }[state.endReason] || '';
    let headline = draw ? 'Draw' : (iWon ? 'Victory!' : 'Defeat');
    if (state.endReason === 'score' && state.score) {
      const mine = state.score[me], theirs = state.score[1 - me];
      headline += ` — score ${mine}–${theirs}`;
    } else if (reasonText && !draw) {
      headline += iWon ? ` — you ${reasonText}` : ` — opponent ${reasonText}`;
    }
    $('go-text').textContent = headline;
  } else {
    go.classList.add('hidden');
  }

  // Hint button only usable on your turn
  $('btn-hint').disabled = !(yourTurn && state.status === 'playing');
}

// ---------- Interaction ----------
// A move is built up one step at a time: pick a die, then tap tilt/jump targets.
// Simple moves (a tilt, or a jump with no possible continuation) commit instantly;
// extendable jumps show a glowing "confirm" square you tap to finish.
function onCellClick(real) {
  if (!current || current.state.status !== 'playing' || !current.yourTurn) return;
  hintCells = null;
  const { state, legalMoves } = current;
  const die = state.board[real];
  const isMyMovableDie = die && die.player === me && (legalMoves || []).some((m) => m.from === real);

  // Nothing selected yet: select one of my movable dice.
  if (selectedFrom === null) {
    if (isMyMovableDie) { selectedFrom = real; pathTilt = null; pathJumps = []; currentPos = real; render(); }
    return;
  }

  // Clicking the current end square: confirm a complete move, or deselect the origin.
  if (real === currentPos) {
    if (canCommit()) commitMove();
    else { resetSelection(); }
    render();
    return;
  }

  // Clicking a valid next step: extend the path (and auto-commit if it can't continue).
  const nexts = nextStepMap();
  if (nexts.has(real)) {
    const step = nexts.get(real);
    if (step.type === 'tilt') pathTilt = step.dir; else pathJumps.push(step.dir);
    currentPos = real;
    if (nextStepMap().size === 0 && canCommit()) { commitMove(); }
    render();
    return;
  }

  // Clicking another of my movable dice before committing: switch selection.
  if (partialSteps().length === 0 && isMyMovableDie) {
    selectedFrom = real; currentPos = real; render();
    return;
  }

  // Otherwise cancel the in-progress move.
  resetSelection();
  render();
}

// ---------- Home actions ----------
async function startAi() {
  homeError.textContent = '';
  await connect();
  const depth = Number($('ai-depth').value);
  sendMsg({ type: 'create', mode: 'ai', aiDepth: depth, name: $('name').value.trim() });
}
async function createRoom() {
  homeError.textContent = '';
  await connect();
  sendMsg({ type: 'create', mode: 'pvp', name: $('name').value.trim() });
}
async function joinRoom() {
  homeError.textContent = '';
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length < 4) { homeError.textContent = 'Enter a 4-letter code.'; return; }
  await connect();
  sendMsg({ type: 'join', code, name: $('name').value.trim() });
}

$('btn-ai').addEventListener('click', startAi);
$('btn-create').addEventListener('click', createRoom);
$('btn-join').addEventListener('click', joinRoom);
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$('btn-leave').addEventListener('click', showHome);
$('btn-rematch').addEventListener('click', () => sendMsg({ type: 'rematch' }));
$('btn-hint').addEventListener('click', () => sendMsg({ type: 'hint' }));
