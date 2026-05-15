"""Tests for hand scoring logic."""

import pytest
from app.engine.scoring import score_hand


# ---------------------------------------------------------------------------
# Normal scoring — bidding team makes their bid
# ---------------------------------------------------------------------------

def test_bidding_team_makes_bid_exact():
    """Bidding team scores meld + tricks when the total equals the bid."""
    deltas = score_hand(
        bid=30,
        bidding_team="NS",
        trick_scores={"NS": 20, "EW": 10},
        tricks_taken={"NS": 8, "EW": 4},
        team_meld={"NS": 10, "EW": 15},
    )
    assert deltas["NS"] == 30  # 10 meld + 20 tricks == bid
    assert deltas["EW"] == 25  # 15 meld + 10 tricks


def test_bidding_team_makes_bid_above():
    """Bidding team scores their full total when it exceeds the bid."""
    deltas = score_hand(
        bid=25,
        bidding_team="NS",
        trick_scores={"NS": 25, "EW": 5},
        tricks_taken={"NS": 10, "EW": 2},
        team_meld={"NS": 20, "EW": 8},
    )
    assert deltas["NS"] == 45  # 20 meld + 25 tricks > bid
    assert deltas["EW"] == 13  # 8 meld + 5 tricks


def test_non_bidding_team_scores_meld_plus_tricks():
    """Non-bidding team always scores meld + tricks when they take at least one trick."""
    deltas = score_hand(
        bid=30,
        bidding_team="EW",
        trick_scores={"NS": 15, "EW": 15},
        tricks_taken={"NS": 5, "EW": 7},
        team_meld={"NS": 12, "EW": 18},
    )
    assert deltas["NS"] == 27  # 12 meld + 15 tricks
    assert deltas["EW"] == 33  # 18 meld + 15 tricks >= bid 30


# ---------------------------------------------------------------------------
# Bidding team fails to make bid — scores -bid
# ---------------------------------------------------------------------------

def test_bidding_team_fails_bid():
    """Bidding team scores -bid when meld + tricks falls short."""
    deltas = score_hand(
        bid=35,
        bidding_team="NS",
        trick_scores={"NS": 10, "EW": 20},
        tricks_taken={"NS": 4, "EW": 8},
        team_meld={"NS": 10, "EW": 15},
    )
    assert deltas["NS"] == -35  # 10 + 10 = 20 < 35, so -bid
    assert deltas["EW"] == 35   # 15 meld + 20 tricks


def test_bidding_team_fails_bid_ew():
    """Bidding team EW scores -bid when they fall short."""
    deltas = score_hand(
        bid=40,
        bidding_team="EW",
        trick_scores={"NS": 18, "EW": 12},
        tricks_taken={"NS": 6, "EW": 6},
        team_meld={"NS": 10, "EW": 20},
    )
    assert deltas["EW"] == -40  # 20 + 12 = 32 < 40
    assert deltas["NS"] == 28   # 10 meld + 18 tricks


# ---------------------------------------------------------------------------
# Team takes zero tricks — scores 0
# ---------------------------------------------------------------------------

def test_non_bidding_team_zero_tricks_scores_zero():
    """Non-bidding team scores 0 when they take no tricks (no meld counts)."""
    deltas = score_hand(
        bid=25,
        bidding_team="NS",
        trick_scores={"NS": 30, "EW": 0},
        tricks_taken={"NS": 12, "EW": 0},
        team_meld={"NS": 10, "EW": 20},
    )
    assert deltas["NS"] == 40   # 10 meld + 30 tricks >= bid
    assert deltas["EW"] == 0    # zero tricks → 0 regardless of meld


def test_bidding_team_zero_tricks_scores_negative_bid():
    """Bidding team scores -bid if they somehow take no tricks."""
    deltas = score_hand(
        bid=30,
        bidding_team="NS",
        trick_scores={"NS": 0, "EW": 30},
        tricks_taken={"NS": 0, "EW": 12},
        team_meld={"NS": 15, "EW": 10},
    )
    assert deltas["NS"] == -30  # zero tricks → -bid
    assert deltas["EW"] == 40   # 10 meld + 30 tricks


# ---------------------------------------------------------------------------
# Shoot the moon success — bidding team takes all tricks, earns +50 bonus
# ---------------------------------------------------------------------------

def test_shoot_the_moon_success():
    """Successful shoot the moon: bidding team scores meld + tricks + 50."""
    deltas = score_hand(
        bid=50,
        bidding_team="NS",
        trick_scores={"NS": 30, "EW": 0},
        tricks_taken={"NS": 12, "EW": 0},
        team_meld={"NS": 25, "EW": 18},
        is_shoot_the_moon=True,
    )
    assert deltas["NS"] == 105  # 25 meld + 30 tricks + 50 bonus
    assert deltas["EW"] == 0    # took no tricks → 0


def test_shoot_the_moon_success_other_team_took_no_tricks():
    """Other team scores 0 when they take zero tricks in shoot the moon."""
    deltas = score_hand(
        bid=60,
        bidding_team="EW",
        trick_scores={"NS": 0, "EW": 30},
        tricks_taken={"NS": 0, "EW": 12},
        team_meld={"NS": 20, "EW": 30},
        is_shoot_the_moon=True,
    )
    assert deltas["EW"] == 110  # 30 meld + 30 tricks + 50 bonus
    assert deltas["NS"] == 0    # took no tricks → 0


# ---------------------------------------------------------------------------
# Shoot the moon failure — doesn't take all tricks, scores -bid
# ---------------------------------------------------------------------------

def test_shoot_the_moon_failure():
    """Failed shoot the moon: bidding team scores -bid."""
    deltas = score_hand(
        bid=50,
        bidding_team="NS",
        trick_scores={"NS": 22, "EW": 8},
        tricks_taken={"NS": 9, "EW": 3},
        team_meld={"NS": 25, "EW": 12},
        is_shoot_the_moon=True,
    )
    assert deltas["NS"] == -50  # didn't take all tricks → -bid


def test_shoot_the_moon_failure_other_team_scores():
    """Non-bidding team scores meld + tricks when shoot the moon fails and they took tricks."""
    deltas = score_hand(
        bid=50,
        bidding_team="NS",
        trick_scores={"NS": 22, "EW": 8},
        tricks_taken={"NS": 9, "EW": 3},
        team_meld={"NS": 25, "EW": 12},
        is_shoot_the_moon=True,
    )
    assert deltas["EW"] == 20   # 12 meld + 8 tricks (took tricks, so meld counts)


def test_shoot_the_moon_failure_other_team_zero_tricks():
    """Non-bidding team scores 0 when shoot the moon fails but they took no tricks.

    Contrived edge case: NS took 11 of 12 tricks (EW took 1), but because EW
    took that 1 trick the moon attempt fails. If EW had somehow taken 0 tricks
    while NS also didn't take all 12, that is impossible in normal play, so we
    test the realistic failure: EW takes exactly 1 trick.
    """
    deltas = score_hand(
        bid=50,
        bidding_team="NS",
        trick_scores={"NS": 28, "EW": 2},
        tricks_taken={"NS": 11, "EW": 1},
        team_meld={"NS": 25, "EW": 12},
        is_shoot_the_moon=True,
    )
    assert deltas["NS"] == -50  # didn't take all tricks → -bid
    assert deltas["EW"] == 14   # 12 meld + 2 tricks (EW took at least one trick)
