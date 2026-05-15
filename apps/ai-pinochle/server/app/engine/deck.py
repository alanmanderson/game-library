import random

RANKS = ["A", "10", "K", "Q", "J", "9"]
SUITS = {"H": "hearts", "S": "spades", "D": "diamonds", "C": "clubs"}

SEATS = ["NORTH", "EAST", "SOUTH", "WEST"]

# All valid card codes: "AH", "10S", "9C", etc.
CARD_CODES = [f"{rank}{suit}" for rank in RANKS for suit in SUITS]


def create_deck() -> list[str]:
    """Return a 48-card Pinochle deck (each card appears twice)."""
    return CARD_CODES * 2


def shuffle_and_deal(deck: list[str] | None = None) -> dict[str, list[str]]:
    """Shuffle the deck and deal 12 cards to each of the 4 seats."""
    if deck is None:
        deck = create_deck()
    deck = list(deck)
    random.shuffle(deck)
    return {seat: deck[i * 12 : (i + 1) * 12] for i, seat in enumerate(SEATS)}
