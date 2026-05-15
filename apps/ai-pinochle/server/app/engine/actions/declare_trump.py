"""DECLARE_TRUMP reducer: bid winner names trump, state moves to PASSING_CARDS.

The adapter handles analytics persistence (inserting the hands/bids rows) as
a side effect because the new hand_id has to be injected back into state.
"""
from app.engine.constants import PARTNER_SEAT, TEAM_FOR_SEAT, VALID_SUITS
from app.engine.errors import ErrorCode, GameRuleError


def reduce(state: dict, payload: dict, actor_seat, metadata: dict):
    if state.get("phase") != "NAMING_TRUMP":
        raise GameRuleError(
            ErrorCode.WRONG_PHASE, "Game is not in the trump naming phase"
        )

    hand = state["current_hand"]
    winning_seat = hand["bidding"]["winning_seat"]

    if actor_seat != winning_seat:
        raise GameRuleError(
            ErrorCode.NOT_BID_WINNER, "Only the bid winner can declare trump"
        )

    raw_suit = payload.get("suit")
    if not isinstance(raw_suit, str):
        raise GameRuleError(ErrorCode.INVALID_SUIT, f"Invalid suit: {raw_suit}")

    suit = raw_suit.upper()
    if suit not in VALID_SUITS:
        raise GameRuleError(ErrorCode.INVALID_SUIT, f"Invalid suit: {raw_suit}")

    shoot_the_moon = bool(payload.get("shoot_the_moon", False))
    if shoot_the_moon:
        hand["bidding"]["is_shoot_the_moon"] = True

    hand["trump_suit"] = suit

    bidding_team = TEAM_FOR_SEAT[winning_seat]
    partner_seat = PARTNER_SEAT[winning_seat]

    hand["card_passing"] = {
        "bidding_team": bidding_team,
        "bidder_seat": winning_seat,
        "partner_seat": partner_seat,
        "submitted": {},
    }
    state["phase"] = "PASSING_CARDS"

    bidding = hand["bidding"]

    events = [
        {
            "scope": "broadcast",
            "event": "TRUMP_NAMED",
            "payload": {
                "trump_suit": suit,
                "declared_by_seat": winning_seat,
                "bidding_team": bidding_team,
                "winning_bid": bidding["winning_bid"],
                "is_shoot_the_moon": bidding["is_shoot_the_moon"],
            },
        },
        {
            "scope": "broadcast",
            "event": "PASSING_PHASE_STARTED",
            "payload": {
                "trump_suit": suit,
                "bidding_team": bidding_team,
                "bidder_seat": winning_seat,
                "partner_seat": partner_seat,
            },
        },
    ]

    side_effects = [{
        "type": "hand_created",
        "hand_number": hand["hand_number"],
        "winning_seat": winning_seat,
        "winning_bid": bidding["winning_bid"],
        "is_shoot_the_moon": bidding["is_shoot_the_moon"],
        "trump_suit": suit,
        "bidding_team": bidding_team,
        "auction": list(bidding.get("auction", [])),
    }]
    return state, events, side_effects
