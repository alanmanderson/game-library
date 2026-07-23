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
let selectedFrom = null;    // index of my selected die
let hintCells = null;       // { from, to } to highlight

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
      selectedFrom = null;
      render();
      break;
    case 'hint':
      if (msg.move) {
        hintCells = { from: msg.move.from, to: msg.move.to };
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

  // Legal-move map: from -> [{to, dir, capture}]
  const fromMap = new Map();
  for (const m of (legalMoves || [])) {
    if (!fromMap.has(m.from)) fromMap.set(m.from, []);
    const occ = state.board[m.to];
    fromMap.get(m.from).push({ ...m, capture: !!occ });
  }

  // Paint cells
  const targets = selectedFrom !== null ? (fromMap.get(selectedFrom) || []) : [];
  const targetTo = new Map(targets.map((t) => [t.to, t]));

  for (const cell of cells) {
    const real = Number(cell.dataset.real);
    cell.className = 'cell';
    const r = Math.floor(real / SIZE);
    if (r === 0) cell.classList.add('home0');
    if (r === SIZE - 1) cell.classList.add('home1');

    // last move highlight
    if (state.lastMove) {
      if (state.lastMove.from === real) cell.classList.add('lastfrom');
      if (state.lastMove.to === real) cell.classList.add('lastto');
    }
    // hint highlight
    if (hintCells && (hintCells.from === real || hintCells.to === real)) {
      cell.classList.add('hint');
    }

    cell.innerHTML = '';
    const die = state.board[real];
    if (die) {
      const de = dieEl(die);
      if (real === selectedFrom) de.classList.add('selected');
      cell.appendChild(de);
      // your movable dice are selectable on your turn
      if (yourTurn && die.player === me && fromMap.has(real)) {
        cell.classList.add('selectable');
      }
    }
    // movement targets
    if (targetTo.has(real)) {
      const t = targetTo.get(real);
      cell.classList.add('target');
      if (t.jump) cell.classList.add('jump');
      else if (t.capture) cell.classList.add('capture');
    }
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
    statusEl.textContent = 'Your turn';
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
function onCellClick(real) {
  if (!current || current.state.status !== 'playing' || !current.yourTurn) return;
  hintCells = null;
  const { state, legalMoves } = current;

  // Clicking a target of the selected die -> make the move.
  if (selectedFrom !== null) {
    const move = (legalMoves || []).find((m) => m.from === selectedFrom && m.to === real);
    if (move) {
      sendMsg({ type: 'move', move: { from: move.from, to: move.to } });
      selectedFrom = null;
      return;
    }
  }

  // Clicking one of my movable dice -> select it.
  const die = state.board[real];
  const canMove = (legalMoves || []).some((m) => m.from === real);
  if (die && die.player === me && canMove) {
    selectedFrom = (selectedFrom === real) ? null : real;
    render();
    return;
  }

  // Otherwise deselect.
  selectedFrom = null;
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
