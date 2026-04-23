import { test as base, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { createGameViaUI, joinGameViaUI, waitForScreen } from '../helpers/utils';

/**
 * Extended test fixtures for Telestrations E2E tests.
 */

interface GameFixtures {
  /** A page where the host has created a game and is in the lobby */
  hostPage: Page;
  /** The game code of the created game */
  gameCode: string;
  /** Function to create a new player page that joins the game */
  createPlayerPage: (name: string) => Promise<{ page: Page; context: BrowserContext }>;
}

export const test = base.extend<GameFixtures>({
  hostPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Page will be set up by gameCode fixture
    await use(page);
    await context.close();
  },

  gameCode: async ({ hostPage }, use) => {
    const code = await createGameViaUI(hostPage, 'Host', {
      drawingTimer: '30',
      guessingTimer: '15',
      promptTimer: '15',
    });
    await use(code);
  },

  createPlayerPage: async ({ browser, gameCode }, use) => {
    const contexts: BrowserContext[] = [];

    const factory = async (name: string) => {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      await joinGameViaUI(page, gameCode, name);
      return { page, context };
    };

    await use(factory);

    // Cleanup all created contexts
    for (const ctx of contexts) {
      await ctx.close();
    }
  },
});

export { expect } from '@playwright/test';
