import { test } from '@playwright/test';

test('debug local page errors', async ({ page }) => {
  page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message}`);
    console.log(`[STACK] ${err.stack}`);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/screenshot-local.png', fullPage: true });

  const rootHTML = await page.locator('#root').innerHTML();
  console.log(`Root has content: ${rootHTML.length > 0}`);
  console.log(`Root preview: ${rootHTML.slice(0, 300)}`);
});
