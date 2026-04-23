import { test, expect } from '@playwright/test';
import {
  createGameViaUI,
  joinGameViaUI,
  waitForScreen,
  submitPrompt,
} from '../helpers/utils';
import type { Page, BrowserContext } from '@playwright/test';

test.describe('Edge Cases', () => {
  test('cannot join a game that has already started', async ({ browser }) => {
    test.setTimeout(60_000);

    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const code = await createGameViaUI(hostPage, 'Host', {
      promptTimer: '15',
      drawingTimer: '30',
      guessingTimer: '15',
    });

    // Join 3 more players
    const ctxs: BrowserContext[] = [hostCtx];
    for (const name of ['P1', 'P2', 'P3']) {
      const ctx = await browser.newContext();
      ctxs.push(ctx);
      const page = await ctx.newPage();
      await joinGameViaUI(page, code, name);
    }

    // Start the game
    await hostPage.click('[data-action="start-game"]');
    await hostPage.waitForSelector('#screen-prompt', { timeout: 10_000 });

    // Try to join as a 5th player
    const lateCtx = await browser.newContext();
    ctxs.push(lateCtx);
    const latePage = await lateCtx.newPage();

    await latePage.goto('/');
    await waitForScreen(latePage, 'landing');
    await latePage.click('[data-action="join-game"]');
    await waitForScreen(latePage, 'join');

    await latePage.fill('#join-code', code);
    await latePage.fill('#join-name', 'LateJoiner');
    await latePage.click('[data-action="submit-join"]');

    // Should show error
    const errorDiv = latePage.locator('#join-error');
    await expect(errorDiv).toBeVisible();
    await expect(errorDiv).toContainText('already started');

    for (const ctx of ctxs) {
      await ctx.close();
    }
  });

  test('cannot start game with fewer than 4 players', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    await createGameViaUI(hostPage, 'Host');

    const startBtn = hostPage.locator('[data-action="start-game"]');
    await expect(startBtn).toBeDisabled();

    // Verify the message indicates need for more players
    const statusText = hostPage.locator('text=Need at least 4 players');
    await expect(statusText).toBeVisible();

    await hostCtx.close();
  });

  test('very long display name is rejected', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');
    await page.click('[data-action="create-game"]');
    await waitForScreen(page, 'create');

    // The input has maxlength=16 so we need to check server-side validation too.
    // First, verify the input maxlength attribute
    const maxLength = await page.locator('#host-name').getAttribute('maxlength');
    expect(maxLength).toBe('16');

    // Try to set a long name via JS to bypass maxlength
    await page.evaluate(() => {
      const input = document.getElementById('host-name') as HTMLInputElement;
      input.removeAttribute('maxlength');
    });
    await page.fill('#host-name', 'ThisNameIsWayTooLongToBeValid');
    await page.click('[data-action="submit-create"]');

    // Should show error (either client-side validation or server rejection)
    const errorDiv = page.locator('#create-error');
    await expect(errorDiv).toBeVisible();
    await expect(errorDiv).toContainText('at most 16 characters');
  });

  test('game code excludes ambiguous characters I, O, L', async ({ browser }) => {
    // Create several games and verify codes don't contain I, O, or L
    const codes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const code = await createGameViaUI(page, `Host${i}`);
      codes.push(code);
      // Leave the game to free up resources
      await ctx.close();
    }

    for (const code of codes) {
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
      expect(code).not.toMatch(/[IOL]/);
    }
  });

  test('back button on create page returns to landing', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');
    await page.click('[data-action="create-game"]');
    await waitForScreen(page, 'create');

    await page.click('[data-action="back"]');
    await waitForScreen(page, 'landing');
  });

  test('back button on join page returns to landing', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');
    await page.click('[data-action="join-game"]');
    await waitForScreen(page, 'join');

    await page.click('[data-action="back"]');
    await waitForScreen(page, 'landing');
  });

  test('home button on game over returns to landing', async ({ browser }) => {
    test.setTimeout(120_000);

    // Play a full game to completion
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

    await hostPage.click('[data-action="start-game"]');

    // Play through all rounds
    // Round 0: Prompt
    for (const page of allPages) {
      await page.waitForSelector('#screen-prompt', { timeout: 10_000 });
      await submitPrompt(page, 'test');
    }
    // Round 1: Draw
    for (const page of allPages) {
      await page.waitForSelector('#screen-drawing', { timeout: 20_000 });
      const canvas = await page.waitForSelector('canvas');
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 50, box.y + 50);
        await page.mouse.down();
        await page.mouse.move(box.x + 100, box.y + 100, { steps: 5 });
        await page.mouse.up();
      }
      await page.waitForTimeout(200);
      await page.click('[data-action="submit-drawing"]');
      await page.waitForFunction(
        () => !document.querySelector('#screen-drawing'),
        {},
        { timeout: 15_000 }
      );
    }
    // Round 2: Guess
    for (const page of allPages) {
      await page.waitForSelector('#screen-guessing', { timeout: 20_000 });
      await page.fill('#guess-input', 'guess');
      await page.click('[data-action="submit-guess"]');
      await page.waitForFunction(
        () => !document.querySelector('#screen-guessing'),
        {},
        { timeout: 15_000 }
      );
    }
    // Round 3: Draw (final)
    for (const page of allPages) {
      await page.waitForSelector('#screen-drawing', { timeout: 20_000 });
      const canvas = await page.waitForSelector('canvas');
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 50, box.y + 50);
        await page.mouse.down();
        await page.mouse.move(box.x + 100, box.y + 100, { steps: 5 });
        await page.mouse.up();
      }
      await page.waitForTimeout(200);
      await page.click('[data-action="submit-drawing"]');
      await page.waitForFunction(
        () => !document.querySelector('#screen-drawing'),
        {},
        { timeout: 15_000 }
      );
    }

    // Review phase
    await hostPage.waitForSelector('#screen-review', { timeout: 20_000 });

    // Click through review using 4-button navigation
    let maxClicks = 50;
    while (maxClicks > 0) {
      maxClicks--;
      const gameOver = await hostPage.locator('#screen-gameover').isVisible().catch(() => false);
      if (gameOver) break;

      const entryBtn = hostPage.locator('[data-action="review-next-entry"]');
      const entryBtnVisible = await entryBtn.isVisible().catch(() => false);
      if (entryBtnVisible) {
        const isDisabled = await entryBtn.isDisabled().catch(() => true);
        if (!isDisabled) {
          await entryBtn.click();
          await hostPage.waitForTimeout(300);
          continue;
        }
      }

      const chainBtn = hostPage.locator('[data-action="review-next-chain"]');
      const chainBtnVisible = await chainBtn.isVisible().catch(() => false);
      if (chainBtnVisible) {
        await chainBtn.click();
        await hostPage.waitForTimeout(300);
        continue;
      }

      await hostPage.waitForTimeout(500);
    }

    await expect(hostPage.locator('#screen-gameover')).toBeVisible();

    // Click Home button on a non-host player
    const playerPage = allPages[1];
    await expect(playerPage.locator('#screen-gameover')).toBeVisible({ timeout: 10_000 });
    await playerPage.click('[data-action="go-home"]');
    await waitForScreen(playerPage, 'landing');

    for (const ctx of ctxs) {
      await ctx.close();
    }
  });
});
