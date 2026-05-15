"""Tests for WebSocket JWT re-validation on long-lived connections.

Covers issue #33: a WS that stays open past its token's expiry must be closed
by the server at the next revalidation tick, so revoked/expired tokens can't
outlive their grant.

These tests drive the revalidation interval down to ~1s via a monkeypatch
on `settings.ws_jwt_revalidate_seconds`, craft tokens with short/expired
`exp` claims, and assert the socket closes on the server's schedule.
"""
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from httpx import AsyncClient
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.config import settings

pytestmark = pytest.mark.anyio


async def _create_game(client: AsyncClient, auth_headers: dict) -> str:
    resp = await client.post("/games/create", headers=auth_headers)
    return resp.json()["room_code"]


async def _register_and_get(client: AsyncClient, email: str) -> tuple[str, str]:
    """Register a user and return (user_id, access_token)."""
    resp = await client.post(
        "/auth/register",
        json={
            "first_name": "Test",
            "last_name": "User",
            "email": email,
            "password": "securepass123",
        },
    )
    body = resp.json()
    return body["id"], body["access_token"]


def _token_for(user_id: str, expires_in_seconds: float) -> str:
    """Forge a JWT signed with the test secret with a custom expiry."""
    expire = datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.secret_key,
        algorithm="HS256",
    )


async def test_valid_token_stays_connected_across_revalidation(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict, monkeypatch
):
    """A non-expired token survives multiple revalidation ticks."""
    monkeypatch.setattr(settings, "ws_jwt_revalidate_seconds", 1)
    room_code = await _create_game(client, auth_headers)
    token = auth_headers["Authorization"].removeprefix("Bearer ")

    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        first = ws.receive_json()
        assert first["event"] == "LOBBY_STATE_UPDATED"

        import time
        time.sleep(2.2)

        ws.send_json({"action": "PING", "payload": {}})
        pong = ws.receive_json()
        assert pong["event"] == "PONG"


async def test_expired_token_disconnects_at_next_revalidation(
    client: AsyncClient, sync_client: TestClient, monkeypatch
):
    """A token that expires after connect is closed at the next tick."""
    monkeypatch.setattr(settings, "ws_jwt_revalidate_seconds", 1)

    user_id, access_token = await _register_and_get(client, "shortlived@test.com")
    create_resp = await client.post(
        "/games/create",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    room_code = create_resp.json()["room_code"]

    short_token = _token_for(user_id, expires_in_seconds=2)

    with sync_client.websocket_connect(f"/ws/{room_code}?token={short_token}") as ws:
        assert ws.receive_json()["event"] == "LOBBY_STATE_UPDATED"

        got_reauth = False
        with pytest.raises(WebSocketDisconnect) as exc_info:
            for _ in range(6):
                frame = ws.receive_json()
                if frame.get("event") == "REAUTH_REQUIRED":
                    got_reauth = True
                    assert frame["payload"]["reason"] == "token_expired"

        assert got_reauth, "Server should emit REAUTH_REQUIRED before closing"
        assert exc_info.value.code == 4401


async def test_tampered_token_disconnects_at_next_revalidation(
    client: AsyncClient, sync_client: TestClient, monkeypatch
):
    """A token whose signature no longer verifies (revoked / tampered) is closed.

    We simulate "revocation" by rotating the server's signing key after
    connect; any subsequent decode must fail, so the next revalidation tick
    must close the socket.
    """
    monkeypatch.setattr(settings, "ws_jwt_revalidate_seconds", 1)
    user_id, access_token = await _register_and_get(client, "rotated@test.com")
    create_resp = await client.post(
        "/games/create",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    room_code = create_resp.json()["room_code"]

    with sync_client.websocket_connect(
        f"/ws/{room_code}?token={access_token}"
    ) as ws:
        assert ws.receive_json()["event"] == "LOBBY_STATE_UPDATED"

        monkeypatch.setattr(settings, "secret_key", "rotated-key-" + uuid.uuid4().hex)

        got_reauth = False
        with pytest.raises(WebSocketDisconnect) as exc_info:
            for _ in range(6):
                frame = ws.receive_json()
                if frame.get("event") == "REAUTH_REQUIRED":
                    got_reauth = True

        assert got_reauth
        assert exc_info.value.code == 4401
