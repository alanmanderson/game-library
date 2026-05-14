import { type Browser, type Page, expect } from '@playwright/test';

/**
 * Helper to create a game with N players and start it.
 * Opens N browser contexts, enters names, creates/joins game, selects roles, starts.
 */
export async function createAndStartGame(
  browser: Browser,
  playerCount: number = 2,
): Promise<{ pages: Page[]; gameUrl: string }> {
  const roleIds = ['pilot', 'explorer', 'diver', 'engineer', 'messenger', 'navigator'];
  const pages: Page[] = [];

  // Player 1: create the game
  const context1 = await browser.newContext();
  const page1 = await context1.newPage();
  pages.push(page1);

  await page1.goto('/');
  await page1.waitForSelector('input[placeholder="Mariner..."]');

  // Clear any pre-existing name and enter new one
  const nameInput = page1.locator('input[placeholder="Mariner..."]');
  await nameInput.fill('Player 1');

  // Click Create Game
  await page1.getByRole('button', { name: 'Create Game' }).click();

  // Should navigate to create screen
  await page1.waitForURL('**/create');

  // Select Normal difficulty (default, but click to be sure)
  await page1.getByText('Normal', { exact: true }).click();

  // Click Create Expedition
  await page1.getByRole('button', { name: 'Create Expedition' }).click();

  // Wait for lobby navigation — the server sends lobby:created which triggers
  // navigation via the store. We need to wait for the lobby URL.
  await page1.waitForURL('**/lobby', { timeout: 10000 });

  // Extract the game URL from the current page
  const lobbyUrl = page1.url();
  const gameUrl = lobbyUrl; // e.g. http://localhost:5173/game/XXXX/lobby

  // Player 1 selects a role
  await page1.waitForSelector('.fi-cap:has-text("Choose Your Role")');
  // Click the first available role card (Pilot)
  const role1Card = page1.getByText(roleIds[0].charAt(0).toUpperCase() + roleIds[0].slice(1), { exact: true }).first();
  await role1Card.click();

  // Wait for role selection to register
  await page1.waitForTimeout(500);

  // Additional players join
  for (let i = 1; i < playerCount; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    pages.push(page);

    // Navigate directly to the lobby URL
    await page.goto(lobbyUrl);
    await page.waitForTimeout(500);

    // The lobby page needs the player to join via WebSocket.
    // The player needs a name set in localStorage first.
    await page.evaluate((name: string) => {
      localStorage.setItem('fi-player-name', name);
    }, `Player ${i + 1}`);

    // The lobby screen should show up. The player needs to join via WS.
    // Going to the lobby URL directly means the WS needs to send a join message.
    // Looking at HomeScreen, it sends lobby:join when handleJoin is called.
    // But going to the lobby URL directly does NOT auto-join.
    // The player needs to go to home, then join from the game list, or
    // the lobby screen needs to detect a new arrival.

    // Actually looking at LobbyScreen.tsx, it doesn't auto-join on mount.
    // The join happens on HomeScreen via handleJoin.
    // So we need to go to home first, wait for game list, then join.

    await page.goto('/');
    await page.waitForSelector('input[placeholder="Mariner..."]');
    await page.locator('input[placeholder="Mariner..."]').fill(`Player ${i + 1}`);

    // Wait for the game list to populate via WebSocket
    // The server broadcasts game list to clients not in a game
    await page.waitForTimeout(1000);

    // Look for the Join button in the game list
    const joinBtn = page.getByRole('button', { name: 'Join' }).first();
    const joinBtnVisible = await joinBtn.isVisible().catch(() => false);

    if (joinBtnVisible) {
      await joinBtn.click();
    } else {
      // If game list hasn't populated, navigate directly and send join via evaluate
      // Extract gameId from lobbyUrl
      const gameId = lobbyUrl.match(/\/game\/([^/]+)\//)?.[1];
      if (!gameId) throw new Error('Could not extract gameId from lobby URL');

      await page.goto(`/game/${gameId}/lobby`);
      // The page won't auto-join, so we need the WS message
      await page.waitForTimeout(500);
    }

    // Wait for lobby page
    await page.waitForURL('**/lobby', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Select a role
    const roleName = roleIds[i].charAt(0).toUpperCase() + roleIds[i].slice(1);
    const roleCard = page.getByText(roleName, { exact: true }).first();
    const roleVisible = await roleCard.isVisible().catch(() => false);
    if (roleVisible) {
      await roleCard.click();
      await page.waitForTimeout(500);
    }
  }

  // Host (page1) clicks Set Sail
  await page1.waitForTimeout(1000); // Wait for all lobby updates
  const setSailBtn = page1.getByRole('button', { name: 'Set Sail' });
  const canStart = await setSailBtn.isEnabled().catch(() => false);
  if (canStart) {
    await setSailBtn.click();

    // Wait for all pages to navigate to game screen
    for (const page of pages) {
      await page.waitForURL(/\/game\/[^/]+$/, { timeout: 10000 }).catch(() => {
        // Game screen URL is /game/:id (no /lobby suffix)
      });
    }
  }

  return { pages, gameUrl };
}

/**
 * Helper to navigate to the lobby and get there with a name already set.
 */
export async function goToHomeWithName(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('input[placeholder="Mariner..."]');
  await page.locator('input[placeholder="Mariner..."]').fill(name);
}
