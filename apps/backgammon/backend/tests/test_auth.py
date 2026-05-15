"""Authentication endpoint tests for the backgammon backend.

Tests registration, login, guest creation, JWT validation, Google auth (mocked),
protected endpoint access, and guest stats restriction.
"""

import pytest
from unittest.mock import AsyncMock, patch

from tests.conftest import auth_headers, create_test_player


# -----------------------------------------------------------------------
# Registration
# -----------------------------------------------------------------------


class TestRegistration:
    @pytest.mark.asyncio
    async def test_register_success(self, client):
        """POST /api/auth/register creates an account and returns JWT + player."""
        resp = await client.post(
            "/api/auth/register",
            json={"email": "alice@example.com", "password": "Secret123!", "nickname": "Alice"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["player"]["nickname"] == "Alice"
        assert data["player"]["is_guest"] is False
        assert data["player"]["auth_provider"] == "local"

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client):
        """Registering with the same email twice returns 409."""
        await client.post(
            "/api/auth/register",
            json={"email": "dup@example.com", "password": "Secret123!", "nickname": "First"},
        )
        resp = await client.post(
            "/api/auth/register",
            json={"email": "dup@example.com", "password": "Other456!", "nickname": "Second"},
        )
        assert resp.status_code == 409
        assert "already registered" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_register_weak_password(self, client):
        """A password that fails complexity requirements is rejected (422)."""
        resp = await client.post(
            "/api/auth/register",
            json={"email": "weak@example.com", "password": "abc", "nickname": "Weak"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_register_short_nickname(self, client):
        """A nickname shorter than 2 characters is rejected (422)."""
        resp = await client.post(
            "/api/auth/register",
            json={"email": "short@example.com", "password": "Secret123!", "nickname": "X"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_register_missing_fields(self, client):
        """Omitting required fields returns 422."""
        resp = await client.post("/api/auth/register", json={})
        assert resp.status_code == 422


# -----------------------------------------------------------------------
# Login
# -----------------------------------------------------------------------


class TestLogin:
    @pytest.mark.asyncio
    async def test_login_success(self, client):
        """Login with correct credentials returns JWT + player."""
        # First register
        await client.post(
            "/api/auth/register",
            json={"email": "bob@example.com", "password": "Password1!", "nickname": "Bob"},
        )
        # Then login
        resp = await client.post(
            "/api/auth/login",
            json={"email": "bob@example.com", "password": "Password1!"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["player"]["nickname"] == "Bob"

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client):
        """Login with wrong password returns 401."""
        await client.post(
            "/api/auth/register",
            json={"email": "wrong@example.com", "password": "Correct1!", "nickname": "WrongPW"},
        )
        resp = await client.post(
            "/api/auth/login",
            json={"email": "wrong@example.com", "password": "incorrect"},
        )
        assert resp.status_code == 401
        assert "invalid" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_login_nonexistent_email(self, client):
        """Login with an email that doesn't exist returns 401."""
        resp = await client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "whatever"},
        )
        assert resp.status_code == 401
        assert "invalid" in resp.json()["detail"].lower()


# -----------------------------------------------------------------------
# Guest
# -----------------------------------------------------------------------


class TestGuest:
    @pytest.mark.asyncio
    async def test_create_guest(self, client):
        """POST /api/auth/guest creates a guest player with JWT."""
        resp = await client.post(
            "/api/auth/guest",
            json={"nickname": "GuestBob"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["player"]["nickname"] == "GuestBob"
        assert data["player"]["is_guest"] is True
        assert data["player"]["auth_provider"] == "guest"

    @pytest.mark.asyncio
    async def test_guest_empty_nickname(self, client):
        """An empty guest nickname is rejected (422 due to min_length=1)."""
        resp = await client.post(
            "/api/auth/guest",
            json={"nickname": ""},
        )
        assert resp.status_code == 422


# -----------------------------------------------------------------------
# JWT Token Validation
# -----------------------------------------------------------------------


class TestTokenValidation:
    @pytest.mark.asyncio
    async def test_me_endpoint_with_valid_token(self, client):
        """GET /api/auth/me with a valid token returns the player."""
        reg = await client.post(
            "/api/auth/register",
            json={"email": "me@example.com", "password": "Secret123!", "nickname": "MeUser"},
        )
        token = reg.json()["token"]

        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["nickname"] == "MeUser"

    @pytest.mark.asyncio
    async def test_me_endpoint_without_token(self, client):
        """GET /api/auth/me without a token returns 401."""
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_me_endpoint_with_invalid_token(self, client):
        """GET /api/auth/me with a bad token returns 401."""
        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalidtoken123"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_guest_can_use_me_endpoint(self, client):
        """Guest JWT works for the /me endpoint."""
        guest_resp = await client.post(
            "/api/auth/guest",
            json={"nickname": "GuestMe"},
        )
        token = guest_resp.json()["token"]

        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["nickname"] == "GuestMe"
        assert resp.json()["is_guest"] is True


# -----------------------------------------------------------------------
# Google Auth (mocked)
# -----------------------------------------------------------------------


class TestGoogleAuth:
    @pytest.mark.asyncio
    async def test_google_auth_not_configured(self, client):
        """Google auth returns 401 when GOOGLE_CLIENT_ID is not set."""
        resp = await client.post(
            "/api/auth/google",
            json={"id_token": "some-google-token"},
        )
        assert resp.status_code == 401
        assert "not configured" in resp.json()["detail"].lower() or "invalid" in resp.json()["detail"].lower()

    @patch("app.api.auth_routes.verify_google_token")
    @pytest.mark.asyncio
    async def test_google_auth_success(self, mock_verify, client):
        """Google auth creates a user when the token is valid."""
        mock_verify.return_value = {
            "sub": "google-user-123",
            "email": "google@example.com",
            "name": "Google User",
        }

        resp = await client.post(
            "/api/auth/google",
            json={"id_token": "valid-google-token"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["player"]["nickname"] == "Google User"
        assert data["player"]["auth_provider"] == "google"
        assert data["player"]["is_guest"] is False

    @patch("app.api.auth_routes.verify_google_token")
    @pytest.mark.asyncio
    async def test_google_auth_existing_user(self, mock_verify, client):
        """Logging in again with the same Google account returns the same player."""
        mock_verify.return_value = {
            "sub": "google-repeat-456",
            "email": "repeat@google.com",
            "name": "Repeat User",
        }

        resp1 = await client.post(
            "/api/auth/google",
            json={"id_token": "google-token-1"},
        )
        resp2 = await client.post(
            "/api/auth/google",
            json={"id_token": "google-token-2"},
        )

        assert resp1.status_code == 200
        assert resp2.status_code == 200
        assert resp1.json()["player"]["id"] == resp2.json()["player"]["id"]

    @patch("app.api.auth_routes.verify_google_token")
    @pytest.mark.asyncio
    async def test_google_auth_invalid_token(self, mock_verify, client):
        """Google auth returns 401 when the token is invalid."""
        mock_verify.return_value = None

        resp = await client.post(
            "/api/auth/google",
            json={"id_token": "bad-token"},
        )
        assert resp.status_code == 401


# -----------------------------------------------------------------------
# Protected endpoint access
# -----------------------------------------------------------------------


class TestProtectedEndpoints:
    @pytest.mark.asyncio
    async def test_registered_player_can_create_table(self, client):
        """A registered player can create a table via the normal API."""
        reg = await client.post(
            "/api/auth/register",
            json={"email": "table@example.com", "password": "Secret123!", "nickname": "TableMaker"},
        )
        token = reg.json()["token"]
        player_id = reg.json()["player"]["id"]

        resp = await client.post(
            "/api/tables",
            json={"player_id": player_id},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "waiting"

    @pytest.mark.asyncio
    async def test_guest_can_create_table(self, client):
        """A guest player can also create a table."""
        guest = await client.post(
            "/api/auth/guest",
            json={"nickname": "GuestTableMaker"},
        )
        token = guest.json()["token"]
        player_id = guest.json()["player"]["id"]

        resp = await client.post(
            "/api/tables",
            json={"player_id": player_id},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "waiting"

    @pytest.mark.asyncio
    async def test_unauthenticated_cannot_create_table(self, client):
        """Creating a table without auth returns 401."""
        resp = await client.post("/api/tables", json={"player_id": "some-id"})
        assert resp.status_code == 401


# -----------------------------------------------------------------------
# Stats restriction for guests
# -----------------------------------------------------------------------


class TestGuestStatsRestriction:
    @pytest.mark.asyncio
    async def test_guest_stats_forbidden(self, client):
        """Guest players get 403 when requesting stats."""
        guest = await client.post(
            "/api/auth/guest",
            json={"nickname": "GuestNoStats"},
        )
        token = guest.json()["token"]
        player_id = guest.json()["player"]["id"]

        resp = await client.get(
            f"/api/players/{player_id}/stats",
            headers=auth_headers(token),
        )
        assert resp.status_code == 403
        assert "guest" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_registered_stats_ok(self, client):
        """Registered players can access their stats."""
        reg = await client.post(
            "/api/auth/register",
            json={"email": "stats@example.com", "password": "Secret123!", "nickname": "StatsUser"},
        )
        token = reg.json()["token"]
        player_id = reg.json()["player"]["id"]

        resp = await client.get(
            f"/api/players/{player_id}/stats",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_games"] == 0


# -----------------------------------------------------------------------
# Logout
# -----------------------------------------------------------------------


class TestLogout:
    @pytest.mark.asyncio
    async def test_logout_success(self, client):
        """POST /api/auth/logout with a valid token returns 200."""
        reg = await client.post(
            "/api/auth/register",
            json={"email": "logout@example.com", "password": "Secret123!", "nickname": "LogoutUser"},
        )
        token = reg.json()["token"]

        resp = await client.post(
            "/api/auth/logout",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["message"] == "Logged out successfully"

    @pytest.mark.asyncio
    async def test_logout_without_token_returns_401(self, client):
        """POST /api/auth/logout without a token returns 401."""
        resp = await client.post("/api/auth/logout")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_logout_with_invalid_token_returns_401(self, client):
        """POST /api/auth/logout with a bad token returns 401."""
        resp = await client.post(
            "/api/auth/logout",
            headers={"Authorization": "Bearer notavalidtoken"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_guest_can_logout(self, client):
        """Guest players can also call the logout endpoint."""
        guest = await client.post(
            "/api/auth/guest",
            json={"nickname": "GuestLogout"},
        )
        token = guest.json()["token"]

        resp = await client.post(
            "/api/auth/logout",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["message"] == "Logged out successfully"
