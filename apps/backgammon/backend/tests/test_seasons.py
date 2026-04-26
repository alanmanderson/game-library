"""Tests for season endpoints, is_ranked table flag, and tier in responses."""

from datetime import datetime, timezone

import pytest

from app.models import Season
from tests.conftest import (
    auth_headers,
    create_test_player,
)


class TestSeasonsEndpoint:
    async def test_active_season_empty(self, client):
        """With no seasons seeded, the endpoint returns null."""
        resp = await client.get("/api/seasons/active")
        assert resp.status_code == 200
        assert resp.json() is None

    async def test_active_season_returns_active_row(self, client, db_session):
        """The active season is returned when seeded in the DB."""
        db_session.add(
            Season(
                name="Spring 2026",
                start_date=datetime(2026, 3, 1, tzinfo=timezone.utc),
                end_date=datetime(2026, 5, 31, tzinfo=timezone.utc),
                is_active=True,
            )
        )
        await db_session.commit()

        resp = await client.get("/api/seasons/active")
        assert resp.status_code == 200
        data = resp.json()
        assert data is not None
        assert data["name"] == "Spring 2026"
        assert data["is_active"] is True


class TestIsRankedFlag:
    async def test_create_table_default_is_ranked(self, client):
        """New tables default to is_ranked = True."""
        auth = await create_test_player(client, "Alice")
        resp = await client.post(
            "/api/tables",
            json={"player_id": auth["player"]["id"]},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        assert resp.json()["is_ranked"] is True

    async def test_create_casual_table(self, client):
        """is_ranked=false is respected when creating a table."""
        auth = await create_test_player(client, "Alice")
        resp = await client.post(
            "/api/tables",
            json={"player_id": auth["player"]["id"], "is_ranked": False},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        assert resp.json()["is_ranked"] is False

    async def test_lobby_exposes_is_ranked(self, client):
        """Public lobby rows include the is_ranked flag."""
        auth = await create_test_player(client, "Alice")
        await client.post(
            "/api/tables",
            json={"player_id": auth["player"]["id"], "is_public": True, "is_ranked": False},
            headers=auth_headers(auth["token"]),
        )

        resp = await client.get("/api/lobby")
        assert resp.status_code == 200
        entries = resp.json()
        assert len(entries) == 1
        assert entries[0]["is_ranked"] is False


class TestTierInResponses:
    async def test_player_response_has_tier(self, client):
        """PlayerResponse exposes a derived tier field."""
        auth = await create_test_player(client, "Alice")
        # Guests start at rating 1500 -> Silver
        assert auth["player"]["tier"] == "Silver"

    async def test_leaderboard_entries_have_tier(self, client, db_session):
        """Leaderboard entries include a derived tier field."""
        # Register a real (non-guest) player and bump their rating so they
        # appear in the rating leaderboard.
        resp = await client.post(
            "/api/auth/register",
            json={"email": "diamond@test.com", "password": "Password1!", "nickname": "DiamondPlayer"},
        )
        assert resp.status_code == 200
        pid = resp.json()["player"]["id"]

        from app.models import Player

        player = await db_session.get(Player, pid)
        player.rating = 2100
        player.rating_games = 10
        await db_session.commit()

        resp = await client.get("/api/leaderboard?metric=rating")
        assert resp.status_code == 200
        entries = resp.json()["entries"]
        assert len(entries) >= 1
        diamond = next(e for e in entries if e["player_id"] == pid)
        assert diamond["tier"] == "Diamond"
