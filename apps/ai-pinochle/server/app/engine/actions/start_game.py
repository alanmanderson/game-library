"""START_GAME reducer: deal the first hand and open bidding."""
from app.engine.constants import new_hand_state
from app.engine.errors import ErrorCode, GameRuleError


def reduce(state: dict, payload: dict, actor_seat, metadata: dict):
    if state.get("phase") != "LOBBY_WAITING":
        raise GameRuleError(ErrorCode.WRONG_PHASE, "Game is not in the lobby phase")

    created_by = state.get("created_by")
    actor_user_id = metadata.get("actor_user_id")
    if created_by and actor_user_id and str(actor_user_id) != created_by:
        raise GameRuleError(
            ErrorCode.NOT_GAME_CREATOR,
            "Only the game creator can start the game",
        )

    if not metadata.get("all_seats_filled"):
        raise GameRuleError(
            ErrorCode.SEATS_NOT_FULL,
            "All seats must be occupied before starting",
        )

    player_hands = metadata["new_deal"]
    dealer_seat = metadata["new_dealer"]
    first_bidder = metadata["first_bidder"]

    new_state = {
        "room_code": state.get("room_code") or metadata.get("room_code"),
        "phase": "BIDDING",
        "game_scores": {"NS": 0, "EW": 0},
        "current_hand": new_hand_state(1, dealer_seat, first_bidder),
        "player_hands": player_hands,
        "created_by": state.get("created_by"),
    }

    events = _deal_and_bidding_events(player_hands, first_bidder)
    return new_state, events, [{"type": "game_started"}]


def _deal_and_bidding_events(player_hands: dict, first_bidder: str) -> list[dict]:
    """Private HAND_DEALT per seat + public BIDDING_TURN to open the auction."""
    return [
        {
            "scope": "per_seat",
            "event": "HAND_DEALT",
            "payloads": {
                seat: {"cards": cards} for seat, cards in player_hands.items()
            },
        },
        {
            "scope": "broadcast",
            "event": "BIDDING_TURN",
            "payload": {
                "current_highest_bid": None,
                "highest_bidder_seat": None,
                "next_to_act_seat": first_bidder,
                "minimum_valid_bid": 25,
            },
        },
    ]
