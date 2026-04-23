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
 * Play a full game through to the review phase.
 * Returns all pages and contexts for cleanup.
 */
async function playFullGameToReview(browser: import('@playwright/test').Browser): Promise<{
  hostPage: Page;
  allPages: Page[];
  allContexts: BrowserContext[];
}> {
  const hostCtx = await browser.newContext();
  const hostPage = await hostCtx.newPage();
  const code = await createGameViaUI(hostPage, 'Host', {
    drawingTimer: '30',
    guessingTimer: '15',
    promptTimer: '15',
  });

  const allContexts: BrowserContext[] = [hostCtx];
  const allPages: Page[] = [hostPage];

  for (const name of ['Alice', 'Bob', 'Carol']) {
    const ctx = await browser.newContext();
    allContexts.push(ctx);
    const page = await ctx.newPage();
    await joinGameViaUI(page, code, name);
    allPages.push(page);
  }

  // Start game
  await hostPage.click('[data-action="start-game"]');

  // Round 0: Prompt
  for (const page of allPages) {
    await page.waitForSelector('#screen-prompt', { timeout: 10_000 });
    await submitPrompt(page, 'test prompt');
  }

  // Round 1: Draw
  for (const page of allPages) {
    await page.waitForSelector('#screen-drawing', { timeout: 20_000 });
    await drawAndSubmit(page);
  }

  // Round 2: Guess
  for (const page of allPages) {
    await page.waitForSelector('#screen-guessing', { timeout: 20_000 });
    await submitGuess(page, 'test guess');
  }

  // Round 3: Draw (final)
  for (const page of allPages) {
    await page.waitForSelector('#screen-drawing', { timeout: 20_000 });
    await drawAndSubmit(page);
  }

  // Wait for review
  for (const page of allPages) {
    await page.waitForSelector('#screen-review', { timeout: 20_000 });
  }

  return { hostPage, allPages, allContexts };
}

/**
 * Navigate through all entries and chains to reach game over.
 * Uses the new 4-button navigation: next-entry within chain, next-chain to advance chains.
 */
async function navigateToGameOver(hostPage: Page): Promise<void> {
  let maxClicks = 50;
  while (maxClicks > 0) {
    maxClicks--;
    const gameOver = await hostPage.locator('#screen-gameover').isVisible().catch(() => false);
    if (gameOver) break;

    // Try next-entry first (advance within chain)
    const nextEntryBtn = hostPage.locator('[data-action="review-next-entry"]');
    const nextEntryVisible = await nextEntryBtn.isVisible().catch(() => false);
    if (nextEntryVisible) {
      const isDisabled = await nextEntryBtn.isDisabled().catch(() => true);
      if (!isDisabled) {
        await nextEntryBtn.click();
        await hostPage.waitForTimeout(300);
        continue;
      }
    }

    // If next-entry is disabled (end of chain), click next-chain
    const nextChainBtn = hostPage.locator('[data-action="review-next-chain"]');
    const nextChainVisible = await nextChainBtn.isVisible().catch(() => false);
    if (nextChainVisible) {
      await nextChainBtn.click();
      await hostPage.waitForTimeout(300);
      continue;
    }

    await hostPage.waitForTimeout(500);
  }
}

test.describe('Review Phase', () => {
  test('review phase shows chain entries one at a time', async ({ browser }) => {
    test.setTimeout(120_000);
    const { hostPage, allContexts } = await playFullGameToReview(browser);

    // First entry should be visible
    const entries = hostPage.locator('.chain-entry');
    await expect(entries.first()).toBeVisible();

    // Chain header shows origin player
    const chainTitle = hostPage.locator('.chain-title');
    await expect(chainTitle).toBeVisible();
    await expect(chainTitle).toContainText('Started by');

    for (const ctx of allContexts) {
      await ctx.close();
    }
  });

  test('host Next Entry button reveals next entry', async ({ browser }) => {
    test.setTimeout(120_000);
    const { hostPage, allContexts } = await playFullGameToReview(browser);

    // Count initial entries
    const initialCount = await hostPage.locator('.chain-entry').count();
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Click next entry
    await hostPage.click('[data-action="review-next-entry"]');
    await hostPage.waitForTimeout(500);

    // Should have more entries now
    const newCount = await hostPage.locator('.chain-entry').count();
    expect(newCount).toBeGreaterThan(initialCount);

    for (const ctx of allContexts) {
      await ctx.close();
    }
  });

  test('host Previous Entry button goes back', async ({ browser }) => {
    test.setTimeout(120_000);
    const { hostPage, allContexts } = await playFullGameToReview(browser);

    // Advance a couple times
    await hostPage.click('[data-action="review-next-entry"]');
    await hostPage.waitForTimeout(500);
    await hostPage.click('[data-action="review-next-entry"]');
    await hostPage.waitForTimeout(500);

    const countAfterAdvance = await hostPage.locator('.chain-entry').count();

    // Go back
    await hostPage.click('[data-action="review-prev-entry"]');
    await hostPage.waitForTimeout(500);

    const countAfterBack = await hostPage.locator('.chain-entry').count();
    expect(countAfterBack).toBeLessThan(countAfterAdvance);

    for (const ctx of allContexts) {
      await ctx.close();
    }
  });

  test('non-host sees same content as host (synchronized)', async ({ browser }) => {
    test.setTimeout(120_000);
    const { hostPage, allPages, allContexts } = await playFullGameToReview(browser);

    const playerPage = allPages[1]; // Non-host player

    // Both should see same chain indicator
    const hostIndicator = await hostPage.locator('.chain-indicator').textContent();
    const playerIndicator = await playerPage.locator('.chain-indicator').textContent();
    expect(hostIndicator).toBe(playerIndicator);

    // Advance and verify sync
    await hostPage.click('[data-action="review-next-entry"]');
    await hostPage.waitForTimeout(800);

    const hostEntryCount = await hostPage.locator('.chain-entry').count();
    const playerEntryCount = await playerPage.locator('.chain-entry').count();
    expect(hostEntryCount).toBe(playerEntryCount);

    for (const ctx of allContexts) {
      await ctx.close();
    }
  });

  test('chain indicator shows correct X of Y', async ({ browser }) => {
    test.setTimeout(120_000);
    const { hostPage, allContexts } = await playFullGameToReview(browser);

    const indicator = hostPage.locator('.chain-indicator');
    await expect(indicator).toContainText('Chain 1 of 4');

    for (const ctx of allContexts) {
      await ctx.close();
    }
  });

  test('next-chain advances to next chain', async ({ browser }) => {
    test.setTimeout(120_000);
    const { hostPage, allContexts } = await playFullGameToReview(browser);

    // Verify we start on chain 1
    await expect(hostPage.locator('.chain-indicator')).toContainText('Chain 1 of 4');

    // Click next-chain to jump to chain 2
    await hostPage.click('[data-action="review-next-chain"]');
    await hostPage.waitForTimeout(500);

    // Should now be on chain 2
    await expect(hostPage.locator('.chain-indicator')).toContainText('Chain 2 of 4');

    // Should show only first entry of new chain
    const entryCount = await hostPage.locator('.chain-entry').count();
    expect(entryCount).toBe(1);

    for (const ctx of allContexts) {
      await ctx.close();
    }
  });

  test('prev-chain goes back to previous chain', async ({ browser }) => {
    test.setTimeout(120_000);
    const { hostPage, allContexts } = await playFullGameToReview(browser);

    // Go to chain 2
    await hostPage.click('[data-action="review-next-chain"]');
    await hostPage.waitForTimeout(500);
    await expect(hostPage.locator('.chain-indicator')).toContainText('Chain 2 of 4');

    // Go back to chain 1
    await hostPage.click('[data-action="review-prev-chain"]');
    await hostPage.waitForTimeout(500);

    await expect(hostPage.locator('.chain-indicator')).toContainText('Chain 1 of 4');

    for (const ctx of allContexts) {
      await ctx.close();
    }
  });

  test('game over screen appears after all chains reviewed', async ({ browser }) => {
    test.setTimeout(120_000);
    const { hostPage, allContexts } = await playFullGameToReview(browser);

    // Navigate through all entries and chains to game over
    await navigateToGameOver(hostPage);

    await expect(hostPage.locator('#screen-gameover')).toBeVisible();
    await expect(hostPage.locator('.game-over-header')).toContainText('Game Over');

    // Host should see Play Again button
    const playAgainBtn = hostPage.locator('[data-action="play-again"]');
    await expect(playAgainBtn).toBeVisible();

    for (const ctx of allContexts) {
      await ctx.close();
    }
  });

  test('play again creates new game', async ({ browser }) => {
    test.setTimeout(120_000);
    const { hostPage, allPages, allContexts } = await playFullGameToReview(browser);

    // Navigate to game over
    await navigateToGameOver(hostPage);
    await expect(hostPage.locator('#screen-gameover')).toBeVisible();

    // Click Play Again
    await hostPage.click('[data-action="play-again"]');

    // Should transition to lobby with new game
    await waitForScreen(hostPage, 'lobby');

    // Other players should also be in the new lobby
    for (let i = 1; i < allPages.length; i++) {
      await expect(allPages[i].locator('#screen-lobby')).toBeVisible({ timeout: 10_000 });
    }

    for (const ctx of allContexts) {
      await ctx.close();
    }
  });
});
