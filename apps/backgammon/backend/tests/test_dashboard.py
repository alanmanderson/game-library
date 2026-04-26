"""Dashboard endpoint tests for the backgammon backend.

Tests GET /api/players/{player_id}/dashboard which returns past games,
results, opponent info, W/L record, abandoned games count, and total games.
"""

import pytest
from datetime import datetime, timedelta

from app.models import Player, Table
from tests.conftest import auth_headers, create_test_player


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def register_player(client, email, nickname):
    """Register a non-guest player via the auth API and return (player_dict, token)."""
    resp = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "Secret123!", "nickname": nickname},
    )
    assert resp.status_code == 200, f"Failed to register player: {resp.text}"
    data = resp.json()
    return data["player"], data["token"]


async def insert_table(db_session, **kwargs):
    """Insert a Table row directly into the test database."""
    table = Table(**kwargs)
    db_session.add(table)
    await db_session.flush()
    return table


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestDashboardEndpoint:
    """Tests for GET /api/players/{player_id}/dashboard."""

    async def test_not_found_for_nonexistent_player(self, client):
        """Dashboard returns 401 when no auth is provided."""
        resp = await client.get("/api/players/nonexistent-id/dashboard")
        assert resp.status_code == 401

    async def test_forbidden_for_guest_player(self, client):
        """Dashboard returns 403 for guest players."""
        guest_auth = await create_test_player(client, "GuestDash")
        resp = await client.get(
            f"/api/players/{guest_auth['player']['id']}/dashboard",
            headers=auth_headers(guest_auth["token"]),
        )
        assert resp.status_code == 403
        assert "guest" in resp.json()["detail"].lower()

    async def test_empty_dashboard(self, client):
        """A registered player with no games gets an empty dashboard."""
        player, token = await register_player(client, "empty@example.com", "EmptyPlayer")
        resp = await client.get(
            f"/api/players/{player['id']}/dashboard",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_games"] == 0
        assert data["wins"] == 0
        assert data["losses"] == 0
        assert data["win_rate"] == 0.0
        assert data["abandoned_games"] == 0
        assert data["games"] == []

    async def test_finished_game_win(self, client, db_session):
        """A finished game where the player won shows as a win."""
        player, token = await register_player(client, "winner@example.com", "Winner")
        opponent, _ = await register_player(client, "loser@example.com", "Loser")

        now = datetime.utcnow()
        await insert_table(
            db_session,
            id="TBLWIN01",
            status="finished",
            white_player_id=player["id"],
            black_player_id=opponent["id"],
            winner_id=player["id"],
            win_type="normal",
            final_score=1,
            created_at=now - timedelta(hours=1),
            finished_at=now,
        )
        await db_session.commit()

        resp = await client.get(
            f"/api/players/{player['id']}/dashboard",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_games"] == 1
        assert data["wins"] == 1
        assert data["losses"] == 0
        assert data["win_rate"] == 100.0
        assert data["abandoned_games"] == 0
        assert len(data["games"]) == 1

        game = data["games"][0]
        assert game["table_id"] == "TBLWIN01"
        assert game["opponent_nickname"] == "Loser"
        assert game["player_color"] == "white"
        assert game["result"] == "win"
        assert game["win_type"] == "normal"
        assert game["score"] == 1
        assert game["table_status"] == "finished"

    async def test_finished_game_loss(self, client, db_session):
        """A finished game where the player lost shows as a loss."""
        player, token = await register_player(client, "plose@example.com", "PlayerLose")
        opponent, _ = await register_player(client, "pwin@example.com", "PlayerWin")

        now = datetime.utcnow()
        await insert_table(
            db_session,
            id="TBLLOS01",
            status="finished",
            white_player_id=opponent["id"],
            black_player_id=player["id"],
            winner_id=opponent["id"],
            win_type="gammon",
            final_score=2,
            created_at=now - timedelta(hours=1),
            finished_at=now,
        )
        await db_session.commit()

        resp = await client.get(
            f"/api/players/{player['id']}/dashboard",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_games"] == 1
        assert data["wins"] == 0
        assert data["losses"] == 1
        assert data["win_rate"] == 0.0

        game = data["games"][0]
        assert game["table_id"] == "TBLLOS01"
        assert game["opponent_nickname"] == "PlayerWin"
        assert game["player_color"] == "black"
        assert game["result"] == "loss"
        assert game["win_type"] == "gammon"
        assert game["score"] == 2
        assert game["table_status"] == "finished"

    async def test_abandoned_game(self, client, db_session):
        """A game with status 'playing' shows as abandoned."""
        player, token = await register_player(client, "abandon@example.com", "Abandoner")
        opponent, _ = await register_player(client, "left@example.com", "LeftBehind")

        now = datetime.utcnow()
        await insert_table(
            db_session,
            id="TBLABN01",
            status="playing",
            white_player_id=player["id"],
            black_player_id=opponent["id"],
            created_at=now,
        )
        await db_session.commit()

        resp = await client.get(
            f"/api/players/{player['id']}/dashboard",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        # Abandoned games do NOT count toward total_games (finished only)
        assert data["total_games"] == 0
        assert data["wins"] == 0
        assert data["losses"] == 0
        assert data["win_rate"] == 0.0
        assert data["abandoned_games"] == 1
        assert len(data["games"]) == 1

        game = data["games"][0]
        assert game["table_id"] == "TBLABN01"
        assert game["result"] == "abandoned"
        assert game["win_type"] is None
        assert game["score"] is None
        assert game["table_status"] == "playing"

    async def test_game_over_status_shows_as_abandoned(self, client, db_session):
        """A table with status 'game_over' (mid-match) shows as abandoned and resumable."""
        player, token = await register_player(client, "gameover@example.com", "GameOverPlayer")
        opponent, _ = await register_player(client, "goopp@example.com", "GameOverOpp")

        now = datetime.utcnow()
        await insert_table(
            db_session,
            id="TBLGO001",
            status="game_over",
            white_player_id=player["id"],
            black_player_id=opponent["id"],
            created_at=now,
        )
        await db_session.commit()

        resp = await client.get(
            f"/api/players/{player['id']}/dashboard",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["abandoned_games"] == 1
        assert len(data["games"]) == 1

        game = data["games"][0]
        assert game["table_id"] == "TBLGO001"
        assert game["result"] == "abandoned"
        assert game["table_status"] == "game_over"

    async def test_summary_calculations(self, client, db_session):
        """Summary stats are calculated correctly across multiple games."""
        player, token = await register_player(client, "summary@example.com", "SummaryPlayer")
        opp1, _ = await register_player(client, "opp1@example.com", "Opponent1")
        opp2, _ = await register_player(client, "opp2@example.com", "Opponent2")

        now = datetime.utcnow()

        # Game 1: player wins
        await insert_table(
            db_session,
            id="TBLSUM01",
            status="finished",
            white_player_id=player["id"],
            black_player_id=opp1["id"],
            winner_id=player["id"],
            win_type="normal",
            final_score=1,
            created_at=now - timedelta(hours=4),
            finished_at=now - timedelta(hours=3),
        )

        # Game 2: player loses
        await insert_table(
            db_session,
            id="TBLSUM02",
            status="finished",
            white_player_id=opp2["id"],
            black_player_id=player["id"],
            winner_id=opp2["id"],
            win_type="backgammon",
            final_score=3,
            created_at=now - timedelta(hours=3),
            finished_at=now - timedelta(hours=2),
        )

        # Game 3: player wins
        await insert_table(
            db_session,
            id="TBLSUM03",
            status="finished",
            white_player_id=player["id"],
            black_player_id=opp1["id"],
            winner_id=player["id"],
            win_type="gammon",
            final_score=2,
            created_at=now - timedelta(hours=2),
            finished_at=now - timedelta(hours=1),
        )

        # Game 4: abandoned
        await insert_table(
            db_session,
            id="TBLSUM04",
            status="playing",
            white_player_id=player["id"],
            black_player_id=opp2["id"],
            created_at=now,
        )

        await db_session.commit()

        resp = await client.get(
            f"/api/players/{player['id']}/dashboard",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()

        # 3 finished games, 1 abandoned
        assert data["total_games"] == 3
        assert data["wins"] == 2
        assert data["losses"] == 1
        assert abs(data["win_rate"] - 66.66666666666667) < 0.01
        assert data["abandoned_games"] == 1
        # All 4 games (finished + abandoned) appear in the list
        assert len(data["games"]) == 4

    async def test_games_ordered_newest_first(self, client, db_session):
        """Games are returned with the newest first (descending created_at)."""
        player, token = await register_player(client, "order@example.com", "OrderPlayer")
        opp, _ = await register_player(client, "orderopp@example.com", "OrderOpp")

        now = datetime.utcnow()

        # Older game
        await insert_table(
            db_session,
            id="TBLORD01",
            status="finished",
            white_player_id=player["id"],
            black_player_id=opp["id"],
            winner_id=player["id"],
            win_type="normal",
            final_score=1,
            created_at=now - timedelta(hours=2),
            finished_at=now - timedelta(hours=1),
        )

        # Newer game
        await insert_table(
            db_session,
            id="TBLORD02",
            status="finished",
            white_player_id=opp["id"],
            black_player_id=player["id"],
            winner_id=opp["id"],
            win_type="normal",
            final_score=1,
            created_at=now - timedelta(minutes=30),
            finished_at=now,
        )

        await db_session.commit()

        resp = await client.get(
            f"/api/players/{player['id']}/dashboard",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()

        assert len(data["games"]) == 2
        # Newest game first
        assert data["games"][0]["table_id"] == "TBLORD02"
        assert data["games"][1]["table_id"] == "TBLORD01"

    async def test_waiting_tables_excluded(self, client, db_session):
        """Tables with status 'waiting' are not included in the dashboard."""
        player, token = await register_player(client, "waiting@example.com", "WaitPlayer")

        now = datetime.utcnow()
        await insert_table(
            db_session,
            id="TBLWAIT1",
            status="waiting",
            white_player_id=player["id"],
            created_at=now,
        )
        await db_session.commit()

        resp = await client.get(
            f"/api/players/{player['id']}/dashboard",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_games"] == 0
        assert data["abandoned_games"] == 0
        assert data["games"] == []
