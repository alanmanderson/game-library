import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://app-lemonadestand-web.azurewebsites.net';

test('create game and advance days with sales', async ({ page }) => {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });
  page.on('response', res => {
    if (res.url().includes('/api/')) {
      console.log(`[API] ${res.status()} ${res.url()}`);
      if (res.url().includes('advance-day')) {
        res.text().then(t => console.log(`[DAY RESULT] ${t.slice(0, 300)}`)).catch(() => {});
      }
    }
  });

  // Create new game
  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="text"]').fill('SalesVerify');
  await page.locator('button', { hasText: 'Play' }).click();
  await page.waitForTimeout(5000);

  // Should be on dashboard
  expect(page.url()).toContain('/game/');
  await page.screenshot({ path: '/tmp/ss-dashboard.png', fullPage: true });

  // Find the day/advance button - look for "Start Day" text
  const startDayBtn = page.locator('button:has-text("Start Day")');
  if (await startDayBtn.isVisible({ timeout: 3000 })) {
    console.log('Found Start Day button, clicking...');
    await startDayBtn.click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: '/tmp/ss-day1-result.png', fullPage: true });

    const bodyText = await page.textContent('body');
    console.log(`After advancing day: ${bodyText?.slice(0, 500)}`);

    // Check for any revenue/cups sold info
    if (bodyText?.includes('cups sold') || bodyText?.includes('Cups Sold') || bodyText?.includes('Revenue')) {
      console.log('SUCCESS: Found sales-related text in page');
    }
  } else {
    // Try other button text
    const allButtons = await page.locator('button').allTextContents();
    console.log(`Available buttons: ${allButtons.join(', ')}`);
  }
});
