"""REST API endpoint tests for the backgammon backend.

Uses httpx.AsyncClient to exercise every route defined in ``app.api.routes``.
Each test is independent -- a fresh in-memory database is provisioned via the
``client`` fixture (which itself depends on ``db_session``).
"""

import pytest

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
