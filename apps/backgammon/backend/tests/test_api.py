"""REST API endpoint tests for the backgammon backend.

Uses httpx.AsyncClient to exercise every route defined in ``app.api.routes``.
Each test is independent -- a fresh in-memory database is provisioned via the
``client`` fixture (which itself depends on ``db_session``).
"""

import pytest

from datetime import datetime, timedelta, timezone

from app.models import Player, PlayerStats, Table
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
    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
    async def test_create_two_different_players(self, client):
        """Two players with different nicknames get different IDs."""
        p1 = await create_test_player(client, "Alice")
        p2 = await create_test_player(client, "Bob")
        assert p1["player"]["id"] != p2["player"]["id"]
        assert p1["player"]["nickname"] == "Alice"
        assert p2["player"]["nickname"] == "Bob"

    @pytest.mark.asyncio
    async def test_create_guest_empty_nickname(self, client):
        """An empty-string nickname is rejected by the guest endpoint (min_length=1)."""
        resp = await client.post("/api/auth/guest", json={"nickname": ""})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_guest_missing_nickname(self, client):
        """Omitting the nickname field should return a 422 validation error."""
        resp = await client.post("/api/auth/guest", json={})
        assert resp.status_code == 422

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
    async def test_get_player_not_found(self, client):
        """GET /api/players/{id} with a nonexistent ID returns 404."""
        # Need an authenticated user to hit this endpoint
        auth = await create_test_player(client, "Auth")
        resp = await client.get(
            "/api/players/nonexistent-uuid", headers=auth_headers(auth["token"])
        )
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_get_player_unauthenticated(self, client):
        """GET /api/players/{id} without auth returns 401."""
        resp = await client.get("/api/players/some-id")
        assert resp.status_code == 401


# -----------------------------------------------------------------------
# Table endpoints
# -----------------------------------------------------------------------


class TestTableEndpoints:
    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
    async def test_create_table_unauthenticated(self, client):
        """Creating a table without auth returns 401."""
        resp = await client.post("/api/tables", json={"player_id": "some-id"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_table(self, client):
        """GET /api/tables/{id} retrieves an existing table."""
        auth = await create_test_player(client)
        table = await create_test_table(client, auth["token"], auth["player"]["id"])
        resp = await client.get(f"/api/tables/{table['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == table["id"]
        assert data["status"] == "waiting"

    @pytest.mark.asyncio
    async def test_get_table_not_found(self, client):
        """GET /api/tables/{id} with a nonexistent ID returns 404."""
        resp = await client.get("/api/tables/ZZZZZZ")
        assert resp.status_code == 404

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
    async def test_join_table_not_found(self, client):
        """Joining a nonexistent table returns 400 (ValueError from game_service)."""
        auth = await create_test_player(client)
        resp = await client.post(
            "/api/tables/XXXXXX/join",
            json={"player_id": auth["player"]["id"]},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
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
    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
    async def test_history_after_join(self, client):
        """After join (no moves played yet) the history is still empty."""
        table, _, _ = await create_and_join_table(client)
        resp = await client.get(f"/api/tables/{table['id']}/history")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["records"] == []

    @pytest.mark.asyncio
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
    @pytest.mark.asyncio
    async def test_export_not_found(self, client):
        """GET /api/tables/{id}/export returns 404 for a nonexistent table."""
        resp = await client.get("/api/tables/XXXXXXXX/export")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_export_empty_game(self, client):
        """Export of a newly-created table returns valid gnubg-compatible MAT format."""
        table, creator_auth, joiner_auth = await create_and_join_table(client, "Alice", "Bob")
        table_id = table["id"]

        resp = await client.get(f"/api/tables/{table_id}/export")
        assert resp.status_code == 200
        assert "text/plain" in resp.headers["content-type"]
        content = resp.text
        # Both player nicknames appear in the score line.
        assert "Alice" in content
        assert "Bob" in content
        # gnubg format: "N point match" (not "Match to N points")
        assert "point match" in content
        assert " Game 1" in content

    @pytest.mark.asyncio
    async def test_export_with_move_records(self, client, db_session):
        """Export output includes dice and move notation in gnubg MAT format."""
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
        # White's notation unchanged (already from White's perspective)
        assert "31: 8/5 6/5" in content
        # Black's internal "24/20 13/11" mirrored to Black's perspective: "1/5 12/14"
        assert "42: 1/5 12/14" in content
        # gnubg format: right-justified 3-char move number
        assert "  1)" in content

    @pytest.mark.asyncio
    async def test_export_content_disposition_header(self, client):
        """The response carries a Content-Disposition attachment header."""
        table, _, _ = await create_and_join_table(client)
        table_id = table["id"]
        resp = await client.get(f"/api/tables/{table_id}/export")
        assert resp.status_code == 200
        cd = resp.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert f"game_{table_id}.mat" in cd

    @pytest.mark.asyncio
    async def test_export_gnubg_format_structure(self, client, db_session):
        """Verify the full structure matches gnubg MAT import expectations."""
        from app.models import MoveRecord, Table

        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        table_id = table["id"]
        white_id = table["white_player"]["id"]
        black_id = table["black_player"]["id"]

        # Mark as finished with a winner
        db_table = await db_session.get(Table, table_id)
        db_table.status = "finished"
        db_table.winner_id = white_id
        db_table.final_score = 2

        # Add moves including bar entry and bear-off
        db_session.add(MoveRecord(
            table_id=table_id, player_id=white_id, move_number=1,
            dice_roll="3-1", moves_notation="8/5 6/5",
        ))
        db_session.add(MoveRecord(
            table_id=table_id, player_id=black_id, move_number=2,
            dice_roll="6-2", moves_notation="bar/3 12/18",
        ))
        db_session.add(MoveRecord(
            table_id=table_id, player_id=white_id, move_number=3,
            dice_roll="5-1", moves_notation="3/off bar/24",
        ))
        await db_session.commit()

        resp = await client.get(f"/api/tables/{table_id}/export")
        assert resp.status_code == 200
        lines = resp.text.split("\n")

        # Line 0: match length in gnubg format
        assert "point match" in lines[0]
        # The number should be parseable: " N point match"
        match_line = lines[0].strip()
        assert match_line.split()[0].isdigit()

        # Line 2: " Game 1"
        assert lines[2].strip() == "Game 1"
        assert lines[2].startswith(" ")

        # Line 3: score line with both player names
        assert "Alice" in lines[3] and "Bob" in lines[3]
        assert ": 0" in lines[3]

        # Move lines: gnubg uses numeric 25 for bar entry, 0 for bear-off
        content = resp.text
        # White's bar/24 → 25/24 (White's bar is 25 in MAT)
        assert "25/24" in content
        # White's 3/off → 3/0 (off = 0 in MAT)
        assert "3/0" in content
        # Black's bar/3 → from Black's perspective: 25/22 (bar=25, point 3 mirrors to 22)
        assert "25/22" in content
        # Black's 12/18 → from Black's perspective: 13/7
        assert "13/7" in content

        # Result line
        assert "Wins 2 points" in content

    async def test_export_black_moves_first(self, client, db_session):
        """When black wins the opening roll and moves first, black is in the left column."""
        from app.models import MoveRecord

        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        table_id = table["id"]
        white_id = table["white_player"]["id"]
        black_id = table["black_player"]["id"]
        black_name = table["black_player"]["nickname"]
        white_name = table["white_player"]["nickname"]

        # Black moved first (lower move_number)
        db_session.add(MoveRecord(
            table_id=table_id, player_id=black_id, move_number=1,
            dice_roll="6-3", moves_notation="12/18 12/15",
        ))
        db_session.add(MoveRecord(
            table_id=table_id, player_id=white_id, move_number=2,
            dice_roll="3-1", moves_notation="8/5 6/5",
        ))
        db_session.add(MoveRecord(
            table_id=table_id, player_id=black_id, move_number=3,
            dice_roll="4-2", moves_notation="24/20 13/11",
        ))
        await db_session.commit()

        resp = await client.get(f"/api/tables/{table_id}/export")
        assert resp.status_code == 200
        lines = resp.text.split("\n")

        # Black (first mover) should be in the left column
        score_line = lines[3]
        black_pos = score_line.index(black_name)
        white_pos = score_line.index(white_name)
        assert black_pos < white_pos, "Black (first mover) should be in the left column"

        # Row 1: Black's first move on the left, White's first move on the right
        row1 = lines[4]
        # Black's "12/18 12/15" mirrored → "13/7 13/10"
        assert "63: 13/7 13/10" in row1
        # White's move on the right in the same row
        assert "31: 8/5 6/5" in row1

        # Row 2: Black's second move on the left, no white move on right
        row2 = lines[5]
        # Black's "24/20 13/11" mirrored → "1/5 12/14"
        assert "42: 1/5 12/14" in row2


class TestPlayerStats:
    @pytest.mark.asyncio
    async def test_stats_for_new_player(self, client):
        """A brand-new registered player has zeroed-out stats."""
        # Use auth/register to create a non-guest player (guests get 403)
        reg_resp = await client.post(
            "/api/auth/register",
            json={"email": "newbie@example.com", "password": "Secret123!", "nickname": "Newbie"},
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

    @pytest.mark.asyncio
    async def test_stats_for_guest_player_forbidden(self, client):
        """Guest players get 403 when requesting stats."""
        auth = await create_test_player(client, "GuestNewbie")
        resp = await client.get(
            f"/api/players/{auth['player']['id']}/stats",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_stats_unauthenticated(self, client):
        """Stats without auth returns 401."""
        resp = await client.get("/api/players/nonexistent-id/stats")
        assert resp.status_code == 401

    @pytest.mark.asyncio
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
    @pytest.mark.asyncio
    async def test_replay_not_found(self, client):
        """Replay for a nonexistent table returns 404."""
        resp = await client.get("/api/tables/XXXXXX/replay")
        assert resp.status_code == 404

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
    async def test_replay_blocks_in_progress_game(self, client):
        """Replay endpoint refuses to serve games still being played."""
        table, _, _ = await create_and_join_table(client)
        # After joining, the table status is "playing".
        resp = await client.get(f"/api/tables/{table['id']}/replay")
        assert resp.status_code == 403
        assert "completed" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
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
# Game analysis
# -----------------------------------------------------------------------


class TestGameAnalysis:
    @pytest.mark.asyncio
    async def test_analysis_not_found(self, client):
        """Analysis for a nonexistent table returns 404."""
        auth = await create_test_player(client, "Alice")
        resp = await client.get(
            "/api/tables/XXXXXX/analysis",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_analysis_requires_auth(self, client):
        """Unauthenticated requests to the analysis endpoint are rejected with 401."""
        table, _, _ = await create_and_join_table(client)
        resp = await client.get(f"/api/tables/{table['id']}/analysis")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_analysis_rejects_bad_token(self, client):
        """Malformed/expired tokens are rejected with 401."""
        table, _, _ = await create_and_join_table(client)
        resp = await client.get(
            f"/api/tables/{table['id']}/analysis",
            headers=auth_headers("not-a-real-jwt"),
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_analysis_rejects_non_participant(self, client, db_session):
        """An authenticated non-participant gets 403."""
        from app.models import Table

        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        db_table = await db_session.get(Table, table["id"])
        db_table.status = "finished"
        await db_session.commit()

        # Third player who had nothing to do with the game
        outsider = await create_test_player(client, "Carol")
        resp = await client.get(
            f"/api/tables/{table['id']}/analysis",
            headers=auth_headers(outsider["token"]),
        )
        assert resp.status_code == 403
        assert "participat" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_analysis_blocks_in_progress_game(self, client):
        """Analysis endpoint refuses to serve in-progress games (for participants)."""
        table, creator_auth, _ = await create_and_join_table(client)
        resp = await client.get(
            f"/api/tables/{table['id']}/analysis",
            headers=auth_headers(creator_auth["token"]),
        )
        assert resp.status_code == 403
        assert "completed" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_analysis_empty_game_returns_empty_list(self, client, db_session):
        """A finished table with no moves returns an empty analyses list."""
        from app.models import Table

        table, creator_auth, _ = await create_and_join_table(client)
        db_table = await db_session.get(Table, table["id"])
        db_table.status = "finished"
        await db_session.commit()

        resp = await client.get(
            f"/api/tables/{table['id']}/analysis",
            headers=auth_headers(creator_auth["token"]),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["table_id"] == table["id"]
        assert data["move_analyses"] == []
        assert data["total_moves"] == 0
        assert data["moves_analysed"] == 0

    @pytest.mark.asyncio
    async def test_analysis_scores_recorded_moves(self, client, db_session):
        """Analysis produces one entry per recorded move with a quality label."""
        from app.models import MoveRecord, Table
        from app.game_engine import BackgammonEngine, Color, DiceRoll, Move

        table, creator_auth, _ = await create_and_join_table(client, "A", "B")
        db_table = await db_session.get(Table, table["id"])
        db_table.status = "finished"

        # Synthesise one recorded move for the white player
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(3, 1))
        engine.make_move(Move(from_point=8, to_point=5))
        engine.make_move(Move(from_point=6, to_point=5))
        state_after = engine.get_state_snapshot()

        rec = MoveRecord(
            table_id=table["id"],
            player_id=db_table.white_player_id,
            move_number=1,
            dice_roll="3-1",
            moves_notation="8/5 6/5",
            game_state_after=state_after,
        )
        db_session.add(rec)
        await db_session.commit()

        resp = await client.get(
            f"/api/tables/{table['id']}/analysis",
            headers=auth_headers(creator_auth["token"]),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_moves"] == 1
        assert data["moves_analysed"] == 1
        assert len(data["move_analyses"]) == 1
        a = data["move_analyses"][0]
        assert a["player_color"] == "white"
        assert a["dice_roll"] == "3-1"
        assert a["quality"] in {"best", "good", "inaccuracy", "mistake", "blunder"}
        assert a["equity_loss"] >= 0.0
        assert "equity_before" in a and "equity_after" in a
        assert "best_equity" in a

    @pytest.mark.asyncio
    async def test_analysis_is_cached(self, client, db_session):
        """Second request is served from the game_analyses cache table."""
        from app.models import GameAnalysis, MoveRecord, Table
        from app.game_engine import BackgammonEngine, Color, DiceRoll, Move

        table, creator_auth, _ = await create_and_join_table(client, "A", "B")
        db_table = await db_session.get(Table, table["id"])
        db_table.status = "finished"

        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(5, 3))
        engine.make_move(Move(from_point=8, to_point=3))
        engine.make_move(Move(from_point=8, to_point=3))
        state_after = engine.get_state_snapshot()

        db_session.add(
            MoveRecord(
                table_id=table["id"],
                player_id=db_table.white_player_id,
                move_number=1,
                dice_roll="5-3",
                moves_notation="8/3 8/3",
                game_state_after=state_after,
            )
        )
        await db_session.commit()

        # First call: computes + caches
        resp1 = await client.get(
            f"/api/tables/{table['id']}/analysis",
            headers=auth_headers(creator_auth["token"]),
        )
        assert resp1.status_code == 200

        cached = await db_session.get(GameAnalysis, table["id"])
        assert cached is not None
        assert cached.moves_analysed == 1

        # Second call: served from cache
        resp2 = await client.get(
            f"/api/tables/{table['id']}/analysis",
            headers=auth_headers(creator_auth["token"]),
        )
        assert resp2.status_code == 200
        assert resp2.json() == resp1.json()


# -----------------------------------------------------------------------
# Active games endpoint
# -----------------------------------------------------------------------


class TestActiveGamesEndpoint:
    @pytest.mark.asyncio
    async def test_active_games_empty(self, client):
        """GET /api/active-games returns empty list when no games are active."""
        resp = await client.get("/api/active-games")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
    async def test_active_games_excludes_waiting_tables(self, client):
        """GET /api/active-games does not include tables still waiting."""
        auth = await create_test_player(client, "Alice")
        await create_test_table(client, auth["token"], auth["player"]["id"])
        # Waiting table should not appear
        resp = await client.get("/api/active-games")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
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
    @pytest.mark.asyncio
    async def test_leaderboard_empty(self, client):
        """GET /api/leaderboard returns an empty list when no games have been played."""
        resp = await client.get("/api/leaderboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["entries"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
    async def test_leaderboard_invalid_metric(self, client):
        """An invalid metric value returns a 422 validation error."""
        resp = await client.get("/api/leaderboard?metric=invalid")
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_leaderboard_invalid_period(self, client):
        """An invalid period value returns a 422 validation error."""
        resp = await client.get("/api/leaderboard?period=yesterday")
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_leaderboard_period_week_only_recent_games(
        self, client, db_session
    ):
        """period=week counts only games finished in the last 7 days."""
        alice = Player(nickname="Alice", is_guest=False)
        bob = Player(nickname="Bob", is_guest=False)
        db_session.add_all([alice, bob])
        await db_session.flush()

        now = datetime.now(timezone.utc)
        recent_win = Table(
            id="RECENT01",
            status="finished",
            white_player_id=alice.id,
            black_player_id=bob.id,
            winner_id=alice.id,
            finished_at=now - timedelta(days=2),
        )
        old_win = Table(
            id="OLDWIN01",
            status="finished",
            white_player_id=bob.id,
            black_player_id=alice.id,
            winner_id=bob.id,
            finished_at=now - timedelta(days=40),
        )
        db_session.add_all([recent_win, old_win])
        await db_session.flush()

        resp = await client.get("/api/leaderboard?period=week&metric=wins")
        assert resp.status_code == 200
        entries = resp.json()["entries"]
        nicknames_to_wins = {e["nickname"]: e["total_wins"] for e in entries}
        # Alice has 1 recent win; Bob has 0 in the week window but was in the
        # recent game, so still appears with 1 game/0 wins.
        assert nicknames_to_wins.get("Alice") == 1
        assert nicknames_to_wins.get("Bob") == 0
        # The old game is outside the window so each player only has 1 game.
        alice_entry = next(e for e in entries if e["nickname"] == "Alice")
        bob_entry = next(e for e in entries if e["nickname"] == "Bob")
        assert alice_entry["total_games"] == 1
        assert bob_entry["total_games"] == 1

    @pytest.mark.asyncio
    async def test_leaderboard_period_month_window(self, client, db_session):
        """period=month counts games finished in the last 30 days only."""
        p = Player(nickname="Carol", is_guest=False)
        q = Player(nickname="Dave", is_guest=False)
        db_session.add_all([p, q])
        await db_session.flush()

        now = datetime.now(timezone.utc)
        in_month = Table(
            id="INMONTH1",
            status="finished",
            white_player_id=p.id,
            black_player_id=q.id,
            winner_id=p.id,
            finished_at=now - timedelta(days=10),
        )
        out_of_month = Table(
            id="OUTMON01",
            status="finished",
            white_player_id=p.id,
            black_player_id=q.id,
            winner_id=p.id,
            finished_at=now - timedelta(days=100),
        )
        db_session.add_all([in_month, out_of_month])
        await db_session.flush()

        resp = await client.get("/api/leaderboard?period=month&metric=wins")
        assert resp.status_code == 200
        entries = resp.json()["entries"]
        carol = next(e for e in entries if e["nickname"] == "Carol")
        assert carol["total_wins"] == 1
        assert carol["total_games"] == 1

    @pytest.mark.asyncio
    async def test_leaderboard_period_all_time_uses_playerstats(
        self, client, db_session
    ):
        """period=all_time (default) still reads from PlayerStats aggregates."""
        p = Player(nickname="Eve", is_guest=False)
        db_session.add(p)
        await db_session.flush()
        db_session.add(
            PlayerStats(
                player_id=p.id,
                opponent_id=None,
                games_played=7,
                games_won=4,
                games_lost=3,
            )
        )
        await db_session.flush()

        resp = await client.get("/api/leaderboard?period=all_time&metric=wins")
        assert resp.status_code == 200
        entries = resp.json()["entries"]
        eve = next(e for e in entries if e["nickname"] == "Eve")
        assert eve["total_wins"] == 4
        assert eve["total_games"] == 7

    @pytest.mark.asyncio
    async def test_leaderboard_viewer_entry_out_of_window(self, client, db_session):
        """viewer_entry is returned when the viewer is ranked below the page."""
        players = []
        for i in range(5):
            p = Player(nickname=f"Ranker{i}", is_guest=False)
            db_session.add(p)
            players.append(p)
        await db_session.flush()

        # Give each player a decreasing win count.
        for i, p in enumerate(players):
            db_session.add(
                PlayerStats(
                    player_id=p.id,
                    opponent_id=None,
                    games_played=10,
                    games_won=10 - i,
                    games_lost=i,
                )
            )
        await db_session.flush()

        # The last player (Ranker4) has 6 wins — lowest rank. Ask for page
        # size 2 with their id as viewer_id so we expect a viewer_entry back.
        last_id = players[4].id
        resp = await client.get(
            f"/api/leaderboard?metric=wins&limit=2&offset=0&viewer_id={last_id}"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["entries"]) == 2
        assert data["viewer_entry"] is not None
        assert data["viewer_entry"]["player_id"] == last_id
        assert data["viewer_entry"]["rank"] == 5

    @pytest.mark.asyncio
    async def test_leaderboard_viewer_entry_absent_when_on_page(
        self, client, db_session
    ):
        """viewer_entry is NOT populated when the viewer is already in the page."""
        p = Player(nickname="OnPage", is_guest=False)
        db_session.add(p)
        await db_session.flush()
        db_session.add(
            PlayerStats(
                player_id=p.id,
                opponent_id=None,
                games_played=4,
                games_won=3,
                games_lost=1,
            )
        )
        await db_session.flush()

        resp = await client.get(
            f"/api/leaderboard?metric=wins&viewer_id={p.id}"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["viewer_entry"] is None
