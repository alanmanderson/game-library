# Sneaky Sabotage

Mobile-first multiplayer party game combining social deduction with cooperative puzzle solving. Players decode cryptic puzzles together while a hidden Saboteur tries to mislead the team. Based on the physical board game by Finders Seekers.

## Quick Start

```bash
# Local dev (requires Docker)
cp .env.example .env
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
- **Frontend**: React 18, TypeScript, Vite
- **Database**: PostgreSQL 16 (asyncpg driver)
- **Real-time**: WebSocket at `/ws/{game_id}/{player_id}?token=SESSION`

## Environment Variables

- `DATABASE_URL` — AsyncPG connection string (set automatically in Docker)
- `ALLOWED_ORIGINS` — CORS origins (default: `http://localhost:5173`)

## Project Structure

```
backend/
  app/
    main.py              # FastAPI app setup, CORS, static file serving
    config.py            # Pydantic Settings (DATABASE_URL, ALLOWED_ORIGINS)
    database.py          # Async engine + session factory
    models.py            # SQLAlchemy: Game, Player, Round, PlayerRole, Vote
    schemas.py           # Pydantic request/response schemas
    routes.py            # REST: create game, join game, get game info
    websocket.py         # WebSocket handler + ConnectionManager
    game_engine.py       # Core game logic: roles, scoring, state transitions
    puzzle_loader.py     # Load puzzles from JSON, random selection
    logservice.py        # Centralized logging SDK
  alembic/               # Database migrations
  puzzles/
    puzzles.json         # 30+ puzzles of various types
  tests/                 # pytest-asyncio tests (SQLite in-memory)
frontend/
  src/
    components/          # React components for each game phase
      styles/            # Per-component CSS files
    hooks/
      useWebSocket.ts    # WebSocket with auto-reconnect
    services/api.ts      # REST client
    types/game.ts        # TypeScript interfaces
Dockerfile               # Multi-stage: build frontend, install Python deps
docker-compose.yml        # Local dev: postgres + backend + frontend
```

## Architecture

### Game Flow
1. **Lobby** — Host creates game (6-char code), players join on their phones
2. **Role Reveal** — Roles secretly assigned: Agent, Saboteur, Insider (one card discarded like physical game)
3. **Puzzle Solving** — Timer counts down, team decodes puzzle cooperatively
4. **Voting** — Everyone votes for who they think is the Saboteur
5. **Saboteur Guess** — Revealed Saboteur guesses the Insider
6. **Scoring** — Points tallied, then next round (4 rounds total)

### Roles
- **Agent** — Solve the puzzle and identify the Saboteur
- **Saboteur** — Sees the hint, subtly misleads the team. Scores when puzzle is wrong.
- **Insider** — Sees the hint, subtly helps the team. Loses points if Saboteur identifies them.

One role card is always discarded unseen, so any role might be absent in a given round.

### Scoring
| Event | Who Scores | Points |
|-------|-----------|--------|
| Puzzle correct | Each Agent & Insider | +10 |
| Puzzle wrong | Saboteur | +10 |
| Correctly ID Saboteur | Voter | +3 |
| Wrong Saboteur vote | Saboteur | +2 per wrong vote |
| Saboteur finds Insider | Saboteur +5, Insider -5 | |

### Puzzle Types
Puzzles are stored as JSON in `backend/puzzles/puzzles.json`. Types include: caesar_cipher, number_code, anagram, reverse_message, first_letters, keyboard_shift, missing_vowels, morse_code, letter_math, word_chain.

### WebSocket Protocol
Client sends: `start_game`, `ready`, `propose_answer`, `vote_answer`, `vote_saboteur`, `saboteur_guess`, `next_round`, `chat`, `update_settings`, `kick_player`.

Server sends: `game_state`, `role_assigned`, `puzzle_start`, `timer_update`, `answer_proposed`, `answer_result`, `voting_phase`, `votes_revealed`, `round_results`, `game_over`, `chat`, `error`.

### No Auth Required
This is a party game — players just enter a name to join. A simple session token (UUID) is used for WebSocket reconnection. No accounts, no passwords, no OAuth.

## Deployment

Production domain: `sabotage.games.alanmanderson.com`

The game is included in the shared `infra/docker-compose.yml` and routes through Caddy. Uses the shared PostgreSQL instance with database `sneaky_sabotage`.

## Conventions

### Backend
- All database calls use `AsyncSession` — never use sync SQLAlchemy
- Alembic for all schema changes
- Game IDs: 6-char uppercase alphanumeric (no I/O/0/1). Player IDs: UUIDs.
- Backend tests use in-memory SQLite via fixtures in `conftest.py`
- Game state managed via WebSocket; REST only for create/join/info

### Frontend
- Mobile-first design — all components optimized for phone screens
- Dark spy-themed aesthetic with CSS variables
- Per-component CSS files in `components/styles/`
- Session stored in localStorage key `sneaky_sabotage_session`
- Minimum 44px touch targets for all interactive elements
