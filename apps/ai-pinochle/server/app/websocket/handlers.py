import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.websockets import WebSocket

from app.models.game import Game
from app.models.user import User
from app.websocket.connection_manager import manager

VALID_SEATS = {"NORTH", "EAST", "SOUTH", "WEST"}

SEAT_COLUMNS = {
    "NORTH": "north_player_id",
    "EAST": "east_player_id",
    "SOUTH": "south_player_id",
    "WEST": "west_player_id",
}


async def handle_message(
    websocket: WebSocket,
    data: dict,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
):
    action = data.get("action")
    payload = data.get("payload", {})

    if action == "SELECT_SEAT":
        await handle_select_seat(websocket, payload, room_code, user_id, db)
    else:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": f"Unknown action: {action}"},
        })


async def handle_select_seat(
    websocket: WebSocket,
    payload: dict,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
):
    seat = payload.get("seat", "").upper()
    if seat not in VALID_SEATS:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": f"Invalid seat: {payload.get('seat')}"},
        })
        return

    result = await db.execute(
        select(Game).where(Game.room_code == room_code, Game.status == "IN_PROGRESS")
    )
    game = result.scalar_one_or_none()
    if game is None:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "Game not found"},
        })
        return

    phase = (game.current_state_json or {}).get("phase")
    if phase != "LOBBY_WAITING":
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "Game already started"},
        })
        return

    # Check if user already occupies a different seat — unseat them first
    for s, col in SEAT_COLUMNS.items():
        if getattr(game, col) == user_id and s != seat:
            setattr(game, col, None)

    # Attempt to claim the seat (atomic: only set if currently empty)
    col = SEAT_COLUMNS[seat]
    current_occupant = getattr(game, col)
    if current_occupant is not None and current_occupant != user_id:
        await manager.send_personal(websocket, {
            "event": "SEAT_CLAIM_FAILED",
            "payload": {
                "message": f"The {seat.capitalize()} seat was claimed by another player.",
                "requested_seat": seat,
            },
        })
        return

    setattr(game, col, user_id)
    await db.flush()

    seats = await _build_seats_dict(game, db)
    await manager.broadcast(room_code, {
        "event": "LOBBY_STATE_UPDATED",
        "payload": {"seats": seats},
    })


async def _build_seats_dict(game: Game, db: AsyncSession) -> dict[str, str | None]:
    player_ids = {
        seat: getattr(game, col) for seat, col in SEAT_COLUMNS.items()
    }

    occupied_ids = [pid for pid in player_ids.values() if pid is not None]
    id_to_username: dict[uuid.UUID, str] = {}
    if occupied_ids:
        rows = await db.execute(select(User).where(User.id.in_(occupied_ids)))
        for u in rows.scalars():
            id_to_username[u.id] = u.username

    return {
        seat: id_to_username.get(pid) if pid else None
        for seat, pid in player_ids.items()
    }
