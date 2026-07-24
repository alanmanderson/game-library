// End-to-end smoke test against the running server.
import WebSocket from 'ws';

const URL = 'ws://localhost:3000';

function client() {
  const ws = new WebSocket(URL);
  const handlers = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    handlers.forEach((h) => h(msg));
  });
  return {
    ws,
    ready: new Promise((res) => ws.on('open', res)),
    on: (h) => handlers.push(h),
    send: (m) => ws.send(JSON.stringify(m)),
    close: () => ws.close(),
  };
}

function waitFor(c, pred, timeout = 8000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout waiting for message')), timeout);
    const h = (msg) => { if (pred(msg)) { clearTimeout(t); res(msg); } };
    c.on(h);
  });
}

async function testAiGame(gameVariant) {
  const c = client();
  await c.ready;
  c.send({ type: 'create', mode: 'ai', aiDepth: 3, variant: gameVariant, name: 'Tester' });
  let st = await waitFor(c, (m) => m.type === 'state');
  if (st.state.variant !== gameVariant) throw new Error(`variant not applied (got ${st.state.variant})`);
  if (gameVariant === 'clash' && st.legalMoves.some((m) => m.jump)) throw new Error('clash produced a jump move');
  let moves = 0;
  while (st.state.status === 'playing' && moves < 400) {
    if (st.yourTurn) {
      const lm = st.legalMoves;
      // pick a legal move that makes forward progress if possible
      const fwd = lm.find((m) => m.dir === 'N') || lm[Math.floor(Math.random() * lm.length)];
      c.send({ type: 'move', move: { from: fwd.from, tilt: fwd.tilt, jumps: fwd.jumps } });
      moves++;
    }
    st = await waitFor(c, (m) => m.type === 'state');
  }
  c.close();
  if (st.state.status !== 'won' && st.state.status !== 'draw') {
    throw new Error(`${gameVariant} AI game did not finish (moves=${moves})`);
  }
  console.log(`AI ${gameVariant} game finished after ${moves} human moves. Status: ${st.state.status}, winner: ${st.state.winner}, reason: ${st.state.endReason}`);
  return true;
}

async function testPvp() {
  const a = client(); await a.ready;
  a.send({ type: 'create', mode: 'pvp', variant: 'clash', name: 'Alice' });
  const created = await waitFor(a, (m) => m.type === 'created');
  const code = created.code;

  const b = client(); await b.ready;
  b.send({ type: 'join', code, name: 'Bob' });
  await waitFor(b, (m) => m.type === 'joined');

  // Alice (seat 0) moves first.
  let aState = await waitFor(a, (m) => m.type === 'state' && m.yourTurn);
  const mv = aState.legalMoves[0];
  a.send({ type: 'move', move: { from: mv.from, tilt: mv.tilt, jumps: mv.jumps } });
  // Bob should now see it's his turn.
  const bState = await waitFor(b, (m) => m.type === 'state' && m.yourTurn);
  if (bState.state.moveCount !== 1) throw new Error('pvp move not applied');

  // Test hint for Bob.
  b.send({ type: 'hint' });
  const hint = await waitFor(b, (m) => m.type === 'hint');
  if (!hint.move) throw new Error('no hint returned');

  a.close(); b.close();
  console.log('PvP flow ok: join, alternate turns, hint. Hint move:', hint.move);
  return true;
}

try {
  await testAiGame('clash');
  await testAiGame('traditional');
  await testPvp();
  console.log('\nE2E: all checks passed.');
  process.exit(0);
} catch (e) {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
}
