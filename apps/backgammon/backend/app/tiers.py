"""League tier mapping for ranked play.

Maps a player's ELO rating to one of five tier buckets. Used on leaderboard,
dashboard, and player profile responses.

Thresholds are intentionally coarse and exclusive upper-bounds so the function
is a pure mapping (no hysteresis / promotion logic yet).
"""

from typing import Final


# Ordered from lowest to highest.
TIER_ORDER: Final[tuple[str, ...]] = (
    "Bronze",
    "Silver",
    "Gold",
    "Platinum",
    "Diamond",
)


def tier_for_rating(rating: int) -> str:
    """Return the tier name for a given ELO rating.

    - Bronze:   <1400
    - Silver:   1400-1599
    - Gold:     1600-1799
    - Platinum: 1800-1999
    - Diamond:  >=2000
    """
    if rating < 1400:
        return "Bronze"
    if rating < 1600:
        return "Silver"
    if rating < 1800:
        return "Gold"
    if rating < 2000:
        return "Platinum"
    return "Diamond"
