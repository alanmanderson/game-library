"""Translate reducer event specs into WebSocket frames.

Event spec scopes:
  - "broadcast"   — send to every connection in the room
  - "seat"        — send to one seat's connection
  - "per_seat"    — send a different payload to each seat
  - "your_turn"   — adapter-computed legal-cards envelope for the next actor
"""
import logging
import uuid

from app.engine.meld import SUIT_LETTER
from app.engine.tricks import card_suit, get_legal_cards, trick_winner
from app.models.game import Game
from app.websocket.connection_manager import manager

logger = logging.getLogger(__name__)

SEAT_COLUMNS = {
    "NORTH": "north_player_id",
    "EAST": "east_player_id",
    "SOUTH": "south_player_id",
    "WEST": "west_player_id",
}


async def dispatch(
    game: Game, room_code: str, state: dict, events: list[dict]
) -> None:
    seat_to_user_id = {s: getattr(game, c) for s, c in SEAT_COLUMNS.items()}
    for spec in events:
        scope = spec["scope"]
        if scope == "broadcast":
            await manager.broadcast(room_code, {
                "event": spec["event"],
                "payload": spec["payload"],
            })
        elif scope == "seat":
            await _send_to_seat(
                room_code, seat_to_user_id[spec["seat"]],
                spec["event"], spec["payload"],
            )
        elif scope == "per_seat":
            for seat, pl in spec["payloads"].items():
                await _send_to_seat(
                    room_code, seat_to_user_id[seat], spec["event"], pl
                )
        elif scope == "your_turn":
            await _send_your_turn(game, room_code, state, spec["seat"])
        else:
            logger.warning("unknown event scope %s", scope)


async def _send_to_seat(
    room_code: str, user_id: uuid.UUID | None, event: str, payload: dict
) -> None:
    if user_id is None:
        return
    for conn in manager.get_connections(room_code):
        if conn.user_id == user_id:
            await manager.send_personal(conn.websocket, {
                "event": event,
                "payload": payload,
            })
            return


async def _send_your_turn(
    game: Game, room_code: str, state: dict, seat: str
) -> None:
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

    await _send_to_seat(room_code, user_id, "YOUR_TURN", {
        "seat": seat,
        "legal_cards": legal_cards,
        "trick_number": trick_play["trick_number"],
        "led_suit": led_suit,
        "cards_played": cards_played,
        "currently_winning": currently_winning,
    })
