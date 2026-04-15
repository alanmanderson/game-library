"""Tests for the daily / weekly challenge system."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Challenge, Player, PlayerChallenge
from app.services.challenge_service import (
    GameResultMeta,
    daily_period_key,
    get_active_player_challenges,
    iter_progress_deltas,
    record_game_result,
    weekly_period_key,
)

from tests.conftest import auth_headers, create_test_player


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


SEED_CHALLENGES = [
    {
        "id": "daily_play_3",
        "name": "Play 3 Games",
        "description": "Play any 3 games today.",
        "type": "daily",
        "target": 3,
        "metric": "games",
        "reward_points": 10,
        "is_active": True,
    },
    {
        "id": "daily_win_2",
        "name": "Win 2 Games",
        "description": "Win 2 games today.",
        "type": "daily",
        "target": 2,
        "metric": "wins",
        "reward_points": 25,
        "is_active": True,
    },
    {
        "id": "daily_gammon",
        "name": "Score a Gammon",
        "description": "Win a game by gammon.",
        "type": "daily",
        "target": 1,
        "metric": "gammons",
        "reward_points": 40,
        "is_active": True,
    },
    {
        "id": "weekly_play_10",
        "name": "Play 10 Games",
        "description": "Play 10 games this week.",
        "type": "weekly",
        "target": 10,
        "metric": "games",
        "reward_points": 50,
        "is_active": True,
    },
    {
        "id": "weekly_beat_hard_bot",
        "name": "Beat a Hard Bot",
        "description": "Win vs Hard/Expert bot.",
        "type": "weekly",
        "target": 1,
        "metric": "wins_vs_hard_bot",
        "reward_points": 75,
        "is_active": True,
    },
]


async def _seed_challenges(db: AsyncSession) -> None:
    """Seed the default challenge templates — the in-memory SQLite DB
    started by the test fixture does not run migrations so no templates
    exist by default."""
    for c in SEED_CHALLENGES:
        db.add(Challenge(**c))
    await db.flush()


async def _make_registered_player(
    db: AsyncSession, nickname: str = "alice"
) -> Player:
    p = Player(nickname=nickname, is_guest=False, auth_provider="local")
    db.add(p)
    await db.flush()
    return p


# ---------------------------------------------------------------------------
# Period key helpers
# ---------------------------------------------------------------------------


def test_daily_period_key_shape():
    key = daily_period_key()
    assert len(key) == 10
    datetime.strptime(key, "%Y-%m-%d")


def test_weekly_period_key_shape():
    key = weekly_period_key()
    assert "-W" in key
    year, week = key.split("-W")
    assert 2000 <= int(year) <= 2100
    assert 1 <= int(week) <= 53


# ---------------------------------------------------------------------------
# Metric matching
# ---------------------------------------------------------------------------


def test_iter_progress_deltas_matches_metrics():
    challenges = [Challenge(**c) for c in SEED_CHALLENGES]
    won_gammon_vs_hard = GameResultMeta(
        won=True,
        win_type="gammon",
        opponent_is_bot=True,
        bot_difficulty="hard",
    )
    deltas = dict(iter_progress_deltas(challenges, won_gammon_vs_hard))
    assert deltas["daily_play_3"] == 1
    assert deltas["daily_win_2"] == 1
    assert deltas["daily_gammon"] == 1
    assert deltas["weekly_play_10"] == 1
    assert deltas["weekly_beat_hard_bot"] == 1


def test_loss_vs_easy_bot_only_counts_games_played():
    challenges = [Challenge(**c) for c in SEED_CHALLENGES]
    lost_vs_easy = GameResultMeta(
        won=False, win_type="normal", opponent_is_bot=True, bot_difficulty="easy"
    )
    deltas = dict(iter_progress_deltas(challenges, lost_vs_easy))
    assert deltas["daily_play_3"] == 1
    assert deltas["weekly_play_10"] == 1
    assert deltas["daily_win_2"] == 0
    assert deltas["daily_gammon"] == 0
    assert deltas["weekly_beat_hard_bot"] == 0


# ---------------------------------------------------------------------------
# record_game_result
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_record_game_result_increments_and_completes(db_session):
    await _seed_challenges(db_session)
    p = await _make_registered_player(db_session)

    meta = GameResultMeta(
        won=True, win_type="normal", opponent_is_bot=False, bot_difficulty=None
    )
    completed1 = await record_game_result(db_session, p.id, meta)
    assert completed1 == []  # only 1 win so far

    completed2 = await record_game_result(db_session, p.id, meta)
    # 2 wins — daily_win_2 now complete
    assert "daily_win_2" in completed2

    await db_session.refresh(p)
    assert p.challenge_points == 25

    # A third game (not a win) should still bump play counts but not re-award
    meta_loss = GameResultMeta(
        won=False, win_type=None, opponent_is_bot=False, bot_difficulty=None
    )
    completed3 = await record_game_result(db_session, p.id, meta_loss)
    # 3rd game finishes daily_play_3 (target=3).
    assert "daily_play_3" in completed3
    await db_session.refresh(p)
    assert p.challenge_points == 25 + 10


@pytest.mark.asyncio
async def test_completed_challenges_do_not_over_award(db_session):
    await _seed_challenges(db_session)
    p = await _make_registered_player(db_session)
    meta = GameResultMeta(
        won=True, win_type="gammon", opponent_is_bot=False, bot_difficulty=None
    )
    # One gammon win completes daily_gammon (target=1, reward=40)
    completed = await record_game_result(db_session, p.id, meta)
    assert "daily_gammon" in completed
    await db_session.refresh(p)
    first = p.challenge_points

    # A second gammon win must not re-award the already-completed row.
    completed2 = await record_game_result(db_session, p.id, meta)
    assert "daily_gammon" not in completed2
    await db_session.refresh(p)
    # daily_gammon already fired; no additional 40 pts from it.
    # (Other challenges may still progress — we only check daily_gammon isn't
    # double-credited.)
    # Points should not include a second +40.
    # Allow increases from other metrics (wins, games) though.
    result = await db_session.execute(
        select(PlayerChallenge).where(
            PlayerChallenge.player_id == p.id,
            PlayerChallenge.challenge_id == "daily_gammon",
        )
    )
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].progress == 1  # capped at target


@pytest.mark.asyncio
async def test_guest_player_not_tracked(db_session):
    await _seed_challenges(db_session)
    guest = Player(nickname="g", is_guest=True, auth_provider="guest")
    db_session.add(guest)
    await db_session.flush()
    meta = GameResultMeta(
        won=True, win_type="normal", opponent_is_bot=False, bot_difficulty=None
    )
    completed = await record_game_result(db_session, guest.id, meta)
    assert completed == []
    # No PlayerChallenge rows created for guest.
    rows = (
        await db_session.execute(
            select(PlayerChallenge).where(PlayerChallenge.player_id == guest.id)
        )
    ).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_get_active_player_challenges_upserts_current_period(db_session):
    await _seed_challenges(db_session)
    p = await _make_registered_player(db_session)

    rows = await get_active_player_challenges(db_session, p.id)
    # Five seeded challenges => five rows.
    assert len(rows) == 5
    types = {r["type"] for r in rows}
    assert types == {"daily", "weekly"}
    # All progress starts at 0, none completed.
    for r in rows:
        assert r["progress"] == 0
        assert r["completed_at"] is None
    # Daily rows keyed by today, weekly by this ISO week.
    for r in rows:
        if r["type"] == "daily":
            assert r["period_key"] == daily_period_key()
        else:
            assert r["period_key"] == weekly_period_key()


# ---------------------------------------------------------------------------
# HTTP endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_my_challenges_endpoint_requires_auth(client, db_session):
    await _seed_challenges(db_session)
    resp = await client.get("/api/challenges/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_my_challenges_endpoint_rejects_guest(client, db_session):
    await _seed_challenges(db_session)
    auth = await create_test_player(client, "guestie")
    resp = await client.get(
        "/api/challenges/me", headers=auth_headers(auth["token"])
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_my_challenges_endpoint_returns_daily_and_weekly(client, db_session):
    await _seed_challenges(db_session)
    # Guest player created via API — we flip is_guest to simulate a registered
    # account without needing full email/password plumbing in the test.
    auth = await create_test_player(client, "regular")
    player_id = auth["player"]["id"]
    p = await db_session.get(Player, player_id)
    p.is_guest = False
    await db_session.commit()

    resp = await client.get(
        "/api/challenges/me", headers=auth_headers(auth["token"])
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "daily" in body
    assert "weekly" in body
    assert body["challenge_points"] == 0
    assert len(body["daily"]) == 3
    assert len(body["weekly"]) == 2
    # Progress bar fields are present on each entry.
    for entry in body["daily"] + body["weekly"]:
        assert "progress" in entry
        assert "target" in entry
        assert "reward_points" in entry
