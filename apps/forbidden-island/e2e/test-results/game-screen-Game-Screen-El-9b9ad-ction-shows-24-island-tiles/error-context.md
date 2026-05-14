# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game-screen.spec.ts >> Game Screen Elements >> board section shows 24 island tiles
- Location: tests/game-screen.spec.ts:53:7

# Error details

```
"beforeAll" hook timeout of 30000ms exceeded.
```

```
Error: locator.click: Target page, context or browser has been closed
Call log:
  - waiting for getByRole('button', { name: 'Set Sail' })
    - locator resolved to <button disabled class="fi" type="button">Set Sail</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    46 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e5]:
  - generic [ref=e6]:
    - generic [ref=e7]:
      - img [ref=e8]
      - generic [ref=e20]:
        - generic [ref=e21]: A CO-OP EXPEDITION
        - generic [ref=e22]: Forbidden Island
    - button "Leave Expedition" [ref=e23] [cursor=pointer]
  - generic [ref=e24]:
    - generic [ref=e25]:
      - generic [ref=e26]: "Expedition #"
      - generic [ref=e27]: I0ZDVXSM
      - generic [ref=e28]: SHARE THIS CODE OR THE LINK BELOW
    - generic [ref=e29]:
      - generic [ref=e30]:
        - textbox [ref=e31]: http://localhost:5173/game/i0zDVxSm/lobby
        - button "Copy" [ref=e32] [cursor=pointer]
      - generic [ref=e33]:
        - generic [ref=e34]: normal - Water 2
        - generic [ref=e35]: 3 / 4 aboard
  - generic [ref=e36]:
    - generic [ref=e37]:
      - generic [ref=e38]: Crew
      - generic [ref=e39]:
        - generic [ref=e40]:
          - generic [ref=e42]:
            - img [ref=e43]
            - img [ref=e47]
          - generic [ref=e51]:
            - generic [ref=e52]:
              - generic [ref=e53]: Ada
              - generic [ref=e54]: Host
              - generic [ref=e55]: You
            - generic [ref=e56]: PILOT
          - generic [ref=e57]: ✓
        - generic [ref=e58]:
          - generic [ref=e60]:
            - img [ref=e61]
            - img [ref=e65]
          - generic [ref=e68]:
            - generic [ref=e70]: Babbage
            - generic [ref=e71]: EXPLORER
          - generic [ref=e72]: ✓
        - generic [ref=e75]:
          - generic [ref=e77]: Shorer
          - generic [ref=e78]: CHOOSING ROLE...
        - generic [ref=e82]:
          - generic [ref=e83]: Awaiting player...
          - generic [ref=e84]: SLOT 4
    - generic [ref=e85]:
      - generic [ref=e87]: Choose Your Role
      - generic [ref=e88]:
        - generic [ref=e89]:
          - generic [ref=e91]:
            - img [ref=e92]
            - img [ref=e96]
          - generic [ref=e99]:
            - generic [ref=e101]: Explorer
            - generic [ref=e103]: Move and shore up diagonally (8-direction).
            - generic [ref=e104]: Claimed - Babbage
        - generic [ref=e105] [cursor=pointer]:
          - generic [ref=e107]:
            - img [ref=e108]
            - img [ref=e112]
          - generic [ref=e116]:
            - generic [ref=e118]: Diver
            - generic [ref=e120]: Move through any number of flooded or sunk tiles to reach a tile.
        - generic [ref=e121] [cursor=pointer]:
          - generic [ref=e123]:
            - img [ref=e124]
            - img [ref=e128]
          - generic [ref=e134]:
            - generic [ref=e136]: Engineer
            - generic [ref=e138]: Shore up two tiles for one action.
        - generic [ref=e139] [cursor=pointer]:
          - generic [ref=e141]:
            - img [ref=e142]
            - img [ref=e146]
          - generic [ref=e150]:
            - generic [ref=e152]: Pilot
            - generic [ref=e154]: Fly to any tile, once per turn (1 action).
            - generic [ref=e155]: YOU
        - generic [ref=e156] [cursor=pointer]:
          - generic [ref=e158]:
            - img [ref=e159]
            - img [ref=e163]
          - generic [ref=e166]:
            - generic [ref=e168]: Messenger
            - generic [ref=e170]: Give Treasure cards to any player on any tile.
        - generic [ref=e171] [cursor=pointer]:
          - generic [ref=e173]:
            - img [ref=e174]
            - img [ref=e178]
          - generic [ref=e181]:
            - generic [ref=e183]: Navigator
            - generic [ref=e185]: Move another player up to two tiles for one action.
  - generic [ref=e186]:
    - generic [ref=e187]:
      - generic [ref=e188]: Host Controls
      - generic [ref=e189]:
        - generic [ref=e190]: Difficulty
        - generic [ref=e191]:
          - button "novice" [ref=e192] [cursor=pointer]
          - button "normal" [ref=e193] [cursor=pointer]
          - button "elite" [ref=e194] [cursor=pointer]
          - button "legendary" [ref=e195] [cursor=pointer]
    - button "Set Sail" [disabled] [ref=e196]
```

# Test source

```ts
  1   | import { test, expect, type Page, type BrowserContext } from '@playwright/test';
  2   | 
  3   | test.describe('Game Screen Elements', () => {
  4   |   let context1: BrowserContext;
  5   |   let context2: BrowserContext;
  6   |   let page1: Page;
  7   |   let page2: Page;
  8   | 
  9   |   test.beforeAll(async ({ browser }) => {
  10  |     // Set up a 2-player game
  11  |     context1 = await browser.newContext();
  12  |     context2 = await browser.newContext();
  13  |     page1 = await context1.newPage();
  14  |     page2 = await context2.newPage();
  15  | 
  16  |     // Player 1: Create game
  17  |     await page1.goto('/');
  18  |     await page1.evaluate(() => localStorage.removeItem('fi-player-name'));
  19  |     await page1.goto('/');
  20  |     await page1.locator('input[placeholder="Mariner..."]').fill('Ada');
  21  |     await page1.getByRole('button', { name: 'Create Game' }).click();
  22  |     await page1.getByRole('button', { name: 'Create Expedition' }).click();
  23  |     await page1.waitForURL('**/lobby', { timeout: 10000 });
  24  | 
  25  |     // Player 1 picks Pilot
  26  |     await page1.getByText('Pilot', { exact: true }).first().click();
  27  |     await page1.waitForTimeout(1000);
  28  | 
  29  |     // Player 2: Join game
  30  |     await page2.goto('/');
  31  |     await page2.evaluate(() => localStorage.removeItem('fi-player-name'));
  32  |     await page2.goto('/');
  33  |     await page2.locator('input[placeholder="Mariner..."]').fill('Babbage');
  34  |     await page2.waitForTimeout(2000);
  35  |     await page2.getByRole('button', { name: 'Join' }).first().click();
  36  |     await page2.waitForURL('**/lobby', { timeout: 10000 });
  37  | 
  38  |     // Player 2 picks Explorer
  39  |     await page2.getByText('Explorer', { exact: true }).first().click();
  40  |     await page2.waitForTimeout(1000);
  41  | 
  42  |     // Start game
> 43  |     await page1.getByRole('button', { name: 'Set Sail' }).click();
      |                                                           ^ Error: locator.click: Target page, context or browser has been closed
  44  |     await page1.waitForURL(/\/game\/[^/]+$/, { timeout: 10000 });
  45  |     await page2.waitForURL(/\/game\/[^/]+$/, { timeout: 10000 });
  46  |   });
  47  | 
  48  |   test.afterAll(async () => {
  49  |     await context1?.close();
  50  |     await context2?.close();
  51  |   });
  52  | 
  53  |   test('board section shows 24 island tiles', async () => {
  54  |     // The board uses IslandGrid which renders tiles based on BOARD_MASK
  55  |     // BOARD_MASK has 24 cells with value 1 (the diamond pattern)
  56  |     // Each tile gets a Tile component. Look for tile elements.
  57  |     // Tiles are rendered as divs with onClick handlers - look for them by the tile structure
  58  |     // The IslandGrid renders inside the 'board' grid area
  59  | 
  60  |     // Wait for the game state to load
  61  |     await page1.waitForTimeout(1000);
  62  | 
  63  |     // The board area should be present
  64  |     const boardArea = page1.locator('[style*="grid-area"] >> nth=0');
  65  |     await expect(boardArea).toBeTruthy();
  66  | 
  67  |     // We can check for tile names if they're displayed (showNames defaults to true)
  68  |     // Check for at least some known tile names
  69  |     await expect(page1.getByText("Fools' Landing")).toBeVisible({ timeout: 5000 });
  70  |   });
  71  | 
  72  |   test('left sidebar shows crew panel', async () => {
  73  |     // The PlayerPanel shows "Crew - N aboard"
  74  |     await expect(page1.getByText('Crew - 2 aboard')).toBeVisible();
  75  | 
  76  |     // Both player names should be visible
  77  |     await expect(page1.getByText('Ada')).toBeVisible();
  78  |     await expect(page1.getByText('Babbage')).toBeVisible();
  79  |   });
  80  | 
  81  |   test('left sidebar shows treasure tracker', async () => {
  82  |     // TreasureTracker is rendered in the left sidebar
  83  |     // It shows 4 treasures. We can check that the treasure section exists.
  84  |     // The treasures are: Earth Stone, Statue of the Wind, Crystal of Fire, Ocean's Chalice
  85  |     // These are rendered as TreasureMark components
  86  |     const leftSidebar = page1.locator('[style*="grid-area: left"]').first();
  87  |     await expect(leftSidebar).toBeTruthy();
  88  |   });
  89  | 
  90  |   test('left sidebar shows water meter', async () => {
  91  |     // WaterMeter component is rendered in the left sidebar
  92  |     // It shows the water level. The level starts at 2 for Normal difficulty.
  93  |     const leftSidebar = page1.locator('[style*="left"]');
  94  |     await expect(leftSidebar.first()).toBeTruthy();
  95  |   });
  96  | 
  97  |   test('right sidebar shows hand cards section', async () => {
  98  |     // The hand section shows "Your Hand - N / 5"
  99  |     await expect(page1.getByText(/Your Hand/)).toBeVisible();
  100 |   });
  101 | 
  102 |   test('right sidebar shows deck stacks', async () => {
  103 |     // Decks section with Treasure and Flood decks
  104 |     await expect(page1.getByText('Decks')).toBeVisible();
  105 |     await expect(page1.getByText('Treasure')).toBeVisible();
  106 |     await expect(page1.getByText('Flood')).toBeVisible();
  107 |   });
  108 | 
  109 |   test('right sidebar shows captain\'s log', async () => {
  110 |     await expect(page1.getByText("Captain's Log")).toBeVisible();
  111 |   });
  112 | 
  113 |   test('action bar shows all 5 action buttons', async () => {
  114 |     // ActionBar renders: Move, Shore Up, Give Card, Capture, End Turn
  115 |     await expect(page1.getByText('Move', { exact: true })).toBeVisible();
  116 |     await expect(page1.getByText('Shore Up')).toBeVisible();
  117 |     await expect(page1.getByText('Give Card')).toBeVisible();
  118 |     await expect(page1.getByText('Capture')).toBeVisible();
  119 |     await expect(page1.getByText('End Turn')).toBeVisible();
  120 |   });
  121 | 
  122 |   test('action bar shows action hints', async () => {
  123 |     await expect(page1.getByText('1 tile - adjacent')).toBeVisible();
  124 |     await expect(page1.getByText('Flip flooded tile')).toBeVisible();
  125 |     await expect(page1.getByText('Same tile - 1 card')).toBeVisible();
  126 |     await expect(page1.getByText('4 matching - on tile')).toBeVisible();
  127 |     await expect(page1.getByText('Pass to next')).toBeVisible();
  128 |   });
  129 | 
  130 |   test('turn indicator shows current player name', async () => {
  131 |     // One of the players has the current turn
  132 |     // The TurnIndicator shows "Your turn" or "<name>'s turn"
  133 |     const turnText = page1.getByText(/turn/i).first();
  134 |     await expect(turnText).toBeVisible();
  135 | 
  136 |     // Should show either "Your turn" (if Ada is current) or "Babbage's turn"
  137 |     const allText = await page1.textContent('body');
  138 |     const hasValidTurn =
  139 |       allText?.includes('Your turn') || allText?.includes("'s turn");
  140 |     expect(hasValidTurn).toBeTruthy();
  141 |   });
  142 | 
  143 |   test('actions remaining counter is displayed', async () => {
```