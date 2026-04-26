"""Tests for tournament API endpoints and bracket management."""

import pytest

from tests.conftest import auth_headers, create_test_player


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


async def create_registered_player(client, nickname: str) -> dict:
    """Create a non-guest player via register so they can join tournaments."""
    resp = await client.post(
        "/api/auth/register",
        json={"email": f"{nickname.lower()}@test.com", "password": "Password1!", "nickname": nickname},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def create_tournament(client, token: str, name: str = "Test Tournament", max_players: int = 4, match_points: int = 1) -> dict:
    resp = await client.post(
        "/api/tournaments",
        json={"name": name, "max_players": max_players, "match_points": match_points},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# List / Create tournaments
# ---------------------------------------------------------------------------


class TestTournamentList:
    async def test_list_tournaments_empty(self, client):
        """GET /api/tournaments returns empty list when no tournaments exist."""
        resp = await client.get("/api/tournaments")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_tournament_requires_auth(self, client):
        """POST /api/tournaments without auth returns 401."""
        resp = await client.post(
            "/api/tournaments",
            json={"name": "T1", "max_players": 4, "match_points": 1},
        )
        assert resp.status_code == 401

    async def test_guest_cannot_create_tournament(self, client):
        """Guest players cannot create tournaments."""
        guest = await create_test_player(client, "Guest1")
        resp = await client.post(
            "/api/tournaments",
            json={"name": "T1", "max_players": 4, "match_points": 1},
            headers=auth_headers(guest["token"]),
        )
        assert resp.status_code == 403

    async def test_create_tournament_success(self, client):
        """Registered player can create a tournament."""
        player = await create_registered_player(client, "Organizer")
        data = await create_tournament(client, player["token"], "My Tournament", max_players=4, match_points=3)
        assert data["name"] == "My Tournament"
        assert data["max_players"] == 4
        assert data["match_points"] == 3
        assert data["status"] == "registering"
        assert data["player_count"] == 0
        assert "id" in data

    async def test_list_tournaments_after_create(self, client):
        """Tournaments appear in the listing after creation."""
        player = await create_registered_player(client, "OrganizerB")
        await create_tournament(client, player["token"], "Listed Tournament")
        resp = await client.get("/api/tournaments")
        assert resp.status_code == 200
        tournaments = resp.json()
        assert len(tournaments) == 1
        assert tournaments[0]["name"] == "Listed Tournament"

    async def test_create_tournament_invalid_max_players(self, client):
        """max_players below 2 is rejected."""
        player = await create_registered_player(client, "OrganizerC")
        resp = await client.post(
            "/api/tournaments",
            json={"name": "T1", "max_players": 1, "match_points": 1},
            headers=auth_headers(player["token"]),
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Tournament registration
# ---------------------------------------------------------------------------


class TestTournamentRegistration:
    async def test_register_for_tournament(self, client):
        """A registered player can sign up for a tournament."""
        organizer = await create_registered_player(client, "OrgD")
        player1 = await create_registered_player(client, "PlayerD1")
        tournament = await create_tournament(client, organizer["token"])

        resp = await client.post(
            f"/api/tournaments/{tournament['id']}/register",
            headers=auth_headers(player1["token"]),
        )
        assert resp.status_code == 200
        bracket = resp.json()
        assert bracket["tournament"]["player_count"] == 1

    async def test_register_duplicate_raises_error(self, client):
        """Registering twice returns 400."""
        organizer = await create_registered_player(client, "OrgE")
        player1 = await create_registered_player(client, "PlayerE1")
        tournament = await create_tournament(client, organizer["token"])

        await client.post(
            f"/api/tournaments/{tournament['id']}/register",
            headers=auth_headers(player1["token"]),
        )
        resp = await client.post(
            f"/api/tournaments/{tournament['id']}/register",
            headers=auth_headers(player1["token"]),
        )
        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"].lower()

    async def test_guest_cannot_register(self, client):
        """Guest players cannot register for tournaments."""
        organizer = await create_registered_player(client, "OrgF")
        guest = await create_test_player(client, "GuestF")
        tournament = await create_tournament(client, organizer["token"])

        resp = await client.post(
            f"/api/tournaments/{tournament['id']}/register",
            headers=auth_headers(guest["token"]),
        )
        assert resp.status_code == 403

    async def test_tournament_full(self, client):
        """Registering beyond max_players returns 400."""
        organizer = await create_registered_player(client, "OrgG")
        # Use max_players=2 so we only need 2 registrations + 1 extra = 3 calls
        tournament = await create_tournament(client, organizer["token"], max_players=2)

        for i in range(2):
            p = await create_registered_player(client, f"PlayerG{i}")
            resp = await client.post(
                f"/api/tournaments/{tournament['id']}/register",
                headers=auth_headers(p["token"]),
            )
            assert resp.status_code == 200

        extra = await create_registered_player(client, "PlayerGExtra")
        resp = await client.post(
            f"/api/tournaments/{tournament['id']}/register",
            headers=auth_headers(extra["token"]),
        )
        assert resp.status_code == 400
        assert "full" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Bracket generation / start
# ---------------------------------------------------------------------------


class TestTournamentStart:
    async def test_only_creator_can_start(self, client):
        """Non-creator cannot start the tournament."""
        organizer = await create_registered_player(client, "OrgH")
        other = await create_registered_player(client, "OtherH")
        tournament = await create_tournament(client, organizer["token"])

        # Register enough players
        for i in range(2):
            p = await create_registered_player(client, f"PlayerH{i}")
            await client.post(
                f"/api/tournaments/{tournament['id']}/register",
                headers=auth_headers(p["token"]),
            )

        resp = await client.post(
            f"/api/tournaments/{tournament['id']}/start",
            headers=auth_headers(other["token"]),
        )
        assert resp.status_code == 403

    async def test_start_tournament_needs_players(self, client):
        """Starting a tournament with < 2 players returns 400."""
        organizer = await create_registered_player(client, "OrgI")
        tournament = await create_tournament(client, organizer["token"])

        resp = await client.post(
            f"/api/tournaments/{tournament['id']}/start",
            headers=auth_headers(organizer["token"]),
        )
        assert resp.status_code == 400

    async def test_start_tournament_4_players(self, client):
        """Starting with 4 players creates 3 matches (2 in round 1, 1 in round 2)."""
        organizer = await create_registered_player(client, "OrgJ")
        tournament = await create_tournament(client, organizer["token"], max_players=4)

        for i in range(4):
            p = await create_registered_player(client, f"PlayerJ{i}")
            await client.post(
                f"/api/tournaments/{tournament['id']}/register",
                headers=auth_headers(p["token"]),
            )

        resp = await client.post(
            f"/api/tournaments/{tournament['id']}/start",
            headers=auth_headers(organizer["token"]),
        )
        assert resp.status_code == 200
        bracket = resp.json()
        assert bracket["tournament"]["status"] == "in_progress"
        assert bracket["total_rounds"] == 2
        assert len(bracket["matches"]) == 3  # 2 + 1

    async def test_start_tournament_2_players(self, client):
        """Starting with 2 players creates 1 match in 1 round."""
        organizer = await create_registered_player(client, "OrgK")
        tournament = await create_tournament(client, organizer["token"], max_players=4)

        for i in range(2):
            p = await create_registered_player(client, f"PlayerK{i}")
            await client.post(
                f"/api/tournaments/{tournament['id']}/register",
                headers=auth_headers(p["token"]),
            )

        resp = await client.post(
            f"/api/tournaments/{tournament['id']}/start",
            headers=auth_headers(organizer["token"]),
        )
        assert resp.status_code == 200
        bracket = resp.json()
        assert bracket["tournament"]["status"] == "in_progress"
        assert bracket["total_rounds"] == 1
        assert len(bracket["matches"]) == 1

    async def test_start_tournament_3_players_has_bye(self, client):
        """3 players: bracket size=4, one BYE match auto-completes."""
        organizer = await create_registered_player(client, "OrgL")
        tournament = await create_tournament(client, organizer["token"], max_players=4)

        for i in range(3):
            p = await create_registered_player(client, f"PlayerL{i}")
            await client.post(
                f"/api/tournaments/{tournament['id']}/register",
                headers=auth_headers(p["token"]),
            )

        resp = await client.post(
            f"/api/tournaments/{tournament['id']}/start",
            headers=auth_headers(organizer["token"]),
        )
        assert resp.status_code == 200
        bracket = resp.json()
        # Should have a BYE match
        statuses = [m["status"] for m in bracket["matches"]]
        assert "bye" in statuses

    async def test_cannot_start_twice(self, client):
        """Starting an already-started tournament returns 400."""
        organizer = await create_registered_player(client, "OrgM")
        tournament = await create_tournament(client, organizer["token"])

        for i in range(2):
            p = await create_registered_player(client, f"PlayerM{i}")
            await client.post(
                f"/api/tournaments/{tournament['id']}/register",
                headers=auth_headers(p["token"]),
            )

        await client.post(
            f"/api/tournaments/{tournament['id']}/start",
            headers=auth_headers(organizer["token"]),
        )
        resp = await client.post(
            f"/api/tournaments/{tournament['id']}/start",
            headers=auth_headers(organizer["token"]),
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Get bracket
# ---------------------------------------------------------------------------


class TestTournamentBracket:
    async def test_get_bracket_not_found(self, client):
        """GET /api/tournaments/NOTEXIST returns 404."""
        resp = await client.get("/api/tournaments/NOTEXIST")
        assert resp.status_code == 404

    async def test_get_bracket_registering(self, client):
        """Can fetch bracket of a tournament still in registration phase."""
        organizer = await create_registered_player(client, "OrgN")
        tournament = await create_tournament(client, organizer["token"])

        resp = await client.get(f"/api/tournaments/{tournament['id']}")
        assert resp.status_code == 200
        bracket = resp.json()
        assert bracket["tournament"]["status"] == "registering"
        assert bracket["entries"] == []
        assert bracket["matches"] == []
        assert bracket["total_rounds"] == 0

    async def test_get_bracket_with_entries(self, client):
        """Bracket includes registered players."""
        organizer = await create_registered_player(client, "OrgO")
        player1 = await create_registered_player(client, "PlayerO1")
        tournament = await create_tournament(client, organizer["token"])

        await client.post(
            f"/api/tournaments/{tournament['id']}/register",
            headers=auth_headers(player1["token"]),
        )

        resp = await client.get(f"/api/tournaments/{tournament['id']}")
        assert resp.status_code == 200
        bracket = resp.json()
        assert len(bracket["entries"]) == 1
        assert bracket["entries"][0]["player_nickname"] == "PlayerO1"
