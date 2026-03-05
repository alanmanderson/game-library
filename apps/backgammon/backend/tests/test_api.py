"""REST API endpoint tests for the backgammon backend.

Uses httpx.AsyncClient to exercise every route defined in ``app.api.routes``.
Each test is independent -- a fresh in-memory database is provisioned via the
``client`` fixture (which itself depends on ``db_session``).
"""

import pytest

from tests.conftest import create_test_player, create_test_table, create_and_join_table


# -----------------------------------------------------------------------
# Player endpoints
# -----------------------------------------------------------------------


class TestPlayerEndpoints:
    async def test_create_player(self, client):
        """POST /api/players creates a player and returns its data."""
        resp = await client.post("/api/players", json={"nickname": "Alice"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["nickname"] == "Alice"
        assert "id" in data
        assert "created_at" in data

    async def test_create_player_different_nicknames(self, client):
        """Two players with different nicknames get different IDs."""
        p1 = await create_test_player(client, "Alice")
        p2 = await create_test_player(client, "Bob")
        assert p1["id"] != p2["id"]
        assert p1["nickname"] == "Alice"
        assert p2["nickname"] == "Bob"

    async def test_create_player_empty_nickname(self, client):
        """An empty-string nickname is still accepted (no server-side min-length)."""
        resp = await client.post("/api/players", json={"nickname": ""})
        # The API does not enforce a minimum length -- it should succeed.
        assert resp.status_code == 200
        assert resp.json()["nickname"] == ""

    async def test_create_player_missing_nickname(self, client):
        """Omitting the nickname field should return a 422 validation error."""
        resp = await client.post("/api/players", json={})
        assert resp.status_code == 422

    async def test_get_player(self, client):
        """GET /api/players/{id} retrieves a previously created player."""
        created = await create_test_player(client, "Charlie")
        resp = await client.get(f"/api/players/{created['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == created["id"]
        assert data["nickname"] == "Charlie"

    async def test_get_player_not_found(self, client):
        """GET /api/players/{id} with a nonexistent ID returns 404."""
        resp = await client.get("/api/players/nonexistent-uuid")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()


# -----------------------------------------------------------------------
# Table endpoints
# -----------------------------------------------------------------------


class TestTableEndpoints:
    async def test_create_table(self, client):
        """POST /api/tables creates a table in 'waiting' status."""
        player = await create_test_player(client, "Alice")
        resp = await client.post("/api/tables", json={"player_id": player["id"]})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "waiting"
        assert data["white_player"]["id"] == player["id"]
        assert data["black_player"] is None

    async def test_create_table_invalid_player(self, client):
        """Creating a table with a nonexistent player_id returns 404."""
        resp = await client.post("/api/tables", json={"player_id": "does-not-exist"})
        assert resp.status_code == 404

    async def test_create_table_missing_player_id(self, client):
        """Omitting player_id should return a 422 validation error."""
        resp = await client.post("/api/tables", json={})
        assert resp.status_code == 422

    async def test_get_table(self, client):
        """GET /api/tables/{id} retrieves an existing table."""
        player = await create_test_player(client)
        table = await create_test_table(client, player["id"])
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
        table, creator, joiner = await create_and_join_table(client)
        assert table["status"] == "playing"
        # Both player slots should be filled (order depends on random color assignment)
        assert table["white_player"] is not None
        assert table["black_player"] is not None
        player_ids = {table["white_player"]["id"], table["black_player"]["id"]}
        assert creator["id"] in player_ids
        assert joiner["id"] in player_ids

    async def test_join_table_own_table(self, client):
        """A player cannot join a table they created."""
        player = await create_test_player(client, "SoloPlayer")
        table = await create_test_table(client, player["id"])
        resp = await client.post(
            f"/api/tables/{table['id']}/join", json={"player_id": player["id"]}
        )
        assert resp.status_code == 400
        assert "own table" in resp.json()["detail"].lower()

    async def test_join_table_already_playing(self, client):
        """A third player cannot join a table that is already playing."""
        table, _creator, _joiner = await create_and_join_table(client)
        intruder = await create_test_player(client, "Intruder")
        resp = await client.post(
            f"/api/tables/{table['id']}/join", json={"player_id": intruder["id"]}
        )
        assert resp.status_code == 400
        assert "not waiting" in resp.json()["detail"].lower()

    async def test_join_table_invalid_player(self, client):
        """Joining with a nonexistent player_id returns 404."""
        player = await create_test_player(client)
        table = await create_test_table(client, player["id"])
        resp = await client.post(
            f"/api/tables/{table['id']}/join", json={"player_id": "no-such-player"}
        )
        assert resp.status_code == 404

    async def test_join_table_not_found(self, client):
        """Joining a nonexistent table returns 400 (ValueError from game_service)."""
        player = await create_test_player(client)
        resp = await client.post(
            "/api/tables/XXXXXX/join", json={"player_id": player["id"]}
        )
        assert resp.status_code == 400


# -----------------------------------------------------------------------
# Game history
# -----------------------------------------------------------------------


class TestGameHistory:
    async def test_empty_history(self, client):
        """A freshly-created table has no move history."""
        player = await create_test_player(client)
        table = await create_test_table(client, player["id"])
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
        player = reg_resp.json()["player"]
        resp = await client.get(f"/api/players/{player['id']}/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_games"] == 0
        assert data["total_wins"] == 0
        assert data["total_losses"] == 0
        assert data["win_rate"] == 0.0
        assert data["per_opponent"] == []

    async def test_stats_for_guest_player_forbidden(self, client):
        """Guest players get 403 when requesting stats."""
        player = await create_test_player(client, "GuestNewbie")
        resp = await client.get(f"/api/players/{player['id']}/stats")
        assert resp.status_code == 403

    async def test_stats_not_found(self, client):
        """Stats for a nonexistent player returns 404."""
        resp = await client.get("/api/players/nonexistent-id/stats")
        assert resp.status_code == 404
