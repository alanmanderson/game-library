import { SIZE, countDice, rollDie } from '/shared/engine.js';

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
let selectedFrom = null;    // index of my selected die (start of the move), or null
let pendingTarget = null;   // an ambiguous end square being disambiguated (real index), or null
let hintCells = null;       // { from, to, path } to highlight

function resetSelection() {
  selectedFrom = null; pendingTarget = null;
}

// ---------- Move helpers: reachable ends, ghost orientation, disambiguation ----------
// The whole effect of a Dittle move is just the mover's final square and its final
// orientation (jumps never touch other dice; a terminal tilt clash is resolved from
// the destination). So two moves are visibly equivalent iff they share (to, orient),
// and a move's orient is fixed entirely by its optional single tilt.
function movesFrom(from) {
  return (current?.legalMoves || []).filter((m) => m.from === from);
}

// Orientation the selected die would show at the end of move `m` (only the tilt, if
// any, changes the up-face; jump hops never do).
function finalOrient(die, m) {
  return m.tilt ? rollDie(die, m.tilt)
                : { player: die.player, up: die.up, north: die.north, east: die.east };
}
function orientKey(o) { return `${o.up}.${o.north}.${o.east}`; }

// Reachable end squares for the selected die: end index -> { moves, outcomes }, where
// `outcomes` is a Map<orientKey, {move, orient}>. outcomes.size === 1 means the square
// has one unambiguous result (tap to play); > 1 means it can be reached with visibly
// different results (tap to pick a route).
function endMap(from) {
  const die = current.state.board[from];
  const map = new Map();
  if (!die) return map;
  for (const m of movesFrom(from)) {
    let e = map.get(m.to);
    if (!e) { e = { moves: [], outcomes: new Map() }; map.set(m.to, e); }
    e.moves.push(m);
    const o = finalOrient(die, m);
    const k = orientKey(o);
    if (!e.outcomes.has(k)) e.outcomes.set(k, { move: m, orient: o });
  }
  return map;
}

// Distinct routes to an ambiguous target: first-hop landing square -> { move, orient }.
// Each visibly-different result is reached by a distinct first hop (the tilt, or the
// first jump for a pure jump), so choosing the first hop picks the result.
function routesTo(from, target) {
  const die = current.state.board[from];
  const map = new Map();
  if (!die) return map;
  for (const m of movesFrom(from)) {
    if (m.to !== target) continue;
    const land = m.path[0];
    if (map.has(land)) continue;
    map.set(land, { move: m, orient: finalOrient(die, m) });
  }
  return map;
}

function commitMoveObj(m) {
  sendMsg({ type: 'move', move: { from: m.from, tilt: m.tilt || null, jumps: (m.jumps || []).slice() } });
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
let ghostLayer = null; // translucent preview dice for reachable squares
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
  ghostLayer = document.createElement('div');
  ghostLayer.className = 'ghost-layer';
  boardEl.appendChild(ghostLayer);   // above the dice so previews stay visible
  elByReal = new Map();
  builtMe = me;
}

// ---------- Ghost preview dice ----------
// Build a translucent die element oriented like a real one. It sits above the board
// and is itself clickable (dice pop up in 3D and can overlap the target's well, so
// the ghost is the reliable hit target — a click routes through the same handler).
function createGhost(real, orient, cls) {
  const el = document.createElement('div');
  el.className = 'die ghost ' + cls + (orient.player === me ? ' light' : ' dark');
  el.dataset.real = real;
  const holder = document.createElement('div');
  holder.className = 'cube-holder';
  const cube = document.createElement('div');
  cube.className = 'cube no-anim';
  for (const v of [1, 2, 3, 4, 5, 6]) cube.appendChild(makeFace(v));
  // Same per-seat display flip as live dice (seat 1 views the board rotated 180°).
  const n = me === 0 ? orient.north : 7 - orient.north;
  const e = me === 0 ? orient.east : 7 - orient.east;
  cube.style.transform = orientMatrix(orient.up, n, e);
  holder.appendChild(cube);
  el.appendChild(holder);
  el.addEventListener('click', () => onCellClick(real));
  return el;
}

// Redraw the ghost layer from a list of { real, orient, cls }.
function renderGhosts(list) {
  if (!ghostLayer) return;
  ghostLayer.innerHTML = '';
  for (const g of list) {
    const el = createGhost(g.real, g.orient, g.cls);
    const { sr, sc } = screenPos(g.real);
    el.style.left = sc * STEP + 'px';
    el.style.top = sr * STEP + 'px';
    ghostLayer.appendChild(el);
  }
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

  const raceLabel = (state.rules && state.rules.clash === false) ? ' · RACE' : '';
  $('room-label').textContent = (mode === 'ai' ? 'VS COMPUTER' : `ROOM ${current.code}`) + raceLabel;

  if (builtMe !== me || wells.length === 0) buildBoard();

  const movableFrom = new Set((legalMoves || []).map((m) => m.from));

  // Selection preview: ghost dice at reachable ends, or the route choices while
  // disambiguating an ambiguous target. Collect ghost dice + well highlight classes.
  const ghosts = [];              // { real, orient, cls }
  const wellClass = new Map();    // real -> extra well class
  let goalSquare = null;          // the ambiguous target being resolved (if any)

  if (yourTurn && selectedFrom !== null) {
    if (pendingTarget !== null) {
      // Choosing among the distinct routes (landing faces) to the ambiguous target.
      goalSquare = pendingTarget;
      for (const [land, r] of routesTo(selectedFrom, pendingTarget)) {
        ghosts.push({ real: land, orient: r.orient, cls: 'route' });
        wellClass.set(land, 'route');
      }
    } else {
      // Preview every square the die can reach, oriented as it would arrive.
      for (const [to, e] of endMap(selectedFrom)) {
        const unique = e.outcomes.size === 1;
        const first = e.outcomes.values().next().value;
        ghosts.push({ real: to, orient: first.orient, cls: unique ? 'playable' : 'ambiguous' });
        wellClass.set(to, unique ? 'ghost-playable' : 'ghost-ambiguous');
      }
    }
  }

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

    const under = state.board[real];
    if (yourTurn && under && under.player === me && selectedFrom === null && movableFrom.has(real)) {
      well.classList.add('selectable');
    }
    if (wellClass.has(real)) well.classList.add(wellClass.get(real));
    if (real === goalSquare) well.classList.add('goal');
  }

  renderGhosts(ghosts);

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
    if (pendingTarget !== null) {
      statusEl.textContent = 'Several ways here — tap a glowing die to pick the landing';
    } else if (selectedFrom !== null) {
      statusEl.textContent = 'Tap a ghost die to move there — or tap your die again to cancel';
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
// Pick a die → ghost previews appear at every square it can reach. Tap a ghost to
// play that move directly. When a square can be reached with visibly different
// results (a different landing face), tapping it instead offers the routes to choose.
function onCellClick(real) {
  if (!current || current.state.status !== 'playing' || !current.yourTurn) return;
  hintCells = null;
  const { state, legalMoves } = current;
  const die = state.board[real];
  const isMyMovableDie = die && die.player === me && (legalMoves || []).some((m) => m.from === real);

  // Nothing selected yet: pick one of my movable dice.
  if (selectedFrom === null) {
    if (isMyMovableDie) { selectedFrom = real; pendingTarget = null; render(); }
    return;
  }

  // Tapping a different movable die re-selects it.
  if (isMyMovableDie && real !== selectedFrom) {
    selectedFrom = real; pendingTarget = null; render();
    return;
  }

  // Disambiguating an ambiguous target: a tap picks one of the routes to it.
  if (pendingTarget !== null) {
    const routes = routesTo(selectedFrom, pendingTarget);
    if (routes.has(real)) { commitMoveObj(routes.get(real).move); render(); return; }
    pendingTarget = null;                         // tap elsewhere → back to the full preview
    if (real === selectedFrom) resetSelection();  // tap the die again → deselect
    render();
    return;
  }

  // Full preview: tap a reachable end square.
  const e = endMap(selectedFrom).get(real);
  if (e) {
    if (e.outcomes.size === 1) commitMoveObj(e.outcomes.values().next().value.move); // unique → play
    else pendingTarget = real;                                                       // ambiguous → choose route
    render();
    return;
  }

  // Tap on the selected die again, or on empty space → deselect.
  resetSelection();
  render();
}

// ---------- Home actions ----------
async function startAi() {
  homeError.textContent = '';
  await connect();
  const depth = Number($('ai-depth').value);
  sendMsg({ type: 'create', mode: 'ai', aiDepth: depth, clash: $('clash-rules').checked, name: $('name').value.trim() });
}
async function createRoom() {
  homeError.textContent = '';
  await connect();
  sendMsg({ type: 'create', mode: 'pvp', clash: $('clash-rules').checked, name: $('name').value.trim() });
}
async function joinRoom() {
  homeError.textContent = '';
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length < 4) { homeError.textContent = 'Enter a 4-letter code.'; return; }
  await connect();
  sendMsg({ type: 'join', code, name: $('name').value.trim() });
}

$('clash-rules').addEventListener('change', (e) => {
  $('clash-desc').textContent = e.target.checked
    ? 'Dice capture by clashing and surrounding.'
    : 'Pure race — no captures, first die across wins.';
});
$('btn-ai').addEventListener('click', startAi);
$('btn-create').addEventListener('click', createRoom);
$('btn-join').addEventListener('click', joinRoom);
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$('btn-leave').addEventListener('click', showHome);
$('btn-rematch').addEventListener('click', () => sendMsg({ type: 'rematch' }));
$('btn-hint').addEventListener('click', () => sendMsg({ type: 'hint' }));
