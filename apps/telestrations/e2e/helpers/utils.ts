import { type Page, type BrowserContext, expect } from '@playwright/test';

/**
 * Wait for the app to finish rendering a specific screen.
 */
export async function waitForScreen(page: Page, screenId: string, timeout = 10_000): Promise<void> {
  await page.waitForSelector(`#screen-${screenId}`, { timeout });
}

/**
 * Create a new game via the UI. Returns the game code.
 */
export async function createGameViaUI(
  page: Page,
  hostName: string,
  options?: {
    drawingTimer?: string;
    guessingTimer?: string;
    promptTimer?: string;
  }
): Promise<string> {
  await page.goto('/');
  await waitForScreen(page, 'landing');

  await page.click('[data-action="create-game"]');
  await waitForScreen(page, 'create');

  await page.fill('#host-name', hostName);

  if (options?.drawingTimer) {
    await page.selectOption('#draw-timer', options.drawingTimer);
  }
  if (options?.guessingTimer) {
    await page.selectOption('#guess-timer', options.guessingTimer);
  }
  if (options?.promptTimer) {
    await page.selectOption('#prompt-timer', options.promptTimer);
  }

  await page.click('[data-action="submit-create"]');
  await waitForScreen(page, 'lobby');

  const codeEl = await page.waitForSelector('.game-code');
  const code = await codeEl.textContent();
  if (!code || code === '----') {
    throw new Error('Failed to get game code from lobby');
  }
  return code.trim();
}

/**
 * Join an existing game via the UI.
 */
export async function joinGameViaUI(
  page: Page,
  gameCode: string,
  playerName: string
): Promise<void> {
  await page.goto('/');
  await waitForScreen(page, 'landing');

  await page.click('[data-action="join-game"]');
  await waitForScreen(page, 'join');

  await page.fill('#join-code', gameCode);
  await page.fill('#join-name', playerName);
  await page.click('[data-action="submit-join"]');
  await waitForScreen(page, 'lobby');
}

/**
 * Wait until the page is no longer showing a specific screen.
 * After submission, the player might go to waiting, transition, or the next round.
 */
async function waitForScreenToLeave(page: Page, screenId: string, timeout = 15_000): Promise<void> {
  await page.waitForSelector(
    `#screen-waiting, #screen-transition, #screen-drawing, #screen-guessing, #screen-prompt, #screen-review, #screen-gameover`,
    { timeout }
  );
}

/**
 * Submit a prompt during the prompt phase.
 */
export async function submitPrompt(page: Page, text: string): Promise<void> {
  await page.waitForSelector('#prompt-input', { timeout: 10_000 });
  await page.fill('#prompt-input', text);
  await page.click('[data-action="submit-prompt"]');
  // Wait for screen to change away from prompt (could be waiting, transition, or next round)
  await page.waitForFunction(
    () => !document.querySelector('#screen-prompt'),
    {},
    { timeout: 15_000 }
  );
}

/**
 * Draw something on the canvas and submit.
 */
export async function drawAndSubmit(page: Page): Promise<void> {
  const canvas = await page.waitForSelector('canvas', { timeout: 10_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');

  // Draw a simple diagonal line
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 200, { steps: 10 });
  await page.mouse.up();

  // Small delay to let the canvas register the stroke
  await page.waitForTimeout(200);

  await page.click('[data-action="submit-drawing"]');
  // Wait for screen to change away from drawing
  await page.waitForFunction(
    () => !document.querySelector('#screen-drawing'),
    {},
    { timeout: 15_000 }
  );
}

/**
 * Submit a guess during the guessing phase.
 */
export async function submitGuess(page: Page, text: string): Promise<void> {
  await page.waitForSelector('#guess-input', { timeout: 10_000 });
  await page.fill('#guess-input', text);
  await page.click('[data-action="submit-guess"]');
  // Wait for screen to change away from guessing
  await page.waitForFunction(
    () => !document.querySelector('#screen-guessing'),
    {},
    { timeout: 15_000 }
  );
}

/**
 * Wait for a player's screen to transition away from a specific screen.
 */
export async function waitForScreenChange(
  page: Page,
  fromScreenId: string,
  timeout = 15_000
): Promise<void> {
  await page.waitForFunction(
    (id) => !document.querySelector(`#screen-${id}`),
    fromScreenId,
    { timeout }
  );
}

/**
 * Handle whatever round type is shown (prompt, drawing, or guessing).
 */
export async function handleCurrentRound(page: Page, roundIndex: number): Promise<void> {
  // Wait for a round screen to appear
  const screenEl = await page.waitForSelector(
    '#screen-prompt, #screen-drawing, #screen-guessing',
    { timeout: 15_000 }
  );
  const screenId = await screenEl.getAttribute('id');

  if (screenId === 'screen-prompt') {
    await submitPrompt(page, `Test prompt ${roundIndex}`);
  } else if (screenId === 'screen-drawing') {
    await drawAndSubmit(page);
  } else if (screenId === 'screen-guessing') {
    await submitGuess(page, `Test guess ${roundIndex}`);
  }
}

/**
 * Create a new browser context and page.
 */
export async function createNewPlayerContext(
  browser: import('@playwright/test').Browser
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}
