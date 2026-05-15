import { test, expect } from '../fixtures/game.fixture';
import { waitForScreen, joinGameViaUI, createGameViaUI } from '../helpers/utils';

test.describe('Lobby', () => {
  test('host sees game code, player list, and start button', async ({ hostPage, gameCode }) => {
    // Game code visible
    const codeEl = hostPage.locator('.game-code');
    await expect(codeEl).toBeVisible();
    await expect(codeEl).toHaveText(gameCode);

    // Player list visible with host
    const playerItems = hostPage.locator('.player-item');
    await expect(playerItems).toHaveCount(1);

    // Start button visible but disabled (only 1 player)
    const startBtn = hostPage.locator('[data-action="start-game"]');
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toBeDisabled();
  });

  test('non-host sees waiting message and no start button', async ({ hostPage, gameCode, createPlayerPage }) => {
    const { page: playerPage } = await createPlayerPage('Player1');

    // Waiting message
    const waitingMsg = playerPage.locator('.waiting-state');
    await expect(waitingMsg).toBeVisible();
    await expect(waitingMsg).toContainText('Waiting for host');

    // No start button
    const startBtn = playerPage.locator('[data-action="start-game"]');
    await expect(startBtn).toHaveCount(0);

    // Leave button visible
    const leaveBtn = playerPage.locator('[data-action="leave-game"]');
    await expect(leaveBtn).toBeVisible();
  });

  test('new players appear in real-time in player list', async ({ hostPage, gameCode, createPlayerPage }) => {
    // Initially only host
    await expect(hostPage.locator('.player-item')).toHaveCount(1);

    // Join player 1
    await createPlayerPage('Alice');
    await expect(hostPage.locator('.player-item')).toHaveCount(2);

    // Join player 2
    await createPlayerPage('Bob');
    await expect(hostPage.locator('.player-item')).toHaveCount(3);
  });

  test('start button disabled with fewer than 4 players', async ({ hostPage, gameCode, createPlayerPage }) => {
    const startBtn = hostPage.locator('[data-action="start-game"]');
    await expect(startBtn).toBeDisabled();

    await createPlayerPage('Alice');
    await expect(hostPage.locator('.player-item')).toHaveCount(2);
    await expect(startBtn).toBeDisabled();

    await createPlayerPage('Bob');
    await expect(hostPage.locator('.player-item')).toHaveCount(3);
    await expect(startBtn).toBeDisabled();

    // After 4th player, should be enabled
    await createPlayerPage('Carol');
    await expect(hostPage.locator('.player-item')).toHaveCount(4);
    await expect(startBtn).toBeEnabled();
  });

  test('host can kick a player', async ({ hostPage, gameCode, createPlayerPage }) => {
    const { page: playerPage } = await createPlayerPage('KickMe');
    await expect(hostPage.locator('.player-item')).toHaveCount(2);

    // Host clicks kick
    const kickBtn = hostPage.locator('[data-action="kick"]');
    await expect(kickBtn).toBeVisible();
    await kickBtn.click();

    // Player should be removed from host's list
    await expect(hostPage.locator('.player-item')).toHaveCount(1);

    // Kicked player should be returned to landing page
    await waitForScreen(playerPage, 'landing');
  });

  test('player leaving updates list in real-time', async ({ hostPage, gameCode, createPlayerPage }) => {
    const { page: playerPage } = await createPlayerPage('Leaver');
    await expect(hostPage.locator('.player-item')).toHaveCount(2);

    // Player clicks leave
    await playerPage.click('[data-action="leave-game"]');

    // Host should see player removed
    await expect(hostPage.locator('.player-item')).toHaveCount(1);
  });

  test('copy game code button works', async ({ hostPage, gameCode }) => {
    // Grant clipboard permissions
    await hostPage.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    const copyBtn = hostPage.locator('[data-action="copy-code"]');
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // Verify clipboard content
    const clipboardText = await hostPage.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(gameCode);
  });
});
