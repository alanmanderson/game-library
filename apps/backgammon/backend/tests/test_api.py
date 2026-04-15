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
        data = resp.json()
        assert data["total"] == 0
        assert data["limit"] == 50
        assert data["offset"] == 0
        assert data["records"] == []

    async def test_history_after_join(self, client):
        """After join (no moves played yet) the history is still empty."""
        table, _, _ = await create_and_join_table(client)
        resp = await client.get(f"/api/tables/{table['id']}/history")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["records"] == []

    async def test_history_pagination_params(self, client):
        """Custom limit and offset are reflected in the response."""
        auth = await create_test_player(client)
        table = await create_test_table(client, auth["token"], auth["player"]["id"])
        resp = await client.get(
            f"/api/tables/{table['id']}/history?limit=10&offset=5"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["limit"] == 10
        assert data["offset"] == 5
        assert data["total"] == 0
        assert data["records"] == []


# -----------------------------------------------------------------------
# Game export
# -----------------------------------------------------------------------


class TestGameExport:
    async def test_export_not_found(self, client):
        """GET /api/tables/{id}/export returns 404 for a nonexistent table."""
        resp = await client.get("/api/tables/XXXXXXXX/export")
        assert resp.status_code == 404

    async def test_export_empty_game(self, client):
        """Export of a newly-created table returns valid plain-text with headers."""
        table, creator_auth, joiner_auth = await create_and_join_table(client, "Alice", "Bob")
        table_id = table["id"]

        resp = await client.get(f"/api/tables/{table_id}/export")
        assert resp.status_code == 200
        assert "text/plain" in resp.headers["content-type"]
        content = resp.text
        # Both player nicknames appear (order depends on white/black assignment).
        assert "Alice" in content
        assert "Bob" in content
        assert "Match to" in content
        assert "Game 1" in content

    async def test_export_with_move_records(self, client, db_session):
        """Export output includes dice and move notation from recorded moves."""
        from app.models import MoveRecord

        table, creator_auth, joiner_auth = await create_and_join_table(client, "WhitePlayer", "BlackPlayer")
        table_id = table["id"]
        white_id = table["white_player"]["id"]
        black_id = table["black_player"]["id"]

        # Insert synthetic move records directly into the test database.
        rec1 = MoveRecord(
            table_id=table_id,
            player_id=white_id,
            move_number=1,
            dice_roll="3-1",
            moves_notation="8/5 6/5",
        )
        rec2 = MoveRecord(
            table_id=table_id,
            player_id=black_id,
            move_number=2,
            dice_roll="4-2",
            moves_notation="24/20 13/11",
        )
        db_session.add(rec1)
        db_session.add(rec2)
        await db_session.commit()

        resp = await client.get(f"/api/tables/{table_id}/export")
        assert resp.status_code == 200
        content = resp.text
        assert "31: 8/5 6/5" in content
        assert "42: 24/20 13/11" in content
        assert " 1)" in content

    async def test_export_content_disposition_header(self, client):
        """The response carries a Content-Disposition attachment header."""
        table, _, _ = await create_and_join_table(client)
        table_id = table["id"]
        resp = await client.get(f"/api/tables/{table_id}/export")
        assert resp.status_code == 200
        cd = resp.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert f"game_{table_id}.mat" in cd


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
# Game replay
# -----------------------------------------------------------------------


class TestGameReplay:
    async def test_replay_not_found(self, client):
        """Replay for a nonexistent table returns 404."""
        resp = await client.get("/api/tables/XXXXXX/replay")
        assert resp.status_code == 404

    async def test_replay_empty_moves(self, client):
        """Replay for a table with no moves has an empty moves list."""
        auth = await create_test_player(client)
        table = await create_test_table(client, auth["token"], auth["player"]["id"])
        resp = await client.get(f"/api/tables/{table['id']}/replay")
        assert resp.status_code == 200
        data = resp.json()
        assert data["table_id"] == table["id"]
        assert data["moves"] == []
        assert "initial_state" in data
        # initial_state should have the standard starting board
        state = data["initial_state"]
        assert len(state["points"]) == 26
        assert state["bar_white"] == 0
        assert state["bar_black"] == 0
        assert state["off_white"] == 0
        assert state["off_black"] == 0

    async def test_replay_includes_player_nicknames(self, client, db_session):
        """Replay response includes white and black player nicknames."""
        from app.models import Table

        table, creator_auth, joiner_auth = await create_and_join_table(
            client, "ReplayAlice", "ReplayBob"
        )
        # Mark the table as finished so the public replay endpoint allows access
        db_table = await db_session.get(Table, table["id"])
        db_table.status = "game_over"
        await db_session.commit()

        resp = await client.get(f"/api/tables/{table['id']}/replay")
        assert resp.status_code == 200
        data = resp.json()
        nicknames = {data.get("white_player_nickname"), data.get("black_player_nickname")}
        assert "ReplayAlice" in nicknames
        assert "ReplayBob" in nicknames

    async def test_replay_response_structure(self, client, db_session):
        """Replay response has the expected top-level fields."""
        from app.models import Table

        table, _, _ = await create_and_join_table(client)
        db_table = await db_session.get(Table, table["id"])
        db_table.status = "finished"
        await db_session.commit()

        resp = await client.get(f"/api/tables/{table['id']}/replay")
        assert resp.status_code == 200
        data = resp.json()
        assert "table_id" in data
        assert "white_player_nickname" in data
        assert "black_player_nickname" in data
        assert "initial_state" in data
        assert "moves" in data
        assert "status" in data
        assert "winner_color" in data
        assert "win_type" in data
        assert isinstance(data["moves"], list)

    async def test_replay_blocks_in_progress_game(self, client):
        """Replay endpoint refuses to serve games still being played."""
        table, _, _ = await create_and_join_table(client)
        # After joining, the table status is "playing".
        resp = await client.get(f"/api/tables/{table['id']}/replay")
        assert resp.status_code == 403
        assert "completed" in resp.json()["detail"].lower()

    async def test_replay_is_public_for_finished_games(self, client, db_session):
        """Completed games can be fetched without any auth header."""
        from app.models import Table, Player

        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        db_table = await db_session.get(Table, table["id"])
        db_table.status = "finished"
        db_table.winner_id = db_table.white_player_id
        db_table.win_type = "gammon"
        await db_session.commit()

        # Look up the actual nickname of the white player (colors are assigned
        # at join-time and which player gets white is not deterministic from
        # the creator/joiner ordering).
        white_player = await db_session.get(Player, db_table.white_player_id)
        expected_winner_nickname = white_player.nickname

        # Explicitly no Authorization header
        resp = await client.get(f"/api/tables/{table['id']}/replay")
        assert resp.status_code == 200
        data = resp.json()
        assert data["winner_color"] == "white"
        assert data["winner_nickname"] == expected_winner_nickname
        assert data["win_type"] == "gammon"


# -----------------------------------------------------------------------
# Active games endpoint
# -----------------------------------------------------------------------


class TestActiveGamesEndpoint:
    async def test_active_games_empty(self, client):
        """GET /api/active-games returns empty list when no games are active."""
        resp = await client.get("/api/active-games")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_active_games_shows_playing_tables(self, client):
        """GET /api/active-games returns tables with status 'playing'."""
        auth1 = await create_test_player(client, "Alice")
        auth2 = await create_test_player(client, "Bob")
        # Create a public table
        create_resp = await client.post(
            "/api/tables",
            json={"player_id": auth1["player"]["id"], "is_public": True},
            headers=auth_headers(auth1["token"]),
        )
        assert create_resp.status_code == 200
        table_id = create_resp.json()["id"]
        # Join it to start the game
        join_resp = await client.post(
            f"/api/tables/{table_id}/join",
            json={"player_id": auth2["player"]["id"]},
            headers=auth_headers(auth2["token"]),
        )
        assert join_resp.status_code == 200

        resp = await client.get("/api/active-games")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        game = data[0]
        assert game["id"] == table_id
        assert "white_player_nickname" in game
        assert "black_player_nickname" in game
        assert "spectator_count" in game
        assert game["spectator_count"] == 0

    async def test_active_games_excludes_waiting_tables(self, client):
        """GET /api/active-games does not include tables still waiting."""
        auth = await create_test_player(client, "Alice")
        await create_test_table(client, auth["token"], auth["player"]["id"])
        # Waiting table should not appear
        resp = await client.get("/api/active-games")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_active_games_excludes_private_tables(self, client):
        """GET /api/active-games does not include private tables."""
        auth1 = await create_test_player(client, "Alice")
        auth2 = await create_test_player(client, "Bob")
        # Create a private table
        resp = await client.post(
            "/api/tables",
            json={"player_id": auth1["player"]["id"], "is_public": False},
            headers=auth_headers(auth1["token"]),
        )
        assert resp.status_code == 200
        table_id = resp.json()["id"]
        # Join it to start the game
        await client.post(
            f"/api/tables/{table_id}/join",
            json={"player_id": auth2["player"]["id"]},
            headers=auth_headers(auth2["token"]),
        )
        resp = await client.get("/api/active-games")
        assert resp.status_code == 200
        # Private table should not show up
        assert all(g["id"] != table_id for g in resp.json())
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
