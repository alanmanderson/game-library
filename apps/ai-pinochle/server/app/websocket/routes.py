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
from app.websocket.game_logger import log_event, log_message
from app.engine.meld import SUIT_LETTER
from app.engine.tricks import card_suit, get_legal_cards, trick_winner
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
    log_event(room_code, user.username, "connected")

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
            log_message(room_code, "IN", user.username, data)
            await handle_message(websocket, data, room_code, user.id, db)
            await db.commit()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(room_code, websocket)
        log_event(room_code, user.username, "disconnected")


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

    elif phase == "PASSING_CARDS":
        winning_seat = bidding.get("winning_seat")
        card_passing = hand.get("card_passing", {})
        await manager.send_personal(websocket, {
            "event": "TRUMP_NAMED",
            "payload": {
                "trump_suit": hand.get("trump_suit"),
                "declared_by_seat": winning_seat,
                "bidding_team": TEAM_FOR_SEAT.get(winning_seat, ""),
                "winning_bid": bidding.get("winning_bid"),
                "is_shoot_the_moon": bidding.get("is_shoot_the_moon", False),
            },
        })
        await manager.send_personal(websocket, {
            "event": "PASSING_PHASE_STARTED",
            "payload": {
                "trump_suit": hand.get("trump_suit"),
                "bidding_team": card_passing.get("bidding_team", ""),
                "bidder_seat": card_passing.get("bidder_seat", ""),
                "partner_seat": card_passing.get("partner_seat", ""),
            },
        })
        submitted = card_passing.get("submitted", {})
        if submitted:
            await manager.send_personal(websocket, {
                "event": "CARDS_PASSED",
                "payload": {
                    "seat": list(submitted.keys())[-1],
                    "submitted_seats": list(submitted.keys()),
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
        trick_play = hand.get("trick_play", {})

        await manager.send_personal(websocket, {
            "event": "MELD_PHASE_COMPLETED",
            "payload": {
                "team_meld": hand.get("team_meld", {}),
                "first_to_act_seat": trick_play.get("led_seat"),
            },
        })

        # Send current trick state (scores, trick number)
        await manager.send_personal(websocket, {
            "event": "TRICK_STATE",
            "payload": {
                "trick_number": trick_play.get("trick_number", 1),
                "tricks_taken": trick_play.get("tricks_taken", {}),
                "trick_scores": trick_play.get("trick_scores", {}),
                "led_seat": trick_play.get("led_seat"),
            },
        })

        # Replay cards played in the current trick
        for card_entry in trick_play.get("cards_played", []):
            await manager.send_personal(websocket, {
                "event": "CARD_PLAYED",
                "payload": {
                    "seat": card_entry["seat"],
                    "card": card_entry["card"],
                    "next_to_act_seat": None,
                },
            })

        # If it's this player's turn, send YOUR_TURN
        if player_seat and player_seat == trick_play.get("next_to_act_seat"):
            trump_letter = SUIT_LETTER.get(hand.get("trump_suit", ""), "")
            cards_played = trick_play.get("cards_played", [])
            player_hand = state.get("player_hands", {}).get(player_seat, [])

            if cards_played:
                led_suit = card_suit(cards_played[0]["card"])
                currently_winning = trick_winner(cards_played, trump_letter)
            else:
                led_suit = None
                currently_winning = None

            legal_cards = get_legal_cards(player_hand, led_suit, trump_letter, cards_played)

            await manager.send_personal(websocket, {
                "event": "YOUR_TURN",
                "payload": {
                    "seat": player_seat,
                    "legal_cards": legal_cards,
                    "trick_number": trick_play.get("trick_number", 1),
                    "led_suit": led_suit,
                    "cards_played": cards_played,
                    "currently_winning": currently_winning,
                },
            })

    elif phase == "HAND_COMPLETE":
        bidding = hand.get("bidding", {})
        winning_seat = bidding.get("winning_seat")
        trick_play = hand.get("trick_play", {})

        await manager.send_personal(websocket, {
            "event": "HAND_COMPLETED",
            "payload": {
                "trick_scores": trick_play.get("trick_scores", {}),
                "team_meld": hand.get("team_meld", {}),
                "bid": bidding.get("winning_bid"),
                "bidding_team": TEAM_FOR_SEAT.get(winning_seat, ""),
                "score_deltas": hand.get("score_deltas", {}),
                "game_scores": state.get("game_scores", {}),
            },
        })

        acked = hand.get("hand_result_acknowledged_seats", [])
        if acked:
            await manager.send_personal(websocket, {
                "event": "HAND_RESULT_ACKNOWLEDGED",
                "payload": {
                    "seat": acked[-1],
                    "acknowledged_seats": list(acked),
                },
            })
