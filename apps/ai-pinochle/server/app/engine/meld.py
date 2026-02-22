from collections import Counter

SUIT_LETTER = {
    "HEARTS": "H",
    "DIAMONDS": "D",
    "CLUBS": "C",
    "SPADES": "S",
}

ALL_SUITS = ["H", "D", "C", "S"]

# Ranks that form a run (in order)
RUN_RANKS = ["A", "10", "K", "Q", "J"]


def calculate_melds(hand: list[str], trump_suit: str) -> list[dict]:
    """Calculate all melds in a Pinochle hand given the trump suit.

    Args:
        hand: List of card codes (e.g., ["AH", "10H", "KH", ...])
        trump_suit: Full suit name (e.g., "HEARTS")

    Returns:
        List of meld dicts with name, cards, and points.
    """
    counts = Counter(hand)
    trump = SUIT_LETTER[trump_suit]
    melds: list[dict] = []

    # --- Runs (trump suit only) ---
    runs_used = _check_runs(counts, trump, melds)

    # --- Arounds (A, K, Q, J of all 4 suits) ---
    _check_arounds(counts, melds)

    # --- Pinochle (JD + QS) ---
    _check_pinochle(counts, melds)

    # --- Marriages (K + Q of same suit) ---
    _check_marriages(counts, trump, runs_used, melds)

    # --- Dix (9 of trump) ---
    _check_dix(counts, trump, melds)

    return melds


def _check_runs(
    counts: Counter, trump: str, melds: list[dict]
) -> int:
    """Check for single/double runs. Returns how many runs were found (0, 1, or 2)."""
    run_cards = [f"{rank}{trump}" for rank in RUN_RANKS]

    # Check if we have 2 of each run card (double run)
    if all(counts[c] >= 2 for c in run_cards):
        cards = []
        for c in run_cards:
            cards.extend([c, c])
        melds.append({"name": "Double Run", "cards": cards, "points": 150})
        return 2

    # Check for single run
    if all(counts[c] >= 1 for c in run_cards):
        melds.append({"name": "Run", "cards": list(run_cards), "points": 15})
        return 1

    return 0


def _check_arounds(counts: Counter, melds: list[dict]) -> None:
    """Check for Aces/Kings/Queens/Jacks around (one or two of each suit)."""
    around_specs = [
        ("A", "Aces Around", "Double Aces Around", 10, 100),
        ("K", "Kings Around", "Double Kings Around", 8, 80),
        ("Q", "Queens Around", "Double Queens Around", 6, 60),
        ("J", "Jacks Around", "Double Jacks Around", 4, 40),
    ]

    for rank, single_name, double_name, single_pts, double_pts in around_specs:
        cards_by_suit = [f"{rank}{s}" for s in ALL_SUITS]

        # Check double around (2 of each suit)
        if all(counts[c] >= 2 for c in cards_by_suit):
            cards = []
            for c in cards_by_suit:
                cards.extend([c, c])
            melds.append({"name": double_name, "cards": cards, "points": double_pts})
        # Check single around (1 of each suit)
        elif all(counts[c] >= 1 for c in cards_by_suit):
            melds.append({"name": single_name, "cards": list(cards_by_suit), "points": single_pts})


def _check_pinochle(counts: Counter, melds: list[dict]) -> None:
    """Check for single or double Pinochle (JD + QS)."""
    jd_count = counts["JD"]
    qs_count = counts["QS"]

    if jd_count >= 2 and qs_count >= 2:
        melds.append({
            "name": "Double Pinochle",
            "cards": ["JD", "JD", "QS", "QS"],
            "points": 30,
        })
    elif jd_count >= 1 and qs_count >= 1:
        melds.append({
            "name": "Pinochle",
            "cards": ["JD", "QS"],
            "points": 4,
        })


def _check_marriages(
    counts: Counter, trump: str, runs_used: int,
    melds: list[dict],
) -> None:
    """Check for marriages (K + Q of same suit).

    Royal Marriages (trump suit) are 4 pts each.
    Regular Marriages (non-trump) are 2 pts each.
    Cards can be reused across meld types (e.g., King in Kings Around AND Marriage),
    but Runs consume K-Q pairs from the trump suit, so subtract runs_used.
    """
    for suit in ALL_SUITS:
        king = f"K{suit}"
        queen = f"Q{suit}"
        pairs = min(counts[king], counts[queen])

        if suit == trump:
            # Runs already used some K-Q pairs
            pairs = max(0, pairs - runs_used)

        if pairs > 0:
            is_royal = suit == trump
            name = "Royal Marriage" if is_royal else "Marriage"
            pts = 4 if is_royal else 2
            for _ in range(pairs):
                melds.append({
                    "name": name,
                    "cards": [king, queen],
                    "points": pts,
                })


def _check_dix(counts: Counter, trump: str, melds: list[dict]) -> None:
    """Check for Dix (9 of trump). Each 9 of trump = 1 pt."""
    nine_trump = f"9{trump}"
    for _ in range(counts[nine_trump]):
        melds.append({"name": "Dix", "cards": [nine_trump], "points": 1})
