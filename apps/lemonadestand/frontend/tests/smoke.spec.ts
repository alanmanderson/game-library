import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://lemonade.games.alanmanderson.com';

test('main menu loads and new game works', async ({ page }) => {
  // Collect console errors
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const requestErrors: string[] = [];
  page.on('requestfailed', req => {
    requestErrors.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });

  // Navigate to main page
  console.log(`Navigating to ${FRONTEND_URL}...`);
  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 30000 });

  // Take a screenshot
  await page.screenshot({ path: '/tmp/screenshot-main.png', fullPage: true });
  console.log('Screenshot saved to /tmp/screenshot-main.png');

  // Log what we see
  const title = await page.title();
  console.log(`Page title: ${title}`);

  const bodyText = await page.textContent('body');
  console.log(`Body text preview: ${bodyText?.slice(0, 500)}`);

  // Check for the main heading
  const heading = page.locator('h1');
  const headingCount = await heading.count();
  console.log(`Found ${headingCount} h1 elements`);
  if (headingCount > 0) {
    console.log(`H1 text: ${await heading.first().textContent()}`);
  }

  // Check for the player name input
  const nameInput = page.locator('input[type="text"]');
  const inputCount = await nameInput.count();
  console.log(`Found ${inputCount} text inputs`);

  // Log errors
  if (consoleErrors.length > 0) {
    console.log(`Console errors: ${JSON.stringify(consoleErrors)}`);
  }
  if (requestErrors.length > 0) {
    console.log(`Request failures: ${JSON.stringify(requestErrors)}`);
  }

  // Try to create a game
  if (inputCount > 0) {
    await nameInput.first().fill('PlaywrightTest');
    console.log('Filled in player name');

    const playButton = page.locator('button', { hasText: 'Play' });
    const playCount = await playButton.count();
    console.log(`Found ${playCount} Play buttons`);

    if (playCount > 0) {
      await playButton.first().click();
      console.log('Clicked Play button');

      // Wait for navigation or response
      await page.waitForTimeout(5000);
      await page.screenshot({ path: '/tmp/screenshot-game.png', fullPage: true });
      console.log('Post-click screenshot saved to /tmp/screenshot-game.png');

      const newUrl = page.url();
      console.log(`Current URL: ${newUrl}`);

      const newBodyText = await page.textContent('body');
      console.log(`Body text after click: ${newBodyText?.slice(0, 500)}`);
    }
  }

  // Final error check
  if (consoleErrors.length > 0) {
    console.log(`Final console errors: ${JSON.stringify(consoleErrors)}`);
  }
  if (requestErrors.length > 0) {
    console.log(`Final request failures: ${JSON.stringify(requestErrors)}`);
  }
});
