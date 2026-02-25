import copy
import random
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.websockets import WebSocket

from app.engine.deck import SEATS, shuffle_and_deal
from app.engine.meld import SUIT_LETTER, calculate_melds
from app.engine.scoring import score_hand
from app.engine.tricks import (
    card_suit,
    get_legal_cards,
    trick_card_points,
    trick_winner,
)
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


async def _load_game(db: AsyncSession, room_code: str) -> Game | None:
    """Load the active game, bypassing the SQLAlchemy identity map cache."""
    result = await db.execute(
        select(Game)
        .where(Game.room_code == room_code, Game.status == "IN_PROGRESS")
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


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
    elif action == "ACKNOWLEDGE_MELD":
        await handle_acknowledge_meld(websocket, room_code, user_id, db)
    elif action == "PLAY_CARD":
        await handle_play_card(websocket, payload, room_code, user_id, db)
    elif action == "ACKNOWLEDGE_HAND_RESULT":
        await handle_acknowledge_hand_result(websocket, room_code, user_id, db)
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

    game = await _load_game(db, room_code)
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
    await db.refresh(game)

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
    game = await _load_game(db, room_code)
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
    game.started_at = datetime.utcnow()
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
    game = await _load_game(db, room_code)
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
    game = await _load_game(db, room_code)
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

    shoot_the_moon = payload.get("shoot_the_moon", False)
    if shoot_the_moon:
        hand["bidding"]["is_shoot_the_moon"] = True

    hand["trump_suit"] = suit

    # Calculate melds for all players
    player_hands = state["player_hands"]
    player_melds = {}
    team_meld = {"NS": 0, "EW": 0}

    for seat_name in SEATS:
        seat_hand = player_hands[seat_name]
        melds = calculate_melds(seat_hand, suit)
        total = sum(m["points"] for m in melds)
        player_melds[seat_name] = {"melds": melds, "total": total}
        team_meld[TEAM_FOR_SEAT[seat_name]] += total

    hand["team_meld"] = team_meld
    hand["player_melds"] = player_melds
    hand["meld_acknowledged_seats"] = []

    state["phase"] = "SHOWING_MELD"
    game.current_state_json = state
    await db.flush()

    bidding = hand["bidding"]

    await manager.broadcast(room_code, {
        "event": "TRUMP_NAMED",
        "payload": {
            "trump_suit": suit,
            "declared_by_seat": winning_seat,
            "bidding_team": TEAM_FOR_SEAT[winning_seat],
            "winning_bid": bidding["winning_bid"],
            "is_shoot_the_moon": bidding["is_shoot_the_moon"],
        },
    })

    await manager.broadcast(room_code, {
        "event": "MELD_BROADCAST",
        "payload": {
            "trump_suit": suit,
            "winning_bid": bidding["winning_bid"],
            "is_shoot_the_moon": bidding["is_shoot_the_moon"],
            "bidding_team": TEAM_FOR_SEAT[winning_seat],
            "team_meld": team_meld,
            "player_melds": player_melds,
        },
    })


async def handle_acknowledge_meld(
    websocket: WebSocket,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
):
    game = await _load_game(db, room_code)
    if game is None:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "Game not found"},
        })
        return

    state = copy.deepcopy(game.current_state_json or {})
    phase = state.get("phase")
    if phase != "SHOWING_MELD":
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "Game is not in the meld showing phase"},
        })
        return

    # Find sender's seat
    sender_seat = None
    for seat, col in SEAT_COLUMNS.items():
        if getattr(game, col) == user_id:
            sender_seat = seat
            break

    if sender_seat is None:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "You are not seated in this game"},
        })
        return

    hand = state["current_hand"]
    acked = hand["meld_acknowledged_seats"]

    if sender_seat in acked:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "You have already acknowledged meld"},
        })
        return

    acked.append(sender_seat)
    hand["meld_acknowledged_seats"] = acked

    if len(acked) >= 4:
        bid_winner = hand["bidding"]["winning_seat"]
        hand["trick_play"] = {
            "trick_number": 1,
            "next_to_act_seat": bid_winner,
            "led_seat": bid_winner,
            "cards_played": [],
            "tricks_taken": {"NS": 0, "EW": 0},
            "trick_scores": {"NS": 0, "EW": 0},
        }

        state["phase"] = "TRICK_PLAYING"
        game.current_state_json = state
        await db.flush()

        await manager.broadcast(room_code, {
            "event": "MELD_PHASE_COMPLETED",
            "payload": {
                "team_meld": hand["team_meld"],
                "first_to_act_seat": bid_winner,
            },
        })

        await _send_your_turn(game, room_code, state, bid_winner)
    else:
        game.current_state_json = state
        await db.flush()

        await manager.broadcast(room_code, {
            "event": "MELD_ACKNOWLEDGED",
            "payload": {
                "seat": sender_seat,
                "acknowledged_seats": list(acked),
            },
        })


def _next_seat(seat: str) -> str:
    """Return the next seat clockwise."""
    idx = SEATS.index(seat)
    return SEATS[(idx + 1) % 4]


async def _send_your_turn(
    game: Game, room_code: str, state: dict, seat: str
) -> None:
    """Send YOUR_TURN event to the player at the given seat."""
    user_id = getattr(game, SEAT_COLUMNS[seat])
    hand = state["current_hand"]
    trick_play = hand["trick_play"]
    cards_played = trick_play["cards_played"]
    player_hand = state["player_hands"][seat]
    trump_letter = SUIT_LETTER[hand["trump_suit"]]

    if cards_played:
        led_suit = card_suit(cards_played[0]["card"])
        currently_winning = trick_winner(cards_played, trump_letter)
    else:
        led_suit = None
        currently_winning = None

    legal_cards = get_legal_cards(player_hand, led_suit, trump_letter, cards_played)

    connections = manager.get_connections(room_code)
    for conn in connections:
        if conn.user_id == user_id:
            await manager.send_personal(conn.websocket, {
                "event": "YOUR_TURN",
                "payload": {
                    "seat": seat,
                    "legal_cards": legal_cards,
                    "trick_number": trick_play["trick_number"],
                    "led_suit": led_suit,
                    "cards_played": cards_played,
                    "currently_winning": currently_winning,
                },
            })
            break


async def handle_play_card(
    websocket: WebSocket,
    payload: dict,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
):
    game = await _load_game(db, room_code)
    if game is None:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "Game not found"},
        })
        return

    state = copy.deepcopy(game.current_state_json or {})
    if state.get("phase") != "TRICK_PLAYING":
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "Game is not in the trick playing phase"},
        })
        return

    # Find sender's seat
    sender_seat = None
    for seat, col in SEAT_COLUMNS.items():
        if getattr(game, col) == user_id:
            sender_seat = seat
            break

    if sender_seat is None:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "You are not seated in this game"},
        })
        return

    hand = state["current_hand"]
    trick_play = hand["trick_play"]

    if sender_seat != trick_play["next_to_act_seat"]:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "It is not your turn"},
        })
        return

    card = payload.get("card")
    if not card:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "No card specified"},
        })
        return

    player_hand = state["player_hands"][sender_seat]
    trump_letter = SUIT_LETTER[hand["trump_suit"]]
    cards_played = trick_play["cards_played"]
    led_suit = card_suit(cards_played[0]["card"]) if cards_played else None
    legal_cards = get_legal_cards(player_hand, led_suit, trump_letter, cards_played)

    if card not in legal_cards:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "That card is not a legal play"},
        })
        return

    # Remove card from hand (first occurrence for duplicate handling)
    player_hand.remove(card)
    cards_played.append({"seat": sender_seat, "card": card})

    if len(cards_played) < 4:
        # Trick not complete — advance to next player
        next_seat = _next_seat(sender_seat)
        trick_play["next_to_act_seat"] = next_seat
        game.current_state_json = state
        await db.flush()

        await manager.broadcast(room_code, {
            "event": "CARD_PLAYED",
            "payload": {
                "seat": sender_seat,
                "card": card,
                "next_to_act_seat": next_seat,
            },
        })

        await _send_your_turn(game, room_code, state, next_seat)
    else:
        # Trick complete
        winner = trick_winner(cards_played, trump_letter)
        winner_seat = winner["seat"]
        winner_team = TEAM_FOR_SEAT[winner_seat]
        points = trick_card_points(cards_played)
        trick_number = trick_play["trick_number"]

        if trick_number == 12:
            points += 1

        trick_play["trick_scores"][winner_team] += points
        trick_play["tricks_taken"][winner_team] += 1

        await manager.broadcast(room_code, {
            "event": "CARD_PLAYED",
            "payload": {
                "seat": sender_seat,
                "card": card,
                "next_to_act_seat": None,
            },
        })

        await manager.broadcast(room_code, {
            "event": "TRICK_COMPLETED",
            "payload": {
                "trick_number": trick_number,
                "winner_seat": winner_seat,
                "cards_played": cards_played,
                "trick_points": points,
                "tricks_taken": trick_play["tricks_taken"],
                "trick_scores": trick_play["trick_scores"],
            },
        })

        if trick_number < 12:
            # Set up next trick
            trick_play["trick_number"] = trick_number + 1
            trick_play["led_seat"] = winner_seat
            trick_play["next_to_act_seat"] = winner_seat
            trick_play["cards_played"] = []
            game.current_state_json = state
            await db.flush()

            await _send_your_turn(game, room_code, state, winner_seat)
        else:
            # Hand complete — score the hand
            bidding = hand["bidding"]
            bid = bidding["winning_bid"]
            bidding_team = TEAM_FOR_SEAT[bidding["winning_seat"]]

            score_deltas = score_hand(
                bid=bid,
                bidding_team=bidding_team,
                trick_scores=trick_play["trick_scores"],
                tricks_taken=trick_play["tricks_taken"],
                team_meld=hand["team_meld"],
            )

            game_scores = state["game_scores"]
            game_scores["NS"] += score_deltas["NS"]
            game_scores["EW"] += score_deltas["EW"]

            state["phase"] = "HAND_COMPLETE"
            hand["score_deltas"] = score_deltas
            hand["hand_result_acknowledged_seats"] = []
            game.current_state_json = state
            await db.flush()

            await manager.broadcast(room_code, {
                "event": "HAND_COMPLETED",
                "payload": {
                    "trick_scores": trick_play["trick_scores"],
                    "team_meld": hand["team_meld"],
                    "bid": bid,
                    "bidding_team": bidding_team,
                    "score_deltas": score_deltas,
                    "game_scores": game_scores,
                },
            })


async def handle_acknowledge_hand_result(
    websocket: WebSocket,
    room_code: str,
    user_id: uuid.UUID,
    db: AsyncSession,
):
    game = await _load_game(db, room_code)
    if game is None:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "Game not found"},
        })
        return

    state = copy.deepcopy(game.current_state_json or {})
    if state.get("phase") != "HAND_COMPLETE":
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "Game is not in the hand complete phase"},
        })
        return

    # Find sender's seat
    sender_seat = None
    for seat, col in SEAT_COLUMNS.items():
        if getattr(game, col) == user_id:
            sender_seat = seat
            break

    if sender_seat is None:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "You are not seated in this game"},
        })
        return

    hand = state["current_hand"]
    acked = hand.get("hand_result_acknowledged_seats", [])

    if sender_seat in acked:
        await manager.send_personal(websocket, {
            "event": "ERROR",
            "payload": {"message": "You have already acknowledged the hand result"},
        })
        return

    acked.append(sender_seat)
    hand["hand_result_acknowledged_seats"] = acked

    if len(acked) < 4:
        game.current_state_json = state
        await db.flush()

        await manager.broadcast(room_code, {
            "event": "HAND_RESULT_ACKNOWLEDGED",
            "payload": {
                "seat": sender_seat,
                "acknowledged_seats": list(acked),
            },
        })
    else:
        # All 4 acknowledged — deal next hand
        player_hands = shuffle_and_deal()
        prev_hand = hand
        new_dealer = _next_seat(prev_hand["dealer_seat"])
        first_bidder = _next_seat(new_dealer)
        new_hand_number = prev_hand["hand_number"] + 1

        state["current_hand"] = {
            "hand_number": new_hand_number,
            "dealer_seat": new_dealer,
            "bidding": {
                "winning_bid": None,
                "winning_seat": None,
                "is_shoot_the_moon": False,
                "next_to_act_seat": first_bidder,
                "passed_seats": [],
            },
        }
        state["player_hands"] = player_hands
        state["phase"] = "BIDDING"
        game.current_state_json = state
        await db.flush()

        # Send private HAND_DEALT to each connected player
        seat_to_user_id = {
            s: getattr(game, c) for s, c in SEAT_COLUMNS.items()
        }
        connections = manager.get_connections(room_code)
        for conn in connections:
            for s, uid in seat_to_user_id.items():
                if conn.user_id == uid:
                    await manager.send_personal(conn.websocket, {
                        "event": "HAND_DEALT",
                        "payload": {"cards": player_hands[s]},
                    })
                    break

        await manager.broadcast(room_code, {
            "event": "BIDDING_TURN",
            "payload": {
                "current_highest_bid": None,
                "highest_bidder_seat": None,
                "next_to_act_seat": first_bidder,
                "minimum_valid_bid": 20,
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
