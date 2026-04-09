---
name: test-local
description: Use Playwright MCP to visually test local dev environment in a browser, verifying key functionality works after code changes.
argument-hint: [optional focus area, e.g. "auth flow" or "game board"]
allowed-tools:
  - Bash
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_screenshot
  - mcp__playwright__browser_click
  - mcp__playwright__browser_type
  - mcp__playwright__browser_wait_for_event
  - mcp__playwright__browser_tab_list
  - mcp__playwright__browser_close
---

# Test Local Changes with Playwright

Use the Playwright MCP browser tools to test the local development environment at **http://localhost:5173** and verify key functionality works.

## Prerequisites

Before testing, ensure the local dev stack is running:

```bash
cd /app && docker compose ps --format '{{.Service}} {{.State}}'
```

If services are not running or unhealthy, start them:

```bash
cd /app && docker compose up -d --wait
```

Wait for all services to be healthy before proceeding. The backend must finish running migrations.

## Testing Procedure

Use the Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_screenshot`) to walk through the app as a real user would.

If the user provided a focus area in the skill argument, prioritize testing that area. Otherwise, run all checks below.

### Test 1: Page Load

1. `browser_navigate` to `http://localhost:5173`
2. `browser_snapshot` to verify the page loaded
3. Confirm the auth modal is visible (should show sign-in/register/guest options)

### Test 2: Guest Authentication

1. Find the guest/continue-as-guest option and click it
2. Type a test nickname like `test-player` into the nickname field
3. Submit the form
4. `browser_snapshot` to confirm you're now on the Home screen
5. Verify the player nickname is displayed and game options are visible (Play vs Bot, New Game, Join Game)

### Test 3: Create Game vs Bot

1. Click the "Play vs Bot" button
2. Wait for navigation to `/game/{tableId}`
3. `browser_snapshot` to verify the game board is rendered
4. Confirm you can see:
   - The backgammon board with checkers
   - Player names (your nickname and "Bot")
   - Game controls (roll dice button or similar)

### Test 4: Gameplay

1. If it's your turn, click the "Roll Dice" button
2. `browser_snapshot` after rolling to verify dice values appear
3. If valid moves are available, attempt to make a move by clicking on a checker and then a destination point
4. `browser_snapshot` to verify the board state updated
5. If you can end your turn, do so and verify the bot takes its turn

### Test 5: Navigation

1. Navigate back to the home screen (click any home/logo link, or `browser_navigate` to `http://localhost:5173/`)
2. `browser_snapshot` to verify the home screen loads correctly and shows game options

## Handling Failures

- If the page doesn't load, check `docker compose ps` and `docker compose logs` for errors
- If the auth modal doesn't appear, take a `browser_screenshot` and report what is visible instead
- If a button or element can't be found, use `browser_snapshot` to see the current page state and adapt — element text or structure may have changed due to the code change being tested
- If WebSocket connection fails (game doesn't start), check backend logs: `docker compose logs backend --tail 50`

## Adapting to the Change

The specific code change you're testing may affect any part of the app. When testing:

- Pay special attention to the area of the app that was modified
- If a UI component was changed, verify it renders correctly and is interactive
- If backend logic was changed, verify the frontend still communicates correctly (no errors in snapshots)
- If styles were changed, use `browser_screenshot` to capture visual state for the user to review

## Reporting Results

After testing, provide a summary:

| Test | Status | Notes |
|------|--------|-------|
| Page load | PASS/FAIL | ... |
| Guest auth | PASS/FAIL | ... |
| Game creation | PASS/FAIL | ... |
| Gameplay | PASS/FAIL | ... |
| Navigation | PASS/FAIL | ... |

If any test fails, include the `browser_snapshot` or `browser_screenshot` output showing the failure, and note whether the failure is likely related to the code change or a pre-existing issue.
