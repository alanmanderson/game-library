import { test } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://app-lemonadestand-web.azurewebsites.net';

test('debug page load', async ({ page }) => {
  const allLogs: string[] = [];
  page.on('console', msg => {
    allLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    allLogs.push(`[PAGE ERROR] ${err.message}`);
  });
  page.on('requestfailed', req => {
    allLogs.push(`[REQUEST FAILED] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });
  page.on('response', res => {
    if (res.status() >= 400) {
      allLogs.push(`[HTTP ${res.status()}] ${res.url()}`);
    }
  });

  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check the HTML content
  const html = await page.content();
  console.log('=== PAGE HTML (first 2000 chars) ===');
  console.log(html.slice(0, 2000));

  console.log('\n=== ALL CONSOLE/ERROR LOGS ===');
  for (const log of allLogs) {
    console.log(log);
  }

  // Check if the root div has content
  const rootDiv = await page.locator('#root').innerHTML();
  console.log(`\n=== #root innerHTML (first 500 chars) ===`);
  console.log(rootDiv.slice(0, 500));
});
