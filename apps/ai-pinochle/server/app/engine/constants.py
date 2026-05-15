"""Pinochle constants shared across pure engine code."""
from app.engine.deck import SEATS

VALID_SEATS = {"NORTH", "EAST", "SOUTH", "WEST"}

VALID_SUITS = {"HEARTS", "DIAMONDS", "CLUBS", "SPADES"}

TEAM_FOR_SEAT = {"NORTH": "NS", "SOUTH": "NS", "EAST": "EW", "WEST": "EW"}

PARTNER_SEAT = {"NORTH": "SOUTH", "SOUTH": "NORTH", "EAST": "WEST", "WEST": "EAST"}

# Card codes are 2-3 chars (e.g. "AH", "10S"). Generous upper bound for sanity.
MAX_CARD_LEN = 3


def next_seat(seat: str) -> str:
    """Return the next seat clockwise."""
    idx = SEATS.index(seat)
    return SEATS[(idx + 1) % 4]


def is_valid_card_code(value) -> bool:
    return isinstance(value, str) and 2 <= len(value) <= MAX_CARD_LEN


def new_hand_state(hand_number: int, dealer_seat: str, first_bidder: str) -> dict:
    return {
        "hand_number": hand_number,
        "dealer_seat": dealer_seat,
        "bidding": {
            "winning_bid": None,
            "winning_seat": None,
            "is_shoot_the_moon": False,
            "next_to_act_seat": first_bidder,
            "passed_seats": [],
            # Ordered list of {seat, bid_amount} entries used both for analytics
            # persistence and to record the pass-vs-bid history.
            "auction": [],
        },
    }
