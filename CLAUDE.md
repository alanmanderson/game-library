# Game Library Monorepo

Monorepo of 9 web-based multiplayer games deployed to a single VM via Docker Compose with subdomain-per-game routing under `*.games.alanmanderson.com`.

## Repository Layout

```
apps/
  ai-pinochle/       React + FastAPI + PostgreSQL      (pinochle.games.alanmanderson.com)
  backgammon/        React + FastAPI + PostgreSQL      (backgammon.games.alanmanderson.com)
  bughouse/          React + FastAPI + PostgreSQL      (bughouse.games.alanmanderson.com)
  dittle/            Node + Express + ws (in-memory)   (dittle.games.alanmanderson.com)
  forbidden-island/  React + Fastify (in-memory)       (fi.games.alanmanderson.com)
  lemonadestand/     React + .NET 8 + SQLite           (lemonade.games.alanmanderson.com)
  sneaky-sabotage/   React + FastAPI + PostgreSQL      (sabotage.games.alanmanderson.com)
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
| FastAPI | ai-pinochle, backgammon, bughouse, sneaky-sabotage | Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic | React + TypeScript + Vite | PostgreSQL 16 (asyncpg) |
| Fastify | forbidden-island | Node 20, Fastify, TypeScript | React + Vite | None (in-memory) |
| .NET | lemonadestand | C# .NET 8 Web API (3-tier) | React 19 + Vite + Tailwind + Zustand | SQLite |
| Flask | spades | Python 3.12, Flask, SQLAlchemy (sync) | Server-rendered | SQLite |
| Express | telestrations | Node 20, Express, Socket.IO, zod | Vanilla TypeScript + Vite | None (in-memory) |
| Express | dittle | Node 20, Express, ws | Vanilla JS (static, no build) | None (in-memory) |

## Deployment Architecture

```
Internet → Caddy (ports 80/443, auto-HTTPS via Let's Encrypt)
             ├── pinochle.games.*    → ai-pinochle:8000
             ├── backgammon.games.*  → backgammon:8000
             ├── bughouse.games.*   → bughouse:8000
             ├── fi.games.*         → forbidden-island:3000
             ├── lemonade.games.*   → lemonadestand:5000
             ├── spades.games.*     → spades:5000
             ├── sabotage.games.*    → sneaky-sabotage:8000
             ├── telestrations.games.* → telestrations:8080
             └── dittle.games.*     → dittle:8080

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

### Logging Service
All games integrate with a centralized logging service (`services/logservice/`). Every game container receives `LOG_SERVICE_URL` and `LOG_SERVICE_API_KEY` environment variables via `infra/docker-compose.yml`.

- **Python backends**: Copy `services/logservice/sdk/python.py` into your backend as `logservice.py`, then call `setup_log_service(app, service="<game-name>")` in your FastAPI `main.py` (or `setup_log_service_flask(app, service="<game-name>")` for Flask).
- **Node backends**: Send logs via HTTP POST to `LOG_SERVICE_URL` with `Authorization: Bearer <LOG_SERVICE_API_KEY>` header. See existing Node games for examples.
- The handler only ships `WARNING` and above by default. It buffers entries and flushes every 5 seconds or every 20 entries.

## Adding a New Game

### Choosing a tech stack

**Default**: FastAPI + React + TypeScript + Vite + PostgreSQL. This is the most battle-tested stack in the repo (backgammon, ai-pinochle, bughouse all use it). Use it unless you have a specific reason not to.

- **In-memory/session-based game** with no persistence needed: Node.js (Express or Fastify) + React + Vite is fine (see telestrations, forbidden-island).
- **Single-player/idle game**: Any backend works; lemonadestand uses .NET + SQLite as a reference.

### Step-by-step checklist

#### 1. Create the game directory

Create `apps/<game-name>/` with the standard structure. For a FastAPI game:

```
apps/<game-name>/
  backend/
    app/
      main.py              # FastAPI app, CORS, lifespan, static file serving
      config.py            # Pydantic BaseSettings (DATABASE_URL, JWT_SECRET, etc.)
      database.py          # Async engine + session factory
      models.py            # SQLAlchemy models
      schemas.py           # Pydantic request/response schemas
      routes.py            # REST endpoints
      websocket.py         # WebSocket handler (if real-time)
      logservice.py        # Copy from services/logservice/sdk/python.py
    alembic/               # Database migrations
    alembic.ini
    requirements.txt
    requirements-dev.txt   # pytest, pytest-asyncio, aiosqlite, httpx
    tests/
      conftest.py          # In-memory SQLite fixtures
  frontend/
    src/
      components/          # React components
      services/api.ts      # Typed REST client with auth headers
      types/               # TypeScript types mirroring backend schemas
      hooks/               # useWebSocket, etc.
    package.json
    vite.config.ts         # Proxy /api and /ws to backend
    tsconfig.json
  Dockerfile               # Multi-stage: build frontend, install Python deps, production image
  docker-compose.yml       # Local dev: postgres + backend + frontend
  .env.example
  CLAUDE.md                # Game-specific instructions (see template below)
```

For a Node.js game, follow the telestrations structure (`server/` + `client/`).

#### 2. Write a Dockerfile

Use a multi-stage build. For FastAPI games, follow this pattern:

```dockerfile
# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
ARG GIT_SHA
ENV VITE_GIT_SHA=$GIT_SHA
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Install Python dependencies
FROM python:3.12-slim AS builder
WORKDIR /build
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 3: Production image
FROM python:3.12-slim AS production
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
WORKDIR /app
COPY --from=builder /install /usr/local
COPY backend/ ./backend/
COPY --from=frontend-build /build/dist ./frontend/dist
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser:appuser /app
USER appuser
ENV PYTHONPATH=/app/backend
EXPOSE 8000
CMD ["sh", "-c", "cd /app/backend && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
```

**Important:** The `ENV PYTHONPATH=/app/backend` line is required so that Alembic can find the `app` module when running migrations at container start.

For Node.js games, follow the telestrations Dockerfile pattern (build client, compile server TypeScript, run with `node`).

#### 3. Write a per-game CLAUDE.md

Every game needs its own CLAUDE.md. Include at minimum:

- **Project overview**: One-line description and tech stack
- **Quick start**: Commands to run locally (docker compose or manual)
- **Running tests**: Exact commands for backend and frontend tests
- **Project structure**: Directory tree with brief descriptions of key files
- **Architecture**: Game engine design, state management, WebSocket protocol (if applicable)
- **Environment variables**: All env vars with descriptions
- **Conventions**: Backend and frontend coding patterns, naming conventions, testing patterns

Use `apps/backgammon/CLAUDE.md` as the most complete reference.

#### 4. Update infrastructure files

These files in `infra/` must all be updated:

**`infra/docker-compose.yml`** — Add a service block:
```yaml
  <game-name>:
    build:
      context: ../apps/<game-name>
      args:
        GIT_SHA: ${GIT_SHA}
    environment:
      DATABASE_URL: ${<GAME>_DATABASE_URL}          # If using PostgreSQL
      JWT_SECRET: ${JWT_SECRET}                      # If using auth
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}          # If using Google OAuth
      LOG_SERVICE_URL: http://logservice:3100/api/ingest
      LOG_SERVICE_API_KEY: ${LOG_SERVICE_API_KEY}
    depends_on:
      - postgres                                     # If using PostgreSQL
    logging: *default-logging
    restart: unless-stopped
```
Also add the new service to `caddy.depends_on`.

**`infra/Caddyfile`** — Add a routing block:
```
<subdomain>.games.alanmanderson.com {
    reverse_proxy <game-name>:<port>
}
```

**`infra/init-databases.sql`** — If using PostgreSQL, add:
```sql
CREATE DATABASE <game_name>;
```

**`infra/.env.example`** — Add the game's database URL and any game-specific env vars:
```
<GAME>_DATABASE_URL=postgresql+asyncpg://postgres:changeme@postgres:5432/<game_name>
```

#### 5. Update the landing page

Edit `apps/landing/index.html`:

1. Add an entry to the `games` array with: `name`, `genre`, `desc`, `url` (`https://<subdomain>.games.alanmanderson.com`), `players`, `duration`, `bot` (boolean), `color` (two-color gradient array), `icon` (key into the icons object).
2. Add an SVG icon to the `icons` object. Use a 64x64 viewBox with white fills/strokes to match existing icons.

**Also update `apps/landing/__tests__/landing.test.ts`:**
1. Update the game card count assertions (search for the previous count and increment by 1 — there are two: one for `.card` and one for `.card-icon`).
2. Add the new game to the `expectedGames` array with: `name`, `url`, `players`, `duration`, `hasBot`.

The deploy workflow runs these landing tests before deploying, so failing to update them will block deployment.

#### 6. Update the deploy workflow

**`.github/workflows/deploy.yml`** — The deploy workflow uses per-game change detection. Four places must be updated:

1. **`detect-changes` job outputs** — Add: `<game-name>: ${{ steps.changes.outputs.<game-name> }}`
2. **`detect-changes` paths-filter** — Add a filter block:
   ```yaml
   <game-name>:
     - 'apps/<game-name>/**'
   ```
3. **`deploy` job `if` condition** — Add: `needs.detect-changes.outputs.<game-name> == 'true' ||`
4. **`Determine which services to rebuild` step** — Add: `[ "${{ needs.detect-changes.outputs.<game-name> }}" == "true" ] && SERVICES="$SERVICES <game-name>"`
5. **Compose-diff service lists** (two places in the same step) — Add `<game-name>` to both the `for svc in ...` loop and the fallback `COMPOSE_SERVICES="..."` string.

#### 7. Add DNS record

Add an **A record** in Squarespace DNS for `<subdomain>.games` pointing to the VM's IP address (`20.83.116.73`). Squarespace does not support wildcard DNS records, so each subdomain must be added individually. Use an A record (not CNAME) to match the other games.

#### 8. Update the root CLAUDE.md

Update the Repository Layout, Tech Stacks table, and Deployment Architecture diagram in this file to include the new game.

#### 9. Post-merge: production database and env setup

The `init-databases.sql` file only runs on first PostgreSQL initialization, so for an existing deployment the database must be created manually. After merging:

1. **Create the database** on the VM:
   ```bash
   ssh azureuser@backgammon.games.alanmanderson.com \
     "cd /opt/gamelibrary/infra && docker compose exec -T postgres psql -U postgres -c 'CREATE DATABASE <game_name>;'"
   ```
2. **Add the database URL** to the production `.env`:
   ```bash
   ssh azureuser@backgammon.games.alanmanderson.com \
     "echo '<GAME>_DATABASE_URL=postgresql+asyncpg://postgres:<password>@postgres:5432/<game_name>' >> /opt/gamelibrary/infra/.env"
   ```
   (Use the same password as the other `*_DATABASE_URL` entries in `.env`.)
3. **Restart Caddy** after the first deploy so it provisions the Let's Encrypt TLS certificate for the new subdomain:
   ```bash
   ssh azureuser@backgammon.games.alanmanderson.com \
     "cd /opt/gamelibrary/infra && docker compose restart caddy"
   ```
   A `caddy reload` is not sufficient for a brand-new domain — Caddy needs a full restart to trigger certificate provisioning.
### Internal port conventions

Docker networking isolates containers, so port collisions between games are not possible. By convention:
- **Python backends (FastAPI/Flask)**: port `8000` (FastAPI) or `5000` (Flask/.NET)
- **Node backends**: port `3000` (Fastify) or `8080` (Express)

Pick whichever matches your backend framework. The port only matters inside Docker and in the Caddyfile `reverse_proxy` directive.

## Working in This Repo

1. **Start a worktree** before making any code changes — use the `/worktree-dev` skill to create an isolated git worktree for each development task. This prevents collisions with other agentic sessions working on the same repo.
2. Navigate to the specific game directory under `apps/`
3. Read that game's CLAUDE.md for local dev setup, test commands, and conventions
4. Each game is independently buildable and testable from its own directory
5. Infrastructure changes go in `infra/`; game changes go in `apps/<game>/`
