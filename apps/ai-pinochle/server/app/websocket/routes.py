import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.game import Game
from app.websocket.connection_manager import Connection, manager
from app.websocket.handlers import (
    handle_message,
    _build_seats_dict,
    SEAT_COLUMNS,
    TEAM_FOR_SEAT,
)

logger = logging.getLogger(__name__)

router = APIRouter()


async def _authenticate(token: str, db: AsyncSession) -> User | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id_str = payload.get("sub")
        if user_id_str is None:
            return None
        user_id = uuid.UUID(user_id_str)
    except (JWTError, ValueError):
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


@router.websocket("/{room_code}")
async def game_websocket(websocket: WebSocket, room_code: str):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    db_factory = getattr(websocket.app.state, "_test_db_factory", None)

    if db_factory:
        db = db_factory()
    else:
        db = AsyncSessionLocal()

    session = await db.__aenter__()
    try:
        await _run_websocket(websocket, room_code, token, session)
    finally:
        try:
            await db.__aexit__(None, None, None)
        except Exception:
            logger.debug("Session cleanup error (connection already closed)")


async def _run_websocket(
    websocket: WebSocket, room_code: str, token: str, db: AsyncSession
):
    user = await _authenticate(token, db)
    if user is None:
        await websocket.close(code=4001, reason="Invalid token")
        return

    conn = Connection(websocket=websocket, user_id=user.id, username=user.username)
    await manager.connect(room_code, conn)

    # Send current game state on connect
    result = await db.execute(
        select(Game).where(Game.room_code == room_code, Game.status == "IN_PROGRESS")
    )
    game = result.scalar_one_or_none()
    if game is not None:
        seats = await _build_seats_dict(game, db)
        await manager.send_personal(websocket, {
            "event": "LOBBY_STATE_UPDATED",
            "payload": {"seats": seats},
        })

        await _send_game_state_on_reconnect(websocket, game, user.id, db)

    try:
        while True:
            data = await websocket.receive_json()
            await handle_message(websocket, data, room_code, user.id, db)
            await db.commit()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(room_code, websocket)


async def _send_game_state_on_reconnect(
    websocket: WebSocket,
    game: Game,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Send the full game state to a reconnecting player."""
    state = game.current_state_json or {}
    phase = state.get("phase")

    if phase == "LOBBY_WAITING" or phase is None:
        return

    # Find the player's seat
    player_seat = None
    for seat, col in SEAT_COLUMNS.items():
        if getattr(game, col) == user_id:
            player_seat = seat
            break

    # Send hand if player is seated
    player_hands = state.get("player_hands", {})
    if player_seat and player_seat in player_hands:
        await manager.send_personal(websocket, {
            "event": "HAND_DEALT",
            "payload": {"cards": player_hands[player_seat]},
        })

    hand = state.get("current_hand", {})
    bidding = hand.get("bidding", {})

    if phase == "BIDDING":
        winning_bid = bidding.get("winning_bid")
        await manager.send_personal(websocket, {
            "event": "BIDDING_TURN",
            "payload": {
                "current_highest_bid": winning_bid,
                "highest_bidder_seat": bidding.get("winning_seat"),
                "next_to_act_seat": bidding.get("next_to_act_seat"),
                "minimum_valid_bid": (winning_bid + 1) if winning_bid is not None else 20,
            },
        })

    elif phase == "NAMING_TRUMP":
        await manager.send_personal(websocket, {
            "event": "BIDDING_COMPLETED",
            "payload": {
                "winning_seat": bidding.get("winning_seat"),
                "winning_bid": bidding.get("winning_bid"),
                "is_shoot_the_moon": bidding.get("is_shoot_the_moon", False),
            },
        })

    elif phase == "SHOWING_MELD":
        winning_seat = bidding.get("winning_seat")
        await manager.send_personal(websocket, {
            "event": "MELD_BROADCAST",
            "payload": {
                "trump_suit": hand.get("trump_suit"),
                "winning_bid": bidding.get("winning_bid"),
                "is_shoot_the_moon": bidding.get("is_shoot_the_moon", False),
                "bidding_team": TEAM_FOR_SEAT.get(winning_seat, ""),
                "team_meld": hand.get("team_meld", {}),
                "player_melds": hand.get("player_melds", {}),
            },
        })
        acked = hand.get("meld_acknowledged_seats", [])
        if acked:
            await manager.send_personal(websocket, {
                "event": "MELD_ACKNOWLEDGED",
                "payload": {
                    "seat": acked[-1],
                    "acknowledged_seats": list(acked),
                },
            })

    elif phase == "TRICK_PLAYING":
        await manager.send_personal(websocket, {
            "event": "MELD_PHASE_COMPLETED",
            "payload": {
                "team_meld": hand.get("team_meld", {}),
            },
        })
