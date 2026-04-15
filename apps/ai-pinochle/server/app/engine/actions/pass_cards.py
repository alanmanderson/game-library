"""PASS_CARDS reducer: bidding team exchanges 3 cards each.

When both partners have submitted, hands are swapped, melds are calculated,
and the phase transitions to SHOWING_MELD.
"""
from app.engine.constants import TEAM_FOR_SEAT, is_valid_card_code
from app.engine.deck import SEATS
from app.engine.errors import ErrorCode, GameRuleError
from app.engine.meld import calculate_melds


def reduce(state: dict, payload: dict, actor_seat, metadata: dict):
    if state.get("phase") != "PASSING_CARDS":
        raise GameRuleError(
            ErrorCode.WRONG_PHASE, "Game is not in the card passing phase"
        )

    if actor_seat is None:
        raise GameRuleError(ErrorCode.NOT_SEATED, "You are not seated in this game")

    hand = state["current_hand"]
    card_passing = hand["card_passing"]
    bidding_team = card_passing["bidding_team"]

    if TEAM_FOR_SEAT[actor_seat] != bidding_team:
        raise GameRuleError(
            ErrorCode.NOT_BIDDING_TEAM, "Only the bidding team passes cards"
        )

    if actor_seat in card_passing["submitted"]:
        raise GameRuleError(
            ErrorCode.ALREADY_PASSED, "You have already submitted your cards"
        )

    cards = payload.get("cards", [])
    if not isinstance(cards, list) or len(cards) != 3:
        raise GameRuleError(
            ErrorCode.INVALID_PASS_CARDS, "You must pass exactly 3 cards"
        )
    if not all(is_valid_card_code(c) for c in cards):
        raise GameRuleError(ErrorCode.INVALID_CARD, "Cards must be valid card codes")

    player_hand = list(state["player_hands"][actor_seat])
    for card in cards:
        if card in player_hand:
            player_hand.remove(card)
        else:
            raise GameRuleError(
                ErrorCode.CARD_NOT_IN_HAND, f"Card {card} is not in your hand"
            )

    card_passing["submitted"][actor_seat] = cards
    submitted_seats = list(card_passing["submitted"].keys())

    if len(submitted_seats) < 2:
        events = [{
            "scope": "broadcast",
            "event": "CARDS_PASSED",
            "payload": {
                "seat": actor_seat,
                "submitted_seats": submitted_seats,
            },
        }]
        return state, events, []

    # Both partners have submitted — swap hands, compute melds, advance phase.
    bidder_seat = card_passing["bidder_seat"]
    partner_seat = card_passing["partner_seat"]
    bidder_cards = card_passing["submitted"][bidder_seat]
    partner_cards = card_passing["submitted"][partner_seat]

    bidder_hand = list(state["player_hands"][bidder_seat])
    partner_hand = list(state["player_hands"][partner_seat])

    for card in bidder_cards:
        bidder_hand.remove(card)
    for card in partner_cards:
        partner_hand.remove(card)

    bidder_hand.extend(partner_cards)
    partner_hand.extend(bidder_cards)

    state["player_hands"][bidder_seat] = bidder_hand
    state["player_hands"][partner_seat] = partner_hand

    trump_suit = hand["trump_suit"]
    player_melds = {}
    team_meld = {"NS": 0, "EW": 0}
    for seat_name in SEATS:
        seat_hand = state["player_hands"][seat_name]
        melds = calculate_melds(seat_hand, trump_suit)
        total = sum(m["points"] for m in melds)
        player_melds[seat_name] = {"melds": melds, "total": total}
        team_meld[TEAM_FOR_SEAT[seat_name]] += total

    hand["team_meld"] = team_meld
    hand["player_melds"] = player_melds
    hand["meld_acknowledged_seats"] = []
    state["phase"] = "SHOWING_MELD"

    bidding = hand["bidding"]
    events = [
        {
            "scope": "broadcast",
            "event": "CARDS_PASSED",
            "payload": {"seat": actor_seat, "submitted_seats": submitted_seats},
        },
        {
            "scope": "per_seat",
            "event": "CARDS_RECEIVED",
            "payloads": {
                bidder_seat: {
                    "cards_received": partner_cards,
                    "new_hand": bidder_hand,
                },
                partner_seat: {
                    "cards_received": bidder_cards,
                    "new_hand": partner_hand,
                },
            },
        },
        {
            "scope": "broadcast",
            "event": "MELD_BROADCAST",
            "payload": {
                "trump_suit": trump_suit,
                "winning_bid": bidding["winning_bid"],
                "is_shoot_the_moon": bidding["is_shoot_the_moon"],
                "bidding_team": bidding_team,
                "team_meld": team_meld,
                "player_melds": player_melds,
            },
        },
    ]
    return state, events, []
