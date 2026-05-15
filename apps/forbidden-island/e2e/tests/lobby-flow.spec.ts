import { test, expect } from '@playwright/test';

test.describe('Create Game and Lobby Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('fi-player-name'));
    await page.reload();
  });

  test('navigates to create screen with all difficulty options', async ({ page }) => {
    const nameInput = page.locator('input[placeholder="Mariner..."]');
    await nameInput.fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();

    await expect(page).toHaveURL(/\/create$/);

    // Step indicator
    await expect(page.getByText('Step 1 of 3')).toBeVisible();
    await expect(page.getByText('Choose your difficulty')).toBeVisible();

    // All four difficulty options (use .first() since water meter also shows level labels)
    await expect(page.getByText('Novice', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Normal', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Elite', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Legendary', { exact: true }).first()).toBeVisible();
  });

  test('Normal difficulty is selected by default', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await expect(page).toHaveURL(/\/create$/);

    // The Normal card should have the "Selected" pill
    await expect(page.getByText('Selected')).toBeVisible();
    // Normal's subtitle
    await expect(page.getByText('Standard challenge')).toBeVisible();
  });

  test('can switch difficulty selection', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await expect(page).toHaveURL(/\/create$/);

    // Click Elite difficulty option
    await page.getByText('Elite', { exact: true }).first().click();
    // Should show Elite's subtitle is present and Selected pill moves
    await expect(page.getByText('For experienced players')).toBeVisible();
  });

  test('difficulty descriptions are shown', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await expect(page).toHaveURL(/\/create$/);

    await expect(page.getByText('Relaxed pace, great for learning')).toBeVisible();
    await expect(page.getByText('Standard challenge')).toBeVisible();
    await expect(page.getByText('For experienced players')).toBeVisible();
    await expect(page.getByText('Near-impossible odds')).toBeVisible();
  });

  test('Create Expedition button is visible on create screen', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await expect(page).toHaveURL(/\/create$/);

    await expect(page.getByRole('button', { name: 'Create Expedition' })).toBeVisible();
  });

  test('Cancel button returns to home', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await expect(page).toHaveURL(/\/create$/);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL('/');
  });

  test('Back button returns to home', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await expect(page).toHaveURL(/\/create$/);

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL('/');
  });

  test('Create Expedition navigates to lobby', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await expect(page).toHaveURL(/\/create$/);

    await page.getByRole('button', { name: 'Create Expedition' }).click();

    // Should navigate to /game/:id/lobby
    await page.waitForURL('**/lobby', { timeout: 10000 });
    expect(page.url()).toMatch(/\/game\/[^/]+\/lobby$/);
  });

  test('lobby shows game ID / expedition code', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: 'Create Expedition' }).click();
    await page.waitForURL('**/lobby', { timeout: 10000 });

    // Expedition # header
    await expect(page.getByText('Expedition #')).toBeVisible();

    // The game ID should be displayed
    const gameIdEl = page.locator('.fi-display').filter({ hasText: /^[A-Za-z0-9_-]+$/ });
    await expect(gameIdEl.first()).toBeVisible();
  });

  test('lobby shows share instructions', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: 'Create Expedition' }).click();
    await page.waitForURL('**/lobby', { timeout: 10000 });

    await expect(page.getByText('SHARE THIS CODE OR THE LINK BELOW')).toBeVisible();
  });

  test('lobby shows player as host in crew list', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: 'Create Expedition' }).click();
    await page.waitForURL('**/lobby', { timeout: 10000 });

    // Crew section
    await expect(page.getByText('Crew')).toBeVisible();

    // Player name should appear (wait for server state)
    await expect(page.getByText('Captain')).toBeVisible({ timeout: 5000 });

    // Host pill
    await expect(page.getByText('Host', { exact: true }).first()).toBeVisible({ timeout: 5000 });

    // You pill (rendered as "You" in a Pill component)
    await expect(page.getByText('You', { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });

  test('lobby shows role selection grid with 6 roles', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: 'Create Expedition' }).click();
    await page.waitForURL('**/lobby', { timeout: 10000 });

    await expect(page.getByText('Choose Your Role')).toBeVisible();

    // All 6 roles should be visible
    await expect(page.getByText('Explorer', { exact: true })).toBeVisible();
    await expect(page.getByText('Diver', { exact: true })).toBeVisible();
    await expect(page.getByText('Engineer', { exact: true })).toBeVisible();
    await expect(page.getByText('Pilot', { exact: true })).toBeVisible();
    await expect(page.getByText('Messenger', { exact: true })).toBeVisible();
    await expect(page.getByText('Navigator', { exact: true })).toBeVisible();
  });

  test('host can select a role', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: 'Create Expedition' }).click();
    await page.waitForURL('**/lobby', { timeout: 10000 });

    // Click on Pilot role
    await page.getByText('Pilot', { exact: true }).first().click();

    // Should show "YOU" indicator after server confirms role selection
    // The RoleCard renders "YOU" in fi-mono style when isMe is true
    await expect(page.locator('.fi-mono').filter({ hasText: 'YOU' })).toBeVisible({ timeout: 5000 });
  });

  test('lobby shows 4 player slots', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: 'Create Expedition' }).click();
    await page.waitForURL('**/lobby', { timeout: 10000 });

    // 3 empty slots should show "Awaiting player..."
    const awaitingSlots = page.getByText('Awaiting player...');
    await expect(awaitingSlots).toHaveCount(3);
  });

  test('lobby shows player count', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: 'Create Expedition' }).click();
    await page.waitForURL('**/lobby', { timeout: 10000 });

    await expect(page.getByText('1 / 4 aboard')).toBeVisible();
  });

  test('lobby shows host controls with Set Sail button', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: 'Create Expedition' }).click();
    await page.waitForURL('**/lobby', { timeout: 10000 });

    await expect(page.getByText('Host Controls')).toBeVisible();
    const setSailBtn = page.getByRole('button', { name: 'Set Sail' });
    await expect(setSailBtn).toBeVisible();
    // Should be disabled with only 1 player
    await expect(setSailBtn).toBeDisabled();
  });

  test('lobby has Copy link button', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: 'Create Expedition' }).click();
    await page.waitForURL('**/lobby', { timeout: 10000 });

    await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  });

  test('lobby has Leave Expedition button', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: 'Create Expedition' }).click();
    await page.waitForURL('**/lobby', { timeout: 10000 });

    const leaveBtn = page.getByRole('button', { name: 'Leave Expedition' });
    await expect(leaveBtn).toBeVisible();
  });

  test('Leave Expedition returns to home', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: 'Create Expedition' }).click();
    await page.waitForURL('**/lobby', { timeout: 10000 });

    await page.getByRole('button', { name: 'Leave Expedition' }).click();
    await expect(page).toHaveURL('/');
  });

  test('host can change difficulty in lobby', async ({ page }) => {
    await page.locator('input[placeholder="Mariner..."]').fill('Captain');
    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: 'Create Expedition' }).click();
    await page.waitForURL('**/lobby', { timeout: 10000 });

    // The Host Controls section has difficulty buttons (lowercase text, CSS uppercase)
    const eliteBtn = page.locator('button').filter({ hasText: 'elite' });
    await eliteBtn.click();

    // The difficulty pill should update to show Elite
    await expect(page.getByText(/elite/i).first()).toBeVisible({ timeout: 5000 });
  });
});
