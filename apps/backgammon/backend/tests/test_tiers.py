"""Tests for the league-tier mapping in app.tiers."""

import pytest

from app.tiers import TIER_ORDER, tier_for_rating


@pytest.mark.parametrize(
    "rating,expected",
    [
        (0, "Bronze"),
        (1000, "Bronze"),
        (1399, "Bronze"),
        (1400, "Silver"),
        (1500, "Silver"),
        (1599, "Silver"),
        (1600, "Gold"),
        (1799, "Gold"),
        (1800, "Platinum"),
        (1999, "Platinum"),
        (2000, "Diamond"),
        (2500, "Diamond"),
    ],
)
def test_tier_for_rating_thresholds(rating: int, expected: str) -> None:
    assert tier_for_rating(rating) == expected


def test_tier_order_covers_all_tiers() -> None:
    # Every tier returned by tier_for_rating must be present in TIER_ORDER so
    # the frontend and backend stay in sync.
    produced = {tier_for_rating(r) for r in range(0, 3000, 100)}
    assert produced.issubset(set(TIER_ORDER))
