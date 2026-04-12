"""WebSocket handler for real-time backgammon game play."""

import json
import logging
from typing import Optional

import jwt
from fastapi import WebSocket, WebSocketDisconnect

from app.config import settings
from app.database import async_session
from app.models import Player, Table
from app.game_engine import GameStatus
from app.services.game_service import game_manager
from app.services.bot_service import (
    is_bot_game, is_bot_player, schedule_bot_turn_if_needed,
    schedule_bot_double_response_if_needed, restore_bot_difficulty,
)

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections organized by table and player.

    Supports per-player messaging for personalized game state delivery,
    table-wide broadcasts, graceful disconnect notifications, and spectator
    connections that receive read-only game state updates.
    """

    def __init__(self) -> None:
        # table_id -> {player_id: WebSocket}
        self._connections: dict[str, dict[str, WebSocket]] = {}
        # table_id -> [WebSocket]  (spectators, tracked by object identity)
        self._spectators: dict[str, list[WebSocket]] = {}

    async def connect(self, table_id: str, player_id: str, ws: WebSocket) -> None:
        """Accept a WebSocket connection and register it for a table/player.

        If the player is reconnecting (replacing an existing connection),
        the opponent is notified.
        """
        await ws.accept()
        if table_id not in self._connections:
            self._connections[table_id] = {}

        self._connections[table_id][player_id] = ws

        # Notify opponent of reconnection
        failed = []
        for pid, conn in self._connections[table_id].items():
            if pid != player_id:
                try:
                    await conn.send_json({"type": "opponent_reconnected", "data": {}})
                except (ConnectionError, RuntimeError) as e:
                    logger.warning(f"Failed to send to player {pid}: {e}")
                    failed.append(pid)
        for pid in failed:
            self.disconnect(table_id, pid)

    def disconnect(self, table_id: str, player_id: str) -> None:
        """Remove a player's WebSocket connection from the registry."""
        if table_id in self._connections:
            self._connections[table_id].pop(player_id, None)
            if not self._connections[table_id]:
                del self._connections[table_id]

    async def connect_spectator(self, table_id: str, ws: WebSocket) -> None:
        """Accept a spectator WebSocket connection for a table."""
        await ws.accept()
        if table_id not in self._spectators:
            self._spectators[table_id] = []
        self._spectators[table_id].append(ws)

    def disconnect_spectator(self, table_id: str, ws: WebSocket) -> None:
        """Remove a spectator WebSocket connection from the registry."""
        if table_id in self._spectators:
            try:
                self._spectators[table_id].remove(ws)
            except ValueError:
                pass
            if not self._spectators[table_id]:
                del self._spectators[table_id]

    def get_spectator_count(self, table_id: str) -> int:
        """Return the number of spectators currently watching a table."""
        return len(self._spectators.get(table_id, []))

    async def broadcast_to_spectators(self, table_id: str, message: dict) -> None:
        """Send a JSON message to all spectators at a table."""
        spectators = list(self._spectators.get(table_id, []))
        failed = []
        for ws in spectators:
            try:
                await ws.send_json(message)
            except (ConnectionError, RuntimeError) as e:
                logger.warning(f"Failed to send to spectator at table {table_id}: {e}")
                failed.append(ws)
        for ws in failed:
            self.disconnect_spectator(table_id, ws)

    async def send_to_player(
        self, table_id: str, player_id: str, message: dict
    ) -> None:
        """Send a JSON message to a specific player at a table."""
        conns = self._connections.get(table_id, {})
        ws = conns.get(player_id)
        if ws:
            try:
                await ws.send_json(message)
            except (ConnectionError, RuntimeError) as e:
                logger.warning(f"Failed to send to player {player_id}: {e}")
                self.disconnect(table_id, player_id)

    async def broadcast_to_table(
        self, table_id: str, message: dict, exclude: Optional[str] = None
    ) -> None:
        """Send a JSON message to all connected players at a table.

        Optionally exclude one player (e.g. the sender).
        """
        conns = self._connections.get(table_id, {})
        failed = []
        for pid, ws in conns.items():
            if pid != exclude:
                try:
                    await ws.send_json(message)
                except (ConnectionError, RuntimeError) as e:
                    logger.warning(f"Failed to send to player {pid}: {e}")
                    failed.append(pid)
        for pid in failed:
            self.disconnect(table_id, pid)

    async def notify_opponent_disconnect(
        self, table_id: str, player_id: str
    ) -> None:
        """Notify the opponent that a player has disconnected."""
        conns = self._connections.get(table_id, {})
        failed = []
        for pid, ws in conns.items():
            if pid != player_id:
                try:
                    await ws.send_json({"type": "opponent_disconnected", "data": {}})
                except (ConnectionError, RuntimeError) as e:
                    logger.warning(f"Failed to send to player {pid}: {e}")
                    failed.append(pid)
        for pid in failed:
            self.disconnect(table_id, pid)

    def get_player_ids(self, table_id: str) -> list[str]:
        """Return a list of currently connected player IDs for a table."""
        return list(self._connections.get(table_id, {}).keys())

    async def close_all(self) -> None:
        """Gracefully close all WebSocket connections and clear the registry."""
        for table_id in list(self._connections.keys()):
            for player_id in list(self._connections[table_id].keys()):
                try:
                    ws = self._connections[table_id][player_id]
                    await ws.close(code=1001, reason="Server shutting down")
                except Exception:
                    pass
        self._connections.clear()
        for table_id in list(self._spectators.keys()):
            for ws in list(self._spectators[table_id]):
                try:
                    await ws.close(code=1001, reason="Server shutting down")
                except Exception:
                    pass
        self._spectators.clear()

    def connection_count(self) -> int:
        """Return the total number of active WebSocket connections across all tables."""
        player_count = sum(len(players) for players in self._connections.values())
        spectator_count = sum(len(specs) for specs in self._spectators.values())
        return player_count + spectator_count


# Global singleton connection manager
manager = ConnectionManager()


async def _build_full_message(table_id: str, player_id: str, msg_type: str = "game_state", db=None) -> dict:
    """Build a full WebSocket message with game_state, your_color, and table info.

    If *db* is provided, reuse that session (to see uncommitted changes).
    Otherwise a fresh session is opened.
    """
    state = game_manager.build_game_state_response(table_id, player_id)
    color = game_manager.get_player_color(table_id, player_id)

    async def _build_table_data(session):
        table = await session.get(Table, table_id)
        if not table:
            return None
        white_player = await session.get(Player, table.white_player_id) if table.white_player_id else None
        black_player = await session.get(Player, table.black_player_id) if table.black_player_id else None
        # Get live time remaining from in-memory state
        white_time_ms, black_time_ms = game_manager.get_time_remaining(table_id)
        return {
            "id": table.id,
            "status": table.status,
            "white_player": {
                "id": white_player.id,
                "nickname": white_player.nickname,
                "created_at": str(white_player.created_at),
                "rating": white_player.rating,
                "rating_games": white_player.rating_games,
            } if white_player else None,
            "black_player": {
                "id": black_player.id,
                "nickname": black_player.nickname,
                "created_at": str(black_player.created_at),
                "rating": black_player.rating,
                "rating_games": black_player.rating_games,
            } if black_player else None,
            "created_at": str(table.created_at),
            "match_points": table.match_points,
            "white_match_score": table.white_match_score,
            "black_match_score": table.black_match_score,
            "bot_difficulty": table.bot_difficulty,
            "time_control": table.time_control,
            "white_time_remaining_ms": white_time_ms,
            "black_time_remaining_ms": black_time_ms,
            "spectator_count": manager.get_spectator_count(table_id),
        }

    if db is not None:
        table_data = await _build_table_data(db)
    else:
        async with async_session() as fresh_db:
            table_data = await _build_table_data(fresh_db)

    return {
        "type": msg_type,
        "data": {
            "game_state": state,
            "your_color": color.value if color else None,
            "table": table_data,
        },
    }


async def _build_spectator_message(table_id: str, msg_type: str = "game_state", db=None) -> dict:
    """Build a game state WebSocket message for spectators.

    Spectators receive full board state but with no valid_moves and
    your_color set to null (they are not participants).
    If *db* is provided, reuse that session; otherwise opens a fresh one.
    """
    # Spectators get the same board state as a non-current-turn player
    # (empty valid_moves). We reuse build_game_state_response with a
    # sentinel player_id that has no registered color.
    state = game_manager.build_game_state_response(table_id, "")
    # Ensure valid_moves is empty for spectators (prevent coaching)
    state["valid_moves"] = []

    async def _build_table_data(session):
        table = await session.get(Table, table_id)
        if not table:
            return None
        white_player = await session.get(Player, table.white_player_id) if table.white_player_id else None
        black_player = await session.get(Player, table.black_player_id) if table.black_player_id else None
        white_time_ms, black_time_ms = game_manager.get_time_remaining(table_id)
        return {
            "id": table.id,
            "status": table.status,
            "white_player": {
                "id": white_player.id,
                "nickname": white_player.nickname,
                "created_at": str(white_player.created_at),
                "rating": white_player.rating,
                "rating_games": white_player.rating_games,
            } if white_player else None,
            "black_player": {
                "id": black_player.id,
                "nickname": black_player.nickname,
                "created_at": str(black_player.created_at),
                "rating": black_player.rating,
                "rating_games": black_player.rating_games,
            } if black_player else None,
            "created_at": str(table.created_at),
            "match_points": table.match_points,
            "white_match_score": table.white_match_score,
            "black_match_score": table.black_match_score,
            "bot_difficulty": table.bot_difficulty,
            "time_control": table.time_control,
            "white_time_remaining_ms": white_time_ms,
            "black_time_remaining_ms": black_time_ms,
            "spectator_count": manager.get_spectator_count(table_id),
        }

    if db is not None:
        table_data = await _build_table_data(db)
    else:
        async with async_session() as fresh_db:
            table_data = await _build_table_data(fresh_db)

    return {
        "type": msg_type,
        "data": {
            "game_state": state,
            "your_color": None,
            "table": table_data,
        },
    }


async def notify_game_started(table_id: str) -> None:
    """Called from the REST join endpoint to push the initial game state
    to every WebSocket client already connected at *table_id*."""
    await _send_game_state_to_all(table_id)


async def _send_game_state_to_all(table_id: str, db=None) -> None:
    """Send personalized game state to every connected player and spectator.

    Each player receives their own valid_moves (only the current player
    whose turn it is sees moves; the opponent sees an empty list).
    Spectators receive the full board state with empty valid_moves.
    If *db* is provided, reuse it to see uncommitted changes.
    """
    for pid in manager.get_player_ids(table_id):
        try:
            message = await _build_full_message(table_id, pid, db=db)
            await manager.send_to_player(table_id, pid, message)
        except (ConnectionError, RuntimeError, ValueError, KeyError):
            logger.exception("Failed to send game state to player %s", pid)

    # Broadcast to spectators (empty valid_moves to prevent coaching)
    if manager.get_spectator_count(table_id) > 0:
        try:
            spectator_message = await _build_spectator_message(table_id, db=db)
            await manager.broadcast_to_spectators(table_id, spectator_message)
        except (ConnectionError, RuntimeError, ValueError, KeyError):
            logger.exception("Failed to send game state to spectators at table %s", table_id)


async def _send_error(ws: WebSocket, message: str) -> None:
    """Send an error message to a single WebSocket client."""
    try:
        await ws.send_json({"type": "error", "data": {"message": message}})
    except (ConnectionError, RuntimeError):
        pass  # Client already disconnected, nothing to do


async def _broadcast_game_over(table_id: str, game_over_data: dict) -> None:
    """Send game_over message to all connected players and spectators at a table."""
    msg = {"type": "game_over", "data": game_over_data}
    for pid in manager.get_player_ids(table_id):
        await manager.send_to_player(table_id, pid, msg)
    await manager.broadcast_to_spectators(table_id, msg)


async def websocket_endpoint(websocket: WebSocket, table_id: str, player_id: str) -> None:
    """WebSocket endpoint for real-time game interaction.

    Path: /ws/{table_id}/{player_id}

    After connecting, the player receives the current game state.
    The client sends JSON messages with an "action" field:

    - {"action": "roll_dice"}
        Roll dice for the current player's turn.

    - {"action": "make_move", "from_point": int, "to_point": int}
        Execute a checker move.

    - {"action": "end_turn"}
        End the turn when no valid moves remain.

    After each action, updated game state is broadcast to both players
    with personalized valid_moves.
    """
    # Validate JWT token before anything else
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        token_player_id = payload.get("sub")
        if token_player_id != player_id:
            await websocket.close(code=4001, reason="Player ID mismatch")
            return
    except jwt.InvalidTokenError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Validate player and table exist before accepting the connection
    async with async_session() as db:
        player = await db.get(Player, player_id)
        table = await db.get(Table, table_id)

    if not player or not table:
        await websocket.accept()
        reason = "Player not found" if not player else "Table not found"
        await websocket.close(code=4004, reason=reason)
        return

    # Accept and register the connection
    await manager.connect(table_id, player_id, websocket)

    try:
        # Send initial game state if engine is active (or can be restored)
        async with async_session() as db:
            engine = await game_manager.get_or_restore_engine(table_id, db)
            if engine:
                await restore_bot_difficulty(table_id, db)
        if engine:
            message = await _build_full_message(table_id, player_id)
            await websocket.send_json(message)
            # If this is a bot game and it's the bot's turn, re-trigger the bot
            if is_bot_game(table_id):
                schedule_bot_turn_if_needed(table_id)
        else:
            # Game not started yet or already finished -- send table status
            async with async_session() as db:
                table = await db.get(Table, table_id)
                await websocket.send_json({
                    "type": "waiting",
                    "data": {"table_id": table_id, "status": table.status if table else "unknown"},
                })

        # Main message loop
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await _send_error(websocket, "Invalid JSON")
                continue

            action = message.get("action")
            if not action:
                await _send_error(websocket, "Missing 'action' field")
                continue

            # All game actions require a database session and per-table lock
            trigger_bot = False
            trigger_bot_double = False

            async with game_manager._get_lock(table_id):
                # Check for timeout before processing any action
                engine = game_manager.get_engine(table_id)
                if engine and engine.state.status != GameStatus.FINISHED:
                    timed_out_color = game_manager.check_timeout(table_id)
                    if timed_out_color is not None:
                        async with async_session() as db:
                            await game_manager.handle_timeout(db, table_id)
                            await db.commit()
                            await _send_game_state_to_all(table_id, db=db)
                            # Send time_expired game over
                            table = await db.get(Table, table_id)
                            if table:
                                game_over_data = {
                                    "winner_id": table.winner_id,
                                    "win_type": "timeout",
                                    "final_score": table.final_score,
                                    "match_over": table.status == "finished",
                                    "white_match_score": table.white_match_score,
                                    "black_match_score": table.black_match_score,
                                }
                                await _broadcast_game_over(table_id, game_over_data)
                                if table.status == "finished":
                                    game_manager.cleanup_finished_game(table_id)
                        continue

                # Snapshot engine state before action so we can restore on DB failure
                state_snapshot = engine.get_state_snapshot() if engine else None

                async with async_session() as db:
                    try:
                        if action == "roll_dice":
                            await _handle_roll_dice(db, websocket, table_id, player_id)

                        elif action == "make_move":
                            from_point = message.get("from_point")
                            to_point = message.get("to_point")
                            if from_point is None or to_point is None:
                                await _send_error(
                                    websocket,
                                    "make_move requires 'from_point' and 'to_point'",
                                )
                                continue
                            if not isinstance(from_point, int) or not isinstance(to_point, int):
                                await manager.send_to_player(table_id, player_id, {
                                    "type": "error",
                                    "data": {"message": "from_point and to_point must be integers"}
                                })
                                continue
                            await _handle_make_move(
                                db, websocket, table_id, player_id, from_point, to_point
                            )

                        elif action == "end_turn":
                            await _handle_end_turn(db, websocket, table_id, player_id)

                        elif action == "undo_turn":
                            await _handle_undo_turn(db, websocket, table_id, player_id)

                        elif action == "offer_double":
                            await _handle_offer_double(db, websocket, table_id, player_id)
                            trigger_bot_double = True

                        elif action == "accept_double":
                            await _handle_accept_double(db, websocket, table_id, player_id)

                        elif action == "decline_double":
                            await _handle_decline_double(db, websocket, table_id, player_id)

                        elif action == "next_game":
                            await _handle_next_game(db, websocket, table_id, player_id)

                        else:
                            await _send_error(websocket, f"Unknown action: {action}")

                        await db.commit()
                        trigger_bot = True

                    except ValueError as e:
                        await db.rollback()
                        # Restore engine state on DB failure
                        if engine and state_snapshot:
                            await game_manager.restore_engine_from_snapshot(table_id, engine, state_snapshot)
                        await _send_error(websocket, str(e))
                    except Exception:  # Broad catch intentional: safety net to keep WS loop alive and rollback DB
                        await db.rollback()
                        # Restore engine state on DB failure
                        if engine and state_snapshot:
                            await game_manager.restore_engine_from_snapshot(table_id, engine, state_snapshot)
                        logger.exception(
                            "Unexpected error handling action '%s' for player %s at table %s",
                            action, player_id, table_id,
                        )
                        await _send_error(websocket, "Internal server error")

            # Schedule bot turn outside the lock to avoid deadlocks
            if trigger_bot and is_bot_game(table_id):
                if trigger_bot_double:
                    schedule_bot_double_response_if_needed(table_id)
                else:
                    schedule_bot_turn_if_needed(table_id)

    except WebSocketDisconnect:
        logger.info("Player %s disconnected from table %s", player_id, table_id)
    except Exception:  # Broad catch intentional: ensure cleanup in finally block always runs
        logger.exception(
            "WebSocket error for player %s at table %s", player_id, table_id
        )
    finally:
        manager.disconnect(table_id, player_id)
        await manager.notify_opponent_disconnect(table_id, player_id)


async def _handle_roll_dice(
    db, websocket: WebSocket, table_id: str, player_id: str
) -> None:
    """Handle a roll_dice action: roll and broadcast the result."""
    roll_result = await game_manager.roll_dice(db, table_id, player_id)

    # Send dice result to the rolling player
    await websocket.send_json({"type": "dice_rolled", "data": roll_result})

    # Broadcast updated game state to all connected players
    await _send_game_state_to_all(table_id, db=db)


async def _handle_make_move(
    db, websocket: WebSocket, table_id: str, player_id: str,
    from_point: int, to_point: int,
) -> None:
    """Handle a make_move action: execute the move and broadcast the result."""
    await game_manager.make_move(db, table_id, player_id, from_point, to_point)

    # Broadcast updated game state (including the final state) to all players
    await _send_game_state_to_all(table_id, db=db)

    # If the game is finished, send a game_over message and conditionally clean up
    engine = game_manager.get_engine(table_id)
    if engine and engine.state.status == GameStatus.FINISHED:
        table = await db.get(Table, table_id)
        if table:
            match_over = table.status == "finished"
            game_over_data = {
                "winner_id": table.winner_id,
                "win_type": table.win_type,
                "final_score": table.final_score,
                "match_over": match_over,
                "white_match_score": table.white_match_score,
                "black_match_score": table.black_match_score,
            }
            await _broadcast_game_over(table_id, game_over_data)
        # Only clean up engine when match is truly over
        if table and table.status == "finished":
            game_manager.cleanup_finished_game(table_id)


async def _handle_end_turn(
    db, websocket: WebSocket, table_id: str, player_id: str
) -> None:
    """Handle an end_turn action: end the turn and broadcast the result."""
    await game_manager.end_turn(db, table_id, player_id)

    # Broadcast updated game state to all connected players
    await _send_game_state_to_all(table_id, db=db)


async def _handle_undo_turn(
    db, websocket: WebSocket, table_id: str, player_id: str
) -> None:
    """Handle an undo_turn action: rewind all moves this turn."""
    await game_manager.undo_turn(db, table_id, player_id)

    # Broadcast updated game state to all connected players
    await _send_game_state_to_all(table_id, db=db)


async def _handle_offer_double(
    db, websocket: WebSocket, table_id: str, player_id: str
) -> None:
    """Handle an offer_double action."""
    await game_manager.offer_double(db, table_id, player_id)
    await _send_game_state_to_all(table_id, db=db)


async def _handle_accept_double(
    db, websocket: WebSocket, table_id: str, player_id: str
) -> None:
    """Handle an accept_double action."""
    await game_manager.accept_double(db, table_id, player_id)
    await _send_game_state_to_all(table_id, db=db)


async def _handle_decline_double(
    db, websocket: WebSocket, table_id: str, player_id: str
) -> None:
    """Handle a decline_double action: opponent forfeits the game."""
    await game_manager.decline_double(db, table_id, player_id)

    await _send_game_state_to_all(table_id, db=db)

    # Send game_over message
    engine = game_manager.get_engine(table_id)
    if engine and engine.state.status == GameStatus.FINISHED:
        table = await db.get(Table, table_id)
        if table:
            match_over = table.status == "finished"
            game_over_data = {
                "winner_id": table.winner_id,
                "win_type": table.win_type,
                "final_score": table.final_score,
                "match_over": match_over,
                "white_match_score": table.white_match_score,
                "black_match_score": table.black_match_score,
            }
            await _broadcast_game_over(table_id, game_over_data)
        if table and table.status == "finished":
            game_manager.cleanup_finished_game(table_id)


async def _handle_next_game(
    db, websocket: WebSocket, table_id: str, player_id: str
) -> None:
    """Handle a next_game action: start the next game in a match."""
    await game_manager.start_next_game(db, table_id)
    await _send_game_state_to_all(table_id, db=db)


async def websocket_spectator_endpoint(websocket: WebSocket, table_id: str) -> None:
    """WebSocket endpoint for spectators watching a live game.

    Path: /ws/{table_id}/spectate

    Spectators receive game state updates in real-time but cannot send
    game actions. Valid moves are not included in state messages to
    prevent coaching. A valid JWT token is still required.
    """
    # Validate JWT token before anything else
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return
    try:
        jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Validate table exists before accepting the connection
    async with async_session() as db:
        table = await db.get(Table, table_id)

    if not table:
        await websocket.accept()
        await websocket.close(code=4004, reason="Table not found")
        return

    # Accept and register the spectator connection
    await manager.connect_spectator(table_id, websocket)
    logger.info("Spectator connected to table %s (total: %d)", table_id, manager.get_spectator_count(table_id))

    try:
        # Send initial game state if engine is active
        async with async_session() as db:
            engine = await game_manager.get_or_restore_engine(table_id, db)
        if engine:
            message = await _build_spectator_message(table_id)
            await websocket.send_json(message)
        else:
            # Game not yet started or already finished
            async with async_session() as db:
                table = await db.get(Table, table_id)
            await websocket.send_json({
                "type": "waiting",
                "data": {"table_id": table_id, "status": table.status if table else "unknown"},
            })

        # Spectators only receive messages; any data they send is ignored
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        logger.info("Spectator disconnected from table %s", table_id)
    except Exception:  # Broad catch intentional: ensure cleanup always runs
        logger.exception("WebSocket error for spectator at table %s", table_id)
    finally:
        manager.disconnect_spectator(table_id, websocket)
        logger.info("Spectator left table %s (remaining: %d)", table_id, manager.get_spectator_count(table_id))
