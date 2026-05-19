import { test } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://lemonade.games.alanmanderson.com';

test('debug page errors', async ({ page }) => {
  page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message}`);
    console.log(`[STACK] ${err.stack}`);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[CONSOLE ERROR] ${msg.text()}`);
      // Try to get args
      for (const arg of msg.args()) {
        arg.jsonValue().then(v => console.log(`[ARG] ${JSON.stringify(v)}`)).catch(() => {});
      }
    }
  });
  page.on('response', res => {
    if (res.status() >= 400) {
      console.log(`[HTTP ${res.status()}] ${res.url()}`);
    }
  });
  page.on('requestfailed', req => {
    console.log(`[FAILED] ${req.url()} ${req.failure()?.errorText}`);
  });

  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Also try evaluating in page context
  const errors = await page.evaluate(() => {
    const root = document.getElementById('root');
    return {
      rootChildren: root?.children.length ?? -1,
      rootInnerHTML: root?.innerHTML?.slice(0, 200) ?? 'null',
    };
  });
  console.log(`Root state: ${JSON.stringify(errors)}`);
});
