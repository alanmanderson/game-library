# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game-actions.spec.ts >> Game Actions >> action sequence >> current player can click Move to enter move mode
- Location: tests/game-actions.spec.ts:69:9

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
      - generic [ref=e27]: XZAWTKCV
      - generic [ref=e28]: SHARE THIS CODE OR THE LINK BELOW
    - generic [ref=e29]:
      - generic [ref=e30]:
        - textbox [ref=e31]: http://localhost:5173/game/XzaWTkCV/lobby
        - button "Copy" [ref=e32] [cursor=pointer]
      - generic [ref=e33]:
        - generic [ref=e34]: normal - Water 2
        - generic [ref=e35]: 1 / 4 aboard
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
              - generic [ref=e53]: Mover
              - generic [ref=e54]: Host
              - generic [ref=e55]: You
            - generic [ref=e56]: PILOT
          - generic [ref=e57]: ✓
        - generic [ref=e61]:
          - generic [ref=e62]: Awaiting player...
          - generic [ref=e63]: SLOT 2
        - generic [ref=e67]:
          - generic [ref=e68]: Awaiting player...
          - generic [ref=e69]: SLOT 3
        - generic [ref=e73]:
          - generic [ref=e74]: Awaiting player...
          - generic [ref=e75]: SLOT 4
    - generic [ref=e76]:
      - generic [ref=e78]: Choose Your Role
      - generic [ref=e79]:
        - generic [ref=e80] [cursor=pointer]:
          - generic [ref=e82]:
            - img [ref=e83]
            - img [ref=e87]
          - generic [ref=e90]:
            - generic [ref=e92]: Explorer
            - generic [ref=e94]: Move and shore up diagonally (8-direction).
        - generic [ref=e95] [cursor=pointer]:
          - generic [ref=e97]:
            - img [ref=e98]
            - img [ref=e102]
          - generic [ref=e106]:
            - generic [ref=e108]: Diver
            - generic [ref=e110]: Move through any number of flooded or sunk tiles to reach a tile.
        - generic [ref=e111] [cursor=pointer]:
          - generic [ref=e113]:
            - img [ref=e114]
            - img [ref=e118]
          - generic [ref=e124]:
            - generic [ref=e126]: Engineer
            - generic [ref=e128]: Shore up two tiles for one action.
        - generic [ref=e129] [cursor=pointer]:
          - generic [ref=e131]:
            - img [ref=e132]
            - img [ref=e136]
          - generic [ref=e140]:
            - generic [ref=e142]: Pilot
            - generic [ref=e144]: Fly to any tile, once per turn (1 action).
            - generic [ref=e145]: YOU
        - generic [ref=e146] [cursor=pointer]:
          - generic [ref=e148]:
            - img [ref=e149]
            - img [ref=e153]
          - generic [ref=e156]:
            - generic [ref=e158]: Messenger
            - generic [ref=e160]: Give Treasure cards to any player on any tile.
        - generic [ref=e161] [cursor=pointer]:
          - generic [ref=e163]:
            - img [ref=e164]
            - img [ref=e168]
          - generic [ref=e171]:
            - generic [ref=e173]: Navigator
            - generic [ref=e175]: Move another player up to two tiles for one action.
  - generic [ref=e176]:
    - generic [ref=e177]:
      - generic [ref=e178]: Host Controls
      - generic [ref=e179]:
        - generic [ref=e180]: Difficulty
        - generic [ref=e181]:
          - button "novice" [ref=e182] [cursor=pointer]
          - button "normal" [ref=e183] [cursor=pointer]
          - button "elite" [ref=e184] [cursor=pointer]
          - button "legendary" [ref=e185] [cursor=pointer]
    - button "Set Sail" [disabled] [ref=e186]
```

# Test source

```ts
  1   | import { test, expect, type Page, type BrowserContext } from '@playwright/test';
  2   | 
  3   | test.describe('Game Actions', () => {
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
  20  |     await page1.locator('input[placeholder="Mariner..."]').fill('Mover');
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
  33  |     await page2.locator('input[placeholder="Mariner..."]').fill('Shorer');
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
  46  | 
  47  |     // Wait for game state to fully load
  48  |     await page1.waitForTimeout(1000);
  49  |     await page2.waitForTimeout(1000);
  50  |   });
  51  | 
  52  |   test.afterAll(async () => {
  53  |     await context1?.close();
  54  |     await context2?.close();
  55  |   });
  56  | 
  57  |   /**
  58  |    * Find which page has the current turn by checking for "Your turn" text.
  59  |    */
  60  |   async function getCurrentTurnPage(): Promise<{ currentPage: Page; otherPage: Page }> {
  61  |     const p1Text = await page1.textContent('body');
  62  |     if (p1Text?.includes('Your turn')) {
  63  |       return { currentPage: page1, otherPage: page2 };
  64  |     }
  65  |     return { currentPage: page2, otherPage: page1 };
  66  |   }
  67  | 
  68  |   test.describe.serial('action sequence', () => {
  69  |     test('current player can click Move to enter move mode', async () => {
  70  |       const { currentPage } = await getCurrentTurnPage();
  71  | 
  72  |       // Click the Move button
  73  |       const moveBtn = currentPage.getByText('Move', { exact: true });
  74  |       await moveBtn.click();
  75  |       await currentPage.waitForTimeout(500);
  76  | 
  77  |       // The Move button should now be in "active" state
  78  |       // In active mode, the button gets a different border color (brassHi)
  79  |       // We verify the mode is active by checking if the action mode changed
  80  |       // Valid target tiles should become highlighted (they get a special border/background)
  81  |     });
  82  | 
  83  |     test('current player can click End Turn to pass', async () => {
  84  |       const { currentPage, otherPage } = await getCurrentTurnPage();
  85  |       const currentPlayerName = await currentPage
  86  |         .locator('input[placeholder="Mariner..."]')
  87  |         .inputValue()
  88  |         .catch(() => '');
  89  | 
  90  |       // Click End Turn
  91  |       const endTurnBtn = currentPage.getByText('End Turn');
  92  |       await endTurnBtn.click();
  93  | 
  94  |       // Wait for the turn to process (server sends game:state)
  95  |       await currentPage.waitForTimeout(2000);
  96  |       await otherPage.waitForTimeout(1000);
  97  | 
  98  |       // After ending turn, the server processes treasure draw + flood cards,
  99  |       // then the turn passes. The other player should now see "Your turn".
  100 |       await expect(otherPage.getByText('Your turn')).toBeVisible({ timeout: 10000 });
  101 |     });
  102 | 
  103 |     test('second player can also use End Turn', async () => {
  104 |       const { currentPage, otherPage } = await getCurrentTurnPage();
  105 | 
  106 |       // Current player ends their turn
  107 |       await currentPage.getByText('End Turn').click();
  108 |       await currentPage.waitForTimeout(2000);
  109 | 
  110 |       // Turn should pass back
  111 |       await expect(otherPage.getByText('Your turn')).toBeVisible({ timeout: 10000 });
  112 |     });
  113 | 
  114 |     test('non-current player has disabled action buttons', async () => {
  115 |       const { otherPage } = await getCurrentTurnPage();
  116 | 
  117 |       // The non-current player should have disabled action buttons
  118 |       // Action buttons use HTML disabled attribute
  119 |       const moveBtn = otherPage.locator('button:has-text("Move")');
  120 |       await expect(moveBtn).toBeDisabled();
  121 | 
  122 |       const shoreBtn = otherPage.locator('button:has-text("Shore Up")');
  123 |       await expect(shoreBtn).toBeDisabled();
  124 | 
  125 |       const endBtn = otherPage.locator('button:has-text("End Turn")');
  126 |       await expect(endBtn).toBeDisabled();
  127 |     });
  128 | 
  129 |     test('current player has enabled Move and End Turn buttons', async () => {
  130 |       const { currentPage } = await getCurrentTurnPage();
  131 | 
  132 |       const moveBtn = currentPage.locator('button:has-text("Move")');
  133 |       await expect(moveBtn).toBeEnabled();
  134 | 
  135 |       const endBtn = currentPage.locator('button:has-text("End Turn")');
  136 |       await expect(endBtn).toBeEnabled();
  137 |     });
  138 | 
  139 |     test('Shore Up button is available for current player', async () => {
  140 |       const { currentPage } = await getCurrentTurnPage();
  141 | 
  142 |       const shoreBtn = currentPage.locator('button:has-text("Shore Up")');
  143 |       // Shore Up should be enabled during action phase
```