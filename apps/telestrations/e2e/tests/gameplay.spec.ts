import { test, expect } from '@playwright/test';
import {
  createGameViaUI,
  joinGameViaUI,
  waitForScreen,
  submitPrompt,
  drawAndSubmit,
  submitGuess,
} from '../helpers/utils';
import type { Page, BrowserContext } from '@playwright/test';

/**
 * Handle whatever screen a player is currently on, submitting if needed.
 * Returns the screen type that was handled.
 */
async function handlePlayerScreen(page: Page, label: string): Promise<string> {
  // Wait for a gameplay screen to appear
  const screenEl = await page.waitForSelector(
    '#screen-prompt, #screen-drawing, #screen-guessing, #screen-waiting, #screen-transition, #screen-review, #screen-gameover',
    { timeout: 20_000 }
  );
  const screenId = await screenEl.getAttribute('id');

  if (screenId === 'screen-prompt') {
    await submitPrompt(page, `${label} prompt`);
    return 'prompt';
  } else if (screenId === 'screen-drawing') {
    await drawAndSubmit(page);
    return 'drawing';
  } else if (screenId === 'screen-guessing') {
    await submitGuess(page, `${label} guess`);
    return 'guessing';
  } else if (screenId === 'screen-waiting') {
    return 'waiting';
  } else if (screenId === 'screen-transition') {
    return 'transition';
  } else if (screenId === 'screen-review') {
    return 'review';
  } else if (screenId === 'screen-gameover') {
    return 'gameover';
  }
  return 'unknown';
}

/**
 * Play one round for all players. Handles each player's current screen.
 * All players should be on a gameplay screen (prompt/drawing/guessing).
 * Processes them concurrently using Promise.all to avoid timing issues.
 */
async function playRoundForAll(pages: Page[]): Promise<void> {
  await Promise.all(
    pages.map(async (page, i) => {
      // Wait for an actionable screen (not waiting/transition)
      await page.waitForSelector(
        '#screen-prompt, #screen-drawing, #screen-guessing',
        { timeout: 25_000 }
      );
      await handlePlayerScreen(page, `p${i}`);
    })
  );
}

test.describe('Gameplay', () => {
  test('full 4-player game: prompt, draw, guess, review', async ({ browser }) => {
    test.setTimeout(180_000);

    // Create game with short timers
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const code = await createGameViaUI(hostPage, 'Host', {
      drawingTimer: '30',
      guessingTimer: '15',
      promptTimer: '15',
    });

    // Join 3 more players
    const playerContexts: BrowserContext[] = [];
    const allPages: Page[] = [hostPage];

    for (const name of ['Alice', 'Bob', 'Carol']) {
      const ctx = await browser.newContext();
      playerContexts.push(ctx);
      const page = await ctx.newPage();
      await joinGameViaUI(page, code, name);
      allPages.push(page);
    }

    // Verify all 4 players in host lobby
    await expect(hostPage.locator('.player-item')).toHaveCount(4);

    // Host starts the game
    const startBtn = hostPage.locator('[data-action="start-game"]');
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    // With 4 players and useAllRounds, there are 4 rounds total (prompt + 3):
    // Round 0: Prompt
    // Round 1: Draw
    // Round 2: Guess
    // Round 3: Draw (final)

    // Play through all rounds
    // Round 0: Prompt
    await playRoundForAll(allPages);

    // Round 1: Drawing
    await playRoundForAll(allPages);

    // Round 2: Guessing
    await playRoundForAll(allPages);

    // Round 3: Drawing (final)
    await playRoundForAll(allPages);

    // === Review phase ===
    for (const page of allPages) {
      await page.waitForSelector('#screen-review', { timeout: 20_000 });
    }

    // Verify review screen shows chain info
    const chainIndicator = hostPage.locator('.chain-indicator');
    await expect(chainIndicator).toBeVisible();
    await expect(chainIndicator).toContainText('Chain 1 of 4');

    // Host should see review controls (4-button bar)
    const nextEntryBtn = hostPage.locator('[data-action="review-next-entry"]');
    await expect(nextEntryBtn).toBeVisible();

    // Navigate through all entries in all chains until game ends
    let gameEnded = false;
    let maxClicks = 50;
    while (!gameEnded && maxClicks > 0) {
      maxClicks--;
      const gameOverVisible = await hostPage.locator('#screen-gameover').isVisible().catch(() => false);
      if (gameOverVisible) {
        gameEnded = true;
        break;
      }

      // Try next-entry first
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

      // If next-entry disabled, click next-chain
      const chainBtn = hostPage.locator('[data-action="review-next-chain"]');
      const chainBtnVisible = await chainBtn.isVisible().catch(() => false);
      if (chainBtnVisible) {
        await chainBtn.click();
        await hostPage.waitForTimeout(300);
        continue;
      }

      await hostPage.waitForTimeout(500);
    }

    // Verify game over screen
    await expect(hostPage.locator('#screen-gameover')).toBeVisible();
    await expect(hostPage.locator('.game-over-header')).toContainText('Game Over');

    // All players should see game over
    for (const page of allPages) {
      await expect(page.locator('#screen-gameover')).toBeVisible({ timeout: 10_000 });
    }

    // Cleanup
    await hostCtx.close();
    for (const ctx of playerContexts) {
      await ctx.close();
    }
  });

  test('prompt submission works', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const code = await createGameViaUI(hostPage, 'Host', {
      drawingTimer: '30',
      guessingTimer: '15',
      promptTimer: '15',
    });

    const playerContexts: BrowserContext[] = [];
    const allPages: Page[] = [hostPage];
    for (const name of ['P1', 'P2', 'P3']) {
      const ctx = await browser.newContext();
      playerContexts.push(ctx);
      const page = await ctx.newPage();
      await joinGameViaUI(page, code, name);
      allPages.push(page);
    }

    // Start game
    await hostPage.click('[data-action="start-game"]');

    // Wait for prompt screen
    for (const page of allPages) {
      await page.waitForSelector('#screen-prompt', { timeout: 10_000 });
    }

    // First player types and checks character count
    const firstPage = allPages[0];
    await firstPage.fill('#prompt-input', 'flying elephant');

    // "flying elephant" is 15 characters
    const charCount = firstPage.locator('#prompt-char-count');
    await expect(charCount).toHaveText('15');

    await firstPage.click('[data-action="submit-prompt"]');
    await waitForScreen(firstPage, 'waiting');

    // Verify waiting screen shows submission progress
    const submissionInfo = firstPage.locator('text=Submissions');
    await expect(submissionInfo).toBeVisible();

    await hostCtx.close();
    for (const ctx of playerContexts) {
      await ctx.close();
    }
  });

  test('timer displays during gameplay', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const code = await createGameViaUI(hostPage, 'Host', {
      drawingTimer: '30',
      guessingTimer: '15',
      promptTimer: '15',
    });

    const playerContexts: BrowserContext[] = [];
    for (const name of ['P1', 'P2', 'P3']) {
      const ctx = await browser.newContext();
      playerContexts.push(ctx);
      const page = await ctx.newPage();
      await joinGameViaUI(page, code, name);
    }

    await hostPage.click('[data-action="start-game"]');
    await hostPage.waitForSelector('#screen-prompt', { timeout: 10_000 });

    // Timer should be visible
    const timer = hostPage.locator('#game-timer');
    await expect(timer).toBeVisible();
    const timerText = await timer.textContent();
    // Should show seconds (15 second prompt timer)
    expect(timerText).toBeTruthy();

    await hostCtx.close();
    for (const ctx of playerContexts) {
      await ctx.close();
    }
  });

  test('drawing submission works with canvas interaction', async ({ browser }) => {
    test.setTimeout(90_000);

    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const code = await createGameViaUI(hostPage, 'Host', {
      drawingTimer: '30',
      guessingTimer: '15',
      promptTimer: '15',
    });

    const playerContexts: BrowserContext[] = [];
    const allPages: Page[] = [hostPage];
    for (const name of ['P1', 'P2', 'P3']) {
      const ctx = await browser.newContext();
      playerContexts.push(ctx);
      const page = await ctx.newPage();
      await joinGameViaUI(page, code, name);
      allPages.push(page);
    }

    // Start game and submit all prompts
    await hostPage.click('[data-action="start-game"]');
    await playRoundForAll(allPages);

    // Wait for drawing phase
    for (const page of allPages) {
      await page.waitForSelector('#screen-drawing', { timeout: 20_000 });
    }

    // Verify canvas is present on the host page
    const canvas = hostPage.locator('canvas');
    await expect(canvas).toBeVisible();

    // Verify prompt text is shown
    const promptDisplay = hostPage.locator('.prompt-display');
    await expect(promptDisplay).toBeVisible();

    // Verify Done button
    const doneBtn = hostPage.locator('#drawing-submit-btn');
    await expect(doneBtn).toBeVisible();
    await expect(doneBtn).toContainText('Done');

    // Draw and submit
    await drawAndSubmit(hostPage);

    // Should transition to waiting screen
    await expect(hostPage.locator('#screen-waiting')).toBeVisible();

    await hostCtx.close();
    for (const ctx of playerContexts) {
      await ctx.close();
    }
  });

  test('waiting screen shows submission progress', async ({ browser }) => {
    test.setTimeout(90_000);

    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const code = await createGameViaUI(hostPage, 'Host', {
      drawingTimer: '30',
      guessingTimer: '15',
      promptTimer: '30',
    });

    const playerContexts: BrowserContext[] = [];
    const allPages: Page[] = [hostPage];
    for (const name of ['P1', 'P2', 'P3']) {
      const ctx = await browser.newContext();
      playerContexts.push(ctx);
      const page = await ctx.newPage();
      await joinGameViaUI(page, code, name);
      allPages.push(page);
    }

    // Start game
    await hostPage.click('[data-action="start-game"]');
    for (const page of allPages) {
      await page.waitForSelector('#screen-prompt', { timeout: 10_000 });
    }

    // Submit for the host first
    await submitPrompt(hostPage, 'test waiting');

    // Host should be on waiting screen
    await waitForScreen(hostPage, 'waiting');

    // Should show submission count
    const submissionHeader = hostPage.locator('text=Submissions');
    await expect(submissionHeader).toBeVisible();

    // Should show 1 out of 4 submitted
    await expect(hostPage.locator('text=1/4')).toBeVisible();

    await hostCtx.close();
    for (const ctx of playerContexts) {
      await ctx.close();
    }
  });
});
