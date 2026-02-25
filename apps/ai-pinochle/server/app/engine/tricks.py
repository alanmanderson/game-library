"""Pure trick-playing logic for Pinochle. No DB or WebSocket dependencies."""

RANK_ORDER = {"A": 5, "10": 4, "K": 3, "Q": 2, "J": 1, "9": 0}
POINT_VALUES = {"A": 1, "10": 1, "K": 1, "Q": 0, "J": 0, "9": 0}


def card_suit(card: str) -> str:
    """Extract suit letter. 'AH' -> 'H', '10S' -> 'S'."""
    return card[-1]


def card_rank(card: str) -> str:
    """Extract rank. 'AH' -> 'A', '10S' -> '10'."""
    return card[:-1]


def _would_win(card: str, cards_played: list[dict], trump_suit: str) -> bool:
    """Check if playing this card would win the current trick."""
    test = cards_played + [{"seat": "_", "card": card}]
    return trick_winner(test, trump_suit)["seat"] == "_"


def get_legal_cards(
    hand: list[str],
    led_suit: str | None,
    trump_suit: str,
    cards_played: list[dict] | None = None,
) -> list[str]:
    """Return legal cards to play from hand.

    Pinochle rules enforced:
    1. Must follow suit if able.
    2. If can't follow suit, must trump if able.
    3. If neither, play anything.
    4. Must head the trick (play a card that wins) if possible,
       within the constraints above. Ties go to first played.

    Args:
        hand: Player's current hand.
        led_suit: Suit letter of the led card, or None if leading.
        trump_suit: Suit letter of trump.
        cards_played: Cards already on the table (for must-head check).
    """
    if led_suit is None:
        return list(hand)

    # Determine candidate pool
    follow_cards = [c for c in hand if card_suit(c) == led_suit]
    if follow_cards:
        candidates = follow_cards
    else:
        trump_cards = [c for c in hand if card_suit(c) == trump_suit]
        if trump_cards:
            candidates = trump_cards
        else:
            return list(hand)

    # Must head the trick: restrict to winners if any candidate can win
    if cards_played:
        winners = [c for c in candidates if _would_win(c, cards_played, trump_suit)]
        if winners:
            return winners

    return candidates


def trick_winner(cards_played: list[dict], trump_suit: str) -> dict:
    """Determine the winning entry from cards played so far.

    Args:
        cards_played: List of {"seat": str, "card": str} in play order.
        trump_suit: Suit letter of trump.

    Returns:
        The winning {"seat": str, "card": str} entry.
    """
    led_suit = card_suit(cards_played[0]["card"])
    best = cards_played[0]
    best_is_trump = card_suit(best["card"]) == trump_suit

    for entry in cards_played[1:]:
        suit = card_suit(entry["card"])
        is_trump = suit == trump_suit
        entry_rank = RANK_ORDER[card_rank(entry["card"])]
        best_rank = RANK_ORDER[card_rank(best["card"])]

        if best_is_trump:
            # Only a strictly higher trump can beat current best
            if is_trump and entry_rank > best_rank:
                best = entry
        else:
            if is_trump:
                # Trump beats non-trump
                best = entry
                best_is_trump = True
            elif suit == led_suit and entry_rank > best_rank:
                # Higher card of led suit (strictly greater — first played wins ties)
                best = entry

    return best


def trick_card_points(cards_played: list[dict]) -> int:
    """Sum point values of cards in a trick (no last-trick bonus)."""
    return sum(POINT_VALUES[card_rank(e["card"])] for e in cards_played)
