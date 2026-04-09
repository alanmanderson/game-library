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
    services/bot_service.py    # Bot AI (random moves), scheduling
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
    components/            # React components (Game, Board, Home, AuthModal, etc.)
    hooks/useWebSocket.ts  # WebSocket with auto-reconnect and message buffering
    services/api.ts        # REST client with auth headers
    types/game.ts          # TypeScript types mirroring backend models
    constants.ts           # STORAGE_KEY, TOKEN_KEY, BOT_PLAYER_ID
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

### Bot
Player ID: `"BOT"`. Selects random valid moves. 0.6–0.8s delay per action for UX. Auto-accepts doubles.

### Database Models
- **Player**: UUID id, nickname, optional email/password_hash/google_id, is_guest, auth_provider
- **Table**: 8-char alphanumeric id, status (waiting/playing/finished), white/black player FKs, game_state JSON, match scoring
- **MoveRecord**: Per-move history with dice_roll and moves_notation
- **PlayerStats**: Per-opponent win/loss/gammon/backgammon tracking

### Auth Flow
JWT in `localStorage['backgammon_token']`. Four providers: local (email/password), Google OAuth, guest (no persistence), bot (system). All table/player endpoints require valid JWT. Rate limit: 5 registrations/min/IP.

## Deployment

Production domain: `backgammon.alanmanderson.com`. Run `deploy.sh` or use the `/deploy` skill. Builds frontend, Docker image for backend, transfers to Azure VM via SSH, runs migrations, restarts services behind Caddy (auto-HTTPS).

## Conventions

- All database calls use `AsyncSession` — never use sync SQLAlchemy
- Alembic for all schema changes — never modify tables directly
- Table IDs: 8-char uppercase alphanumeric. Player IDs: UUIDs. Bot ID: `"BOT"`
- Backend tests use in-memory SQLite via fixtures in `conftest.py`
- Frontend proxies `/api` and `/ws` to backend via Vite config (dev) or Caddy (prod)
