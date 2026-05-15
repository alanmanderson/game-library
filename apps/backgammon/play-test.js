/**
 * Two Playwright agents play backgammon against each other.
 *
 * Agent 1 creates a table, Agent 2 joins it, then they play
 * a full game by reading game state from intercepted WebSocket
 * messages and clicking on the actual UI elements.
 */
const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:5173';

// WebSocket interceptor script injected into each page
const WS_INTERCEPTOR = `
  window.__gameState = null;
  window.__myColor = null;
  window.__gameStatus = null;
  window.__validMoves = [];
  window.__wsReady = false;
  window.__lastMsgTime = 0;
  window.__gameOver = false;
  window.__winner = null;
  window.__stateVersion = 0;
  window.__errors = [];

  const _OrigWS = window.WebSocket;
  const _origProto = _OrigWS.prototype;

  window.WebSocket = function(...args) {
    const ws = new _OrigWS(...args);

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        window.__lastMsgTime = Date.now();

        if (msg.type === 'game_state' && msg.data) {
          window.__gameState = msg.data.game_state;
          window.__myColor = msg.data.your_color;
          window.__gameStatus = msg.data.game_state.status;
          window.__validMoves = msg.data.game_state.valid_moves || [];
          window.__wsReady = true;
          window.__stateVersion++;

          if (msg.data.game_state.status === 'finished') {
            window.__gameOver = true;
            window.__winner = msg.data.game_state.winner;
          }
        }
        if (msg.type === 'waiting') {
          window.__wsReady = true;
        }
        if (msg.type === 'game_over' && msg.data) {
          window.__gameOver = true;
        }
        if (msg.type === 'error') {
          window.__errors.push(msg.data.message);
        }
      } catch(e) {}
    });

    return ws;
  };
  // Preserve prototype chain
  window.WebSocket.prototype = _origProto;
  window.WebSocket.CONNECTING = _OrigWS.CONNECTING;
  window.WebSocket.OPEN = _OrigWS.OPEN;
  window.WebSocket.CLOSING = _OrigWS.CLOSING;
  window.WebSocket.CLOSED = _OrigWS.CLOSED;
`;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Wait for a condition evaluated in the page context.
 */
async function waitForPageCondition(page, conditionFn, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await page.evaluate(conditionFn);
      if (result) return result;
    } catch (e) {
      if (e.message.includes('closed')) throw e;
    }
    await sleep(200);
  }
  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

/**
 * Get current game info from the page.
 */
async function getGameInfo(page) {
  return page.evaluate(() => ({
    gameState: window.__gameState,
    myColor: window.__myColor,
    status: window.__gameStatus,
    validMoves: window.__validMoves,
    gameOver: window.__gameOver,
    winner: window.__winner,
    stateVersion: window.__stateVersion,
    errors: window.__errors.splice(0),  // drain errors
  }));
}

/**
 * Wait for state version to change (i.e., a new game_state WebSocket message arrived).
 */
async function waitForStateChange(page, currentVersion, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await page.evaluate(() => window.__stateVersion);
      if (v > currentVersion) return v;
    } catch (e) {
      if (e.message.includes('closed')) throw e;
    }
    await sleep(100);
  }
  return null; // timeout - state didn't change
}

/**
 * Click a board point (1-24). Points are rendered as .point-area rects in order 1-24.
 */
async function clickPoint(page, point) {
  const areas = page.locator('.point-area');
  await areas.nth(point - 1).click({ force: true });
}

async function clickBar(page) {
  await page.locator('.bar-area').click({ force: true });
}

async function clickBearOff(page) {
  await page.locator('.bearoff-area').click({ force: true });
}

/**
 * Execute a single move: click the source, wait briefly, then click destination.
 * Returns true if the state changed after the move (indicating success).
 */
async function executeMove(page, move, myColor, agentName) {
  const { from_point, to_point } = move;

  // Get current state version before the move
  const versionBefore = await page.evaluate(() => window.__stateVersion);

  // Click source
  if ((myColor === 'white' && from_point === 25) || (myColor === 'black' && from_point === 0)) {
    await clickBar(page);
  } else {
    await clickPoint(page, from_point);
  }

  await sleep(250);

  // Click destination
  if ((myColor === 'white' && to_point === 0) || (myColor === 'black' && to_point === 25)) {
    await clickBearOff(page);
  } else {
    await clickPoint(page, to_point);
  }

  // Wait for state to change (confirming the move was processed)
  const newVersion = await waitForStateChange(page, versionBefore, 3000);
  if (newVersion === null) {
    console.error(`[${agentName}] WARNING: Move did not trigger state change! from=${from_point} to=${to_point}`);
    // Check for errors
    const errors = await page.evaluate(() => window.__errors.splice(0));
    if (errors.length > 0) {
      console.error(`[${agentName}] Server errors: ${errors.join(', ')}`);
    }
    return false;
  }
  return true;
}

/**
 * Play one turn for the given agent page.
 */
async function playTurn(page, agentName) {
  const info = await getGameInfo(page);

  // Log any server errors
  if (info.errors && info.errors.length > 0) {
    console.error(`[${agentName}] Server errors: ${info.errors.join(', ')}`);
  }

  if (info.gameOver) {
    return 'game_over';
  }

  if (!info.gameState) {
    return 'waiting';
  }

  const isMyTurn = info.gameState.current_turn === info.myColor;
  if (!isMyTurn) {
    return 'not_my_turn';
  }

  // Rolling phase
  if (info.status === 'rolling') {
    const versionBefore = info.stateVersion;
    console.log(`[${agentName}] (${info.myColor}) Rolling dice...`);
    await page.locator('.roll-btn').click();

    // Wait for state to change after roll
    const newVersion = await waitForStateChange(page, versionBefore, 5000);
    if (newVersion === null) {
      console.error(`[${agentName}] WARNING: Roll did not trigger state change!`);
      return 'error';
    }

    return 'rolled';
  }

  // Moving phase
  if (info.status === 'moving') {
    const moves = info.validMoves;

    if (moves.length === 0) {
      const hasRemainingDice = info.gameState.remaining_dice && info.gameState.remaining_dice.length > 0;
      if (hasRemainingDice) {
        console.log(`[${agentName}] (${info.myColor}) No valid moves, ending turn. Remaining dice: [${info.gameState.remaining_dice}]`);
        const versionBefore = info.stateVersion;
        await page.locator('.end-turn-btn').click();
        await waitForStateChange(page, versionBefore, 5000);
      }
      return 'no_moves';
    }

    // Pick the first valid move
    const move = moves[0];
    const fromDesc = (move.from_point === 25 || move.from_point === 0) ? 'bar' : move.from_point;
    const toDesc = (move.to_point === 0 || move.to_point === 25) ? 'off' : move.to_point;
    const hitDesc = move.is_hit ? '*' : '';
    console.log(`[${agentName}] (${info.myColor}) Move: ${fromDesc}→${toDesc}${hitDesc}  [${moves.length} available, dice: ${info.gameState.remaining_dice}]`);

    const success = await executeMove(page, move, info.myColor, agentName);
    if (!success) {
      // Move failed - take diagnostic screenshot
      try {
        await page.screenshot({ path: `screenshot-${agentName}-move-fail.png` });
      } catch {}
      return 'move_failed';
    }

    return 'moved';
  }

  return 'unknown';
}

/**
 * Main game loop for one agent.
 */
async function agentLoop(page, agentName) {
  let actionCount = 0;
  let idleCount = 0;
  let failCount = 0;
  const MAX_IDLE = 300;
  const MAX_ACTIONS = 2000;
  const MAX_FAILS = 10;

  while (actionCount < MAX_ACTIONS && idleCount < MAX_IDLE && failCount < MAX_FAILS) {
    try {
      // Check if page is still open
      if (page.isClosed()) {
        console.log(`[${agentName}] Page was closed.`);
        return null;
      }

      const result = await playTurn(page, agentName);

      if (result === 'game_over') {
        const info = await getGameInfo(page);
        const won = info.winner === info.myColor;
        console.log(`\n${'='.repeat(50)}`);
        console.log(`[${agentName}] GAME OVER! ${won ? 'I WON!' : 'I LOST!'}`);
        console.log(`  Color: ${info.myColor} | Winner: ${info.winner}`);
        if (info.gameState) {
          console.log(`  White off: ${info.gameState.off_white} | Black off: ${info.gameState.off_black}`);
          console.log(`  Win type: ${info.gameState.win_type || 'normal'}`);
        }
        console.log(`${'='.repeat(50)}\n`);
        return info;
      }

      if (result === 'rolled' || result === 'moved') {
        actionCount++;
        idleCount = 0;
        failCount = 0;
      } else if (result === 'move_failed' || result === 'error') {
        failCount++;
        console.error(`[${agentName}] Fail #${failCount}/${MAX_FAILS}`);
        await sleep(500);
      } else {
        // not_my_turn, waiting, no_moves, unknown
        idleCount++;
        await sleep(250);
      }
    } catch (err) {
      if (err.message.includes('closed')) {
        console.log(`[${agentName}] Browser/page closed.`);
        return null;
      }
      console.error(`[${agentName}] Error: ${err.message}`);
      failCount++;
      await sleep(1000);
    }
  }

  if (failCount >= MAX_FAILS) {
    console.error(`[${agentName}] Too many failures, giving up.`);
  }
  if (idleCount >= MAX_IDLE) {
    console.error(`[${agentName}] Too many idle cycles (${MAX_IDLE}), giving up.`);
  }

  // Diagnostic dump
  try {
    const info = await getGameInfo(page);
    console.log(`[${agentName}] Final state dump:`, JSON.stringify({
      myColor: info.myColor,
      status: info.status,
      currentTurn: info.gameState?.current_turn,
      remainingDice: info.gameState?.remaining_dice,
      validMoves: info.validMoves?.length,
      barWhite: info.gameState?.bar_white,
      barBlack: info.gameState?.bar_black,
      offWhite: info.gameState?.off_white,
      offBlack: info.gameState?.off_black,
    }, null, 2));
    await page.screenshot({ path: `screenshot-${agentName}-stuck.png` });
  } catch {}

  return null;
}

async function main() {
  console.log('Starting backgammon Playwright test with two agents...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  await context1.addInitScript(WS_INTERCEPTOR);
  await context2.addInitScript(WS_INTERCEPTOR);

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  try {
    // ===== AGENT 1: Create player & table =====
    console.log('[Agent1] Creating player...');
    await page1.goto(BASE_URL);
    await page1.waitForSelector('input[placeholder="Your nickname"]');
    await page1.fill('input[placeholder="Your nickname"]', 'Agent_Alpha');
    await page1.click('button:has-text("Play")');
    await page1.waitForSelector('button:has-text("Create Table")');

    console.log('[Agent1] Creating table...');
    await page1.click('button:has-text("Create Table")');
    await page1.waitForURL(/\/game\/.+/);
    const tableId = page1.url().split('/game/')[1];
    console.log(`[Agent1] Table ID: ${tableId}`);

    await waitForPageCondition(page1, () => window.__wsReady);

    // ===== AGENT 2: Create player & join table =====
    console.log('[Agent2] Creating player and joining...');
    await page2.goto(BASE_URL);
    await page2.waitForSelector('input[placeholder="Your nickname"]');
    await page2.fill('input[placeholder="Your nickname"]', 'Agent_Beta');
    await page2.click('button:has-text("Play")');
    await page2.waitForSelector('button:has-text("Create Table")');

    await page2.fill('input[placeholder="Table ID"]', tableId);
    await page2.click('button:has-text("Join")');
    await page2.waitForURL(/\/game\/.+/);
    console.log(`[Agent2] Joined table ${tableId}`);

    // Wait for both to have game state
    await waitForPageCondition(page2, () => window.__gameState !== null, 10000);
    await waitForPageCondition(page1, () => window.__gameState !== null, 10000);

    const info1 = await getGameInfo(page1);
    const info2 = await getGameInfo(page2);
    console.log(`\n[Agent1] = ${info1.myColor} | [Agent2] = ${info2.myColor}`);
    console.log(`First turn: ${info1.gameState.current_turn}`);
    console.log(`\n--- GAME START ---\n`);

    // ===== PLAY THE GAME =====
    const results = await Promise.all([
      agentLoop(page1, 'Agent1'),
      agentLoop(page2, 'Agent2'),
    ]);

    console.log('\n--- GAME COMPLETE ---\n');

    // Take final screenshots
    try {
      if (!page1.isClosed()) await page1.screenshot({ path: 'screenshot-agent1-final.png' });
      if (!page2.isClosed()) await page2.screenshot({ path: 'screenshot-agent2-final.png' });
      console.log('Final screenshots saved.');
    } catch {}

    console.log('Keeping browsers open for 10 seconds...');
    await sleep(10000);

  } finally {
    await browser.close();
  }

  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
