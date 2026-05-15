import { test, expect, type Page, type BrowserContext } from '@playwright/test';

test.describe('Two-Player Game Setup', () => {
  let context1: BrowserContext;
  let context2: BrowserContext;
  let page1: Page;
  let page2: Page;
  let lobbyUrl: string;

  test.beforeAll(async ({ browser }) => {
    // Create two independent browser contexts (like two separate users)
    context1 = await browser.newContext();
    context2 = await browser.newContext();
    page1 = await context1.newPage();
    page2 = await context2.newPage();
  });

  test.afterAll(async () => {
    await context1?.close();
    await context2?.close();
  });

  test.describe.serial('multiplayer lobby and start', () => {
    test('Player 1 creates a game', async () => {
      await page1.goto('/');
      await page1.evaluate(() => localStorage.removeItem('fi-player-name'));
      await page1.goto('/');

      await page1.locator('input[placeholder="Mariner..."]').fill('Alice');
      await page1.getByRole('button', { name: 'Create Game' }).click();
      await expect(page1).toHaveURL(/\/create$/);

      await page1.getByRole('button', { name: 'Create Expedition' }).click();
      await page1.waitForURL('**/lobby', { timeout: 10000 });

      lobbyUrl = page1.url();
      expect(lobbyUrl).toMatch(/\/game\/[^/]+\/lobby$/);
    });

    test('Player 1 selects a role', async () => {
      await page1.getByText('Pilot', { exact: true }).first().click();
      await expect(page1.getByText('YOU', { exact: true })).toBeVisible({ timeout: 5000 });
    });

    test('Player 2 sees the game in the open expeditions list', async () => {
      await page2.goto('/');
      await page2.evaluate(() => localStorage.removeItem('fi-player-name'));
      await page2.goto('/');

      await page2.locator('input[placeholder="Mariner..."]').fill('Bob');

      // Wait for game list to populate via WebSocket — the server broadcasts
      // when a new game is created, but WS needs time to connect first
      const aliceExpedition = page2.getByText("Alice's expedition");
      await expect(aliceExpedition).toBeVisible({ timeout: 10000 });
    });

    test('Player 2 joins the game', async () => {
      // Click Join on the game entry
      await page2.getByRole('button', { name: 'Join' }).first().click();
      await page2.waitForURL('**/lobby', { timeout: 10000 });

      // Both should now be on the same lobby
      expect(page2.url()).toContain('/lobby');
    });

    test('both players see each other in the crew list', async () => {
      // Player 1 should see Bob
      await expect(page1.getByText('Bob')).toBeVisible({ timeout: 10000 });
      // Player 2 should see Alice
      await expect(page2.getByText('Alice')).toBeVisible({ timeout: 10000 });

      // Player count should be 2 / 4
      await expect(page1.getByText('2 / 4 aboard')).toBeVisible({ timeout: 5000 });
      await expect(page2.getByText('2 / 4 aboard')).toBeVisible({ timeout: 5000 });
    });

    test('Player 2 selects a role', async () => {
      // Select Explorer (Pilot is already taken by Alice)
      await page2.getByText('Explorer', { exact: true }).first().click();

      // Player 2 should see "YOU" on their selected role
      await expect(page2.getByText('YOU', { exact: true })).toBeVisible({ timeout: 5000 });
    });

    test('Set Sail becomes enabled when all players have roles', async () => {
      // Wait for the lobby to reflect both role selections
      await page1.waitForTimeout(1000);

      const setSailBtn = page1.getByRole('button', { name: 'Set Sail' });
      await expect(setSailBtn).toBeEnabled({ timeout: 5000 });
    });

    test('non-host does not see Set Sail button', async () => {
      // Player 2 (Bob) is not the host, so should NOT see Host Controls
      const hostControls = page2.getByText('Host Controls');
      await expect(hostControls).not.toBeVisible();
    });

    test('Host clicks Set Sail and both navigate to game screen', async () => {
      await page1.getByRole('button', { name: 'Set Sail' }).click();

      // Both players should navigate to the game screen (/game/:id, not /lobby)
      await page1.waitForURL(/\/game\/[^/]+$/, { timeout: 10000 });
      await page2.waitForURL(/\/game\/[^/]+$/, { timeout: 10000 });

      // Verify both are on the game screen (not lobby, not results)
      expect(page1.url()).not.toContain('/lobby');
      expect(page1.url()).not.toContain('/results');
      expect(page2.url()).not.toContain('/lobby');
      expect(page2.url()).not.toContain('/results');
    });

    test('game screen shows turn indicator for both players', async () => {
      // At least one of the players should see the turn indicator
      // The TurnIndicator shows "Your turn" or "<name>'s turn"
      const p1TurnText = page1.getByText(/turn/i).first();
      await expect(p1TurnText).toBeVisible({ timeout: 5000 });

      const p2TurnText = page2.getByText(/turn/i).first();
      await expect(p2TurnText).toBeVisible({ timeout: 5000 });
    });
  });
});
