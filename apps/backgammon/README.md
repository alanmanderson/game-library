# Backgammon Online

Real-time multiplayer backgammon with bot opponents, Google OAuth, and match statistics.

**Live:** [backgammon.alanmanderson.com](https://backgammon.alanmanderson.com)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async) |
| Database | PostgreSQL 16 |
| Real-time | WebSocket |
| Auth | JWT, bcrypt, Google OAuth, guest mode |
| Infra | Docker Compose, Caddy, Terraform (Azure) |

## Quick Start

```bash
cp .env.example .env   # edit with real values
docker compose up -d --wait
```

Frontend: http://localhost:5173 | Backend: http://localhost:8000

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | HMAC key for JWT signing |
| `POSTGRES_PASSWORD` | Yes | Database password |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `DATABASE_URL` | No | AsyncPG connection string (set automatically in Docker) |
| `ALLOWED_ORIGINS` | No | CORS origins (default: `http://localhost:5173`) |

## Running Tests

```bash
# Backend
cd backend && pip install -r requirements-dev.txt && pytest

# Frontend
cd frontend && npm install && npm run test:run
```

## Project Structure

```
backend/
  app/
    api/              # REST + WebSocket endpoints
    services/         # Game manager, auth, bot AI, stats
    game_engine.py    # Pure Python backgammon rules engine
    models.py         # SQLAlchemy models
    schemas.py        # Pydantic request/response schemas
  alembic/            # Database migrations
  tests/              # pytest-asyncio tests (in-memory SQLite)
frontend/
  src/
    components/       # React components
    hooks/            # WebSocket hook with auto-reconnect
    services/         # REST API client
    types/            # TypeScript types
infra/                # Terraform (Azure VM, networking)
```

## Deployment

Pushes to `main` automatically deploy via GitHub Actions. The workflow runs tests, builds the frontend and Docker image, then transfers everything to the Azure VM via SSH.

Manual deploy: `./deploy.sh`

## WebSocket Protocol

Connect to `/ws/{table_id}/{player_id}?token=JWT`

**Client sends:** `roll`, `move {from_point, to_point}`, `end_turn`, `undo_move`, `double`, `accept_double`, `reject_double`

**Server sends:** `game_state`, `dice_rolled`, `move_made`, `turn_ended`, `game_over`, `error`, `waiting`, `player_joined`, `opponent_disconnected`

## License

Private project.
