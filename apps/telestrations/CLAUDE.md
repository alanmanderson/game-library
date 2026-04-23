# Telestrations Web App

## Project Structure

Monorepo with three projects:
- `server/` - Node.js/TypeScript backend (Express + Socket.IO)
- `client/` - Vanilla TypeScript frontend (Vite)
- `e2e/` - Playwright E2E tests

Root `package.json` orchestrates all three: `npm run dev`, `npm run build`, `npm test`.

## Tech Stack

- **Server**: Node 20, Express, Socket.IO 4.x, zod validation, in-memory state (no database)
- **Client**: Vanilla TypeScript, Vite, HTML5 Canvas, Socket.IO client, CSS custom properties
- **Tests**: vitest (server unit/integration), Playwright (E2E)
- **Deployment**: Azure App Service B1, GitHub Actions CI/CD

## Key Architecture Decisions

- All game state is in-memory (no database). Games are ephemeral.
- Server is the single source of truth for timers, state transitions, and game flow.
- Client uses a simple `setState` + `subscribe` pattern (no framework). Screens re-render reactively when relevant state changes.
- Socket.IO for all real-time communication; REST for game creation/joining.

## Development

```bash
npm run install:all   # Install deps for server + client
npm run dev           # Start both dev servers (server on 8080, client on 5173)
npm test              # Run server tests (vitest)
```

Server listens on port 8080 by default. The Vite dev server proxies `/api/*` and `/socket.io/*` to `localhost:8080` (configured in `client/vite.config.ts`).

## Testing

### Server tests
```bash
cd server && npx vitest run       # 184 tests
```

### E2E tests
```bash
cd e2e && NODE_ENV=test npx playwright test
```

**E2E gotcha**: The Playwright config (`e2e/playwright.config.ts`) starts its own server via `webServer.command`. It builds both projects and starts the server on port 3001. If `reuseExistingServer` is true and a stale server is running from a previous session, Playwright will connect to the OLD server with OLD compiled code. If E2E tests mysteriously fail (events not received, handlers not firing), **kill any stale server processes first** or set `reuseExistingServer: false`.

## Common Patterns

### Adding a new Socket.IO event
1. Add the event signature to `server/src/models/types.ts` (`ClientToServerEvents` or `ServerToClientEvents`)
2. Implement the handler method in `server/src/game/GameManager.ts`
3. Wire it up in `server/src/socket/handlers.ts`
4. Add the emit helper in `client/src/socket.ts`
5. Handle the server response in the appropriate client screen

### Event listener stacking bug
When a screen's `setup*()` function adds event listeners to a container element (like `appRoot`) and the screen re-renders reactively (innerHTML replacement + setup called again), listeners stack because `innerHTML` only removes listeners on child elements, not the container. **Always call `removeEventListener` before `addEventListener`** in setup functions, or only attach listeners once in `init()`. This bug has bitten us twice (DrawingCanvas undo, Review click handler).

### Screen rendering lifecycle
`app.ts` controls rendering: `renderScreen()` sets `appRoot.innerHTML = html` then calls `setup*(appRoot)`. For reactive screens (lobby, waiting, review), `shouldReactiveRerender()` determines if a re-render is needed when state changes. The setup function runs on every re-render, not just the first mount.

## Docs

- `docs/product-spec.md` - Full game rules and requirements
- `docs/backend-architecture.md` - API endpoints, Socket.IO events, state machine
- `docs/design-system.md` - Colors, typography, spacing, component specs
- `docs/deployment-guide.md` - Azure setup, DNS, CI/CD, cost breakdown
