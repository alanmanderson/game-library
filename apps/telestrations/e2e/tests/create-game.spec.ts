import { test, expect } from '@playwright/test';
import { waitForScreen, createGameViaUI } from '../helpers/utils';

test.describe('Create Game', () => {
  test('can create a game with default settings', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');
    await page.click('[data-action="create-game"]');
    await waitForScreen(page, 'create');

    await page.fill('#host-name', 'TestHost');
    await page.click('[data-action="submit-create"]');

    await waitForScreen(page, 'lobby');
  });

  test('game code is displayed in lobby after creation', async ({ page }) => {
    const code = await createGameViaUI(page, 'TestHost');

    const codeEl = page.locator('.game-code');
    await expect(codeEl).toBeVisible();
    const displayedCode = await codeEl.textContent();
    expect(displayedCode?.trim()).toBe(code);
    expect(code).toMatch(/^[A-Z]{4}$/);
  });

  test('can create game with custom timer settings', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');
    await page.click('[data-action="create-game"]');
    await waitForScreen(page, 'create');

    await page.fill('#host-name', 'TestHost');
    await page.selectOption('#draw-timer', '90');
    await page.selectOption('#guess-timer', '45');
    await page.selectOption('#prompt-timer', '20');
    await page.click('[data-action="submit-create"]');

    await waitForScreen(page, 'lobby');

    // Verify settings are reflected in the lobby
    const settingsSection = page.locator('.card', { hasText: 'Settings' });
    await expect(settingsSection).toBeVisible();
    // Host should see dropdown selects with chosen values
    const drawTimerSelect = page.locator('[data-setting="drawingTimerSeconds"]');
    await expect(drawTimerSelect).toHaveValue('90');
  });

  test('validates empty display name', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');
    await page.click('[data-action="create-game"]');
    await waitForScreen(page, 'create');

    // Leave name empty and try to submit
    await page.click('[data-action="submit-create"]');

    // Should show error, still on create screen
    const errorDiv = page.locator('#create-error');
    await expect(errorDiv).toBeVisible();
    await expect(errorDiv).toContainText('at least 2 characters');
    await expect(page.locator('#screen-create')).toBeVisible();
  });

  test('validates too-short display name', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');
    await page.click('[data-action="create-game"]');
    await waitForScreen(page, 'create');

    await page.fill('#host-name', 'A');
    await page.click('[data-action="submit-create"]');

    const errorDiv = page.locator('#create-error');
    await expect(errorDiv).toBeVisible();
    await expect(errorDiv).toContainText('at least 2 characters');
    await expect(page.locator('#screen-create')).toBeVisible();
  });
});
