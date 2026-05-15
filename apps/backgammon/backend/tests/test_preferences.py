"""Tests for the cosmetic preferences endpoint.

Covers:
  - Successful board_theme update
  - Successful checker_style update
  - Unknown IDs rejected with 400
  - Partial updates leave the other field untouched
  - Unauthenticated requests rejected with 401
  - Preferences round-trip through /api/auth/me
"""

import pytest

from tests.conftest import auth_headers, create_test_player


class TestUpdatePreferences:
    @pytest.mark.asyncio
    async def test_update_board_theme(self, client):
        auth = await create_test_player(client, "Alice")
        resp = await client.patch(
            "/api/players/me/preferences",
            json={"board_theme": "dark-marble"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["board_theme"] == "dark-marble"
        # checker_style untouched — still the default
        assert data["checker_style"] == "classic"

    @pytest.mark.asyncio
    async def test_update_checker_style(self, client):
        auth = await create_test_player(client, "Bob")
        resp = await client.patch(
            "/api/players/me/preferences",
            json={"checker_style": "marble"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["checker_style"] == "marble"
        assert data["board_theme"] == "classic"

    @pytest.mark.asyncio
    async def test_update_both_fields(self, client):
        auth = await create_test_player(client, "Carol")
        resp = await client.patch(
            "/api/players/me/preferences",
            json={"board_theme": "green-felt", "checker_style": "metal"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["board_theme"] == "green-felt"
        assert data["checker_style"] == "metal"

    @pytest.mark.asyncio
    async def test_reject_unknown_board_theme(self, client):
        auth = await create_test_player(client, "Dave")
        resp = await client.patch(
            "/api/players/me/preferences",
            json={"board_theme": "bogus-theme"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_reject_unknown_checker_style(self, client):
        auth = await create_test_player(client, "Eve")
        resp = await client.patch(
            "/api/players/me/preferences",
            json={"checker_style": "plastic"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_requires_auth(self, client):
        resp = await client.patch(
            "/api/players/me/preferences",
            json={"board_theme": "classic"},
        )
        # Missing Authorization header -> 401/403
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_preferences_visible_on_me(self, client):
        """After updating, GET /api/auth/me reflects the new preferences."""
        auth = await create_test_player(client, "Frank")
        await client.patch(
            "/api/players/me/preferences",
            json={"board_theme": "dark-marble", "checker_style": "marble"},
            headers=auth_headers(auth["token"]),
        )
        resp = await client.get(
            "/api/auth/me",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["board_theme"] == "dark-marble"
        assert data["checker_style"] == "marble"

    @pytest.mark.asyncio
    async def test_default_values_on_new_player(self, client):
        """A freshly created player starts with classic / classic defaults."""
        auth = await create_test_player(client, "Grace")
        assert auth["player"]["board_theme"] == "classic"
        assert auth["player"]["checker_style"] == "classic"
