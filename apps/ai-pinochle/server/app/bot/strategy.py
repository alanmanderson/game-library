"""Random-legal-move strategy for AI bots.

Every function returns an action dict ready to feed into the state machine.
The strategy is intentionally simple: pick a random legal option. A smarter
strategy can be swapped in later by replacing these functions.
"""
import random

from app.engine.meld import calculate_melds
from app.engine.tricks import card_suit, get_legal_cards

RANK_ORDER = {"9": 0, "J": 1, "Q": 2, "K": 3, "10": 4, "A": 5}
SUIT_NAMES = {"H": "HEARTS", "S": "SPADES", "D": "DIAMONDS", "C": "CLUBS"}
SUIT_CHARS = {"HEARTS": "H", "SPADES": "S", "DIAMONDS": "D", "CLUBS": "C"}


def choose_bid(hand: list[str], bidding_state: dict) -> dict:
    """Decide whether to bid or pass.

    Simple heuristic: estimate hand strength as total meld points across all
    possible trump suits + count of aces/10s. If strength exceeds a threshold,
    bid the minimum. Otherwise pass.
    """
    best_meld = 0
    for suit_name in SUIT_NAMES.values():
        melds = calculate_melds(hand, suit_name)
        total = sum(m["points"] for m in melds)
        if total > best_meld:
            best_meld = total

    high_cards = sum(1 for c in hand if c[:-1] in ("A", "10"))
    strength = best_meld + high_cards

    winning_bid = bidding_state.get("winning_bid")
    # minimum_valid_bid isn't in persisted state — compute from winning_bid
    minimum = (winning_bid + 1) if winning_bid is not None else 25

    # In Pinochle the dealer must bid if everyone else passed (winning_bid is
    # still None). Always bid the minimum in that situation to avoid a
    # DEALER_MUST_BID error from the engine.
    dealer_forced = winning_bid is None and len(bidding_state.get("passed_seats", [])) == 3

    if dealer_forced or (strength >= 20 and (winning_bid is None or minimum <= strength + 5)):
        return {"action": "SUBMIT_BID", "payload": {"amount": minimum}}
    return {"action": "SUBMIT_BID", "payload": {}}


def choose_trump(hand: list[str]) -> dict:
    """Pick trump suit = suit with most cards."""
    suit_counts: dict[str, int] = {}
    for card in hand:
        s = card_suit(card)
        suit_counts[s] = suit_counts.get(s, 0) + 1
    best_suit = max(suit_counts, key=suit_counts.get)  # type: ignore[arg-type]
    return {
        "action": "DECLARE_TRUMP",
        "payload": {"suit": SUIT_NAMES[best_suit], "shoot_the_moon": False},
    }


def choose_pass_cards(hand: list[str], trump_suit: str) -> dict:
    """Pass 3 weakest non-trump cards to partner."""
    trump_char = SUIT_CHARS.get(trump_suit, trump_suit)

    non_trump = [c for c in hand if card_suit(c) != trump_char]
    if len(non_trump) >= 3:
        non_trump.sort(key=lambda c: RANK_ORDER.get(c[:-1], 0))
        return {"action": "PASS_CARDS", "payload": {"cards": non_trump[:3]}}

    sorted_hand = sorted(hand, key=lambda c: RANK_ORDER.get(c[:-1], 0))
    return {"action": "PASS_CARDS", "payload": {"cards": sorted_hand[:3]}}


def choose_card(hand: list[str], state: dict, seat: str) -> dict:
    """Play a random legal card."""
    trick_play = state.get("current_hand", {}).get("trick_play", {})
    cards_played = trick_play.get("cards_played", [])
    trump_suit = state.get("current_hand", {}).get("trump_suit", "HEARTS")

    led_suit = None
    if cards_played:
        led_suit = card_suit(cards_played[0]["card"])

    trump_char = SUIT_CHARS.get(trump_suit, trump_suit)

    legal = get_legal_cards(hand, led_suit, trump_char, cards_played)
    card = random.choice(legal) if legal else hand[0]
    return {"action": "PLAY_CARD", "payload": {"card": card}}


def choose_acknowledge() -> dict:
    """Generic acknowledge for meld phase."""
    return {"action": "ACKNOWLEDGE_MELD", "payload": {}}


def choose_acknowledge_hand_result() -> dict:
    """Acknowledge hand result."""
    return {"action": "ACKNOWLEDGE_HAND_RESULT", "payload": {}}
