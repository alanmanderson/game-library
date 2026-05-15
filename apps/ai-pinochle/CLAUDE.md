# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An AI-powered Pinochle card game. Tech stack: **React Native** (mobile, iOS + Android), **React** (web), **Python/FastAPI** (server).

## Repository Structure

```
ai-pinochle/
├── server/          # Python/FastAPI backend
│   └── app/
│       ├── api/         # REST routes (/auth, /games)
│       ├── websocket/   # WebSocket handlers + connection manager
│       ├── engine/      # Game engine (deck, meld, tricks, scoring)
│       ├── models/      # SQLAlchemy ORM models (users, games)
│       ├── config.py    # App settings (secrets, DB URL, Google client ID)
│       ├── database.py  # Async SQLAlchemy session setup
│       └── main.py      # FastAPI app entrypoint
├── mobile/          # React Native app (iOS + Android)
│   └── src/
├── web/             # React web client
│   └── src/
├── shared/          # @pinochle/shared — TypeScript types for mobile + web
│   └── src/
│       ├── types/       # WebSocket event/payload types, card types
│       └── constants/   # Card ranks/suits, game phase names, meld values
├── docs/            # Project documentation (design.md, RULES.md)
├── public/          # Card image assets (web-served; mobile loads via URL)
└── package.json     # npm workspaces root (mobile, web, shared)
```

The `shared/` package is TypeScript-only. The Python server and JS clients share no runtime code.

## Card Assets

Card images live in `public/img/` with the naming convention `{Rank}{Suit}.png`, matching the server's card codes:
- Ranks: `9`, `10`, `J`, `K`, `Q`, `A`
- Suits: `C` (clubs), `D` (diamonds), `H` (hearts), `S` (spades)

Example: `public/img/AC.png` = Ace of Clubs, `public/img/10S.png` = Ten of Spades. A `back.svg` is also available for face-down cards. All 24 unique Pinochle cards are present.

Each PNG also has `.avif` and `.webp` siblings (pre-encoded, committed to the repo). The web client uses `<picture>` to serve AVIF first, WebP second, PNG as legacy fallback (see `web/src/game/CardImage.tsx`). Mobile loads `.webp` directly. To regenerate the encoded variants after changing a PNG, run `npm run optimize-cards` from the repo root.

## Design Decisions

Refer to `docs/design.md` for all architectural and design decisions. It is the source of truth for:
- System architecture (thin client / authoritative server model)
- Database schema (PostgreSQL tables: `users`, `games`; all game state in `current_state_json`)
- Game engine state machine phases: `LOBBY_WAITING` → `BIDDING` → `NAMING_TRUMP` → `PASSING_CARDS` → `SHOWING_MELD` → `TRICK_PLAYING` → `HAND_COMPLETE` → loops
- REST API endpoints and WebSocket message contracts (8 actions, 19 events)
- State persistence (PostgreSQL JSON, no Redis) and reconnect behavior

When making implementation choices (data modeling, API shape, WebSocket events, state transitions), consult `docs/design.md` first and stay consistent with the contracts defined there.

## Code Style

- Keep files short and focused. Split into more files rather than letting any single file grow large.
- Keep functions simple and easy to follow.
- Avoid unnecessary abstractions — prefer straightforward, direct code over layers of indirection. The overall design should stay simple.

## Development Workflows

### Server (Python/FastAPI)

```bash
cd server
source .venv/bin/activate          # Always activate venv first
pip install -e ".[dev]"            # Install with dev dependencies
uvicorn app.main:app --reload      # Run dev server on :8000
```

- Python 3.12+, managed with `uv` (lockfile: `server/uv.lock`)
- Config via env vars or `.env` file (see `app/config.py`): `DATABASE_URL`, `SECRET_KEY`, `GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS`
- `DATABASE_URL` uses `postgresql+asyncpg://` (async); Alembic auto-converts to sync `postgresql://`

### Web (React/Vite)

```bash
npm install                        # From repo root (workspaces)
npm run build --workspace=web      # Build for production → web/dist/
npm run dev --workspace=web        # Dev server with HMR
```

- `shared/` has no build step — its `main` points directly to `src/index.ts`
- Vite resolves `@pinochle/shared` via npm workspaces

### Running Tests

```bash
cd server && source .venv/bin/activate
python -m pytest                   # Run all tests
python -m pytest tests/test_scoring.py  # Run specific file
python -m pytest -x               # Stop on first failure
```

- Tests use in-memory SQLite (not PostgreSQL) — see `tests/conftest.py`
- `asyncio_mode = "auto"` in `pyproject.toml` — async tests need no decorator
- SQLAlchemy model defaults are patched for SQLite compatibility in conftest
- WebSocket tests use Starlette's `TestClient` (sync) via the `sync_client` fixture

### Database Migrations (Alembic)

```bash
cd server && source .venv/bin/activate
alembic upgrade head               # Apply all migrations
alembic revision --autogenerate -m "description"  # Create new migration
```

- Alembic reads `DATABASE_URL` env var (set it before running)
- `alembic/env.py` converts `postgresql+asyncpg://` to `postgresql://` and `?ssl=require` to `?sslmode=require` for psycopg2

## Deployment

### Current Production

- **Cloud**: Azure (Visual Studio Enterprise subscription `1a020407-...`)
- **Region**: Canada Central (`canadacentral`)
- **VM**: `vm-pinochle` (Standard_B2s_v2, Ubuntu 24.04), IP: `20.151.4.179`
- **Database**: PostgreSQL 16 Flexible Server (`psql-pinochle-vs`, private networking)
- **Domain**: `pinochle.alanmanderson.com`
- **SSH**: `ssh -i ~/.ssh/id_ed25519 azureuser@20.151.4.179`

### Deployment Architecture

```
Internet → Caddy (:80/:443) → FastAPI (:8000) → PostgreSQL (private subnet)
                ↓
          Static SPA files (/srv/web)
```

- **Docker Compose**: `fastapi` (app) + `caddy` (reverse proxy/TLS)
- **Caddy**: Auto-HTTPS via Let's Encrypt, routes `/auth/*`, `/games/*`, `/ws/*` to FastAPI, serves SPA for everything else
- App files live at `/opt/pinochle/` on the VM
- `.env` file at `/opt/pinochle/.env` (created by cloud-init or manually)
- `server/entrypoint.sh` runs `alembic upgrade head` then starts Uvicorn

### Infrastructure (Terraform / Azure CLI)

Terraform configs are in `infra/` but the actual deployment was done via **Azure CLI** due to an azurerm 4.x provider bug (reads resources from wrong subscription during refresh). The Terraform files still serve as documentation of the desired state.

Key Azure resources: Resource Group (`rg-pinochle`), VNet (`vnet-pinochle`, 10.0.0.0/16), VM subnet + PostgreSQL delegated subnet, NSG (SSH/HTTP/HTTPS), Private DNS zone, Static Public IP.

### Deploy Updates

To redeploy application code to the VM:
```bash
# Build web frontend
npm run build --workspace=web

# Copy files to VM
scp -i ~/.ssh/id_ed25519 -r web/dist azureuser@20.151.4.179:/opt/pinochle/web-dist
scp -i ~/.ssh/id_ed25519 -r server azureuser@20.151.4.179:/opt/pinochle/server
scp -i ~/.ssh/id_ed25519 Dockerfile docker-compose.yml Caddyfile azureuser@20.151.4.179:/opt/pinochle/

# Rebuild and restart on VM
ssh -i ~/.ssh/id_ed25519 azureuser@20.151.4.179 \
  "cd /opt/pinochle && docker build -t pinochle-server:latest . && docker compose up -d"
```

## Redis for WebSocket fan-out

The server supports horizontal scaling via an optional Redis pub/sub broker
(`server/app/websocket/broker.py`). When `REDIS_URL` is set (e.g.
`redis://redis:6379/0`), every room broadcast is published to Redis and
delivered to other app instances that have local subscribers in the same
room; ref-counted SUBSCRIBE/UNSUBSCRIBE means only active rooms incur
traffic. When `REDIS_URL` is unset the server falls back to in-process
broadcast — tests and local dev don't require Redis.

## Branding

Branding tokens live in `shared/src/tokens.ts` and mirror the CSS vars in `web/src/index.css` — keep in sync. Any color, font, radius, shadow, or spacing change must be made in both places. Mobile (`StyleSheet`) consumes the `tokens` object directly; web consumes the CSS custom properties.

## Pinochle Rules Reference

This game implements **4-player partnership Pinochle** (North/South vs East/West). Standard double-deck: 48 cards (two copies each of 9, 10, J, Q, K, A in all four suits). See `docs/RULES.md` for full rules and `docs/design.md` Section 3 for meld values, scoring, and legal card rules as implemented.
