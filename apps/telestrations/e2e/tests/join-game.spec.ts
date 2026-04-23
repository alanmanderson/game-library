import { test, expect } from '@playwright/test';
import { waitForScreen, createGameViaUI, joinGameViaUI } from '../helpers/utils';

test.describe('Join Game', () => {
  test('can join with valid code and name', async ({ browser }) => {
    // Create a game first
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const code = await createGameViaUI(hostPage, 'Host');

    // Join from another browser context
    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await joinGameViaUI(playerPage, code, 'Player1');

    // Verify we are in the lobby
    await expect(playerPage.locator('#screen-lobby')).toBeVisible();

    // Verify the player list contains both players
    const playerItems = playerPage.locator('.player-item');
    await expect(playerItems).toHaveCount(2);

    await hostContext.close();
    await playerContext.close();
  });

  test('shows error for invalid game code format', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');
    await page.click('[data-action="join-game"]');
    await waitForScreen(page, 'join');

    await page.fill('#join-code', 'AB');
    await page.fill('#join-name', 'TestPlayer');
    await page.click('[data-action="submit-join"]');

    const errorDiv = page.locator('#join-error');
    await expect(errorDiv).toBeVisible();
    await expect(errorDiv).toContainText('4 letters');
  });

  test('shows error for non-existent game code', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');
    await page.click('[data-action="join-game"]');
    await waitForScreen(page, 'join');

    await page.fill('#join-code', 'ZZZZ');
    await page.fill('#join-name', 'TestPlayer');
    await page.click('[data-action="submit-join"]');

    const errorDiv = page.locator('#join-error');
    await expect(errorDiv).toBeVisible();
    await expect(errorDiv).toContainText('not found');
  });

  test('shows error for duplicate display name', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const code = await createGameViaUI(hostPage, 'Alice');

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await playerPage.goto('/');
    await waitForScreen(playerPage, 'landing');
    await playerPage.click('[data-action="join-game"]');
    await waitForScreen(playerPage, 'join');

    await playerPage.fill('#join-code', code);
    await playerPage.fill('#join-name', 'Alice');
    await playerPage.click('[data-action="submit-join"]');

    const errorDiv = playerPage.locator('#join-error');
    await expect(errorDiv).toBeVisible();
    await expect(errorDiv).toContainText('already taken');

    await hostContext.close();
    await playerContext.close();
  });

  test('game code input auto-capitalizes', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');
    await page.click('[data-action="join-game"]');
    await waitForScreen(page, 'join');

    const codeInput = page.locator('#join-code');
    await codeInput.fill('abcd');

    // The input handler uppercases the value
    await expect(codeInput).toHaveValue('ABCD');
  });

  test('join via URL with ?code= parameter pre-fills code', async ({ browser }) => {
    // Create a game first
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const code = await createGameViaUI(hostPage, 'Host');

    // Open URL with code parameter
    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await playerPage.goto(`/?code=${code}`);
    await waitForScreen(playerPage, 'join');

    const codeInput = playerPage.locator('#join-code');
    await expect(codeInput).toHaveValue(code);

    await hostContext.close();
    await playerContext.close();
  });
});
