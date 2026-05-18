"""WebSocket action adapter.

Thin I/O layer between WS frames and the pure state machine. Responsibilities:

  1. Route inbound messages to the right handler.
  2. Load the game, resolve the sender's seat.
  3. Call `apply_action()` on the pure state machine.
  4. Persist via `save_game_state` with optimistic locking.
  5. Fan out events through `event_bus` and analytics through `analytics_sink`.

All phase-specific rule logic lives in `app.engine.actions.*`. Adapter-only
actions touch columns or close the socket rather than `current_state_json`:
  - `SELECT_SEAT`        — atomic seat claim via conditional UPDATE
  - `LEAVE_TO_LOBBY`     — WS close
  - `SWAP_SEAT_REQUEST`  — store pending swap in state JSON
  - `SWAP_SEAT_ACCEPT`   — execute swap, clear pending state
  - `KICK_PLAYER`        — host removes a player from a seat
"""
import copy
import logging
import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.websockets import WebSocket

from app.engine.constants import (
    PARTNER_SEAT,
    TEAM_FOR_SEAT,
    VALID_SEATS,
    VALID_SUITS,
    is_valid_card_code,
    next_seat,
)
from app.engine.deck import SEATS, shuffle_and_deal
from app.engine.errors import ErrorCode, GameRuleError
from app.engine.state_machine import apply_action, supports
from app.models.game import Game
from app.models.user import User
from app.websocket import analytics_sink, event_bus
from app.websocket.connection_manager import manager
from app.websocket.state_io import OptimisticLockError, save_game_state

logger = logging.getLogger(__name__)

SEAT_COLUMNS = {
    "NORTH": "north_player_id",
    "EAST": "east_player_id",
    "SOUTH": "south_player_id",
    "WEST": "west_player_id",
}


# ---------------------------------------------------------------------------
# Error + persistence helpers
# ---------------------------------------------------------------------------


async def _send_error(
    websocket: WebSocket, code: ErrorCode, message: str
) -> None:
    await manager.send_personal(websocket, {
        "event": "ERROR",
        "payload": {"code": code.value, "message": message},
    })


async def _save_or_conflict(
    websocket: WebSocket,
    db: AsyncSession,
    game: Game,
    state: dict,
    *,
    extra: dict | None = None,
) -> bool:
    """Save state with optimistic locking. Sends ERROR + returns False on conflict."""
    try:
        await save_game_state(db, game, state, extra=extra)
        return True
    except OptimisticLockError:
        logger.warning("optimistic lock conflict on game %s", game.id)
        await _send_error(
            websocket,
            ErrorCode.STATE_CONFLICT,
            "Game state changed under your action — please retry.",
        )
        return False


async def _load_game(db: AsyncSession, room_code: str) -> Game | None:
    """Load the IN_PROGRESS game, bypassing the SQLAlchemy identity map cache."""
    result = await db.execute(
        select(Game)
        .where(Game.room_code == room_code, Game.status == "IN_PROGRESS")
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def _load_game_any_status(db: AsyncSession, room_code: str) -> Game | None:
    """Rematch revives a finished game — load regardless of status."""
    result = await db.execute(
        select(Game)
        .where(Game.room_code == room_code)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Action dispatch
# ---------------------------------------------------------------------------


async def handle_message(
    websocket: WebSocket,
    data: dict,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
):
    action = data.get("action")
    payload = data.get("payload", {}) or {}

    # Adapter-only actions (touch columns or close the socket, not state JSON).
    if action == "SELECT_SEAT":
        await handle_select_seat(websocket, payload, room_code, user_id, db)
        return
    if action == "LEAVE_TO_LOBBY":
        await handle_leave_to_lobby(websocket)
        return
    if action == "SWAP_SEAT_REQUEST":
        await handle_swap_seat_request(websocket, payload, room_code, user_id, db)
        return
    if action == "SWAP_SEAT_ACCEPT":
        await handle_swap_seat_accept(websocket, payload, room_code, user_id, db)
        return
    if action == "KICK_PLAYER":
        await handle_kick_player(websocket, payload, room_code, user_id, db)
        return
    if action == "FILL_AI":
        await handle_fill_ai(websocket, payload, room_code, user_id, db)
        return

    if not supports(action):
        await _send_error(
            websocket, ErrorCode.UNKNOWN_ACTION, f"Unknown action: {action}"
        )
        return

    await _apply(websocket, db, room_code, user_id, action, payload)


# ---------------------------------------------------------------------------
# Reducer driver
# ---------------------------------------------------------------------------


async def _apply(
    websocket: WebSocket,
    db: AsyncSession,
    room_code: str,
    user_id: uuid.UUID,
    action: str,
    payload: dict,
) -> None:
    game = (
        await _load_game_any_status(db, room_code)
        if action == "REMATCH_REQUEST"
        else await _load_game(db, room_code)
    )
    if game is None:
        await _send_error(websocket, ErrorCode.GAME_NOT_FOUND, "Game not found")
        return

    state = copy.deepcopy(game.current_state_json or {})
    actor_seat = _seat_for_user(game, user_id)
    metadata = _build_metadata(game, action, user_id)

    try:
        new_state, events, side_effects = apply_action(
            state, action, payload, actor_seat, metadata
        )
    except GameRuleError as e:
        await _send_error(websocket, e.code, e.message)
        return

    save_extra = _collect_save_extra(action, side_effects)

    # Preserve bot_seats and hints_enabled across state-rebuilding actions
    # (START_GAME, REMATCH, ACKNOWLEDGE_HAND_RESULT).
    old_bot_seats = state.get("bot_seats", [])
    if old_bot_seats and "bot_seats" not in new_state:
        new_state["bot_seats"] = old_bot_seats

    if state.get("hints_enabled") and "hints_enabled" not in new_state:
        new_state["hints_enabled"] = True

    if not await _save_or_conflict(
        websocket, db, game, new_state, extra=save_extra or None
    ):
        return

    achievement_events = await analytics_sink.dispatch(db, game, new_state, side_effects)
    await event_bus.dispatch(game, room_code, new_state, events + achievement_events)

    # Post-dispatch bookkeeping: clear disconnect timers when the game
    # transitions into a non-play state or gets restarted.
    if new_state.get("phase") == "GAME_OVER":
        manager.disconnect_times.pop(room_code, None)
    elif action == "REMATCH_REQUEST" and new_state.get("phase") == "BIDDING":
        manager.disconnect_times.pop(room_code, None)

    # If the next actor is a bot, schedule their turn.
    from app.bot.scheduler import maybe_schedule_bot_turn
    maybe_schedule_bot_turn(game, new_state, room_code)


def _build_metadata(game: Game, action: str, user_id: uuid.UUID) -> dict:
    """Pre-compute non-determinism and auth context reducers need."""
    meta: dict = {"room_code": game.room_code, "actor_user_id": user_id}

    if action == "START_GAME":
        meta["all_seats_filled"] = all(
            getattr(game, col) is not None for col in SEAT_COLUMNS.values()
        )
        meta["new_deal"] = shuffle_and_deal()
        dealer_seat = random.choice(SEATS)
        meta["new_dealer"] = dealer_seat
        meta["first_bidder"] = SEATS[(SEATS.index(dealer_seat) + 1) % 4]
    elif action == "ACKNOWLEDGE_HAND_RESULT":
        # Only used if the 4th ack triggers a re-deal. Cheap to always compute.
        meta["new_deal"] = shuffle_and_deal()
    elif action == "REMATCH_REQUEST":
        meta["new_deal"] = shuffle_and_deal()
        dealer_seat = random.choice(SEATS)
        meta["new_dealer"] = dealer_seat
        meta["first_bidder"] = SEATS[(SEATS.index(dealer_seat) + 1) % 4]

    return meta


def _collect_save_extra(action: str, side_effects: list[dict]) -> dict:
    """Flatten `save_extra` side effects into the UPDATE-time column map."""
    extra: dict = {}
    now = datetime.now(timezone.utc)
    for sfx in side_effects:
        if sfx.get("type") == "save_extra":
            extra.update(sfx["extra"])
            if sfx.get("set_ended_at"):
                extra["ended_at"] = now
            if sfx.get("set_started_at"):
                extra["started_at"] = now
    if action == "START_GAME":
        extra.setdefault("started_at", now)
    return extra


# ---------------------------------------------------------------------------
# SELECT_SEAT (column update, not state-machine action)
# ---------------------------------------------------------------------------


async def handle_select_seat(
    websocket: WebSocket,
    payload: dict,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
):
    raw_seat = payload.get("seat")
    if not isinstance(raw_seat, str):
        await _send_error(
            websocket, ErrorCode.INVALID_SEAT, f"Invalid seat: {raw_seat}"
        )
        return

    seat = raw_seat.upper()
    if seat not in VALID_SEATS:
        await _send_error(
            websocket, ErrorCode.INVALID_SEAT, f"Invalid seat: {raw_seat}"
        )
        return

    game = await _load_game(db, room_code)
    if game is None:
        await _send_error(websocket, ErrorCode.GAME_NOT_FOUND, "Game not found")
        return

    phase = (game.current_state_json or {}).get("phase")
    if phase != "LOBBY_WAITING":
        await _send_error(
            websocket, ErrorCode.GAME_ALREADY_STARTED, "Game already started"
        )
        return

    # Unseat the user from any other seat they currently occupy.
    col = SEAT_COLUMNS[seat]
    for s, other_col in SEAT_COLUMNS.items():
        if s != seat:
            await db.execute(
                update(Game)
                .where(Game.id == game.id, getattr(Game, other_col) == user_id)
                .values(**{other_col: None})
            )

    # Atomic claim: succeeds only if the seat is currently empty.
    result = await db.execute(
        update(Game)
        .where(Game.id == game.id, getattr(Game, col) == None)  # noqa: E711
        .values(**{col: user_id})
    )

    if result.rowcount == 0:
        await db.refresh(game)
        if getattr(game, col) != user_id:
            await manager.send_personal(websocket, {
                "event": "SEAT_CLAIM_FAILED",
                "payload": {
                    "code": ErrorCode.INVALID_SEAT.value,
                    "message": f"The {seat.capitalize()} seat was claimed by another player.",
                    "requested_seat": seat,
                },
            })
            return

    await db.flush()
    await db.refresh(game)

    seats = await _build_seats_dict(game, db)
    await _send_lobby_state(game, room_code, seats, db)


# ---------------------------------------------------------------------------
# LEAVE_TO_LOBBY (closes the socket; rest is handled by the disconnect path)
# ---------------------------------------------------------------------------


async def handle_leave_to_lobby(websocket: WebSocket) -> None:
    await manager.send_personal(websocket, {
        "event": "LEFT_TO_LOBBY",
        "payload": {},
    })
    try:
        await websocket.close(code=1000, reason="left to lobby")
    except Exception:
        logger.debug("Failed to close ws for leave_to_lobby")


# ---------------------------------------------------------------------------
# SWAP_SEAT_REQUEST
# ---------------------------------------------------------------------------


async def handle_swap_seat_request(
    websocket: WebSocket,
    payload: dict,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    raw_target = payload.get("target_seat")
    if not isinstance(raw_target, str):
        await _send_error(websocket, ErrorCode.INVALID_SEAT, f"Invalid target_seat: {raw_target}")
        return

    target_seat = raw_target.upper()
    if target_seat not in VALID_SEATS:
        await _send_error(websocket, ErrorCode.INVALID_SEAT, f"Invalid seat: {raw_target}")
        return

    game = await _load_game(db, room_code)
    if game is None:
        await _send_error(websocket, ErrorCode.GAME_NOT_FOUND, "Game not found")
        return

    state = game.current_state_json or {}
    if state.get("phase") != "LOBBY_WAITING":
        await _send_error(websocket, ErrorCode.WRONG_PHASE, "Can only swap seats in the lobby")
        return

    requester_seat = _seat_for_user(game, user_id)
    if requester_seat is None:
        await _send_error(websocket, ErrorCode.NOT_SEATED, "You must be seated to request a swap")
        return

    if requester_seat == target_seat:
        await _send_error(websocket, ErrorCode.INVALID_SEAT, "You are already in that seat")
        return

    target_col = SEAT_COLUMNS[target_seat]
    if getattr(game, target_col) is None:
        await _send_error(
            websocket, ErrorCode.INVALID_SEAT, f"Seat {target_seat} is empty — use SELECT_SEAT instead"
        )
        return

    new_state = copy.deepcopy(state)
    new_state["pending_swap"] = {
        "from_seat": requester_seat,
        "to_seat": target_seat,
        "requested_by": str(user_id),
    }

    if not await _save_or_conflict(websocket, db, game, new_state):
        return

    await db.refresh(game)
    seats = await _build_seats_dict(game, db)
    await _send_lobby_state(game, room_code, seats, db)


# ---------------------------------------------------------------------------
# SWAP_SEAT_ACCEPT
# ---------------------------------------------------------------------------


async def handle_swap_seat_accept(
    websocket: WebSocket,
    payload: dict,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    game = await _load_game(db, room_code)
    if game is None:
        await _send_error(websocket, ErrorCode.GAME_NOT_FOUND, "Game not found")
        return

    state = game.current_state_json or {}
    if state.get("phase") != "LOBBY_WAITING":
        await _send_error(websocket, ErrorCode.WRONG_PHASE, "Can only swap seats in the lobby")
        return

    pending = state.get("pending_swap")
    if not pending:
        await _send_error(websocket, ErrorCode.NO_PENDING_SWAP, "No pending swap to accept")
        return

    to_seat = pending["to_seat"]
    to_col = SEAT_COLUMNS[to_seat]
    if getattr(game, to_col) != user_id:
        await _send_error(
            websocket, ErrorCode.SWAP_NOT_FOR_YOU, "This swap request is not directed at you"
        )
        return

    from_seat = pending["from_seat"]
    from_col = SEAT_COLUMNS[from_seat]
    from_player_id = getattr(game, from_col)

    new_state = copy.deepcopy(state)
    new_state.pop("pending_swap", None)

    # Merge seat-column changes into the versioned UPDATE so they're
    # covered by the optimistic lock (no gap between the two writes).
    if not await _save_or_conflict(
        websocket, db, game, new_state,
        extra={from_col: user_id, to_col: from_player_id},
    ):
        return

    await db.refresh(game)
    seats = await _build_seats_dict(game, db)
    await _send_lobby_state(game, room_code, seats, db)


# ---------------------------------------------------------------------------
# KICK_PLAYER
# ---------------------------------------------------------------------------


async def handle_kick_player(
    websocket: WebSocket,
    payload: dict,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    raw_seat = payload.get("seat")
    if not isinstance(raw_seat, str):
        await _send_error(websocket, ErrorCode.INVALID_SEAT, f"Invalid seat: {raw_seat}")
        return

    seat = raw_seat.upper()
    if seat not in VALID_SEATS:
        await _send_error(websocket, ErrorCode.INVALID_SEAT, f"Invalid seat: {raw_seat}")
        return

    game = await _load_game(db, room_code)
    if game is None:
        await _send_error(websocket, ErrorCode.GAME_NOT_FOUND, "Game not found")
        return

    state = game.current_state_json or {}
    if state.get("phase") != "LOBBY_WAITING":
        await _send_error(websocket, ErrorCode.WRONG_PHASE, "Can only kick players in the lobby")
        return

    created_by = state.get("created_by")
    if str(user_id) != created_by:
        await _send_error(websocket, ErrorCode.NOT_GAME_CREATOR, "Only the room creator can kick players")
        return

    col = SEAT_COLUMNS[seat]
    occupant_id = getattr(game, col)
    if occupant_id is None:
        await _send_error(websocket, ErrorCode.INVALID_SEAT, f"Seat {seat} is empty")
        return

    if occupant_id == user_id:
        await _send_error(websocket, ErrorCode.CANNOT_KICK_SELF, "You cannot kick yourself")
        return

    new_state = copy.deepcopy(state)
    pending = new_state.get("pending_swap")
    if pending and (pending.get("from_seat") == seat or pending.get("to_seat") == seat):
        new_state.pop("pending_swap", None)

    # Merge seat-column clear into the versioned UPDATE (same lock coverage).
    if not await _save_or_conflict(
        websocket, db, game, new_state,
        extra={col: None},
    ):
        return

    await db.refresh(game)
    seats = await _build_seats_dict(game, db)
    await _send_lobby_state(game, room_code, seats, db)


# ---------------------------------------------------------------------------
# FILL_AI (fill empty seats with bots)
# ---------------------------------------------------------------------------


async def handle_fill_ai(
    websocket: WebSocket,
    payload: dict,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Fill all empty seats with bots. Only the host (creator) can do this."""
    game = await _load_game(db, room_code)
    if game is None:
        await _send_error(websocket, ErrorCode.GAME_NOT_FOUND, "Game not found")
        return

    state = game.current_state_json or {}
    if state.get("phase") != "LOBBY_WAITING":
        await _send_error(websocket, ErrorCode.WRONG_PHASE, "Can only fill AI in lobby")
        return

    if str(user_id) != state.get("created_by"):
        await _send_error(
            websocket, ErrorCode.NOT_GAME_CREATOR, "Only the creator can add bots"
        )
        return

    caller_seat = _seat_for_user(game, user_id)
    if caller_seat is None:
        await _send_error(websocket, ErrorCode.NOT_SEATED, "You must be seated first")
        return

    from app.bot.users import BOT_UUIDS, get_or_create_bots
    await get_or_create_bots(db)

    bot_seats = []
    extra_columns: dict = {}
    for seat, col in SEAT_COLUMNS.items():
        if getattr(game, col) is None:
            bot_id = BOT_UUIDS[seat]
            extra_columns[col] = bot_id
            bot_seats.append(seat)

    if not bot_seats:
        # All seats already filled
        seats = await _build_seats_dict(game, db)
        await _send_lobby_state(game, room_code, seats, db)
        return

    new_state = copy.deepcopy(state)
    new_state["bot_seats"] = bot_seats

    if not await _save_or_conflict(
        websocket, db, game, new_state, extra=extra_columns
    ):
        return

    await db.refresh(game)
    seats = await _build_seats_dict(game, db)
    await _send_lobby_state(game, room_code, seats, db)

    # Auto-start: all seats are now filled with bots, start immediately
    # so the user doesn't have to click "Start Game" manually.
    all_filled = all(
        getattr(game, col) is not None for col in SEAT_COLUMNS.values()
    )
    if all_filled:
        await _apply(websocket, db, room_code, user_id, "START_GAME", {})


# ---------------------------------------------------------------------------
# Shared helpers (also imported by routes.py / background.py)
# ---------------------------------------------------------------------------


def _seat_for_user(game: Game, user_id: uuid.UUID) -> str | None:
    for seat, col in SEAT_COLUMNS.items():
        if getattr(game, col) == user_id:
            return seat
    return None


def _your_seat(game: Game, user_id: uuid.UUID) -> str | None:
    return _seat_for_user(game, user_id)


async def _resolve_username(db: AsyncSession, user_id_str: str | None) -> str | None:
    """Resolve a UUID string to a first_name, returning None if not found."""
    if not user_id_str:
        return None
    try:
        uid = uuid.UUID(user_id_str)
    except (ValueError, AttributeError):
        return None
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    return user.first_name if user else None


async def _build_lobby_payload(
    game: Game,
    db: AsyncSession,
    seats: dict[str, str | None],
    viewer_user_id: uuid.UUID,
) -> dict:
    """Build the LOBBY_STATE_UPDATED payload for a single viewer."""
    state = game.current_state_json or {}
    your_seat = _your_seat(game, viewer_user_id)

    created_by = state.get("created_by")
    is_host = bool(created_by and str(viewer_user_id) == created_by)

    pending_swap_raw = state.get("pending_swap")
    pending_swap_payload = None
    if pending_swap_raw:
        from_seat = pending_swap_raw.get("from_seat", "")
        to_seat = pending_swap_raw.get("to_seat", "")
        requested_by = pending_swap_raw.get("requested_by")
        from_col = SEAT_COLUMNS.get(from_seat)
        to_col = SEAT_COLUMNS.get(to_seat)
        # Validate the swap is still live: requester must still occupy from_seat
        # and the target seat must still be occupied. If a SELECT_SEAT moved
        # either participant, the swap is stale and we suppress it.
        from_occupant = getattr(game, from_col) if from_col else None
        to_occupant = getattr(game, to_col) if to_col else None
        if (
            from_occupant is not None
            and str(from_occupant) == requested_by
            and to_occupant is not None
        ):
            from_player = await _resolve_username(db, requested_by)
            pending_swap_payload = {
                "from_seat": from_seat,
                "to_seat": to_seat,
                "from_player": from_player or "",
            }

    return {
        "seats": seats,
        "your_seat": your_seat,
        "is_host": is_host,
        "pending_swap": pending_swap_payload,
        "bot_seats": [s.lower() for s in state.get("bot_seats", [])],
        "hints_enabled": state.get("hints_enabled", False),
    }


async def _send_lobby_state(
    game: Game, room_code: str, seats: dict[str, str | None], db: AsyncSession
) -> None:
    connections = manager.get_connections(room_code)
    for conn in connections:
        payload = await _build_lobby_payload(game, db, seats, conn.user_id)
        await manager.send_personal(conn.websocket, {
            "event": "LOBBY_STATE_UPDATED",
            "payload": payload,
        })


async def _build_seats_dict(game: Game, db: AsyncSession) -> dict[str, str | None]:
    player_ids = {seat: getattr(game, col) for seat, col in SEAT_COLUMNS.items()}
    occupied_ids = [pid for pid in player_ids.values() if pid is not None]
    id_to_name: dict[uuid.UUID, str] = {}
    if occupied_ids:
        rows = await db.execute(select(User).where(User.id.in_(occupied_ids)))
        for u in rows.scalars():
            id_to_name[u.id] = u.first_name
    return {
        seat: id_to_name.get(pid) if pid else None
        for seat, pid in player_ids.items()
    }


# Re-exports kept for routes.py / background.py compatibility.
__all__ = [
    "handle_message",
    "SEAT_COLUMNS",
    "TEAM_FOR_SEAT",
    "PARTNER_SEAT",
    "VALID_SEATS",
    "VALID_SUITS",
    "_send_error",
    "_load_game",
    "_seat_for_user",
    "_your_seat",
    "_build_seats_dict",
    "_build_lobby_payload",
    "_send_lobby_state",
    "is_valid_card_code",
    "next_seat",
]
