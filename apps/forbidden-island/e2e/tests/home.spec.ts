import { test, expect } from '@playwright/test';

test.describe('Home Screen', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any saved name from previous runs
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('fi-player-name'));
    await page.goto('/');
  });

  test('page loads with Forbidden Island branding', async ({ page }) => {
    // BrandMark renders "Forbidden Island" in two spans
    await expect(page.getByText('Forbidden')).toBeVisible();
    // The kicker line
    await expect(page.getByText('A CO-OP EXPEDITION')).toBeVisible();
  });

  test('name input is visible and editable', async ({ page }) => {
    const nameInput = page.locator('input[placeholder="Mariner..."]');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue('');

    await nameInput.fill('Captain Hook');
    await expect(nameInput).toHaveValue('Captain Hook');
  });

  test('Create Game button is present and disabled without a name', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: 'Create Game' });
    await expect(createBtn).toBeVisible();
    await expect(createBtn).toBeDisabled();
  });

  test('Create Game button enables when name is entered', async ({ page }) => {
    const nameInput = page.locator('input[placeholder="Mariner..."]');
    await nameInput.fill('Ada');

    const createBtn = page.getByRole('button', { name: 'Create Game' });
    await expect(createBtn).toBeEnabled();
  });

  test('name input enforces max 20 characters', async ({ page }) => {
    const nameInput = page.locator('input[placeholder="Mariner..."]');
    // The HTML maxLength=20 should truncate input
    await nameInput.fill('A'.repeat(25));
    const value = await nameInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(20);
  });

  test('Open Expeditions section is visible', async ({ page }) => {
    await expect(page.getByText('Open Expeditions')).toBeVisible();
    await expect(page.getByText('Join a crew')).toBeVisible();
  });

  test('shows empty state when no games exist', async ({ page }) => {
    await expect(page.getByText('No expeditions afoot. Create one!')).toBeVisible();
  });

  test('name persists in localStorage', async ({ page }) => {
    const nameInput = page.locator('input[placeholder="Mariner..."]');
    await nameInput.fill('Saved Name');

    // Wait for the useEffect to fire
    await page.waitForTimeout(200);

    const stored = await page.evaluate(() => localStorage.getItem('fi-player-name'));
    expect(stored).toBe('Saved Name');
  });

  test('name loads from localStorage on page reload', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('fi-player-name', 'Returning Player'));
    await page.goto('/');

    const nameInput = page.locator('input[placeholder="Mariner..."]');
    await expect(nameInput).toHaveValue('Returning Player');
  });

  test('character count hint is displayed', async ({ page }) => {
    await expect(page.getByText('1-20 CHARACTERS - STORED LOCALLY')).toBeVisible();
  });

  test('description text is visible', async ({ page }) => {
    await expect(
      page.getByText('Four sacred treasures lie scattered across a sinking island')
    ).toBeVisible();
  });

  test('clicking Create Game navigates to create screen', async ({ page }) => {
    const nameInput = page.locator('input[placeholder="Mariner..."]');
    await nameInput.fill('Navigator');

    await page.getByRole('button', { name: 'Create Game' }).click();
    await expect(page).toHaveURL(/\/create$/);
  });

  test('unknown routes redirect to home', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await expect(page).toHaveURL('/');
  });
});
