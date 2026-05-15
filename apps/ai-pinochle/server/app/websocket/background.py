"""Background maintenance loop for the WebSocket layer.

Two responsibilities:

1. **Disconnect-forfeit sweep** — if a player has been disconnected for longer
   than `DISCONNECT_FORFEIT_SECONDS` and the game is mid-hand (not lobby and
   not over), award the game to the opposing team and broadcast GAME_FORFEITED.

2. **Rate-limit map cleanup** — purge stale entries from the in-memory rate
   limit dicts so they don't grow unboundedly.

Started as a single asyncio task in `main.py`'s lifespan. One task is enough
because the work is tiny and runs every 30s.
"""
import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.game import Game
from app.websocket.connection_manager import manager
from app.websocket.handlers import SEAT_COLUMNS, TEAM_FOR_SEAT
from app.websocket.state_io import OptimisticLockError, save_game_state

# Indirection so tests can swap the session factory without monkey-patching
# every callsite. Production code never reassigns this.
_session_factory = AsyncSessionLocal


def set_session_factory(factory):
    global _session_factory
    _session_factory = factory

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_SECONDS = 30
RATE_LIMIT_CLEANUP_INTERVAL_SECONDS = 5 * 60


def _forfeit_timeout_seconds() -> int:
    try:
        return int(os.getenv("DISCONNECT_FORFEIT_SECONDS", "120"))
    except ValueError:
        return 120


_MID_HAND_PHASES = {"BIDDING", "NAMING_TRUMP", "PASSING_CARDS", "SHOWING_MELD", "TRICK_PLAYING", "HAND_COMPLETE"}


async def _sweep_disconnects(now: datetime, timeout: int) -> None:
    """Forfeit games where any seated player has been gone too long."""
    # Snapshot under no lock — manager.disconnect_times is a plain dict; we
    # tolerate races (a player reconnecting mid-sweep just means we read a
    # stale entry, then save_game_state catches the version mismatch).
    snapshot = {
        room: dict(players) for room, players in manager.disconnect_times.items()
    }

    for room_code, players in snapshot.items():
        for user_id, ts in players.items():
            if (now - ts).total_seconds() <= timeout:
                continue
            try:
                await _forfeit_one(room_code, user_id)
            except Exception:
                logger.exception("forfeit sweep failed for room %s", room_code)


async def _forfeit_one(room_code: str, abandoning_user_id: uuid.UUID) -> None:
    async with _session_factory() as db:
        result = await db.execute(
            select(Game).where(Game.room_code == room_code, Game.status == "IN_PROGRESS")
        )
        game = result.scalar_one_or_none()
        if game is None:
            manager.clear_disconnect(room_code, abandoning_user_id)
            return

        state = dict(game.current_state_json or {})
        phase = state.get("phase")
        if phase not in _MID_HAND_PHASES:
            manager.clear_disconnect(room_code, abandoning_user_id)
            return

        # Resolve seat -> team for the abandoning player
        forfeiting_seat = None
        for seat, col in SEAT_COLUMNS.items():
            if getattr(game, col) == abandoning_user_id:
                forfeiting_seat = seat
                break
        if forfeiting_seat is None:
            manager.clear_disconnect(room_code, abandoning_user_id)
            return

        forfeiting_team = TEAM_FOR_SEAT[forfeiting_seat]
        winning_team = "NS" if forfeiting_team == "EW" else "EW"

        state["phase"] = "GAME_OVER"
        state["forfeit"] = {
            "forfeiting_team": forfeiting_team,
            "forfeiting_seat": forfeiting_seat,
            "winning_team": winning_team,
        }

        try:
            await save_game_state(
                db,
                game,
                state,
                extra={"status": "ABANDONED", "ended_at": datetime.now(timezone.utc)},
            )
        except OptimisticLockError:
            # Someone wrote first — retry on the next sweep tick.
            await db.rollback()
            return

        await db.commit()

        # Forget the disconnect timestamps for this room so we don't re-forfeit.
        manager.disconnect_times.pop(room_code, None)

        await manager.broadcast(room_code, {
            "event": "GAME_FORFEITED",
            "payload": {
                "winning_team": winning_team,
                "forfeiting_team": forfeiting_team,
                "forfeiting_seat": forfeiting_seat,
                "final_scores": state.get("game_scores", {"NS": 0, "EW": 0}),
            },
        })


def _sweep_rate_limits() -> None:
    """Drop in-memory rate-limit entries older than their windows."""
    from app.api.auth import _login_attempts, RATE_LIMIT_WINDOW
    from app.api.games import _failed_join_attempts, _FAILED_JOIN_WINDOW_SECONDS

    now_ts = time.time()
    cutoff = now_ts - RATE_LIMIT_WINDOW
    for ip in list(_login_attempts.keys()):
        fresh = [t for t in _login_attempts[ip] if t > cutoff]
        if fresh:
            _login_attempts[ip] = fresh
        else:
            _login_attempts.pop(ip, None)

    join_cutoff_ts = now_ts - _FAILED_JOIN_WINDOW_SECONDS
    for user_id in list(_failed_join_attempts.keys()):
        fresh = [t for t in _failed_join_attempts[user_id] if t.timestamp() > join_cutoff_ts]
        if fresh:
            _failed_join_attempts[user_id] = fresh
        else:
            _failed_join_attempts.pop(user_id, None)


async def maintenance_loop() -> None:
    """Run the disconnect + rate-limit sweeps until cancelled."""
    timeout = _forfeit_timeout_seconds()
    last_rate_cleanup = 0.0

    while True:
        try:
            await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
            now = datetime.now(timezone.utc)
            await _sweep_disconnects(now, timeout)

            now_ts = time.time()
            if now_ts - last_rate_cleanup >= RATE_LIMIT_CLEANUP_INTERVAL_SECONDS:
                _sweep_rate_limits()
                last_rate_cleanup = now_ts
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("maintenance_loop iteration failed; continuing")
