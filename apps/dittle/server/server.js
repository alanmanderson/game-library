// Dittle web server: static hosting + WebSocket rooms + AI opponent.
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { initialState, applyMove, legalMoves, moveKey, normalizeVariant } from '../shared/engine.js';
import { bestMove, DEFAULT_WEIGHTS_TRADITIONAL, DEFAULT_WEIGHTS_CLASH } from '../shared/ai.js';
import { RoomManager } from './rooms.js';
import { LogService, expressErrorLogger } from './logservice.js';

const logService = new LogService('dittle');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = process.env.PORT || 3000;

// Load self-play-trained per-variant weights if present. Returns
// { traditional, clash } weight vectors, falling back to defaults for anything
// missing. Supports both the current schema ({ traditional: {weights}, clash: {weights} })
// and the legacy single-vector schema ({ weights } — treated as clash).
function loadWeights() {
  const fallback = {
    traditional: DEFAULT_WEIGHTS_TRADITIONAL,
    clash: DEFAULT_WEIGHTS_CLASH,
  };
  const p = join(ROOT, 'ai', 'weights.json');
  if (existsSync(p)) {
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf8'));
      const out = { ...fallback };
      let loadedAny = false;
      for (const v of ['traditional', 'clash']) {
        if (parsed?.[v]?.weights) { out[v] = parsed[v].weights; loadedAny = true; }
      }
      if (!loadedAny && parsed?.weights) { out.clash = parsed.weights; loadedAny = true; } // legacy
      if (loadedAny) {
        console.log('Loaded self-play-trained AI weights from ai/weights.json');
        return out;
      }
    } catch (e) {
      console.warn('Could not parse weights.json, using defaults:', e.message);
      logService.warn('Could not parse ai/weights.json, using default weights', {
        error: e.message,
      });
    }
  }
  console.log('Using default AI weights (run `npm run train` to learn better ones).');
  return fallback;
}
const AI_WEIGHTS = loadWeights();
const weightsFor = (variant) => AI_WEIGHTS[normalizeVariant(variant)];

const app = express();
app.use(express.static(join(ROOT, 'public')));
app.use('/shared', express.static(join(ROOT, 'shared')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));

// Log unhandled route errors to the centralized log service (after all routes).
app.use(expressErrorLogger(logService));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const rooms = new RoomManager();

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

// Broadcast the authoritative state to both seats, with each seat's legal moves.
function broadcastState(room, lastMoveMeta = null) {
  const legal = room.state.status === 'playing' ? legalMoves(room.state) : [];
  for (let seat = 0; seat < 2; seat++) {
    const ws = room.players[seat];
    if (!ws) continue;
    send(ws, {
      type: 'state',
      code: room.code,
      mode: room.mode,
      variant: room.variant,
      you: seat,
      names: room.names,
      occupied: [!!room.players[0], room.mode === 'ai' ? true : !!room.players[1]],
      state: room.state,
      // Only the player to move gets actionable legal moves.
      legalMoves: room.state.turn === seat ? legal : [],
      yourTurn: room.state.turn === seat && room.state.status === 'playing',
    });
  }
}

// After a human move in AI mode, let the computer respond (possibly several plies
// are all the same side because turns strictly alternate — one AI move per human).
function maybeAiMove(room) {
  if (room.mode !== 'ai') return;
  if (room.state.status !== 'playing') return;
  if (room.state.turn !== 1) return; // AI is always player 1
  // Compute asynchronously so we don't block the event loop noticeably.
  setTimeout(() => {
    if (room.state.status !== 'playing' || room.state.turn !== 1) return;
    const { move } = bestMove(room.state, room.aiDepth, weightsFor(room.variant));
    if (!move) return;
    room.state = applyMove(room.state, move);
    broadcastState(room);
  }, 350);
}

function handleMove(room, seat, move) {
  if (room.state.status !== 'playing') return;
  if (room.state.turn !== seat) {
    send(room.players[seat], { type: 'error', message: 'Not your turn.' });
    return;
  }
  // Validate against legal moves by full path identity. A move can be a tilt, a
  // (possibly turning) jump chain, or a tilt-then-jump, and two different paths can
  // share a start/end square, so matching on the whole tilt+jumps sequence is
  // required — not just (from, to).
  const legal = legalMoves(room.state);
  let wantKey;
  try { wantKey = moveKey(move); } catch { wantKey = null; }
  const match = wantKey && legal.find((m) => moveKey(m) === wantKey);
  if (!match) {
    send(room.players[seat], { type: 'error', message: 'Illegal move.' });
    return;
  }
  room.state = applyMove(room.state, match);
  broadcastState(room);
  maybeAiMove(room);
}

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.seat = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    try {
      handleMessage(ws, msg);
    } catch (e) {
      logService.error('Unhandled error handling WebSocket message', {
        error_type: e.name,
        stack_trace: e.stack,
        context: { messageType: msg?.type },
      });
      send(ws, { type: 'error', message: 'Server error.' });
    }
  });

  ws.on('close', () => {
    const room = rooms.getRoom(ws.roomCode);
    if (!room) return;
    const seat = room.players.indexOf(ws);
    if (seat !== -1) room.players[seat] = null;
    // Notify the other player.
    const other = room.players[1 - seat];
    if (other) send(other, { type: 'opponentLeft' });
    // Clean up empty rooms.
    if (!room.players[0] && !room.players[1]) rooms.deleteRoom(room.code);
  });
});

function handleMessage(ws, msg) {
    switch (msg.type) {
      case 'create': {
        // Clamp client-supplied search depth to a sane range: an unbounded
        // depth would let a single message trigger an exponential AI search (DoS).
        const requestedDepth = Math.floor(Number(msg.aiDepth));
        const aiDepth = Number.isFinite(requestedDepth) ? Math.max(1, Math.min(7, requestedDepth)) : 3;
        const variant = normalizeVariant(msg.variant);
        const room = rooms.createRoom({ mode: msg.mode === 'ai' ? 'ai' : 'pvp', aiDepth, variant });
        room.players[0] = ws;
        if (msg.name) room.names[0] = String(msg.name).slice(0, 20);
        ws.roomCode = room.code;
        ws.seat = 0;
        send(ws, { type: 'created', code: room.code, you: 0, mode: room.mode, variant: room.variant });
        broadcastState(room);
        // In AI mode player 0 always moves first, so no immediate AI move.
        break;
      }

      case 'join': {
        const room = rooms.getRoom(msg.code);
        if (!room) { send(ws, { type: 'error', message: 'Room not found.' }); break; }
        if (room.mode === 'ai') { send(ws, { type: 'error', message: 'That is a solo (vs AI) room.' }); break; }
        if (room.players[1]) { send(ws, { type: 'error', message: 'Room is full.' }); break; }
        room.players[1] = ws;
        if (msg.name) room.names[1] = String(msg.name).slice(0, 20);
        ws.roomCode = room.code;
        ws.seat = 1;
        send(ws, { type: 'joined', code: room.code, you: 1, mode: room.mode, variant: room.variant });
        broadcastState(room);
        break;
      }

      case 'move': {
        const room = rooms.getRoom(ws.roomCode);
        if (!room || ws.seat === null) break;
        handleMove(room, ws.seat, msg.move);
        break;
      }

      case 'hint': {
        const room = rooms.getRoom(ws.roomCode);
        if (!room || ws.seat === null) break;
        if (room.state.turn !== ws.seat || room.state.status !== 'playing') break;
        const { move, score } = bestMove(room.state, Math.max(2, room.aiDepth), weightsFor(room.variant));
        send(ws, { type: 'hint', move, score });
        break;
      }

      case 'rematch': {
        const room = rooms.getRoom(ws.roomCode);
        if (!room) break;
        room.state = initialState(room.variant);
        broadcastState(room);
        break;
      }

      default:
        break;
    }
}

server.listen(PORT, () => {
  console.log(`Dittle server listening on http://localhost:${PORT}`);
});
