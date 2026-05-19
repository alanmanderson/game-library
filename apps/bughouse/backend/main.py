"""
Bughouse Chess - FastAPI Application

REST endpoints for game lifecycle and WebSocket endpoint for real-time gameplay.
"""

import asyncio
import json
import logging
import os
import random
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import chess

from engine import SEAT_BOARD_COLOR, BOARD_COLOR_SEAT, SEAT_TEAM, Seat
from manager import GameManager, GameRoom, PlayerSession, SpectatorSession, SEAT_INT_TO_NAME
from models import (
    AddBotRequest,
    AddBotResponse,
    CreateGameRequest,
    CreateGameResponse,
    JoinGameRequest,
    JoinGameResponse,
    WatchGameRequest,
    WatchGameResponse,
    GameInfoResponse,
    GameStatus,
    SeatName,
)
from auth import auth_router, get_optional_user
from auth.database import init_db
from auth.models import User
from logservice import setup_log_service

logger = logging.getLogger(__name__)

# CORS origins from environment variable (comma-separated), default to "*" for dev
ALLOWED_ORIGINS = os.environ.get("CORS_ALLOWED_ORIGINS", "*").split(",")

# Per-room locks to prevent concurrent bot move execution
_bot_locks: dict[str, asyncio.Lock] = {}


# --- Application lifespan ---

async def _periodic_cleanup():
    """Background task that cleans up stale games every 10 minutes."""
    while True:
        await asyncio.sleep(600)
        manager.cleanup_old_games(max_age_seconds=3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    await init_db()
    cleanup_task = asyncio.create_task(_periodic_cleanup())
    yield
    cleanup_task.cancel()


app = FastAPI(
    title="Bughouse Chess",
    description="4-player bughouse chess game server",
    version="1.0.0",
    lifespan=lifespan,
)

setup_log_service(app, service="bughouse")

# CORS - origins controlled via CORS_ALLOWED_ORIGINS env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=ALLOWED_ORIGINS != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global game manager
manager = GameManager()

# Auth routes
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": os.environ.get("GIT_SHA", "dev")[:7]}


# --- Helper functions ---

def build_full_game_state(room: GameRoom) -> dict:
    """Build the full game state dict to send to clients.

    Formats data to match the frontend's expected GameState shape:
    - players as {"0": "Alice", "1": null, ...}
    - status uses "playing" instead of "in_progress"
    - turn as top-level array
    - game_over as {winner, reason} object or null
    - legal_moves/legal_drops as flat top-level arrays
    """
    engine_state = room.engine.get_state()

    # Format players as dict: seat_number -> name_or_null
    players = {}
    for seat_val in range(4):
        seat_enum = Seat(seat_val)
        if seat_enum in room.players:
            players[str(seat_val)] = room.players[seat_enum].name
        else:
            players[str(seat_val)] = None

    # Map status: backend "in_progress" -> frontend "playing"
    status = room.status.value
    if status == "in_progress":
        status = "playing"

    # Build game_over object or null
    game_over = None
    if engine_state["game_over"]:
        game_over = {
            "winner": engine_state["winner"],
            "reason": engine_state["result_reason"],
        }

    # Simplify board state for frontend (fen + last_move only)
    boards = [
        {
            "fen": b["fen"],
            "last_move": b["last_move"],
        }
        for b in engine_state["boards"]
    ]

    return {
        "type": "game_state",
        "game_id": room.game_id,
        "boards": boards,
        "pockets": engine_state["pockets"],
        "players": players,
        "status": status,
        "turn": [
            engine_state["boards"][0]["turn"],
            engine_state["boards"][1]["turn"],
        ],
        "game_over": game_over,
        "legal_moves": (
            engine_state["boards"][0]["legal_moves"]
            + engine_state["boards"][1]["legal_moves"]
        ),
        "legal_drops": (
            engine_state["boards"][0]["legal_drops"]
            + engine_state["boards"][1]["legal_drops"]
        ),
    }


async def broadcast(room: GameRoom, message: dict, exclude_ws: WebSocket = None):
    """Send a JSON message to all connected clients in a room."""
    data = json.dumps(message)
    for ws in room.get_connected_websockets():
        if ws is not exclude_ws:
            try:
                await ws.send_text(data)
            except Exception:
                pass  # Client disconnected, will be cleaned up


async def broadcast_game_state(room: GameRoom):
    """Send full game state to all connected clients."""
    state = build_full_game_state(room)
    data = json.dumps(state)
    for ws in room.get_connected_websockets():
        try:
            await ws.send_text(data)
        except Exception:
            pass


async def check_and_broadcast_game_over(room: GameRoom) -> bool:
    """Check if the game is over and broadcast the result if so.

    Sets room status to FINISHED and broadcasts the game_over message.
    Returns True if the game is over, False otherwise.
    """
    if room.engine.is_game_over():
        room.status = GameStatus.FINISHED
        room.finished_at = time.time()
        await broadcast(room, {
            "type": "game_over",
            "winner": room.engine.winner.value if room.engine.winner else None,
            "reason": room.engine.result_reason.value if room.engine.result_reason else None,
        })
        return True
    return False


async def execute_bot_moves(room: GameRoom):
    """Execute bot moves in a loop until no bot has the current turn or game is over."""
    # Acquire per-room lock to prevent concurrent bot move execution
    if room.game_id not in _bot_locks:
        _bot_locks[room.game_id] = asyncio.Lock()
    lock = _bot_locks[room.game_id]

    async with lock:
        max_iterations = 200
        iterations = 0
        while room.status == GameStatus.IN_PROGRESS and not room.engine.is_game_over():
            iterations += 1
            if iterations > max_iterations:
                logger.warning(
                    "Bot move loop hit max iterations (%d) in game %s",
                    max_iterations, room.game_id,
                )
                break

            bot_moved = False
            for board_index in range(2):
                board = room.engine.boards[board_index]
                seat = BOARD_COLOR_SEAT[(board_index, board.turn)]
                if seat not in room.players:
                    continue
                player = room.players[seat]
                if not player.is_bot:
                    continue

                # Collect legal moves and drops
                legal_moves = room.engine.get_legal_moves(board_index)
                legal_drops = room.engine.get_legal_drops(board_index)
                all_options = legal_moves + legal_drops
                if not all_options:
                    continue

                await asyncio.sleep(0.5)

                chosen = random.choice(all_options)

                try:
                    if "@" in chosen:
                        # Drop move: e.g. "N@e4"
                        piece = chosen[0].lower()
                        square = chosen[2:]
                        room.engine.drop_piece(board_index, piece, square)
                        await broadcast(room, {
                            "type": "piece_dropped",
                            "board": board_index,
                            "piece": piece,
                            "square": square,
                            "seat": player.seat.value,
                            "player": player.name,
                        })
                    else:
                        # Standard move: e.g. "e2e4" or "e7e8q"
                        from_sq = chosen[:2]
                        to_sq = chosen[2:4]
                        promotion = chosen[4] if len(chosen) > 4 else None
                        move_result = room.engine.make_move(board_index, from_sq, to_sq, promotion)
                        await broadcast(room, {
                            "type": "move_made",
                            "board": board_index,
                            "from": from_sq,
                            "to": to_sq,
                            "promotion": promotion,
                            "capture": move_result.get("capture", False),
                            "seat": player.seat.value,
                            "player": player.name,
                        })
                except ValueError:
                    # Move was invalid (race condition, game over, etc.) — try next board
                    bot_moved = True  # Flag so outer loop retries
                    continue

                await broadcast_game_state(room)

                if await check_and_broadcast_game_over(room):
                    return

                bot_moved = True
                break  # Re-check both boards from the top after each move

            if not bot_moved:
                break


def validate_player_turn(room: GameRoom, session: PlayerSession, board_index: int):
    """
    Validate that this player can act on this board and it is their turn.

    Raises ValueError with a descriptive message if validation fails.
    """
    # Check game status first — no point validating board/turn for a non-active game
    if room.status != GameStatus.IN_PROGRESS:
        raise ValueError(
            f"Game is not in progress (status: {room.status.value})."
        )

    seat = session.seat
    player_board, player_color = SEAT_BOARD_COLOR[seat]

    if board_index != player_board:
        raise ValueError(
            f"You are seated on board {player_board}, "
            f"not board {board_index}."
        )

    board = room.engine.boards[board_index]
    if board.turn != player_color:
        raise ValueError("It is not your turn.")


# --- REST Endpoints ---

@app.post("/api/games", response_model=CreateGameResponse)
async def create_game(
    request: CreateGameRequest,
    user: Optional[User] = Depends(get_optional_user),
):
    """Create a new bughouse game and join as the first player."""
    player_name = user.display_name if user else request.player_name
    room, session = manager.create_game(
        player_name=player_name,
        preferred_seat=request.preferred_seat,
        user_id=user.id if user else None,
    )
    return CreateGameResponse(
        game_id=room.game_id,
        player_token=session.token,
        seat=session.seat.value,
        player_name=session.name,
    )


@app.get("/api/games")
async def list_games():
    """List games that are waiting for players."""
    rooms = [r for r in manager.games.values() if r.status == GameStatus.WAITING]
    result = []
    for room in rooms:
        players = {}
        for seat_val in range(4):
            seat_enum = Seat(seat_val)
            if seat_enum in room.players:
                players[str(seat_val)] = room.players[seat_enum].name
            else:
                players[str(seat_val)] = None
        result.append({
            "game_id": room.game_id,
            "status": room.status.value,
            "player_count": room.player_count,
            "players": players,
            "created_at": room.created_at,
        })
    return result


@app.get("/api/games/{game_id}", response_model=GameInfoResponse)
async def get_game(game_id: str):
    """Get game info."""
    room = manager.get_game(game_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Game not found.")
    return room.to_info()


@app.post("/api/games/{game_id}/join", response_model=JoinGameResponse)
async def join_game(
    game_id: str,
    request: JoinGameRequest,
    user: Optional[User] = Depends(get_optional_user),
):
    """Join an existing game as a player."""
    # Check room existence first for a proper 404
    room = manager.get_game(game_id)
    if room is None:
        raise HTTPException(status_code=404, detail=f"Game {game_id} not found.")

    try:
        player_name = user.display_name if user else request.player_name
        room, session = manager.join_game(
            game_id=game_id,
            player_name=player_name,
            preferred_seat=request.preferred_seat,
            user_id=user.id if user else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Notify existing connections about the new player
    join_msg = {
        "type": "player_joined",
        "seat": session.seat.value,
        "player_name": session.name,
    }
    await broadcast(room, join_msg)

    # If game just started (all 4 players), notify everyone
    if room.status == GameStatus.IN_PROGRESS:
        await broadcast(room, {"type": "game_started"})
        await broadcast_game_state(room)

    return JoinGameResponse(
        game_id=room.game_id,
        player_token=session.token,
        seat=session.seat.value,
        player_name=session.name,
    )


@app.post("/api/games/{game_id}/watch", response_model=WatchGameResponse)
async def watch_game(game_id: str, request: WatchGameRequest):
    """Join a game as a spectator."""
    try:
        room, session = manager.watch_game(
            game_id=game_id,
            spectator_name=request.spectator_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Notify about spectator
    await broadcast(room, {
        "type": "spectator_joined",
        "count": room.spectator_count,
    })

    return WatchGameResponse(
        game_id=room.game_id,
        spectator_token=session.token,
        spectator_name=session.name,
    )


@app.post("/api/games/{game_id}/add-bot", response_model=AddBotResponse)
async def add_bot(game_id: str, request: AddBotRequest):
    """Add a bot player to an empty seat.

    Design note: No auth check is required here. The room.add_bot() call
    already enforces that the game must be in WAITING status and not full,
    which prevents griefing of in-progress games. Requiring a player token
    would break backwards compatibility with the UI.
    """
    room = manager.get_game(game_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Game not found.")

    try:
        session = room.add_bot(preferred_seat=request.seat)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Notify existing connections
    await broadcast(room, {
        "type": "player_joined",
        "seat": session.seat.value,
        "player_name": session.name,
    })

    if room.status == GameStatus.IN_PROGRESS:
        await broadcast(room, {"type": "game_started"})
        await broadcast_game_state(room)
        # Trigger bot moves if it's a bot's turn
        await execute_bot_moves(room)
    else:
        await broadcast_game_state(room)

    return AddBotResponse(
        seat=session.seat.value,
        player_name=session.name,
    )


# --- WebSocket Endpoint ---

@app.websocket("/ws/{game_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    game_id: str,
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time game communication.

    Connect with: ws://host/ws/{game_id}?token={player_or_spectator_token}
    """
    room = manager.get_game(game_id)
    if room is None:
        await websocket.close(code=4004, reason="Game not found.")
        return

    # Authenticate: check if token belongs to a player or spectator
    player_session = room.get_player_by_token(token)
    spectator_session = room.get_spectator_by_token(token) if not player_session else None

    if player_session is None and spectator_session is None:
        await websocket.close(code=4001, reason="Invalid token.")
        return

    await websocket.accept()

    # Register the WebSocket connection
    is_player = player_session is not None
    if is_player:
        # Close old WebSocket if player is already connected (duplicate connection)
        if player_session.connected and player_session.websocket is not None:
            try:
                await player_session.websocket.close(code=4008, reason="Replaced by new connection.")
            except Exception:
                pass  # Old socket may already be dead
        player_session.connected = True
        player_session.websocket = websocket
    else:
        # Close old WebSocket if spectator is already connected
        if spectator_session.connected and spectator_session.websocket is not None:
            try:
                await spectator_session.websocket.close(code=4008, reason="Replaced by new connection.")
            except Exception:
                pass
        spectator_session.connected = True
        spectator_session.websocket = websocket

    try:
        # Send initial full game state
        state = build_full_game_state(room)
        await websocket.send_text(json.dumps(state))

        # Message loop
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON.",
                }))
                continue

            msg_type = data.get("type")

            # Spectators cannot send game actions
            if not is_player:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Spectators cannot perform actions.",
                }))
                continue

            if msg_type == "move":
                await handle_move(room, player_session, websocket, data)
            elif msg_type == "drop":
                await handle_drop(room, player_session, websocket, data)
            elif msg_type == "resign":
                await handle_resign(room, player_session, websocket)
            else:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                }))

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket error in game %s", game_id)
    finally:
        # Clean up connection state
        if is_player:
            player_session.connected = False
            player_session.websocket = None
            # Notify others
            try:
                await broadcast(room, {
                    "type": "player_left",
                    "seat": player_session.seat.value,
                })
            except Exception:
                pass
        else:
            spectator_session.connected = False
            spectator_session.websocket = None


async def handle_move(
    room: GameRoom,
    session: PlayerSession,
    websocket: WebSocket,
    data: dict,
):
    """Handle a standard chess move from a player."""
    board_index = data.get("board")
    from_sq = data.get("from")
    to_sq = data.get("to")
    promotion = data.get("promotion")

    if board_index is None or from_sq is None or to_sq is None:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Move requires 'board', 'from', and 'to' fields.",
        }))
        return

    try:
        validate_player_turn(room, session, board_index)
        move_result = room.engine.make_move(
            board_index, from_sq, to_sq, promotion
        )
    except ValueError as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": str(e),
        }))
        return

    # Broadcast the move to all connected clients
    move_msg = {
        "type": "move_made",
        "board": board_index,
        "from": from_sq,
        "to": to_sq,
        "promotion": promotion,
        "capture": move_result.get("capture", False),
        "seat": session.seat.value,
        "player": session.name,
    }
    await broadcast(room, move_msg)

    # Send updated game state to everyone
    await broadcast_game_state(room)

    # Check for game over
    if await check_and_broadcast_game_over(room):
        return

    # Trigger bot moves if next turn is a bot
    await execute_bot_moves(room)


async def handle_drop(
    room: GameRoom,
    session: PlayerSession,
    websocket: WebSocket,
    data: dict,
):
    """Handle a piece drop from a player's pocket."""
    board_index = data.get("board")
    piece = data.get("piece")
    square = data.get("square")

    if board_index is None or piece is None or square is None:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Drop requires 'board', 'piece', and 'square' fields.",
        }))
        return

    try:
        validate_player_turn(room, session, board_index)
        drop_result = room.engine.drop_piece(board_index, piece, square)
    except ValueError as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": str(e),
        }))
        return

    # Broadcast the drop
    drop_msg = {
        "type": "piece_dropped",
        "board": board_index,
        "piece": piece,
        "square": square,
        "seat": session.seat.value,
        "player": session.name,
    }
    await broadcast(room, drop_msg)

    # Send updated game state
    await broadcast_game_state(room)

    # Check for game over
    if await check_and_broadcast_game_over(room):
        return

    # Trigger bot moves if next turn is a bot
    await execute_bot_moves(room)


async def handle_resign(
    room: GameRoom,
    session: PlayerSession,
    websocket: WebSocket,
):
    """Handle a player resignation."""
    try:
        result = room.engine.resign(session.seat.value)
    except ValueError as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": str(e),
        }))
        return

    room.status = GameStatus.FINISHED
    room.finished_at = time.time()

    await broadcast(room, {
        "type": "game_over",
        "winner": result["winner"],
        "reason": result["reason"],
        "resigned_seat": session.seat.value,
    })

    await broadcast_game_state(room)


# --- Static Files (serve frontend in production) ---

FRONTEND_BUILD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend",
    "build",
)

if os.path.isdir(FRONTEND_BUILD_DIR):
    app.mount(
        "/",
        StaticFiles(directory=FRONTEND_BUILD_DIR, html=True),
        name="frontend",
    )
