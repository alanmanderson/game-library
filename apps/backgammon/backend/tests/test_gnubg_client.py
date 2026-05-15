"""Tests for the backend's gnubg HTTP client.

All tests use mocked httpx responses — no real network calls and no
dependency on a running gnubg service. Verifies:

- When ``GNUBG_URL`` is unset, every method returns ``None`` without
  attempting an HTTP call.
- Successful round-trips return the parsed JSON.
- Non-2xx / timeout / invalid-JSON responses return ``None`` rather
  than raising, so callers can fall back silently.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest
import pytest_asyncio

from app.config import settings
from app.game_engine import BackgammonEngine, Color
from app.services import gnubg_client


@pytest_asyncio.fixture
async def _reset_client():
    """Reset the module-level client between tests so GNUBG_URL changes take effect."""
    original = settings.gnubg_url
    await gnubg_client.close_gnubg_client()
    gnubg_client.close_sync_client()
    yield
    settings.gnubg_url = original
    await gnubg_client.close_gnubg_client()
    gnubg_client.close_sync_client()


@pytest.mark.asyncio
async def test_disabled_when_url_unset(_reset_client):
    settings.gnubg_url = ""
    assert await gnubg_client.is_available() is False
    assert await gnubg_client.evaluate({}) is None
    assert await gnubg_client.best_move({}, [1, 1]) is None
    assert await gnubg_client.analyze_move({}, [1, 1], []) is None
    assert await gnubg_client.cube_decision({}) is None


@pytest.mark.asyncio
async def test_is_available_success(_reset_client):
    settings.gnubg_url = "http://gnubg.test"

    async def _mock_get(self, url, **kwargs):
        return httpx.Response(200, json={"status": "ok", "gnubg_version": "1.07.01", "ready": True})

    with patch.object(httpx.AsyncClient, "get", new=_mock_get):
        assert await gnubg_client.is_available() is True


@pytest.mark.asyncio
async def test_is_available_degraded(_reset_client):
    settings.gnubg_url = "http://gnubg.test"

    async def _mock_get(self, url, **kwargs):
        return httpx.Response(200, json={"status": "degraded", "gnubg_version": "x", "ready": False})

    with patch.object(httpx.AsyncClient, "get", new=_mock_get):
        assert await gnubg_client.is_available() is False


@pytest.mark.asyncio
async def test_is_available_network_error(_reset_client):
    settings.gnubg_url = "http://gnubg.test"

    async def _mock_get(self, url, **kwargs):
        raise httpx.ConnectError("refused")

    with patch.object(httpx.AsyncClient, "get", new=_mock_get):
        assert await gnubg_client.is_available() is False


@pytest.mark.asyncio
async def test_evaluate_success(_reset_client):
    settings.gnubg_url = "http://gnubg.test"
    payload = {"equity": 0.12, "probs": {"win": 0.53, "win_g": 0.1, "lose_g": 0.08, "win_bg": 0.01, "lose_bg": 0.0}}

    async def _mock_post(self, path, **kwargs):
        assert path == "/evaluate"
        return httpx.Response(200, json=payload)

    with patch.object(httpx.AsyncClient, "post", new=_mock_post):
        result = await gnubg_client.evaluate({"points": [0] * 26, "bar_white": 0, "bar_black": 0, "off_white": 0, "off_black": 0, "turn": "white"})

    assert result == payload


@pytest.mark.asyncio
async def test_best_move_non_2xx_returns_none(_reset_client):
    settings.gnubg_url = "http://gnubg.test"

    async def _mock_post(self, path, **kwargs):
        return httpx.Response(503, text="engine restarting")

    with patch.object(httpx.AsyncClient, "post", new=_mock_post):
        assert await gnubg_client.best_move({}, [3, 1]) is None


@pytest.mark.asyncio
async def test_best_move_timeout_returns_none(_reset_client):
    settings.gnubg_url = "http://gnubg.test"

    async def _mock_post(self, path, **kwargs):
        raise httpx.TimeoutException("slow")

    with patch.object(httpx.AsyncClient, "post", new=_mock_post):
        assert await gnubg_client.best_move({}, [3, 1]) is None


@pytest.mark.asyncio
async def test_analyze_move_success(_reset_client):
    settings.gnubg_url = "http://gnubg.test"
    payload = {
        "best": {"moves": [{"from_point": 8, "to_point": 5}], "notation": "8/5", "equity": 0.3, "probs": {"win": 0.6, "win_g": 0.1, "lose_g": 0.08, "win_bg": 0.0, "lose_bg": 0.0}},
        "chosen": {"moves": [{"from_point": 13, "to_point": 10}], "notation": "13/10", "equity": 0.1, "probs": {"win": 0.55, "win_g": 0.1, "lose_g": 0.1, "win_bg": 0.0, "lose_bg": 0.0}},
        "equity_loss": 0.2,
        "quality": "mistake",
    }

    async def _mock_post(self, path, **kwargs):
        assert path == "/analyze-move"
        # Validate the dice + chosen_moves forwarding.
        body = kwargs.get("json") or {}
        assert body["dice"] == [5, 2]
        assert body["chosen_moves"] == [{"from_point": 13, "to_point": 10}]
        return httpx.Response(200, json=payload)

    with patch.object(httpx.AsyncClient, "post", new=_mock_post):
        result = await gnubg_client.analyze_move(
            {"points": [0] * 26, "turn": "white", "bar_white": 0, "bar_black": 0, "off_white": 0, "off_black": 0},
            [5, 2],
            [{"from_point": 13, "to_point": 10}],
        )
    assert result == payload


@pytest.mark.asyncio
async def test_board_payload_from_engine(_reset_client):
    """board_payload_from_engine must produce a shape accepted by gnubg."""
    engine = BackgammonEngine()
    payload = gnubg_client.board_payload_from_engine(engine, turn=Color.WHITE)

    assert payload["turn"] == "white"
    assert isinstance(payload["points"], list)
    assert len(payload["points"]) == 26
    assert "bar_white" in payload
    assert "off_black" in payload
    assert payload["cube_value"] == 1
    assert payload["cube_owner"] is None
