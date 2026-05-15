# Backgammon Online

Full-stack multiplayer backgammon game. FastAPI backend, React/TypeScript frontend, PostgreSQL database, WebSocket for real-time gameplay.

## Quick Start

```bash
# Local dev (requires Docker)
cp .env.example .env  # edit values
docker compose up -d --wait
# Frontend: http://localhost:5173  Backend: http://localhost:8000
```

## Running Tests

```bash
# Backend (pytest-asyncio, uses in-memory SQLite)
cd backend && pip install -r requirements-dev.txt && pytest

# Frontend (Vitest)
cd frontend && npm install && npm run test:run
```

## Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic migrations, Pydantic
- **Frontend**: React 18, TypeScript, Vite, React Router v6
- **Database**: PostgreSQL 16 (asyncpg driver)
- **Real-time**: WebSocket at `/ws/{table_id}/{player_id}?token=JWT`
- **Auth**: JWT (HS256, 24h expiry), bcrypt passwords, Google OAuth, guest mode
- **ML/AI**: PyTorch neural network (TD-Gammon style), self-play training
- **Infra**: Docker Compose (dev), Caddy reverse proxy (prod), Terraform (Azure)

## Environment Variables

- `JWT_SECRET` — **Required**. HMAC key for JWT signing.
- `POSTGRES_PASSWORD` — Database password.
- `GOOGLE_CLIENT_ID` — Google OAuth client ID (optional).
- `DATABASE_URL` — AsyncPG connection string (set automatically in Docker).
- `ALLOWED_ORIGINS` — CORS origins (default: `http://localhost:5173`).

## Project Structure

```
backend/
  app/
    api/routes.py          # REST: tables, players, game history, stats
    api/auth_routes.py     # REST: register, login, Google, guest
    api/websocket.py       # WebSocket handler for real-time game
    services/game_service.py   # GameManager: table lifecycle, move execution
    services/auth_service.py   # Password hashing, JWT, Google verification
    services/bot_service.py    # Bot AI (ML neural net with random fallback), scheduling
    services/stats_service.py  # Player stats aggregation
    game_engine.py         # Pure Python backgammon rules engine (~1200 lines)
    models.py              # SQLAlchemy: Player, Table, MoveRecord, PlayerStats
    schemas.py             # Pydantic request/response models
    database.py            # Async engine and session factory
    config.py              # Settings from env vars
    main.py                # FastAPI app setup, lifespan, CORS
  alembic/                 # Database migrations
  tests/                   # pytest-asyncio tests (SQLite in-memory)
frontend/
  src/
    components/
      Home.tsx             # Two-panel layout: play panel (left) + tabbed content (right)
      Game.tsx             # Main game view (board, controls, chat)
      Board.tsx            # Backgammon board rendering
      Lobby.tsx            # Game discovery (open games, live games, quick match)
      Leaderboard.tsx      # Player rankings with metric tabs (wins/rate/rating)
      Dashboard.tsx        # Player stats and game history
      Tournament.tsx       # TournamentList (browse/create) + TournamentDetail (bracket)
      AuthModal.tsx        # Login/register/guest auth flow
      GameReplay.tsx       # Move-by-move replay viewer
      Spectator.tsx        # Spectator view for live games
      styles/              # Per-component CSS files (Home.css, Lobby.css, etc.)
    hooks/
      useWebSocket.ts      # WebSocket with auto-reconnect and message buffering
      useGameState.ts      # Game state management, move validation, hints
      useGameKeyboard.ts   # Keyboard shortcut bindings for game controls
    services/api.ts        # REST client with auth headers and typed responses
    types/game.ts          # TypeScript types mirroring backend models
    constants.ts           # STORAGE_KEY, TOKEN_KEY, BOT_PLAYER_ID
    __tests__/             # Vitest tests (ComponentName.test.tsx pattern)
ml/
  encoder.py               # 198-feature Tesauro board encoding
  model.py                 # PyTorch BackgammonNet (198→80→80→5, sigmoid)
  bot_integration.py       # MLBotPlayer class for server integration
  td_trainer.py            # TD(lambda) self-play training loop
  train_fast.py            # Two-phase training pipeline (supervised + TD)
  evaluate.py              # Evaluation framework (vs random, heuristic)
  move_validator.py        # Expert heuristic move scoring and validation
  models/                  # Trained model weights (.pt files)
  REPORT.md                # Full executive report on model training
infra/                     # Terraform (Azure VM, PostgreSQL, networking)
deploy.sh                  # Build and deploy to production via SSH
docker-compose.yml         # Dev environment
docker-compose.prod.yml    # Production (Caddy + FastAPI + PostgreSQL)
```

## Architecture

### Game Engine (`backend/app/game_engine.py`)
Pure Python backgammon implementation. Board is a 26-element list (indices 0, 1-24, 25). Positive values = white checkers, negative = black. White moves 24→1, black moves 1→24. States: WAITING → ROLLING → MOVING → FINISHED.

### GameManager (`backend/app/services/game_service.py`)
Holds active `BackgammonEngine` instances in memory keyed by table_id. Per-table `asyncio.Lock` prevents concurrent move execution. Engines are cleaned up 10 minutes after game finishes.

### WebSocket Protocol
Client sends: `roll`, `move {from_point, to_point}`, `end_turn`, `undo_move`, `double`, `accept_double`, `reject_double`.
Server sends: `game_state`, `dice_rolled`, `move_made`, `turn_ended`, `game_over`, `error`, `waiting`, `player_joined`, `opponent_disconnected`.

### Bot (`backend/app/services/bot_service.py`)
Player ID: `"BOT"`. Uses a trained neural network for move selection, with graceful fallback to random moves if the model is unavailable. 0.6–0.8s delay per action for UX. ML model also handles doubling cube decisions (accept if equity > -0.5, offer if equity > 0.5).

### ML Model (`ml/`)
TD-Gammon style neural network for backgammon position evaluation. Trained via two-phase pipeline: supervised pre-training on 1.34M positions from 50K self-play games, then TD(lambda=0.7) reinforcement learning refinement over 5K self-play games. Achieves 98.75% win rate vs random and 73.25% vs a strategic heuristic.

**Architecture**: `198 input → 80 hidden (sigmoid) → 80 hidden (sigmoid) → 5 output (sigmoid)`. 22,805 parameters, 128 KB model file.

**Input encoding** (standard 198-feature Tesauro encoding):
- 24 points × 4 units × 2 players = 192 features (truncated unary: 0→`[0,0,0,0]`, 1→`[1,0,0,0]`, 2→`[1,1,0,0]`, 3→`[1,1,1,0]`, n≥4→`[1,1,1,(n-3)/2]`)
- 2 bar features (per player, /2), 2 borne-off features (per player, /15), 2 turn indicator

**Output**: 5 probabilities from the current player's perspective: P(win), P(win gammon), P(lose gammon), P(win backgammon), P(lose backgammon). Equity = `2*P(win) - 1 + P(win_gammon) - P(lose_gammon) + P(win_bg) - P(lose_bg)`.

**Move selection**: For each valid move, snapshot board → apply move → encode 198 features → forward pass → compute equity → restore board. Pick the move with highest equity.

**Integration**: `bot_service.py` lazy-loads the model on first bot game. Searches `/app/ml/` (Docker) then relative repo path (local dev). Falls back to random if model missing. The model file is baked into the Docker image at build time.

**Retraining**: `cd ml && python3 train_fast.py --random-games 50000 --td-games 5000`. Requires `torch` and `numpy`. See `ml/REPORT.md` for full details.

### Database Models
- **Player**: UUID id, nickname, optional email/password_hash/google_id, is_guest, auth_provider
- **Table**: 8-char alphanumeric id, status (waiting/playing/finished), white/black player FKs, game_state JSON, match scoring
- **MoveRecord**: Per-move history with dice_roll and moves_notation
- **PlayerStats**: Per-opponent win/loss/gammon/backgammon tracking

### Auth Flow
JWT in `localStorage['backgammon_token']`. Four providers: local (email/password), Google OAuth, guest (no persistence), bot (system). All table/player endpoints require valid JWT. Rate limit: 5 registrations/min/IP.

## Deployment

Production domain: `backgammon.alanmanderson.com`. Run `deploy.sh` or use the `/deploy` skill. Builds frontend, Docker image for backend (includes ML model + PyTorch CPU), transfers to Azure VM via SSH, runs migrations, restarts services behind Caddy (auto-HTTPS). Docker build context is the repo root (`-f backend/Dockerfile .`) so the `ml/` directory is accessible during build.

## Conventions

### Backend
- All database calls use `AsyncSession` — never use sync SQLAlchemy
- Alembic for all schema changes — never modify tables directly
- Table IDs: 8-char uppercase alphanumeric. Player IDs: UUIDs. Bot ID: `"BOT"`
- Backend tests use in-memory SQLite via fixtures in `conftest.py`
- Backend tests require `JWT_SECRET=test` env var: `JWT_SECRET=test python3 -m pytest`
- Frontend proxies `/api` and `/ws` to backend via Vite config (dev) or Caddy (prod)
- **DO NOT upgrade these libraries** — they cause deadlocks in WebSocket tests: `pytest==8.4.2`, `pytest-asyncio==0.25.3`, `aiosqlite==0.22.1`. Stay on the current pinned versions (`pytest==8.3.4`, `pytest-asyncio==0.24.0`, `aiosqlite==0.20.0`).

### Frontend Architecture
- **Home page** uses a two-panel CSS Grid layout: left play panel (380px, sticky) + right tabbed content panel (flex)
- **Embedded pattern**: Lobby, Leaderboard, and TournamentList accept an `embedded?: boolean` prop. When `true`, they hide their standalone header/back button and apply a `--embedded` CSS modifier class (e.g., `.lobby--embedded`). This is how they render inside Home's tab panel vs. as standalone pages.
- **Tab state**: Home.tsx manages `activeTab: HomeTab` state. Tab content mounts/unmounts on switch (not hidden with CSS). This is intentional — Lobby polling restarts cleanly via useEffect cleanup.
- **Component props**: All components use typed interfaces. Optional props use `?`. Navigation callbacks (like `onBack`) use `() => void`.
- **API service**: `api.ts` uses a generic `request<T>()` helper with automatic auth headers and typed returns. Snake_case for API payloads.
- **Constants**: `STORAGE_KEY`, `TOKEN_KEY`, `BOT_PLAYER_ID` in `constants.ts` — use these, don't hardcode strings.

### Frontend Styling
- **CSS variables** defined in `index.css`: `--bg-primary` (#1a1a2e), `--bg-secondary` (#22223a), `--accent` (#d4a843), `--text-primary` (#e8e8e8), `--text-secondary` (#9a9ab0), `--danger` (#e74c3c), `--success` (#2ecc71). Always use these — never hardcode colors.
- **Class naming**: Kebab-case with component prefix (`.lobby-*`, `.play-*`, `.content-tab*`, `.config-pill-*`). BEM-like modifiers for state: `.selected`, `.active`, `.used`.
- **Per-component CSS files** in `components/styles/` — one CSS file per component, imported directly in the component.
- **Responsive breakpoints**: 960px (tablet — grid collapses or shrinks), 768px (mobile — single column), 480px (small mobile — compact text). Use `@media (max-width: ...)`.
- **Interactive states**: Use `:hover:not(:disabled)`, `:active:not(:disabled)`. Transitions default to `0.15s ease`.

### Frontend Testing
- Test files: `__tests__/ComponentName.test.tsx` — one test file per component
- Mock pattern: `vi.mock("../services/api", ...)` with `vi.fn()` stubs, configure return values in `beforeEach` with `vi.mocked(api.someFunction).mockResolvedValue(...)`
- Router mock: `const mockNavigate = vi.fn(); vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }))`
- When testing components that render sub-components with data fetching (e.g., Home renders Lobby which calls `getLobby`), mock ALL API functions the sub-components call, even if the test doesn't assert on them. Otherwise tests fail with "No export defined on mock" errors.
- Coverage thresholds: 35% (lines, functions, branches, statements) configured in `vite.config.ts`
- Run frontend tests: `cd frontend && npx vitest run` (or `npm run test:run`)

### ML / Deployment
- ML model file: `ml/models/backgammon_model_final.pt` — do not delete; baked into Docker image at deploy
- To retrain the model: `cd ml && pip install torch numpy && python3 train_fast.py`
- Docker build context is repo root (not `backend/`); `.dockerignore` at root excludes frontend/infra/.git
