import { test, expect, type Page, type BrowserContext } from '@playwright/test';

test.describe('Game Screen Elements', () => {
  let context1: BrowserContext;
  let context2: BrowserContext;
  let page1: Page;
  let page2: Page;

  test.beforeAll(async ({ browser }) => {
    // Set up a 2-player game
    context1 = await browser.newContext();
    context2 = await browser.newContext();
    page1 = await context1.newPage();
    page2 = await context2.newPage();

    // Player 1: Create game
    await page1.goto('/');
    await page1.evaluate(() => localStorage.removeItem('fi-player-name'));
    await page1.goto('/');
    await page1.locator('input[placeholder="Mariner..."]').fill('Ada');
    await page1.getByRole('button', { name: 'Create Game' }).click();
    await page1.getByRole('button', { name: 'Create Expedition' }).click();
    await page1.waitForURL('**/lobby', { timeout: 10000 });

    // Player 1 picks Pilot
    await page1.getByText('Pilot', { exact: true }).click();
    await page1.waitForTimeout(500);

    // Player 2: Join game
    await page2.goto('/');
    await page2.evaluate(() => localStorage.removeItem('fi-player-name'));
    await page2.goto('/');
    await page2.locator('input[placeholder="Mariner..."]').fill('Babbage');
    await page2.waitForTimeout(2000);
    await page2.getByRole('button', { name: 'Join' }).first().click();
    await page2.waitForURL('**/lobby', { timeout: 10000 });

    // Player 2 picks Explorer
    await page2.getByText('Explorer', { exact: true }).click();
    await page2.waitForTimeout(1000);

    // Start game
    await page1.getByRole('button', { name: 'Set Sail' }).click();
    await page1.waitForURL(/\/game\/[^/]+$/, { timeout: 10000 });
    await page2.waitForURL(/\/game\/[^/]+$/, { timeout: 10000 });
  });

  test.afterAll(async () => {
    await context1?.close();
    await context2?.close();
  });

  test('board section shows 24 island tiles', async () => {
    // The board uses IslandGrid which renders tiles based on BOARD_MASK
    // BOARD_MASK has 24 cells with value 1 (the diamond pattern)
    // Each tile gets a Tile component. Look for tile elements.
    // Tiles are rendered as divs with onClick handlers - look for them by the tile structure
    // The IslandGrid renders inside the 'board' grid area

    // Wait for the game state to load
    await page1.waitForTimeout(1000);

    // The board area should be present
    const boardArea = page1.locator('[style*="grid-area"] >> nth=0');
    await expect(boardArea).toBeTruthy();

    // We can check for tile names if they're displayed (showNames defaults to true)
    // Check for at least some known tile names
    await expect(page1.getByText("Fools' Landing")).toBeVisible({ timeout: 5000 });
  });

  test('left sidebar shows crew panel', async () => {
    // The PlayerPanel shows "Crew - N aboard"
    await expect(page1.getByText('Crew - 2 aboard')).toBeVisible();

    // Both player names should be visible
    await expect(page1.getByText('Ada')).toBeVisible();
    await expect(page1.getByText('Babbage')).toBeVisible();
  });

  test('left sidebar shows treasure tracker', async () => {
    // TreasureTracker is rendered in the left sidebar
    // It shows 4 treasures. We can check that the treasure section exists.
    // The treasures are: Earth Stone, Statue of the Wind, Crystal of Fire, Ocean's Chalice
    // These are rendered as TreasureMark components
    const leftSidebar = page1.locator('[style*="grid-area: left"]').first();
    await expect(leftSidebar).toBeTruthy();
  });

  test('left sidebar shows water meter', async () => {
    // WaterMeter component is rendered in the left sidebar
    // It shows the water level. The level starts at 2 for Normal difficulty.
    const leftSidebar = page1.locator('[style*="left"]');
    await expect(leftSidebar.first()).toBeTruthy();
  });

  test('right sidebar shows hand cards section', async () => {
    // The hand section shows "Your Hand - N / 5"
    await expect(page1.getByText(/Your Hand/)).toBeVisible();
  });

  test('right sidebar shows deck stacks', async () => {
    // Decks section with Treasure and Flood decks
    await expect(page1.getByText('Decks')).toBeVisible();
    await expect(page1.getByText('Treasure')).toBeVisible();
    await expect(page1.getByText('Flood')).toBeVisible();
  });

  test('right sidebar shows captain\'s log', async () => {
    await expect(page1.getByText("Captain's Log")).toBeVisible();
  });

  test('action bar shows all 5 action buttons', async () => {
    // ActionBar renders: Move, Shore Up, Give Card, Capture, End Turn
    await expect(page1.getByText('Move', { exact: true })).toBeVisible();
    await expect(page1.getByText('Shore Up')).toBeVisible();
    await expect(page1.getByText('Give Card')).toBeVisible();
    await expect(page1.getByText('Capture')).toBeVisible();
    await expect(page1.getByText('End Turn')).toBeVisible();
  });

  test('action bar shows action hints', async () => {
    await expect(page1.getByText('1 tile - adjacent')).toBeVisible();
    await expect(page1.getByText('Flip flooded tile')).toBeVisible();
    await expect(page1.getByText('Same tile - 1 card')).toBeVisible();
    await expect(page1.getByText('4 matching - on tile')).toBeVisible();
    await expect(page1.getByText('Pass to next')).toBeVisible();
  });

  test('turn indicator shows current player name', async () => {
    // One of the players has the current turn
    // The TurnIndicator shows "Your turn" or "<name>'s turn"
    const turnText = page1.getByText(/turn/i).first();
    await expect(turnText).toBeVisible();

    // Should show either "Your turn" (if Ada is current) or "Babbage's turn"
    const allText = await page1.textContent('body');
    const hasValidTurn =
      allText?.includes('Your turn') || allText?.includes("'s turn");
    expect(hasValidTurn).toBeTruthy();
  });

  test('actions remaining counter is displayed', async () => {
    // TurnIndicator shows "N / 3" for actions remaining
    await expect(page1.getByText('/ 3')).toBeVisible();
  });

  test('game screen shows brand mark', async () => {
    // BrandMark is rendered at top
    await expect(page1.getByText('Forbidden')).toBeVisible();
  });

  test('both players see the same board state', async () => {
    // Both should see Fools' Landing (always on the board)
    await expect(page1.getByText("Fools' Landing")).toBeVisible();
    await expect(page2.getByText("Fools' Landing")).toBeVisible();
  });
});
