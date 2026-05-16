# Game Library Monorepo

Monorepo of 7 web-based multiplayer games deployed to a single VM via Docker Compose with subdomain-per-game routing under `*.games.alanmanderson.com`.

## Repository Layout

```
apps/
  ai-pinochle/       React + FastAPI + PostgreSQL      (pinochle.games.alanmanderson.com)
  backgammon/        React + FastAPI + PostgreSQL      (backgammon.games.alanmanderson.com)
  bughouse/          React + FastAPI + PostgreSQL      (bughouse.games.alanmanderson.com)
  forbidden-island/  React + Fastify (in-memory)       (fi.games.alanmanderson.com)
  lemonadestand/     React + .NET 8 + SQLite           (lemonade.games.alanmanderson.com)
  spades/            Flask + SQLite                     (spades.games.alanmanderson.com)
  telestrations/     Vanilla TS + Express (in-memory)  (telestrations.games.alanmanderson.com)
services/
  auth/              Planned shared auth service (not yet wired up)
infra/
  docker-compose.yml Caddy + Postgres + all game containers
  Caddyfile          Subdomain routing to containers
  init-databases.sql Creates per-game PostgreSQL databases
  .env.example       Template for shared secrets and DB URLs
```

Each game has its own CLAUDE.md with game-specific architecture, commands, and conventions. Always read the per-game CLAUDE.md before working in that directory.

## Tech Stacks

| Category | Games | Backend | Frontend | Database |
|----------|-------|---------|----------|----------|
| FastAPI | ai-pinochle, backgammon, bughouse | Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic | React + TypeScript + Vite | PostgreSQL 16 (asyncpg) |
| Fastify | forbidden-island | Node 20, Fastify, TypeScript | React + Vite | None (in-memory) |
| .NET | lemonadestand | C# .NET 8 Web API (3-tier) | React 19 + Vite + Tailwind + Zustand | SQLite |
| Flask | spades | Python 3.12, Flask, SQLAlchemy (sync) | Server-rendered | SQLite |
| Express | telestrations | Node 20, Express, Socket.IO, zod | Vanilla TypeScript + Vite | None (in-memory) |

## Deployment Architecture

```
Internet → Caddy (ports 80/443, auto-HTTPS via Let's Encrypt)
             ├── pinochle.games.*    → ai-pinochle:8000
             ├── backgammon.games.*  → backgammon:8000
             ├── bughouse.games.*   → bughouse:8000
             ├── fi.games.*         → forbidden-island:3000
             ├── lemonade.games.*   → lemonadestand:5000
             ├── spades.games.*     → spades:5000
             └── telestrations.games.* → telestrations:8080

PostgreSQL 16 (internal only, shared by ai-pinochle, backgammon, bughouse)
```

Only Caddy exposes external ports. Game containers are internal-only on the Docker network.

### Deploy Commands

```bash
cd infra
cp .env.example .env              # Fill in real values
docker compose up -d              # Start everything

docker compose build backgammon   # Rebuild one game
docker compose up -d backgammon   # Restart just that game

docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile  # Reload routing without restart
```

## Shared Environment Variables

Set in `infra/.env`:
- `POSTGRES_PASSWORD` - shared PostgreSQL password
- `{GAME}_DATABASE_URL` - per-game async connection string (`postgresql+asyncpg://...`)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth (shared across games)
- `JWT_SECRET` - token signing key (shared across games)

## Cross-Project Conventions

### Auth Pattern
All games with auth use JWT (HS256) + bcrypt passwords + Google OAuth. Token stored in localStorage, sent via `Authorization: Bearer` header or WebSocket query param.

### Backend Patterns
- Async-first: all Python backends use `async`/`await` with `AsyncSession`
- Config from environment: Pydantic `BaseSettings` (FastAPI), `os.getenv` (Flask), `appsettings.json` (.NET)
- Database migrations: Alembic (FastAPI projects), Flask-Migrate (Spades), `EnsureCreatedAsync` (Lemonade Stand)
- WebSocket for real-time gameplay in all multiplayer games

### Frontend Patterns
- All React projects use Vite (except Bughouse which uses Create React App)
- CSS custom properties for theming (defined per-project in `index.css`)
- Typed API client in each project (`api.ts` or `services/api.ts`)
- Dev servers proxy API/WebSocket to backend via Vite config

### Testing
- **Python backends**: pytest with in-memory SQLite fixtures (`conftest.py`), `asyncio_mode = "auto"`
- **Node backends**: vitest
- **React frontends**: vitest with component tests in `__tests__/`
- **E2E**: Playwright where available (telestrations, lemonadestand, forbidden-island)
- Backend tests never require a running PostgreSQL instance

### Docker
- All games have multi-stage Dockerfiles (build frontend, copy into backend image)
- Production images serve the built frontend from the backend process or static file serving

## Working in This Repo

1. Navigate to the specific game directory under `apps/`
2. Read that game's CLAUDE.md for local dev setup, test commands, and conventions
3. Each game is independently buildable and testable from its own directory
4. Infrastructure changes go in `infra/`; game changes go in `apps/<game>/`
