import asyncio
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import jwt
from jwt.exceptions import PyJWTError
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
    _build_lobby_payload,
    _build_seats_dict,
    _your_seat,
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
    except (PyJWTError, ValueError):
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


def _token_is_valid(token: str) -> bool:
    """Re-check a JWT's signature + expiry without a DB round-trip.

    Used by the long-lived-connection revalidation loop. We intentionally
    don't re-load the user: the initial `_authenticate` call already bound
    the connection to a user_id. If the token still decodes under our key
    and hasn't expired, the original authorization decision stands.
    """
    try:
        jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except PyJWTError:
        return False
    return True


@router.websocket("/{room_code}")
async def game_websocket(websocket: WebSocket, room_code: str):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    db_factory = getattr(websocket.app.state, "_test_db_factory", None)

    if db_factory:
        db = db_factory()
        session = await db.__aenter__()
        try:
            await _run_websocket(websocket, room_code, token, session)
        finally:
            try:
                await db.__aexit__(None, None, None)
            except Exception:
                pass
    else:
        db = AsyncSessionLocal()
        session = await db.__aenter__()
        try:
            await _run_websocket(websocket, room_code, token, session)
        finally:
            try:
                await db.__aexit__(None, None, None)
            except Exception as e:
                logger.warning("Session cleanup error (%s: %s)", type(e).__name__, e)


async def _run_websocket(
    websocket: WebSocket, room_code: str, token: str, db: AsyncSession
):
    user = await _authenticate(token, db)
    if user is None:
        await websocket.close(code=4001, reason="Invalid token")
        return

    conn = Connection(websocket=websocket, user_id=user.id, username=user.username)
    await manager.connect(room_code, conn)
    manager.clear_disconnect(room_code, user.id)
    log_event(room_code, user.username, "connected")

    # Allow connecting to IN_PROGRESS rooms (active games) and to recently
    # completed rooms (so seated players can request a rematch from the
    # game-over screen). Anything else (ABANDONED, missing) is rejected.
    result = await db.execute(
        select(Game).where(Game.room_code == room_code)
    )
    game = result.scalar_one_or_none()
    if game is None or game.status not in ("IN_PROGRESS", "COMPLETED"):
        await websocket.close(code=4004, reason="Room not found")
        manager.disconnect(room_code, websocket)
        return

    # Send current game state on connect
    seats = await _build_seats_dict(game, db)
    lobby_payload = await _build_lobby_payload(game, db, seats, user.id)
    await manager.send_personal(websocket, {
        "event": "LOBBY_STATE_UPDATED",
        "payload": lobby_payload,
    })

    await _send_game_state_on_reconnect(websocket, game, user.id, db)

    # Auto-start AI games when the human connects and all seats are filled.
    state = game.current_state_json or {}
    bot_seats = state.get("bot_seats", [])
    if (
        state.get("phase") == "LOBBY_WAITING"
        and bot_seats
        and all(
            getattr(game, f"{s.lower()}_player_id") is not None
            for s in ["NORTH", "EAST", "SOUTH", "WEST"]
        )
    ):
        async with manager.get_room_lock(room_code):
            await handle_message(
                websocket,
                {"action": "START_GAME", "payload": {}},
                room_code,
                user.id,
                db,
            )
            await db.commit()

    revalidate_interval = max(1, settings.ws_jwt_revalidate_seconds)

    try:
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=revalidate_interval,
                )
            except asyncio.TimeoutError:
                if not _token_is_valid(token):
                    try:
                        await manager.send_personal(websocket, {
                            "event": "REAUTH_REQUIRED",
                            "payload": {
                                "reason": "token_expired",
                                "message": "Session token expired; reconnect with a fresh token.",
                            },
                        })
                    except Exception:
                        logger.debug("Failed to send REAUTH_REQUIRED to user %s", user.id)
                    await websocket.close(code=4401, reason="Token expired")
                    log_event(room_code, user.username, "reauth_required")
                    return
                continue
            except ValueError:
                await manager.send_personal(websocket, {
                    "event": "ERROR",
                    "payload": {"code": "INVALID_JSON", "message": "Invalid JSON"},
                })
                continue

            log_message(room_code, "IN", user.username, data)
            if data.get("action") == "PING":
                await manager.send_personal(websocket, {"event": "PONG"})
                continue
            try:
                async with manager.get_room_lock(room_code):
                    await handle_message(websocket, data, room_code, user.id, db)
                    await db.commit()
            except WebSocketDisconnect:
                raise
            except Exception:
                logger.exception("Error handling message in room %s", room_code)
                try:
                    await db.rollback()
                except Exception:
                    logger.debug("Rollback failed")
                await manager.send_personal(websocket, {
                    "event": "ERROR",
                    "payload": {
                        "code": "SERVER_ERROR",
                        "message": "Server error processing your action",
                    },
                })
    except WebSocketDisconnect:
        pass
    finally:
        # Record disconnect BEFORE removing the connection so the room's
        # disconnect_times entry isn't orphaned when this is the last player.
        # We only record if there are other connections still active OR we're
        # in a mid-game phase that the forfeit sweep cares about.
        remaining = [c for c in manager.get_connections(room_code) if c.websocket is not websocket]
        if remaining:
            manager.record_disconnect(room_code, user.id)
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

    # Cumulative game scores — included on every per-phase snapshot event below
    # so mid-hand reconnects can render the scoreboard on the trick-play surface
    # without waiting for the next HAND_COMPLETED.
    game_scores = state.get("game_scores", {"NS": 0, "EW": 0})

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
                "minimum_valid_bid": (winning_bid + 1) if winning_bid is not None else 25,
                "game_scores": game_scores,
            },
        })

    elif phase == "NAMING_TRUMP":
        await manager.send_personal(websocket, {
            "event": "BIDDING_COMPLETED",
            "payload": {
                "winning_seat": bidding.get("winning_seat"),
                "winning_bid": bidding.get("winning_bid"),
                "is_shoot_the_moon": bidding.get("is_shoot_the_moon", False),
                "game_scores": game_scores,
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
                "game_scores": game_scores,
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
        acknowledged_seats = list(hand.get("meld_acknowledged_seats", []))
        await manager.send_personal(websocket, {
            "event": "MELD_BROADCAST",
            "payload": {
                "trump_suit": hand.get("trump_suit"),
                "winning_bid": bidding.get("winning_bid"),
                "is_shoot_the_moon": bidding.get("is_shoot_the_moon", False),
                "bidding_team": TEAM_FOR_SEAT.get(winning_seat, ""),
                "team_meld": hand.get("team_meld", {}),
                "player_melds": hand.get("player_melds", {}),
                "game_scores": game_scores,
                "acknowledged_seats": acknowledged_seats,
            },
        })
        if acknowledged_seats:
            await manager.send_personal(websocket, {
                "event": "MELD_ACKNOWLEDGED",
                "payload": {
                    "seat": acknowledged_seats[-1],
                    "acknowledged_seats": acknowledged_seats,
                },
            })

    elif phase == "TRICK_PLAYING":
        trick_play = hand.get("trick_play", {})

        await manager.send_personal(websocket, {
            "event": "MELD_PHASE_COMPLETED",
            "payload": {
                "team_meld": hand.get("team_meld", {}),
                "first_to_act_seat": trick_play.get("led_seat"),
                "game_scores": game_scores,
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
                "game_scores": game_scores,
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
        acknowledged_seats = list(hand.get("hand_result_acknowledged_seats", []))

        await manager.send_personal(websocket, {
            "event": "HAND_COMPLETED",
            "payload": {
                "trick_scores": trick_play.get("trick_scores", {}),
                "team_meld": hand.get("team_meld", {}),
                "bid": bidding.get("winning_bid"),
                "bidding_team": TEAM_FOR_SEAT.get(winning_seat, ""),
                "score_deltas": hand.get("score_deltas", {}),
                "game_scores": game_scores,
                "acknowledged_seats": acknowledged_seats,
            },
        })

        if acknowledged_seats:
            await manager.send_personal(websocket, {
                "event": "HAND_RESULT_ACKNOWLEDGED",
                "payload": {
                    "seat": acknowledged_seats[-1],
                    "acknowledged_seats": acknowledged_seats,
                },
            })

    elif phase == "GAME_OVER":
        # Mid-lobby reconnect after the game ended: re-emit GAME_OVER so the
        # client can render the result screen, and re-emit any in-progress
        # rematch votes via REMATCH_REQUESTED so "Waiting on X" stays accurate.
        pending_rematch_seats = list(state.get("pending_rematch_seats", []))
        await manager.send_personal(websocket, {
            "event": "GAME_OVER",
            "payload": {
                "winner_team": state.get("winner_team", ""),
                "final_scores": game_scores,
                "pending_rematch_seats": pending_rematch_seats,
            },
        })
        if pending_rematch_seats:
            await manager.send_personal(websocket, {
                "event": "REMATCH_REQUESTED",
                "payload": {
                    "seat": pending_rematch_seats[-1],
                    "pending_seats": pending_rematch_seats,
                },
            })
