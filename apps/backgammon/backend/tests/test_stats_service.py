"""Tests for the stats service (update_stats / get_player_stats).

Each test creates its own players directly in the database via the
``db_session`` fixture so that stats assertions are fully isolated.
"""

import pytest

from app.services.stats_service import update_stats, get_player_stats
from app.game_engine import WinType
from app.models import Player


# -----------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------


async def _make_players(db_session, nick_a: str = "Alice", nick_b: str = "Bob"):
    """Insert two players and return them after a flush."""
    p1 = Player(nickname=nick_a)
    p2 = Player(nickname=nick_b)
    db_session.add_all([p1, p2])
    await db_session.flush()
    return p1, p2


# -----------------------------------------------------------------------
# update_stats
# -----------------------------------------------------------------------


class TestUpdateStats:
    @pytest.mark.asyncio
    async def test_normal_win(self, db_session):
        """A normal win credits 1 point to the winner."""
        p1, p2 = await _make_players(db_session)
        await update_stats(db_session, p1.id, p2.id, p1.id, WinType.NORMAL)
        await db_session.flush()

        stats = await get_player_stats(db_session, p1.id)
        assert stats["total_games"] == 1
        assert stats["total_wins"] == 1
        assert stats["total_losses"] == 0
        assert stats["win_rate"] == 100.0

        loser_stats = await get_player_stats(db_session, p2.id)
        assert loser_stats["total_games"] == 1
        assert loser_stats["total_wins"] == 0
        assert loser_stats["total_losses"] == 1

    @pytest.mark.asyncio
    async def test_gammon_win(self, db_session):
        """A gammon win credits 2 points and increments gammons_won."""
        p1, p2 = await _make_players(db_session)
        await update_stats(db_session, p1.id, p2.id, p1.id, WinType.GAMMON)
        await db_session.flush()

        stats = await get_player_stats(db_session, p1.id)
        assert stats["total_wins"] == 1
        per = stats["per_opponent"][0]
        assert per["gammons_won"] == 1
        assert per["total_points_won"] == 2

        loser_stats = await get_player_stats(db_session, p2.id)
        loser_per = loser_stats["per_opponent"][0]
        assert loser_per["gammons_lost"] == 1
        assert loser_per["total_points_lost"] == 2

    @pytest.mark.asyncio
    async def test_backgammon_win(self, db_session):
        """A backgammon win credits 3 points and increments backgammons_won."""
        p1, p2 = await _make_players(db_session)
        await update_stats(db_session, p1.id, p2.id, p1.id, WinType.BACKGAMMON)
        await db_session.flush()

        stats = await get_player_stats(db_session, p1.id)
        per = stats["per_opponent"][0]
        assert per["backgammons_won"] == 1
        assert per["total_points_won"] == 3

        loser_stats = await get_player_stats(db_session, p2.id)
        loser_per = loser_stats["per_opponent"][0]
        assert loser_per["backgammons_lost"] == 1
        assert loser_per["total_points_lost"] == 3

    @pytest.mark.asyncio
    async def test_multiple_games_accumulate(self, db_session):
        """Playing several games correctly accumulates all counters."""
        p1, p2 = await _make_players(db_session)

        await update_stats(db_session, p1.id, p2.id, p1.id, WinType.NORMAL)
        await update_stats(db_session, p1.id, p2.id, p2.id, WinType.GAMMON)
        await update_stats(db_session, p1.id, p2.id, p1.id, WinType.BACKGAMMON)
        await db_session.flush()

        stats = await get_player_stats(db_session, p1.id)
        assert stats["total_games"] == 3
        assert stats["total_wins"] == 2
        assert stats["total_losses"] == 1
        # Points won: 1 (normal) + 3 (backgammon) = 4
        per = stats["per_opponent"][0]
        assert per["total_points_won"] == 4
        # Points lost: 2 (gammon)
        assert per["total_points_lost"] == 2

    @pytest.mark.asyncio
    async def test_loser_stats_mirror_winner(self, db_session):
        """The loser's record is the mirror image of the winner's."""
        p1, p2 = await _make_players(db_session)
        await update_stats(db_session, p1.id, p2.id, p1.id, WinType.NORMAL)
        await db_session.flush()

        w = await get_player_stats(db_session, p1.id)
        l = await get_player_stats(db_session, p2.id)

        assert w["total_wins"] == l["total_losses"]
        assert w["total_losses"] == l["total_wins"]


# -----------------------------------------------------------------------
# get_player_stats
# -----------------------------------------------------------------------


class TestGetPlayerStats:
    @pytest.mark.asyncio
    async def test_empty_stats(self, db_session):
        """A player with no games has all-zero stats."""
        p = Player(nickname="Lonely")
        db_session.add(p)
        await db_session.flush()

        stats = await get_player_stats(db_session, p.id)
        assert stats["total_games"] == 0
        assert stats["total_wins"] == 0
        assert stats["total_losses"] == 0
        assert stats["win_rate"] == 0.0
        assert stats["per_opponent"] == []

    @pytest.mark.asyncio
    async def test_per_opponent_breakdown(self, db_session):
        """Stats are tracked per-opponent; two opponents produce two entries."""
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        p3 = Player(nickname="Charlie")
        db_session.add_all([p1, p2, p3])
        await db_session.flush()

        await update_stats(db_session, p1.id, p2.id, p1.id, WinType.NORMAL)
        await update_stats(db_session, p1.id, p3.id, p3.id, WinType.GAMMON)
        await db_session.flush()

        stats = await get_player_stats(db_session, p1.id)
        assert stats["total_games"] == 2
        assert stats["total_wins"] == 1
        assert stats["total_losses"] == 1
        assert len(stats["per_opponent"]) == 2

        nicknames = {entry["opponent_nickname"] for entry in stats["per_opponent"]}
        assert nicknames == {"Bob", "Charlie"}

    @pytest.mark.asyncio
    async def test_win_rate_calculation(self, db_session):
        """Win rate is a percentage (wins / total * 100)."""
        p1, p2 = await _make_players(db_session)

        await update_stats(db_session, p1.id, p2.id, p1.id, WinType.NORMAL)
        await update_stats(db_session, p1.id, p2.id, p2.id, WinType.NORMAL)
        await update_stats(db_session, p1.id, p2.id, p1.id, WinType.NORMAL)
        await db_session.flush()

        stats = await get_player_stats(db_session, p1.id)
        # 2 wins out of 3 games
        assert stats["total_games"] == 3
        assert stats["total_wins"] == 2
        expected_rate = (2 / 3) * 100
        assert abs(stats["win_rate"] - expected_rate) < 0.01
