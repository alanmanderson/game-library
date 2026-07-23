import { SIZE, countDice } from '/shared/engine.js';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const homeEl = $('home');
const gameEl = $('game');
const boardEl = $('board');       // the tilted plate
const statusEl = $('status');
const homeError = $('home-error');
const sceneEl = $('scene');
const sceneInner = $('sceneInner');
const tiltEl = $('tilt');
const sceneWrap = $('sceneWrap');

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
      syncDice(msg.state);
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
  layout();
}
function showHome() {
  gameEl.classList.add('hidden');
  homeEl.classList.remove('hidden');
  if (ws) { try { ws.close(); } catch {} ws = null; }
  current = null;
}

let statusTimer = null;
function flashStatus(text) {
  statusEl.textContent = text;
  statusEl.className = 'status';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { if (current) render(); }, 1600);
}

// ---------- Board geometry (matches the Dice Board design) ----------
const CELL = 100, GAP = 8, STEP = CELL + GAP, PAD = 28;

// Map a screen cell (sr,sc; screen row 0 = far/top) to a real board index, so that
// "you" always sit at the bottom of the board and move up-screen toward the goal.
function realIndex(sr, sc) {
  if (me === 0) return (SIZE - 1 - sr) * SIZE + sc;   // real (6-sr, sc)
  return sr * SIZE + (SIZE - 1 - sc);                 // real (sr, 6-sc)
}
// Inverse: real index -> on-screen cell.
function screenPos(real) {
  const r = Math.floor(real / SIZE), c = real % SIZE;
  if (me === 0) return { sr: SIZE - 1 - r, sc: c };
  return { sr: r, sc: SIZE - 1 - c };
}

// ---------- 3D die geometry ----------
// A die orientation is {player, up, north, east}. A physical die is a fixed cube;
// we place value k's pip-face on a fixed side and then rotate the WHOLE cube so the
// right value faces up / north / east. Because tilting is a real 90° roll, changing
// orientation animates as the die tumbling to its new face.
//
// Fixed per-value local face normals (opposite faces sum to 7). Handedness is chosen
// so a valid engine die yields a proper rotation (det +1).
const NORMAL = {
  1: [0, 0, 1], 6: [0, 0, -1],
  2: [1, 0, 0], 5: [-1, 0, 0],
  3: [0, -1, 0], 4: [0, 1, 0],
};
// Board-frame target axes: up -> +Z (out of plate), north -> -Y (up-screen), east -> +X.
const AX_U = [0, 0, 1], AX_N = [0, -1, 0], AX_E = [1, 0, 0];

// Build matrix3d(...) that orients a cube so faces `u`,`n`,`e` point up/north/east.
function orientMatrix(u, n, e) {
  const nu = NORMAL[u], nn = NORMAL[n], ne = NORMAL[e];
  // R has columns [U N E]; L has columns [nu nn ne]; M = R * Lᵀ (L orthonormal).
  const R = [
    [AX_U[0], AX_N[0], AX_E[0]],
    [AX_U[1], AX_N[1], AX_E[1]],
    [AX_U[2], AX_N[2], AX_E[2]],
  ];
  const Lt = [nu, nn, ne]; // rows of Lᵀ
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += R[i][k] * Lt[k][j];
      M[i][j] = s;
    }
  // column-major matrix3d
  return `matrix3d(${M[0][0]},${M[1][0]},${M[2][0]},0,` +
         `${M[0][1]},${M[1][1]},${M[2][1]},0,` +
         `${M[0][2]},${M[1][2]},${M[2][2]},0,0,0,0,1)`;
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

function makeFace(value) {
  const face = document.createElement('div');
  face.className = `face f${value}`;
  for (const pos of PIPS[value]) {
    const pip = document.createElement('div');
    pip.className = `pip ${pos}`;
    face.appendChild(pip);
  }
  return face;
}

// Create one die element (all six faces built once). Returns { el, cube }.
function createDie() {
  const el = document.createElement('div');
  el.className = 'die';
  const shadow = document.createElement('div');
  shadow.className = 'die-shadow';
  const holder = document.createElement('div');
  holder.className = 'cube-holder';
  const cube = document.createElement('div');
  cube.className = 'cube';
  for (const v of [1, 2, 3, 4, 5, 6]) cube.appendChild(makeFace(v));
  holder.appendChild(cube);
  el.appendChild(shadow);
  el.appendChild(holder);
  el.addEventListener('click', () => onCellClick(Number(el.dataset.real)));
  return { el, cube };
}

function positionDie(el, sr, sc) {
  el.style.left = sc * STEP + 'px';
  el.style.top = sr * STEP + 'px';
}

// Orient + colour a die element from its board die (with the per-seat display flip).
function applyDie(rec, die) {
  const light = die.player === me;
  rec.el.classList.toggle('light', light);
  rec.el.classList.toggle('dark', !light);
  // Display flip: for seat 1 the board is viewed rotated 180° about the up axis,
  // so the north/east faces swap to their opposites.
  const n = me === 0 ? die.north : 7 - die.north;
  const e = me === 0 ? die.east : 7 - die.east;
  rec.cube.style.transform = orientMatrix(die.up, n, e);
}

// ---------- Wells (sunken board squares) ----------
let diceLayer = null;
let wells = [];       // screen-indexed .well elements
let builtMe = null;   // orientation the board DOM was built for

function buildBoard() {
  boardEl.innerHTML = '';
  wells = [];
  for (let sr = 0; sr < SIZE; sr++) {
    for (let sc = 0; sc < SIZE; sc++) {
      const real = realIndex(sr, sc);
      const well = document.createElement('div');
      well.className = 'well';
      const rr = Math.floor(real / SIZE);
      if (rr === 0 || rr === SIZE - 1) well.classList.add('rim');
      well.style.left = PAD + sc * STEP + 'px';
      well.style.top = PAD + sr * STEP + 'px';
      well.dataset.real = real;
      well.addEventListener('click', () => onCellClick(real));
      boardEl.appendChild(well);
      wells.push(well);
    }
  }
  diceLayer = document.createElement('div');
  diceLayer.className = 'dice-layer';
  boardEl.appendChild(diceLayer);
  elByReal = new Map();
  builtMe = me;
}

// ---------- Persistent die elements + move animation ----------
let elByReal = new Map();   // real index -> { el, cube }

function fadeRemove(el) {
  el.classList.add('removing');
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 360);
}

function spawnDie(real, die) {
  const rec = createDie();
  rec.el.classList.add('no-anim');
  rec.cube.classList.add('no-anim');
  diceLayer.appendChild(rec.el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    rec.el.classList.remove('no-anim');
    rec.cube.classList.remove('no-anim');
  }));
  return rec;
}

// Reconcile the dice DOM with a new authoritative board, keeping elements stable so
// the mover slides (position transition) and rolls (cube transition) into place.
function syncDice(state) {
  const board = state.board;
  const fullRebuild = builtMe !== me || elByReal.size === 0 || !state.lastMove;

  if (fullRebuild) {
    if (builtMe !== me || !diceLayer) buildBoard();
    diceLayer.innerHTML = '';
    const created = [];
    elByReal = new Map();
    for (let real = 0; real < board.length; real++) {
      const die = board[real];
      if (!die) continue;
      const rec = createDie();
      rec.el.classList.add('no-anim');
      rec.cube.classList.add('no-anim');
      const { sr, sc } = screenPos(real);
      positionDie(rec.el, sr, sc);
      rec.el.dataset.real = real;
      applyDie(rec, die);
      diceLayer.appendChild(rec.el);
      elByReal.set(real, rec);
      created.push(rec);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      created.forEach((rec) => { rec.el.classList.remove('no-anim'); rec.cube.classList.remove('no-anim'); });
    }));
    return;
  }

  // Incremental: exactly one die moved (state.lastMove.from -> .to); a clash or
  // surround may additionally remove dice anywhere.
  const lm = state.lastMove;
  const moverPlayer = 1 - state.turn;                 // the side that just moved
  const moverSurvived = !!(board[lm.to] && board[lm.to].player === moverPlayer);
  const prev = elByReal;
  const next = new Map();
  const used = new Set();
  const moverRec = prev.get(lm.from) || null;
  if (moverRec) used.add(moverRec.el);

  for (let real = 0; real < board.length; real++) {
    const die = board[real];
    if (!die) continue;
    let rec;
    if (moverSurvived && real === lm.to && moverRec) {
      rec = moverRec;
    } else if (prev.has(real) && !used.has(prev.get(real).el)) {
      rec = prev.get(real);
      used.add(rec.el);
    } else {
      rec = spawnDie(real, die);
    }
    const { sr, sc } = screenPos(real);
    positionDie(rec.el, sr, sc);
    rec.el.dataset.real = real;
    applyDie(rec, die);
    next.set(real, rec);
  }

  // Anything not carried over was captured / surrounded / is a destroyed mover.
  for (const [, rec] of prev) {
    if (!used.has(rec.el)) fadeRemove(rec.el);
  }
  if (moverRec && ![...next.values()].includes(moverRec)) fadeRemove(moverRec.el);

  elByReal = next;
}

// ---------- Render (highlights, status, scores, panels) ----------
function render() {
  if (!current) return;
  const { state, legalMoves, yourTurn, occupied, names } = current;

  const waiting = mode === 'pvp' && (!occupied[0] || !occupied[1]);
  $('waiting').classList.toggle('hidden', !waiting);
  if (waiting) $('waiting-code').textContent = current.code;

  $('room-label').textContent = mode === 'ai' ? 'VS COMPUTER' : `ROOM ${current.code}`;

  if (builtMe !== me || wells.length === 0) buildBoard();

  const movableFrom = new Set((legalMoves || []).map((m) => m.from));
  const nexts = selectedFrom !== null ? nextStepMap() : new Map();
  const pathSquares = selectedFrom !== null ? new Set(partialPathSquares()) : new Set();
  const commitReady = selectedFrom !== null && canCommit();

  // Wells: reset then apply highlight classes.
  for (const well of wells) {
    const real = Number(well.dataset.real);
    const rr = Math.floor(real / SIZE);
    well.className = 'well' + (rr === 0 || rr === SIZE - 1 ? ' rim' : '');

    if (state.lastMove) {
      if (state.lastMove.from === real) well.classList.add('lastfrom');
      if (state.lastMove.to === real) well.classList.add('lastto');
      if ((state.lastMove.path || []).includes(real) && state.lastMove.to !== real) well.classList.add('path');
    }
    if (hintCells && (hintCells.from === real || hintCells.to === real || (hintCells.path || []).includes(real))) {
      well.classList.add('hint');
    }
    if (pathSquares.has(real)) well.classList.add('path');

    const under = state.board[real];
    if (yourTurn && under && under.player === me && selectedFrom === null && movableFrom.has(real)) {
      well.classList.add('selectable');
    }
    if (nexts.has(real)) {
      const t = nexts.get(real);
      well.classList.add('target');
      if (t.type === 'jump') well.classList.add('jump');
      else if (t.capture) well.classList.add('capture');
    }
    if (commitReady && real === currentPos) well.classList.add('confirm');
  }

  // Dice: selection glow + movable cursor.
  for (const [real, rec] of elByReal) {
    rec.el.classList.toggle('selected', real === selectedFrom);
    const under = state.board[real];
    const movable = yourTurn && under && under.player === me && selectedFrom === null && movableFrom.has(real);
    rec.el.classList.toggle('movable', !!movable);
  }

  // Status / help line
  statusEl.className = 'status';
  if (state.status === 'won') {
    const iWon = state.winner === me;
    statusEl.textContent = iWon ? 'You win! 🎉' : 'You lose.';
    statusEl.classList.add(iWon ? 'win' : 'lose');
  } else if (state.status === 'draw') {
    statusEl.textContent = "It's a draw.";
  } else if (waiting) {
    statusEl.textContent = 'Waiting for an opponent…';
  } else if (yourTurn) {
    if (selectedFrom !== null && partialSteps().length > 0) {
      statusEl.textContent = commitReady
        ? (nexts.size > 0 ? 'Tap the glowing well to confirm, or keep jumping' : 'Tap the glowing well to confirm')
        : 'Continue the jump';
    } else if (selectedFrom !== null) {
      statusEl.textContent = 'Choose where to tilt or jump';
    } else {
      statusEl.textContent = 'Your turn — tap a die';
    }
    statusEl.classList.add('you');
  } else {
    statusEl.textContent = mode === 'ai' ? 'Computer is thinking…' : "Opponent's turn";
    statusEl.classList.add('opp');
  }

  // Scores (dice remaining).
  const oppSeat = 1 - me;
  $('score-you').textContent = `You — ${countDice(state.board, me)} dice`;
  $('score-opp').textContent = `${mode === 'ai' ? 'Computer' : (names?.[oppSeat] || 'Opponent')} — ${countDice(state.board, oppSeat)} dice`;

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

  $('btn-hint').disabled = !(yourTurn && state.status === 'playing');
  layout();
}

// ---------- Responsive scale of the fixed-size 3D scene ----------
// The board is a fixed 804px 3D scene scaled to fit. Transforms don't reserve
// layout space, so we size the .scene box to the board's real rendered extent
// (measured post-tilt/-scale) and position the scaled inner to sit inside it.
const VPAD = 8;
// Union of the plate and every die (dice pop out via translateZ, so the plate's
// own rect understates the rendered extent on all four sides).
function boardBounds() {
  let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
  // Measure the cubes (they carry the translateZ pop-up) rather than the flat
  // .die wrappers, whose rects sit on the plate and understate the height.
  const els = [tiltEl];
  if (diceLayer) els.push(...diceLayer.querySelectorAll('.cube'));
  for (const el of els) {
    const r = el.getBoundingClientRect();
    top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom);
    left = Math.min(left, r.left); right = Math.max(right, r.right);
  }
  return { top, bottom, left, right, width: right - left, height: bottom - top };
}
function layout() {
  if (gameEl.classList.contains('hidden')) return;
  const avail = Math.min(window.innerWidth - 24, 660);
  const s = Math.max(0.30, avail / 804);
  sceneInner.style.transform = `scale(${s})`;
  sceneInner.style.top = '0px';
  sceneInner.style.left = '0px';
  sceneEl.style.width = Math.ceil(804 * s) + 'px';
  sceneEl.style.height = '4px';

  // Vertical: pull the board up so its highest rendered pixel sits below the box top.
  let bd = boardBounds();
  let bx = sceneEl.getBoundingClientRect();
  sceneInner.style.top = Math.round(-(bd.top - bx.top) + VPAD) + 'px';

  // Reserve the true visual height and width, then centre horizontally.
  bd = boardBounds();
  bx = sceneEl.getBoundingClientRect();
  sceneEl.style.height = Math.round(bd.height + VPAD * 2) + 'px';
  sceneEl.style.width = Math.round(bd.width) + 'px';

  bx = sceneEl.getBoundingClientRect();
  bd = boardBounds();
  const dx = (bx.left + bx.width / 2) - (bd.left + bd.width / 2);
  sceneInner.style.left = Math.round(dx) + 'px';
}
window.addEventListener('resize', layout);

// ---------- Interaction ----------
// A move is built up one step at a time: pick a die, then tap tilt/jump targets.
// Simple moves commit instantly; extendable jumps show a glowing confirm well.
function onCellClick(real) {
  if (!current || current.state.status !== 'playing' || !current.yourTurn) return;
  hintCells = null;
  const { state, legalMoves } = current;
  const die = state.board[real];
  const isMyMovableDie = die && die.player === me && (legalMoves || []).some((m) => m.from === real);

  if (selectedFrom === null) {
    if (isMyMovableDie) { selectedFrom = real; pathTilt = null; pathJumps = []; currentPos = real; render(); }
    return;
  }

  if (real === currentPos) {
    if (canCommit()) commitMove();
    else resetSelection();
    render();
    return;
  }

  const nexts = nextStepMap();
  if (nexts.has(real)) {
    const step = nexts.get(real);
    if (step.type === 'tilt') pathTilt = step.dir; else pathJumps.push(step.dir);
    currentPos = real;
    if (nextStepMap().size === 0 && canCommit()) commitMove();
    render();
    return;
  }

  if (partialSteps().length === 0 && isMyMovableDie) {
    selectedFrom = real; currentPos = real; render();
    return;
  }

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
