import copy
import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.websockets import WebSocket

from app.engine.deck import SEATS, shuffle_and_deal
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
    elif action == "START_GAME":
        await handle_start_game(websocket, room_code, user_id, db)
    elif action == "SUBMIT_BID":
        await handle_submit_bid(websocket, payload, room_code, user_id, db)
    elif action == "DECLARE_TRUMP":
        await handle_declare_trump(websocket, payload, room_code, user_id, db)
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


async def handle_start_game(
    websocket: WebSocket,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
):
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
            "payload": {"message": "Game is not in the lobby phase"},
        })
        return

    # Validate all 4 seats are occupied
    for col in SEAT_COLUMNS.values():
        if getattr(game, col) is None:
            await manager.send_personal(websocket, {
                "event": "ERROR",
                "payload": {"message": "All seats must be occupied before starting"},
            })
            return

    # Deal cards
    player_hands = shuffle_and_deal()

    # Pick random dealer; first bidder is to dealer's left
    dealer_seat = random.choice(SEATS)
    dealer_index = SEATS.index(dealer_seat)
    first_bidder = SEATS[(dealer_index + 1) % 4]

    # Build game state
    game.current_state_json = {
        "room_code": room_code,
        "phase": "BIDDING",
        "game_scores": {"NS": 0, "EW": 0},
        "current_hand": {
            "hand_number": 1,
            "dealer_seat": dealer_seat,
            "bidding": {
                "winning_bid": None,
                "winning_seat": None,
                "is_shoot_the_moon": False,
                "next_to_act_seat": first_bidder,
                "passed_seats": [],
            },
        },
        "player_hands": player_hands,
    }
    game.started_at = datetime.now(timezone.utc)
    await db.flush()

    # Build seat -> user_id mapping for targeted sends
    seat_to_user_id = {
        seat: getattr(game, col) for seat, col in SEAT_COLUMNS.items()
    }

    # Send private HAND_DEALT to each connected player
    connections = manager.get_connections(room_code)
    for conn in connections:
        for seat, uid in seat_to_user_id.items():
            if conn.user_id == uid:
                await manager.send_personal(conn.websocket, {
                    "event": "HAND_DEALT",
                    "payload": {"cards": player_hands[seat]},
                })
                break

    # Broadcast BIDDING_TURN
    await manager.broadcast(room_code, {
        "event": "BIDDING_TURN",
        "payload": {
            "current_highest_bid": None,
            "highest_bidder_seat": None,
            "next_to_act_seat": first_bidder,
            "minimum_valid_bid": 20,
        },
    })


def _next_active_bidder(current_seat: str, passed_seats: list[str]) -> str:
    """Find next seat clockwise that hasn't passed."""
    idx = SEATS.index(current_seat)
    for offset in range(1, 5):
        candidate = SEATS[(idx + offset) % 4]
        if candidate not in passed_seats:
            return candidate
    raise ValueError("No active bidders remaining")


async def handle_submit_bid(
    websocket: WebSocket,
    payload: dict,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
):
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

    state = copy.deepcopy(game.current_state_json or {})
    phase = state.get("phase")
    if phase != "BIDDING":
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "Game is not in the bidding phase"},
        })
        return

    hand = state["current_hand"]
    bidding = hand["bidding"]
    next_seat = bidding["next_to_act_seat"]

    # Verify it's this player's turn
    expected_user_id = getattr(game, SEAT_COLUMNS[next_seat])
    if expected_user_id != user_id:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "It is not your turn to bid"},
        })
        return

    amount = payload.get("amount")
    shoot_the_moon = payload.get("shoot_the_moon", False)
    passed_seats = bidding["passed_seats"]
    winning_bid = bidding["winning_bid"]
    dealer_seat = hand["dealer_seat"]

    if amount is None:
        # Pass attempt
        non_dealer_seats = [s for s in SEATS if s != dealer_seat]
        all_others_passed = all(s in passed_seats for s in non_dealer_seats)
        if next_seat == dealer_seat and all_others_passed and winning_bid is None:
            await manager.send_personal(websocket, {
                "event": "ERROR",
                "payload": {"message": "Dealer must bid when all others have passed"},
            })
            return

        passed_seats.append(next_seat)
        bidding["passed_seats"] = passed_seats

        if len(passed_seats) == 3:
            if winning_bid is None:
                bidding["winning_bid"] = 20
                bidding["winning_seat"] = dealer_seat
            state["phase"] = "NAMING_TRUMP"
            game.current_state_json = state
            await db.flush()

            await manager.broadcast(room_code, {
                "event": "BIDDING_COMPLETED",
                "payload": {
                    "winning_seat": bidding["winning_seat"],
                    "winning_bid": bidding["winning_bid"],
                    "is_shoot_the_moon": bidding["is_shoot_the_moon"],
                },
            })
        else:
            bidding["next_to_act_seat"] = _next_active_bidder(next_seat, passed_seats)
            game.current_state_json = state
            await db.flush()

            minimum = (winning_bid + 1) if winning_bid is not None else 20
            await manager.broadcast(room_code, {
                "event": "BIDDING_TURN",
                "payload": {
                    "current_highest_bid": winning_bid,
                    "highest_bidder_seat": bidding["winning_seat"],
                    "next_to_act_seat": bidding["next_to_act_seat"],
                    "minimum_valid_bid": minimum,
                },
            })
    else:
        if not isinstance(amount, int):
            await manager.send_personal(websocket, {
                "event": "ERROR",
                "payload": {"message": "Bid amount must be an integer"},
            })
            return

        minimum = (winning_bid + 1) if winning_bid is not None else 20
        if amount < minimum:
            await manager.send_personal(websocket, {
                "event": "ERROR",
                "payload": {"message": f"Bid must be at least {minimum}"},
            })
            return

        bidding["winning_bid"] = amount
        bidding["winning_seat"] = next_seat

        if shoot_the_moon:
            bidding["is_shoot_the_moon"] = True
            state["phase"] = "NAMING_TRUMP"
            game.current_state_json = state
            await db.flush()

            await manager.broadcast(room_code, {
                "event": "BIDDING_COMPLETED",
                "payload": {
                    "winning_seat": next_seat,
                    "winning_bid": amount,
                    "is_shoot_the_moon": True,
                },
            })
        else:
            bidding["next_to_act_seat"] = _next_active_bidder(next_seat, passed_seats)
            game.current_state_json = state
            await db.flush()

            await manager.broadcast(room_code, {
                "event": "BIDDING_TURN",
                "payload": {
                    "current_highest_bid": amount,
                    "highest_bidder_seat": next_seat,
                    "next_to_act_seat": bidding["next_to_act_seat"],
                    "minimum_valid_bid": amount + 1,
                },
            })


VALID_SUITS = {"HEARTS", "DIAMONDS", "CLUBS", "SPADES"}

TEAM_FOR_SEAT = {"NORTH": "NS", "SOUTH": "NS", "EAST": "EW", "WEST": "EW"}


async def handle_declare_trump(
    websocket: WebSocket,
    payload: dict,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
):
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

    state = copy.deepcopy(game.current_state_json or {})
    phase = state.get("phase")
    if phase != "NAMING_TRUMP":
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "Game is not in the trump naming phase"},
        })
        return

    hand = state["current_hand"]
    winning_seat = hand["bidding"]["winning_seat"]

    # Only the bid winner can declare trump
    expected_user_id = getattr(game, SEAT_COLUMNS[winning_seat])
    if expected_user_id != user_id:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "Only the bid winner can declare trump"},
        })
        return

    suit = payload.get("suit", "").upper()
    if suit not in VALID_SUITS:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": f"Invalid suit: {payload.get('suit')}"},
        })
        return

    hand["trump_suit"] = suit
    state["phase"] = "SHOWING_MELD"
    game.current_state_json = state
    await db.flush()

    await manager.broadcast(room_code, {
        "event": "TRUMP_NAMED",
        "payload": {
            "trump_suit": suit,
            "declared_by_seat": winning_seat,
            "bidding_team": TEAM_FOR_SEAT[winning_seat],
            "winning_bid": hand["bidding"]["winning_bid"],
            "is_shoot_the_moon": hand["bidding"]["is_shoot_the_moon"],
        },
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
