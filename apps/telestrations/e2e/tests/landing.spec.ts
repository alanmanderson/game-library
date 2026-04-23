import { test, expect } from '@playwright/test';
import { waitForScreen } from '../helpers/utils';

test.describe('Landing Page', () => {
  test('displays title, Create Game and Join Game buttons', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');

    // Title
    const title = page.locator('.logo-text');
    await expect(title).toBeVisible();
    await expect(title).toContainText('telestrations');

    // Create Game button
    const createBtn = page.locator('[data-action="create-game"]');
    await expect(createBtn).toBeVisible();
    await expect(createBtn).toContainText('Create Game');

    // Join Game button
    const joinBtn = page.locator('[data-action="join-game"]');
    await expect(joinBtn).toBeVisible();
    await expect(joinBtn).toContainText('Join Game');
  });

  test('Create Game button navigates to create form', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');

    await page.click('[data-action="create-game"]');
    await waitForScreen(page, 'create');

    // Verify create form elements
    await expect(page.locator('#host-name')).toBeVisible();
    await expect(page.locator('#draw-timer')).toBeVisible();
    await expect(page.locator('#create-submit-btn')).toBeVisible();
  });

  test('Join Game button navigates to join form', async ({ page }) => {
    await page.goto('/');
    await waitForScreen(page, 'landing');

    await page.click('[data-action="join-game"]');
    await waitForScreen(page, 'join');

    // Verify join form elements
    await expect(page.locator('#join-code')).toBeVisible();
    await expect(page.locator('#join-name')).toBeVisible();
    await expect(page.locator('#join-submit-btn')).toBeVisible();
  });
});
