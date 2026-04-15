"""REMATCH_REQUEST reducer.

Collects acks from all 4 seated players. Once all four have requested,
the game resets to a fresh bidding state with the same seats and zero scores.
"""
from app.engine.constants import new_hand_state
from app.engine.errors import ErrorCode, GameRuleError


def reduce(state: dict, payload: dict, actor_seat, metadata: dict):
    if state.get("phase") != "GAME_OVER":
        raise GameRuleError(
            ErrorCode.REMATCH_NOT_AVAILABLE,
            "Rematch is only available after the game ends",
        )
    if actor_seat is None:
        raise GameRuleError(ErrorCode.NOT_SEATED, "You are not seated in this game")

    pending = state.setdefault("pending_rematch_seats", [])
    if actor_seat in pending:
        raise GameRuleError(
            ErrorCode.ALREADY_REQUESTED_REMATCH,
            "You have already requested a rematch",
        )

    pending.append(actor_seat)

    if len(pending) < 4:
        events = [{
            "scope": "broadcast",
            "event": "REMATCH_REQUESTED",
            "payload": {
                "seat": actor_seat,
                "pending_seats": list(pending),
            },
        }]
        return state, events, []

    # All 4 requested — reset the game.
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

    events = [
        {
            "scope": "broadcast",
            "event": "REMATCH_STARTED",
            "payload": {
                "dealer_seat": dealer_seat,
                "first_bidder_seat": first_bidder,
            },
        },
        {
            "scope": "per_seat",
            "event": "HAND_DEALT",
            "payloads": {seat: {"cards": cards} for seat, cards in player_hands.items()},
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
    side_effects = [{
        "type": "save_extra",
        "extra": {
            "status": "IN_PROGRESS",
            "ns_total_score": 0,
            "ew_total_score": 0,
            "ended_at": None,
        },
        "set_started_at": True,
    }]
    return new_state, events, side_effects
