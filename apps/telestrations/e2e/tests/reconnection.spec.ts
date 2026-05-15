import { test, expect } from '@playwright/test';
import {
  createGameViaUI,
  joinGameViaUI,
  waitForScreen,
  submitPrompt,
} from '../helpers/utils';
import type { Page, BrowserContext } from '@playwright/test';

test.describe('Reconnection', () => {
  test('player can refresh page and rejoin the game in lobby', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const code = await createGameViaUI(hostPage, 'Host');

    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await joinGameViaUI(playerPage, code, 'Refresher');

    // Verify 2 players
    await expect(hostPage.locator('.player-item')).toHaveCount(2);

    // Refresh the player page
    await playerPage.reload();

    // Player should reconnect and be back in the lobby
    await waitForScreen(playerPage, 'lobby');

    // Host should still see 2 players
    // Allow a brief period for disconnect/reconnect
    await hostPage.waitForTimeout(2000);
    await expect(hostPage.locator('.player-item')).toHaveCount(2);

    await hostCtx.close();
    await playerCtx.close();
  });

  test('player can refresh during active gameplay and rejoin', async ({ browser }) => {
    test.setTimeout(90_000);

    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const code = await createGameViaUI(hostPage, 'Host', {
      drawingTimer: '30',
      guessingTimer: '15',
      promptTimer: '15',
    });

    const ctxs: BrowserContext[] = [hostCtx];
    const allPages: Page[] = [hostPage];

    for (const name of ['P1', 'P2', 'P3']) {
      const ctx = await browser.newContext();
      ctxs.push(ctx);
      const page = await ctx.newPage();
      await joinGameViaUI(page, code, name);
      allPages.push(page);
    }

    // Start game
    await hostPage.click('[data-action="start-game"]');

    // Wait for prompt screen on all players
    for (const page of allPages) {
      await page.waitForSelector('#screen-prompt', { timeout: 10_000 });
    }

    // Submit prompt for all players except the last one
    for (let i = 0; i < allPages.length - 1; i++) {
      await submitPrompt(allPages[i], `prompt ${i}`);
    }

    // Refresh the last player during the prompt phase
    const refreshPage = allPages[allPages.length - 1];
    await refreshPage.reload();

    // The refreshed player should rejoin the game (either prompt screen or waiting)
    await refreshPage.waitForSelector(
      '#screen-prompt, #screen-waiting, #screen-drawing, #screen-guessing',
      { timeout: 15_000 }
    );

    for (const ctx of ctxs) {
      await ctx.close();
    }
  });

  test('disconnected player shows as disconnected in player list', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const code = await createGameViaUI(hostPage, 'Host');

    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await joinGameViaUI(playerPage, code, 'Disconnector');

    await expect(hostPage.locator('.player-item')).toHaveCount(2);

    // Close the player's page (simulates disconnect)
    await playerPage.close();

    // Wait for the disconnect to register on the server (Socket.IO ping timeout)
    // The player-name should get a 'disconnected' class
    await hostPage.waitForSelector('.player-name.disconnected', { timeout: 15_000 });

    await hostCtx.close();
    await playerCtx.close();
  });
});
