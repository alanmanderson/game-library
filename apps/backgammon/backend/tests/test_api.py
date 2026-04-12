"""REST API endpoint tests for the backgammon backend.

Uses httpx.AsyncClient to exercise every route defined in ``app.api.routes``.
Each test is independent -- a fresh in-memory database is provisioned via the
``client`` fixture (which itself depends on ``db_session``).
"""

import pytest

from app.models import Player, PlayerStats
from tests.conftest import (
    auth_headers,
    create_test_player,
    create_test_table,
    create_and_join_table,
)


# -----------------------------------------------------------------------
# Player endpoints
# -----------------------------------------------------------------------


class TestPlayerEndpoints:
    async def test_create_guest_player(self, client):
        """POST /api/auth/guest creates a guest player and returns JWT + player data."""
        resp = await client.post("/api/auth/guest", json={"nickname": "Alice"})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["player"]["nickname"] == "Alice"
        assert "id" in data["player"]
        assert "created_at" in data["player"]
        assert data["player"]["is_guest"] is True

    async def test_create_two_different_players(self, client):
        """Two players with different nicknames get different IDs."""
        p1 = await create_test_player(client, "Alice")
        p2 = await create_test_player(client, "Bob")
        assert p1["player"]["id"] != p2["player"]["id"]
        assert p1["player"]["nickname"] == "Alice"
        assert p2["player"]["nickname"] == "Bob"

    async def test_create_guest_empty_nickname(self, client):
        """An empty-string nickname is rejected by the guest endpoint (min_length=1)."""
        resp = await client.post("/api/auth/guest", json={"nickname": ""})
        assert resp.status_code == 422

    async def test_create_guest_missing_nickname(self, client):
        """Omitting the nickname field should return a 422 validation error."""
        resp = await client.post("/api/auth/guest", json={})
        assert resp.status_code == 422

    async def test_get_player(self, client):
        """GET /api/players/{id} retrieves a previously created player."""
        created = await create_test_player(client, "Charlie")
        token = created["token"]
        player = created["player"]
        resp = await client.get(
            f"/api/players/{player['id']}", headers=auth_headers(token)
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == player["id"]
        assert data["nickname"] == "Charlie"

    async def test_get_player_not_found(self, client):
        """GET /api/players/{id} with a nonexistent ID returns 404."""
        # Need an authenticated user to hit this endpoint
        auth = await create_test_player(client, "Auth")
        resp = await client.get(
            "/api/players/nonexistent-uuid", headers=auth_headers(auth["token"])
        )
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    async def test_get_player_unauthenticated(self, client):
        """GET /api/players/{id} without auth returns 401."""
        resp = await client.get("/api/players/some-id")
        assert resp.status_code == 401


# -----------------------------------------------------------------------
# Table endpoints
# -----------------------------------------------------------------------


class TestTableEndpoints:
    async def test_create_table(self, client):
        """POST /api/tables creates a table in 'waiting' status."""
        auth = await create_test_player(client, "Alice")
        token = auth["token"]
        player = auth["player"]
        resp = await client.post(
            "/api/tables",
            json={"player_id": player["id"]},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "waiting"
        assert data["white_player"]["id"] == player["id"]
        assert data["black_player"] is None

    async def test_create_table_unauthenticated(self, client):
        """Creating a table without auth returns 401."""
        resp = await client.post("/api/tables", json={"player_id": "some-id"})
        assert resp.status_code == 401

    async def test_get_table(self, client):
        """GET /api/tables/{id} retrieves an existing table."""
        auth = await create_test_player(client)
        table = await create_test_table(client, auth["token"], auth["player"]["id"])
        resp = await client.get(f"/api/tables/{table['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == table["id"]
        assert data["status"] == "waiting"

    async def test_get_table_not_found(self, client):
        """GET /api/tables/{id} with a nonexistent ID returns 404."""
        resp = await client.get("/api/tables/ZZZZZZ")
        assert resp.status_code == 404

    async def test_join_table(self, client):
        """POST /api/tables/{id}/join adds a second player and starts the game."""
        table, creator_auth, joiner_auth = await create_and_join_table(client)
        assert table["status"] == "playing"
        # Both player slots should be filled (order depends on random color assignment)
        assert table["white_player"] is not None
        assert table["black_player"] is not None
        player_ids = {table["white_player"]["id"], table["black_player"]["id"]}
        assert creator_auth["player"]["id"] in player_ids
        assert joiner_auth["player"]["id"] in player_ids

    async def test_join_table_own_table(self, client):
        """A player cannot join a table they created."""
        auth = await create_test_player(client, "SoloPlayer")
        table = await create_test_table(client, auth["token"], auth["player"]["id"])
        resp = await client.post(
            f"/api/tables/{table['id']}/join",
            json={"player_id": auth["player"]["id"]},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 400
        assert "own table" in resp.json()["detail"].lower()

    async def test_join_table_already_playing(self, client):
        """A third player cannot join a table that is already playing."""
        table, _creator_auth, _joiner_auth = await create_and_join_table(client)
        intruder_auth = await create_test_player(client, "Intruder")
        resp = await client.post(
            f"/api/tables/{table['id']}/join",
            json={"player_id": intruder_auth["player"]["id"]},
            headers=auth_headers(intruder_auth["token"]),
        )
        assert resp.status_code == 400
        assert "not waiting" in resp.json()["detail"].lower()

    async def test_create_table_with_match_points(self, client):
        """POST /api/tables with match_points sets the value on the table."""
        auth = await create_test_player(client, "MatchPlayer")
        token = auth["token"]
        player = auth["player"]
        resp = await client.post(
            "/api/tables",
            json={"player_id": player["id"], "match_points": 7},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["match_points"] == 7

    async def test_create_table_default_match_points(self, client):
        """POST /api/tables without match_points defaults to 5."""
        auth = await create_test_player(client, "DefaultMP")
        token = auth["token"]
        player = auth["player"]
        resp = await client.post(
            "/api/tables",
            json={"player_id": player["id"]},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["match_points"] == 5

    async def test_create_table_invalid_match_points(self, client):
        """POST /api/tables with out-of-range match_points returns 422."""
        auth = await create_test_player(client, "BadMP")
        token = auth["token"]
        player = auth["player"]
        # Too high
        resp = await client.post(
            "/api/tables",
            json={"player_id": player["id"], "match_points": 11},
            headers=auth_headers(token),
        )
        assert resp.status_code == 422
        # Too low
        resp = await client.post(
            "/api/tables",
            json={"player_id": player["id"], "match_points": 0},
            headers=auth_headers(token),
        )
        assert resp.status_code == 422

    async def test_join_table_not_found(self, client):
        """Joining a nonexistent table returns 400 (ValueError from game_service)."""
        auth = await create_test_player(client)
        resp = await client.post(
            "/api/tables/XXXXXX/join",
            json={"player_id": auth["player"]["id"]},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 400

    async def test_join_table_unauthenticated(self, client):
        """Joining a table without auth returns 401."""
        resp = await client.post(
            "/api/tables/XXXXXX/join", json={"player_id": "some-id"}
        )
        assert resp.status_code == 401


# -----------------------------------------------------------------------
# Game history
# -----------------------------------------------------------------------


class TestGameHistory:
    async def test_empty_history(self, client):
        """A freshly-created table has no move history."""
        auth = await create_test_player(client)
        table = await create_test_table(client, auth["token"], auth["player"]["id"])
        resp = await client.get(f"/api/tables/{table['id']}/history")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_history_after_join(self, client):
        """After join (no moves played yet) the history is still empty."""
        table, _, _ = await create_and_join_table(client)
        resp = await client.get(f"/api/tables/{table['id']}/history")
        assert resp.status_code == 200
        assert resp.json() == []


# -----------------------------------------------------------------------
# Player stats
# -----------------------------------------------------------------------


class TestPlayerStats:
    async def test_stats_for_new_player(self, client):
        """A brand-new registered player has zeroed-out stats."""
        # Use auth/register to create a non-guest player (guests get 403)
        reg_resp = await client.post(
            "/api/auth/register",
            json={"email": "newbie@example.com", "password": "secret123", "nickname": "Newbie"},
        )
        token = reg_resp.json()["token"]
        player = reg_resp.json()["player"]
        resp = await client.get(
            f"/api/players/{player['id']}/stats",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_games"] == 0
        assert data["total_wins"] == 0
        assert data["total_losses"] == 0
        assert data["win_rate"] == 0.0
        assert data["per_opponent"] == []

    async def test_stats_for_guest_player_forbidden(self, client):
        """Guest players get 403 when requesting stats."""
        auth = await create_test_player(client, "GuestNewbie")
        resp = await client.get(
            f"/api/players/{auth['player']['id']}/stats",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 403

    async def test_stats_unauthenticated(self, client):
        """Stats without auth returns 401."""
        resp = await client.get("/api/players/nonexistent-id/stats")
        assert resp.status_code == 401

    async def test_stats_wrong_player(self, client):
        """Requesting stats for a different player returns 403."""
        auth1 = await create_test_player(client, "Player1")
        auth2 = await create_test_player(client, "Player2")
        # Player1 tries to access Player2's stats
        resp = await client.get(
            f"/api/players/{auth2['player']['id']}/stats",
            headers=auth_headers(auth1["token"]),
        )
        assert resp.status_code == 403


# -----------------------------------------------------------------------
# Leaderboard endpoint
# -----------------------------------------------------------------------


class TestLeaderboardEndpoints:
    async def test_leaderboard_empty(self, client):
        """GET /api/leaderboard returns an empty list when no games have been played."""
        resp = await client.get("/api/leaderboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["entries"] == []
        assert data["total"] == 0

    async def test_leaderboard_default_metric_is_wins(self, client, db_session):
        """Default metric is wins; players with wins appear in the list."""
        p = Player(nickname="Winner", is_guest=False)
        db_session.add(p)
        await db_session.flush()

        stats = PlayerStats(
            player_id=p.id,
            opponent_id=None,
            games_played=5,
            games_won=4,
            games_lost=1,
        )
        db_session.add(stats)
        await db_session.flush()

        resp = await client.get("/api/leaderboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        entry = data["entries"][0]
        assert entry["nickname"] == "Winner"
        assert entry["total_wins"] == 4
        assert entry["total_games"] == 5
        assert entry["rank"] == 1

    async def test_leaderboard_excludes_guests(self, client, db_session):
        """Guest accounts are not included in the leaderboard."""
        guest = Player(nickname="GuestUser", is_guest=True)
        db_session.add(guest)
        await db_session.flush()

        stats = PlayerStats(
            player_id=guest.id,
            opponent_id=None,
            games_played=10,
            games_won=8,
            games_lost=2,
        )
        db_session.add(stats)
        await db_session.flush()

        resp = await client.get("/api/leaderboard?metric=wins")
        assert resp.status_code == 200
        data = resp.json()
        assert all(e["nickname"] != "GuestUser" for e in data["entries"])

    async def test_leaderboard_excludes_bot(self, client, db_session):
        """The BOT player is excluded from the leaderboard."""
        bot = Player(id="BOT", nickname="Bot", is_guest=False)
        db_session.add(bot)
        await db_session.flush()

        stats = PlayerStats(
            player_id="BOT",
            opponent_id=None,
            games_played=100,
            games_won=90,
            games_lost=10,
        )
        db_session.add(stats)
        await db_session.flush()

        resp = await client.get("/api/leaderboard?metric=wins")
        assert resp.status_code == 200
        data = resp.json()
        assert all(e["nickname"] != "Bot" for e in data["entries"])

    async def test_leaderboard_wins_ordering(self, client, db_session):
        """Players with more wins appear earlier in the wins leaderboard."""
        p1 = Player(nickname="Alice", is_guest=False)
        p2 = Player(nickname="Bob", is_guest=False)
        db_session.add_all([p1, p2])
        await db_session.flush()

        db_session.add_all([
            PlayerStats(player_id=p1.id, opponent_id=None, games_played=10, games_won=3, games_lost=7),
            PlayerStats(player_id=p2.id, opponent_id=None, games_played=10, games_won=8, games_lost=2),
        ])
        await db_session.flush()

        resp = await client.get("/api/leaderboard?metric=wins")
        assert resp.status_code == 200
        entries = resp.json()["entries"]
        assert entries[0]["nickname"] == "Bob"
        assert entries[1]["nickname"] == "Alice"

    async def test_leaderboard_win_rate_min_10_games(self, client, db_session):
        """win_rate metric excludes players with fewer than 10 games."""
        low = Player(nickname="FewGames", is_guest=False)
        high = Player(nickname="ManyGames", is_guest=False)
        db_session.add_all([low, high])
        await db_session.flush()

        db_session.add_all([
            PlayerStats(player_id=low.id, opponent_id=None, games_played=5, games_won=5, games_lost=0),
            PlayerStats(player_id=high.id, opponent_id=None, games_played=10, games_won=8, games_lost=2),
        ])
        await db_session.flush()

        resp = await client.get("/api/leaderboard?metric=win_rate")
        assert resp.status_code == 200
        entries = resp.json()["entries"]
        nicknames = [e["nickname"] for e in entries]
        assert "FewGames" not in nicknames
        assert "ManyGames" in nicknames

    async def test_leaderboard_rating_min_5_games(self, client, db_session):
        """rating metric excludes players with fewer than 5 rated games."""
        few = Player(nickname="FewRated", is_guest=False, rating=2000, rating_games=3)
        many = Player(nickname="ManyRated", is_guest=False, rating=1600, rating_games=10)
        db_session.add_all([few, many])
        await db_session.flush()

        resp = await client.get("/api/leaderboard?metric=rating")
        assert resp.status_code == 200
        entries = resp.json()["entries"]
        nicknames = [e["nickname"] for e in entries]
        assert "FewRated" not in nicknames
        assert "ManyRated" in nicknames

    async def test_leaderboard_pagination(self, client, db_session):
        """offset parameter correctly paginates results."""
        players = [Player(nickname=f"Player{i}", is_guest=False) for i in range(5)]
        db_session.add_all(players)
        await db_session.flush()

        for i, p in enumerate(players):
            db_session.add(PlayerStats(
                player_id=p.id,
                opponent_id=None,
                games_played=10,
                games_won=i,
                games_lost=10 - i,
            ))
        await db_session.flush()

        resp1 = await client.get("/api/leaderboard?metric=wins&limit=3&offset=0")
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert len(data1["entries"]) == 3
        assert data1["total"] == 5
        assert data1["entries"][0]["rank"] == 1

        resp2 = await client.get("/api/leaderboard?metric=wins&limit=3&offset=3")
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert len(data2["entries"]) == 2
        assert data2["entries"][0]["rank"] == 4

    async def test_leaderboard_invalid_metric(self, client):
        """An invalid metric value returns a 422 validation error."""
        resp = await client.get("/api/leaderboard?metric=invalid")
        assert resp.status_code == 422
