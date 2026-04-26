"""Tests for the /api/players/{player_id}/advanced-stats endpoint.

Covers aggregation of gammon/backgammon wins, per-color win rates,
per-time-control win rates, cube action counters, and ELO rating history.
"""

from datetime import datetime, timedelta, timezone

from app.models import Player, PlayerStats, Table, RatingHistory
from tests.conftest import auth_headers, create_test_player


async def register_player(client, email, nickname):
    resp = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "Secret123!", "nickname": nickname},
    )
    assert resp.status_code == 200, f"register failed: {resp.text}"
    data = resp.json()
    return data["player"], data["token"]


class TestAdvancedStatsAuth:
    async def test_requires_auth(self, client):
        resp = await client.get("/api/players/abc/advanced-stats")
        assert resp.status_code == 401

    async def test_forbidden_for_guest(self, client):
        guest = await create_test_player(client, "GuestAdv")
        resp = await client.get(
            f"/api/players/{guest['player']['id']}/advanced-stats",
            headers=auth_headers(guest["token"]),
        )
        assert resp.status_code == 403

    async def test_cannot_view_other_players(self, client):
        me, token = await register_player(client, "me@example.com", "Me")
        other, _ = await register_player(client, "other@example.com", "Other")
        resp = await client.get(
            f"/api/players/{other['id']}/advanced-stats",
            headers=auth_headers(token),
        )
        assert resp.status_code == 403


class TestAdvancedStatsContent:
    async def test_empty_stats(self, client):
        me, token = await register_player(client, "empty@example.com", "Empty")
        resp = await client.get(
            f"/api/players/{me['id']}/advanced-stats",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_games"] == 0
        assert data["gammon_wins"] == 0
        assert data["backgammon_wins"] == 0
        assert data["cube_stats"] == {
            "offered": 0,
            "accepted": 0,
            "declined": 0,
            "accept_rate": 0.0,
            "accuracy": None,
            "by_verdict": {
                "best": 0,
                "borderline": 0,
                "mistake": 0,
                "blunder": 0,
            },
        }
        assert data["rating_history"] == []

    async def test_aggregates_gammon_backgammon_from_player_stats(
        self, client, db_session
    ):
        me, token = await register_player(client, "g@example.com", "Gammer")
        opp, _ = await register_player(client, "o@example.com", "Opp")

        db_session.add(
            PlayerStats(
                player_id=me["id"],
                opponent_id=opp["id"],
                games_played=5,
                games_won=3,
                games_lost=2,
                gammons_won=1,
                gammons_lost=1,
                backgammons_won=1,
                backgammons_lost=0,
            )
        )
        await db_session.commit()

        resp = await client.get(
            f"/api/players/{me['id']}/advanced-stats",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["gammon_wins"] == 1
        assert data["gammon_losses"] == 1
        assert data["backgammon_wins"] == 1
        # gammon_rate = 1 won / 3 total wins = 33.3%
        assert abs(data["gammon_rate"] - (1 / 3 * 100)) < 0.01

    async def test_per_color_and_time_control_rates(
        self, client, db_session
    ):
        me, token = await register_player(client, "c@example.com", "ColorTest")
        opp, _ = await register_player(client, "x@example.com", "Opp2")

        # 2 white games (1 win, 1 loss); both blitz.
        # 1 black game (1 win); unlimited.
        now = datetime.now(timezone.utc)
        tables = [
            Table(
                id="TBLW1",
                status="finished",
                white_player_id=me["id"],
                black_player_id=opp["id"],
                winner_id=me["id"],
                win_type="normal",
                final_score=1,
                time_control="blitz",
                created_at=now - timedelta(hours=3),
                finished_at=now - timedelta(hours=2),
            ),
            Table(
                id="TBLW2",
                status="finished",
                white_player_id=me["id"],
                black_player_id=opp["id"],
                winner_id=opp["id"],
                win_type="normal",
                final_score=1,
                time_control="blitz",
                created_at=now - timedelta(hours=2),
                finished_at=now - timedelta(hours=1),
            ),
            Table(
                id="TBLB1",
                status="finished",
                white_player_id=opp["id"],
                black_player_id=me["id"],
                winner_id=me["id"],
                win_type="normal",
                final_score=1,
                time_control="unlimited",
                created_at=now - timedelta(hours=1),
                finished_at=now,
            ),
        ]
        for t in tables:
            db_session.add(t)
        await db_session.commit()

        resp = await client.get(
            f"/api/players/{me['id']}/advanced-stats",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_games"] == 3
        assert data["win_rate_as_white"]["games"] == 2
        assert data["win_rate_as_white"]["wins"] == 1
        assert data["win_rate_as_white"]["win_rate"] == 50.0
        assert data["win_rate_as_black"]["games"] == 1
        assert data["win_rate_as_black"]["wins"] == 1
        assert data["win_rate_as_black"]["win_rate"] == 100.0
        assert data["win_rate_by_time_control"]["blitz"]["games"] == 2
        assert data["win_rate_by_time_control"]["blitz"]["wins"] == 1
        assert data["win_rate_by_time_control"]["unlimited"]["games"] == 1

    async def test_cube_stats_reflect_player_counters(
        self, client, db_session
    ):
        me, token = await register_player(client, "cube@example.com", "Cuber")

        # Bump cube counters directly.
        player = await db_session.get(Player, me["id"])
        player.cube_offers = 10
        player.cube_accepts = 6
        player.cube_declines = 2
        await db_session.commit()

        resp = await client.get(
            f"/api/players/{me['id']}/advanced-stats",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        cube = resp.json()["cube_stats"]
        assert cube["offered"] == 10
        assert cube["accepted"] == 6
        assert cube["declined"] == 2
        # 6 / (6+2) = 75%
        assert cube["accept_rate"] == 75.0

    async def test_rating_history_is_chronological(self, client, db_session):
        me, token = await register_player(client, "r@example.com", "RatedOne")
        opp, _ = await register_player(client, "r2@example.com", "RatedTwo")

        now = datetime.now(timezone.utc)
        db_session.add_all(
            [
                RatingHistory(
                    player_id=me["id"],
                    rating=1510,
                    rating_change=10,
                    opponent_id=opp["id"],
                    created_at=now - timedelta(hours=2),
                ),
                RatingHistory(
                    player_id=me["id"],
                    rating=1525,
                    rating_change=15,
                    opponent_id=opp["id"],
                    created_at=now - timedelta(hours=1),
                ),
            ]
        )
        await db_session.commit()

        resp = await client.get(
            f"/api/players/{me['id']}/advanced-stats",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        history = resp.json()["rating_history"]
        assert len(history) == 2
        assert history[0]["rating_after"] == 1510
        assert history[1]["rating_after"] == 1525
        # Ensure chronological
        assert history[0]["played_at"] < history[1]["played_at"]


class TestRatingHistoryPersistence:
    async def test_update_ratings_writes_history_rows(self, db_session):
        """Calling update_ratings should persist RatingHistory entries for both players."""
        from sqlalchemy import select
        from app.services.rating_service import update_ratings

        winner = Player(
            id="wplayer-001",
            nickname="Winner",
            email="w@example.com",
            password_hash="x",
            rating=1500,
            rating_games=5,
        )
        loser = Player(
            id="lplayer-001",
            nickname="Loser",
            email="l@example.com",
            password_hash="x",
            rating=1500,
            rating_games=5,
        )
        db_session.add_all([winner, loser])
        await db_session.flush()

        result = await update_ratings(db_session, winner.id, loser.id, table_id=None)
        assert result is not None

        rows = (
            await db_session.execute(
                select(RatingHistory).order_by(RatingHistory.player_id)
            )
        ).scalars().all()
        assert len(rows) == 2
        by_player = {r.player_id: r for r in rows}
        assert by_player[winner.id].rating == winner.rating
        assert by_player[loser.id].rating == loser.rating
        assert by_player[winner.id].rating_change > 0
        assert by_player[loser.id].rating_change < 0
