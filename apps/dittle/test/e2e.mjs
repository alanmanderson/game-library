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

async function testAiGame() {
  const c = client();
  await c.ready;
  c.send({ type: 'create', mode: 'ai', aiDepth: 3, name: 'Tester' });
  let st = await waitFor(c, (m) => m.type === 'state');
  let moves = 0;
  while (st.state.status === 'playing' && moves < 300) {
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
  if (st.state.status !== 'won') throw new Error('AI game did not finish (moves=' + moves + ')');
  console.log(`AI game finished after ${moves} human moves. Winner: player ${st.state.winner}`);
  return true;
}

async function testPvp() {
  const a = client(); await a.ready;
  a.send({ type: 'create', mode: 'pvp', name: 'Alice' });
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

// Pure-race room (clash: false): play a full AI game and assert nothing is captured.
async function testRace() {
  const c = client();
  await c.ready;
  c.send({ type: 'create', mode: 'ai', aiDepth: 3, clash: false, name: 'Racer' });
  let st = await waitFor(c, (m) => m.type === 'state');
  if (!st.state.rules || st.state.rules.clash !== false) throw new Error('race room not flagged clash:false');
  let moves = 0;
  while (st.state.status === 'playing' && moves < 400) {
    if (st.yourTurn) {
      const lm = st.legalMoves;
      const fwd = lm.find((m) => m.dir === 'N') || lm[Math.floor(Math.random() * lm.length)];
      c.send({ type: 'move', move: { from: fwd.from, tilt: fwd.tilt, jumps: fwd.jumps } });
      moves++;
    }
    st = await waitFor(c, (m) => m.type === 'state');
  }
  c.close();
  const p0 = st.state.board.filter((d) => d && d.player === 0).length;
  const p1 = st.state.board.filter((d) => d && d.player === 1).length;
  if (p0 !== 7 || p1 !== 7) throw new Error(`pure race captured dice (p0=${p0}, p1=${p1})`);
  if (st.state.status !== 'won' && st.state.status !== 'draw') throw new Error('race game did not finish');
  console.log(`Pure-race game finished after ${moves} human moves with all 14 dice intact.`);
  return true;
}

try {
  await testAiGame();
  await testPvp();
  await testRace();
  console.log('\nE2E: all checks passed.');
  process.exit(0);
} catch (e) {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
}
