import { test } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://app-lemonadestand-web.azurewebsites.net';

test('create new game and check API', async ({ page }) => {
  page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message}`);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });
  page.on('requestfailed', req => {
    console.log(`[REQUEST FAILED] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });
  page.on('response', res => {
    if (res.url().includes('/api/')) {
      console.log(`[API RESPONSE] ${res.status()} ${res.url()}`);
      if (res.status() >= 400) {
        res.text().then(t => console.log(`[API BODY] ${t}`)).catch(() => {});
      }
    }
  });

  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 30000 });

  // Fill name and click Play
  await page.locator('input[type="text"]').fill('TestPlayer');
  await page.locator('button', { hasText: 'Play' }).click();

  // Wait for the API call and any navigation
  await page.waitForTimeout(8000);

  await page.screenshot({ path: '/tmp/screenshot-newgame.png', fullPage: true });
  console.log(`Final URL: ${page.url()}`);

  const bodyText = await page.textContent('body');
  console.log(`Body text: ${bodyText?.slice(0, 500)}`);
});
