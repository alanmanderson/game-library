# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer.spec.ts >> Two-Player Game Setup >> multiplayer lobby and start >> both players see each other in the crew list
- Location: tests/multiplayer.spec.ts:67:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Bob')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('Bob')

```

```yaml
- img
- text: A CO-OP EXPEDITION Forbidden Island
- button "Leave Expedition"
- text: "Expedition # NIJY-M4C SHARE THIS CODE OR THE LINK BELOW"
- textbox: http://localhost:5173/game/NIjY-m4C/lobby
- button "Copy"
- text: normal - Water 2 1 / 4 aboard Crew
- img
- img
- text: Alice Host You PILOT ✓ Awaiting player... SLOT 2 Awaiting player... SLOT 3 Awaiting player... SLOT 4 Choose Your Role
- img
- img
- text: Explorer Move and shore up diagonally (8-direction).
- img
- img
- text: Diver Move through any number of flooded or sunk tiles to reach a tile.
- img
- img
- text: Engineer Shore up two tiles for one action.
- img
- img
- text: Pilot Fly to any tile, once per turn (1 action). YOU
- img
- img
- text: Messenger Give Treasure cards to any player on any tile.
- img
- img
- text: Navigator Move another player up to two tiles for one action. Host Controls Difficulty
- button "novice"
- button "normal"
- button "elite"
- button "legendary"
- button "Set Sail" [disabled]
```

# Test source

```ts
  1   | import { test, expect, type Page, type BrowserContext } from '@playwright/test';
  2   | 
  3   | test.describe('Two-Player Game Setup', () => {
  4   |   let context1: BrowserContext;
  5   |   let context2: BrowserContext;
  6   |   let page1: Page;
  7   |   let page2: Page;
  8   |   let lobbyUrl: string;
  9   | 
  10  |   test.beforeAll(async ({ browser }) => {
  11  |     // Create two independent browser contexts (like two separate users)
  12  |     context1 = await browser.newContext();
  13  |     context2 = await browser.newContext();
  14  |     page1 = await context1.newPage();
  15  |     page2 = await context2.newPage();
  16  |   });
  17  | 
  18  |   test.afterAll(async () => {
  19  |     await context1?.close();
  20  |     await context2?.close();
  21  |   });
  22  | 
  23  |   test.describe.serial('multiplayer lobby and start', () => {
  24  |     test('Player 1 creates a game', async () => {
  25  |       await page1.goto('/');
  26  |       await page1.evaluate(() => localStorage.removeItem('fi-player-name'));
  27  |       await page1.goto('/');
  28  | 
  29  |       await page1.locator('input[placeholder="Mariner..."]').fill('Alice');
  30  |       await page1.getByRole('button', { name: 'Create Game' }).click();
  31  |       await expect(page1).toHaveURL(/\/create$/);
  32  | 
  33  |       await page1.getByRole('button', { name: 'Create Expedition' }).click();
  34  |       await page1.waitForURL('**/lobby', { timeout: 10000 });
  35  | 
  36  |       lobbyUrl = page1.url();
  37  |       expect(lobbyUrl).toMatch(/\/game\/[^/]+\/lobby$/);
  38  |     });
  39  | 
  40  |     test('Player 1 selects a role', async () => {
  41  |       await page1.getByText('Pilot', { exact: true }).first().click();
  42  |       await expect(page1.getByText('YOU', { exact: true })).toBeVisible({ timeout: 5000 });
  43  |     });
  44  | 
  45  |     test('Player 2 sees the game in the open expeditions list', async () => {
  46  |       await page2.goto('/');
  47  |       await page2.evaluate(() => localStorage.removeItem('fi-player-name'));
  48  |       await page2.goto('/');
  49  | 
  50  |       await page2.locator('input[placeholder="Mariner..."]').fill('Bob');
  51  | 
  52  |       // Wait for game list to populate via WebSocket — the server broadcasts
  53  |       // when a new game is created, but WS needs time to connect first
  54  |       const aliceExpedition = page2.getByText("Alice's expedition");
  55  |       await expect(aliceExpedition).toBeVisible({ timeout: 10000 });
  56  |     });
  57  | 
  58  |     test('Player 2 joins the game', async () => {
  59  |       // Click Join on the game entry
  60  |       await page2.getByRole('button', { name: 'Join' }).first().click();
  61  |       await page2.waitForURL('**/lobby', { timeout: 10000 });
  62  | 
  63  |       // Both should now be on the same lobby
  64  |       expect(page2.url()).toContain('/lobby');
  65  |     });
  66  | 
  67  |     test('both players see each other in the crew list', async () => {
  68  |       // Player 1 should see Bob
> 69  |       await expect(page1.getByText('Bob')).toBeVisible({ timeout: 10000 });
      |                                            ^ Error: expect(locator).toBeVisible() failed
  70  |       // Player 2 should see Alice
  71  |       await expect(page2.getByText('Alice')).toBeVisible({ timeout: 10000 });
  72  | 
  73  |       // Player count should be 2 / 4
  74  |       await expect(page1.getByText('2 / 4 aboard')).toBeVisible({ timeout: 5000 });
  75  |       await expect(page2.getByText('2 / 4 aboard')).toBeVisible({ timeout: 5000 });
  76  |     });
  77  | 
  78  |     test('Player 2 selects a role', async () => {
  79  |       // Select Explorer (Pilot is already taken by Alice)
  80  |       await page2.getByText('Explorer', { exact: true }).first().click();
  81  | 
  82  |       // Player 2 should see "YOU" on their selected role
  83  |       await expect(page2.getByText('YOU', { exact: true })).toBeVisible({ timeout: 5000 });
  84  |     });
  85  | 
  86  |     test('Set Sail becomes enabled when all players have roles', async () => {
  87  |       // Wait for the lobby to reflect both role selections
  88  |       await page1.waitForTimeout(1000);
  89  | 
  90  |       const setSailBtn = page1.getByRole('button', { name: 'Set Sail' });
  91  |       await expect(setSailBtn).toBeEnabled({ timeout: 5000 });
  92  |     });
  93  | 
  94  |     test('non-host does not see Set Sail button', async () => {
  95  |       // Player 2 (Bob) is not the host, so should NOT see Host Controls
  96  |       const hostControls = page2.getByText('Host Controls');
  97  |       await expect(hostControls).not.toBeVisible();
  98  |     });
  99  | 
  100 |     test('Host clicks Set Sail and both navigate to game screen', async () => {
  101 |       await page1.getByRole('button', { name: 'Set Sail' }).click();
  102 | 
  103 |       // Both players should navigate to the game screen (/game/:id, not /lobby)
  104 |       await page1.waitForURL(/\/game\/[^/]+$/, { timeout: 10000 });
  105 |       await page2.waitForURL(/\/game\/[^/]+$/, { timeout: 10000 });
  106 | 
  107 |       // Verify both are on the game screen (not lobby, not results)
  108 |       expect(page1.url()).not.toContain('/lobby');
  109 |       expect(page1.url()).not.toContain('/results');
  110 |       expect(page2.url()).not.toContain('/lobby');
  111 |       expect(page2.url()).not.toContain('/results');
  112 |     });
  113 | 
  114 |     test('game screen shows turn indicator for both players', async () => {
  115 |       // At least one of the players should see the turn indicator
  116 |       // The TurnIndicator shows "Your turn" or "<name>'s turn"
  117 |       const p1TurnText = page1.getByText(/turn/i).first();
  118 |       await expect(p1TurnText).toBeVisible({ timeout: 5000 });
  119 | 
  120 |       const p2TurnText = page2.getByText(/turn/i).first();
  121 |       await expect(p2TurnText).toBeVisible({ timeout: 5000 });
  122 |     });
  123 |   });
  124 | });
  125 | 
```