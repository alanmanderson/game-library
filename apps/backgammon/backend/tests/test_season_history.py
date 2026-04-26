"""Tests for PlayerSeasonStats upsert and /season-history endpoint."""

from datetime import datetime, timezone

from app.game_engine import WinType
from app.models import Player, PlayerSeasonStats, Season
from app.services.season_stats_service import record_match_result
from tests.conftest import auth_headers, create_test_player


async def register_player(client, email, nickname):
    resp = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "Secret123!", "nickname": nickname},
    )
    assert resp.status_code == 200, f"register failed: {resp.text}"
    data = resp.json()
    return data["player"], data["token"]


async def _seed_active_season(db_session) -> Season:
    season = Season(
        name="Spring 2026",
        start_date=datetime(2026, 3, 1, tzinfo=timezone.utc),
        end_date=datetime(2026, 5, 31, tzinfo=timezone.utc),
        is_active=True,
    )
    db_session.add(season)
    await db_session.commit()
    return season


class TestRecordMatchResult:
    async def test_creates_rows_on_first_game(self, client, db_session):
        """First rated game creates one PlayerSeasonStats row per player."""
        await _seed_active_season(db_session)
        winner, _ = await register_player(client, "w@test.com", "Winner")
        loser, _ = await register_player(client, "l@test.com", "Loser")

        # Simulate update_ratings having already run.
        w = await db_session.get(Player, winner["id"])
        l = await db_session.get(Player, loser["id"])
        w.rating = 1540
        l.rating = 1460
        await db_session.flush()

        await record_match_result(db_session, w.id, l.id, WinType.NORMAL)
        await db_session.commit()

        rows = (
            await db_session.execute(
                PlayerSeasonStats.__table__.select()
            )
        ).fetchall()
        assert len(rows) == 2

        winner_row = next(r for r in rows if r.player_id == w.id)
        assert winner_row.wins == 1
        assert winner_row.losses == 0
        assert winner_row.games_played == 1
        assert winner_row.end_rating == 1540
        assert winner_row.peak_rating == 1540
        assert winner_row.tier_final == "Silver"
        assert winner_row.gammons_won == 0

        loser_row = next(r for r in rows if r.player_id == l.id)
        assert loser_row.wins == 0
        assert loser_row.losses == 1
        assert loser_row.end_rating == 1460

    async def test_increments_on_subsequent_games(self, client, db_session):
        """Second game upserts the same rows, bumping counters and peak rating."""
        await _seed_active_season(db_session)
        winner, _ = await register_player(client, "w@test.com", "Winner")
        loser, _ = await register_player(client, "l@test.com", "Loser")

        w = await db_session.get(Player, winner["id"])
        l = await db_session.get(Player, loser["id"])

        # Game 1: winner goes 1500 -> 1540
        w.rating = 1540
        l.rating = 1460
        await record_match_result(db_session, w.id, l.id, WinType.NORMAL)

        # Game 2: winner goes 1540 -> 1600, gammon win
        w.rating = 1600
        l.rating = 1400
        await record_match_result(db_session, w.id, l.id, WinType.GAMMON)
        await db_session.commit()

        rows = (
            await db_session.execute(
                PlayerSeasonStats.__table__.select()
            )
        ).fetchall()
        # Still just two rows (one per player) — upsert semantics.
        assert len(rows) == 2

        winner_row = next(r for r in rows if r.player_id == w.id)
        assert winner_row.wins == 2
        assert winner_row.games_played == 2
        assert winner_row.end_rating == 1600
        assert winner_row.peak_rating == 1600
        # Gold threshold is 1600 inclusive
        assert winner_row.tier_final == "Gold"
        assert winner_row.gammons_won == 1

        loser_row = next(r for r in rows if r.player_id == l.id)
        assert loser_row.losses == 2
        assert loser_row.gammons_lost == 1
        assert loser_row.end_rating == 1400

    async def test_peak_rating_preserved_after_drop(self, client, db_session):
        """peak_rating is a max, not a last-seen value."""
        await _seed_active_season(db_session)
        winner, _ = await register_player(client, "w@test.com", "Winner")
        loser, _ = await register_player(client, "l@test.com", "Loser")

        w = await db_session.get(Player, winner["id"])
        l = await db_session.get(Player, loser["id"])

        # Winner's rating climbs to 1700...
        w.rating = 1700
        l.rating = 1300
        await record_match_result(db_session, w.id, l.id, WinType.NORMAL)

        # ...then drops to 1620 on a later (reversed) match.
        w.rating = 1620
        l.rating = 1380
        await record_match_result(db_session, l.id, w.id, WinType.NORMAL)
        await db_session.commit()

        rows = (
            await db_session.execute(
                PlayerSeasonStats.__table__.select()
            )
        ).fetchall()
        w_row = next(r for r in rows if r.player_id == w.id)
        assert w_row.end_rating == 1620
        assert w_row.peak_rating == 1700  # peak preserved

    async def test_no_active_season_is_noop(self, client, db_session):
        """Missing active season leaves the table empty without raising."""
        winner, _ = await register_player(client, "w@test.com", "Winner")
        loser, _ = await register_player(client, "l@test.com", "Loser")

        await record_match_result(db_session, winner["id"], loser["id"], WinType.NORMAL)
        await db_session.commit()

        rows = (
            await db_session.execute(PlayerSeasonStats.__table__.select())
        ).fetchall()
        assert rows == []

    async def test_guest_games_skipped(self, client, db_session):
        """Guest players don't get PlayerSeasonStats rows."""
        await _seed_active_season(db_session)
        guest1 = await create_test_player(client, "Guest1")
        guest2 = await create_test_player(client, "Guest2")

        await record_match_result(
            db_session,
            guest1["player"]["id"],
            guest2["player"]["id"],
            WinType.NORMAL,
        )
        await db_session.commit()

        rows = (
            await db_session.execute(PlayerSeasonStats.__table__.select())
        ).fetchall()
        assert rows == []


class TestSeasonHistoryEndpoint:
    async def test_requires_auth(self, client):
        resp = await client.get("/api/players/abc/season-history")
        assert resp.status_code == 401

    async def test_forbidden_for_guest(self, client):
        guest = await create_test_player(client, "GuestSH")
        resp = await client.get(
            f"/api/players/{guest['player']['id']}/season-history",
            headers=auth_headers(guest["token"]),
        )
        assert resp.status_code == 403

    async def test_forbidden_for_other_player(self, client):
        me, token = await register_player(client, "me@test.com", "Me")
        other, _ = await register_player(client, "other@test.com", "Other")
        resp = await client.get(
            f"/api/players/{other['id']}/season-history",
            headers=auth_headers(token),
        )
        assert resp.status_code == 403

    async def test_returns_empty_for_new_player(self, client):
        me, token = await register_player(client, "me@test.com", "Me")
        resp = await client.get(
            f"/api/players/{me['id']}/season-history",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_returns_history_with_season_metadata(self, client, db_session):
        await _seed_active_season(db_session)
        me, token = await register_player(client, "me@test.com", "Me")
        opp, _ = await register_player(client, "opp@test.com", "Opp")

        me_row = await db_session.get(Player, me["id"])
        opp_row = await db_session.get(Player, opp["id"])
        me_row.rating = 1650
        opp_row.rating = 1350
        await record_match_result(
            db_session, me_row.id, opp_row.id, WinType.GAMMON
        )
        await db_session.commit()

        resp = await client.get(
            f"/api/players/{me['id']}/season-history",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        entry = data[0]
        assert entry["season_name"] == "Spring 2026"
        assert entry["is_active"] is True
        assert entry["wins"] == 1
        assert entry["losses"] == 0
        assert entry["gammons_won"] == 1
        assert entry["end_rating"] == 1650
        assert entry["peak_rating"] == 1650
        assert entry["tier_final"] == "Gold"
        assert entry["games_played"] == 1

    async def test_active_season_first_in_ordering(self, client, db_session):
        """Active season is returned before older finished seasons."""
        old = Season(
            name="Winter 2025",
            start_date=datetime(2025, 12, 1, tzinfo=timezone.utc),
            end_date=datetime(2026, 2, 28, tzinfo=timezone.utc),
            is_active=False,
        )
        db_session.add(old)
        await db_session.commit()
        active = await _seed_active_season(db_session)

        me, token = await register_player(client, "me@test.com", "Me")
        # Seed one row per season by hand.
        db_session.add_all(
            [
                PlayerSeasonStats(
                    player_id=me["id"],
                    season_id=old.id,
                    end_rating=1500,
                    peak_rating=1520,
                    wins=3,
                    losses=5,
                    gammons_won=0,
                    gammons_lost=1,
                    tier_final="Silver",
                    games_played=8,
                ),
                PlayerSeasonStats(
                    player_id=me["id"],
                    season_id=active.id,
                    end_rating=1620,
                    peak_rating=1640,
                    wins=4,
                    losses=2,
                    gammons_won=1,
                    gammons_lost=0,
                    tier_final="Gold",
                    games_played=6,
                ),
            ]
        )
        await db_session.commit()

        resp = await client.get(
            f"/api/players/{me['id']}/season-history",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert [e["season_name"] for e in data] == ["Spring 2026", "Winter 2025"]
        assert data[0]["is_active"] is True
        assert data[1]["is_active"] is False
