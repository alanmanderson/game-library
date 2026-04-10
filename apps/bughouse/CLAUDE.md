# Bughouse Chess

4-player bughouse chess web app: two boards, two teams, captured pieces transfer to your partner's pocket.

## Tech Stack

- **Backend**: Python 3.12, FastAPI, python-chess (CrazyhouseBoard), SQLAlchemy (async), JWT auth
- **Frontend**: React 19, TypeScript, react-router-dom, Create React App
- **Database**: SQLite (dev), PostgreSQL 16 (prod/docker)
- **Infra**: Docker multi-stage build, docker-compose, Terraform (Azure)

## Project Structure

```
backend/
  main.py          # FastAPI app, REST endpoints, WebSocket handler
  engine.py        # Bughouse game engine (2 CrazyhouseBoards + capture transfer)
  manager.py       # Game room management, player/spectator sessions
  models.py        # Pydantic request/response models
  tests.py         # Pytest tests (engine, manager, API)
  auth/            # Auth module (register, login, Google OAuth, JWT)
frontend/src/
  components/      # Lobby, GameView, Board, Pocket, AuthModal, UserMenu, SeatPicker
  contexts/        # AuthContext
  hooks/           # useWebSocket
  types.ts         # Shared TypeScript types
terraform/         # Azure infrastructure
```

## Common Commands

### Backend
```bash
cd backend
pip install -r requirements.txt          # install deps (or use uv)
pytest tests.py -v                       # run tests
python -m uvicorn main:app --port 8000   # run dev server
```

### Frontend
```bash
cd frontend
npm ci                  # install deps
npm start               # dev server (proxies API to localhost:8000)
npm run build           # production build
npm test                # run tests
```

### Full Stack (local)
```bash
./start.sh              # runs backend on port 8000 (serves built frontend too)
```

### Docker
```bash
docker compose up --build   # app on :8000, postgres on :5432
```

## Game Model

- **4 seats**: 0 (Board A White), 1 (Board A Black), 2 (Board B White), 3 (Board B Black)
- **Teams**: A = seats 0+3, B = seats 1+2 (partners are on different boards)
- **Captures transfer** to partner's pocket on the other board
- Game starts when all 4 seats are filled; ends on checkmate or resignation

## Key Environment Variables

- `BUGHOUSE_DATABASE_URL` - DB connection string (defaults to SQLite `bughouse.db` in dev)
- `BUGHOUSE_JWT_SECRET_KEY` - JWT signing key
- `BUGHOUSE_GOOGLE_CLIENT_ID` / `BUGHOUSE_GOOGLE_CLIENT_SECRET` - Google OAuth
- `CORS_ALLOWED_ORIGINS` - comma-separated allowed origins (defaults to `*`)
- `BUGHOUSE_ENV` - set to `development` for SQLite, otherwise expects PostgreSQL

## WebSocket Protocol

Connect: `ws://host/ws/{game_id}?token={token}`

Client messages: `move` (board, from, to, promotion), `drop` (board, piece, square), `resign`
Server messages: `game_state`, `move_made`, `piece_dropped`, `game_over`, `player_joined`, `error`

## Testing

Backend tests cover engine logic, manager operations, and API endpoints. Run with `pytest tests.py` from the `backend/` directory. Tests use `BUGHOUSE_ENV=development` (SQLite).
