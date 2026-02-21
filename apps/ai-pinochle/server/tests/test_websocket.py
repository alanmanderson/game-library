import pytest
from httpx import AsyncClient
from starlette.testclient import TestClient

from app.websocket.connection_manager import manager


pytestmark = pytest.mark.anyio


def _sync_client():
    from app.main import app
    return TestClient(app)


async def _create_game_and_get_token(client: AsyncClient, auth_headers: dict) -> tuple[str, str]:
    """Create a game and return (room_code, token)."""
    resp = await client.post("/games/create", headers=auth_headers)
    room_code = resp.json()["room_code"]
    token = auth_headers["Authorization"].removeprefix("Bearer ")
    return room_code, token


async def test_websocket_connect_and_select_seat(client: AsyncClient, auth_headers: dict):
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    sync_client = _sync_client()
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "NORTH"}})
        data = ws.receive_json()
        assert data["event"] == "LOBBY_STATE_UPDATED"
        assert data["payload"]["seats"]["NORTH"] == "testplayer"
        assert data["payload"]["seats"]["EAST"] is None
        assert data["payload"]["seats"]["SOUTH"] is None
        assert data["payload"]["seats"]["WEST"] is None


async def test_websocket_missing_token(client: AsyncClient, auth_headers: dict):
    room_code, _ = await _create_game_and_get_token(client, auth_headers)

    sync_client = _sync_client()
    with pytest.raises(Exception):
        with sync_client.websocket_connect(f"/ws/{room_code}") as ws:
            ws.receive_json()


async def test_websocket_invalid_token(client: AsyncClient, auth_headers: dict):
    room_code, _ = await _create_game_and_get_token(client, auth_headers)

    sync_client = _sync_client()
    with pytest.raises(Exception):
        with sync_client.websocket_connect(f"/ws/{room_code}?token=bad.token.here") as ws:
            ws.receive_json()


async def test_websocket_invalid_seat(client: AsyncClient, auth_headers: dict):
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    sync_client = _sync_client()
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "CENTER"}})
        data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert "Invalid seat" in data["payload"]["message"]


async def test_websocket_unknown_action(client: AsyncClient, auth_headers: dict):
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    sync_client = _sync_client()
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "DANCE", "payload": {}})
        data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert "Unknown action" in data["payload"]["message"]


async def test_websocket_seat_already_taken(client: AsyncClient, auth_headers: dict):
    """Register two users, have user1 take NORTH, then user2 tries NORTH."""
    room_code, token1 = await _create_game_and_get_token(client, auth_headers)

    # Register a second user
    resp2 = await client.post(
        "/auth/register",
        json={"username": "player2", "password": "securepass456"},
    )
    token2 = resp2.json()["access_token"]

    sync_client = _sync_client()

    # User 1 takes NORTH
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token1}") as ws1:
        ws1.send_json({"action": "SELECT_SEAT", "payload": {"seat": "NORTH"}})
        data = ws1.receive_json()
        assert data["event"] == "LOBBY_STATE_UPDATED"

    # User 2 tries NORTH — should fail
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token2}") as ws2:
        ws2.send_json({"action": "SELECT_SEAT", "payload": {"seat": "NORTH"}})
        data = ws2.receive_json()
        assert data["event"] == "SEAT_CLAIM_FAILED"
        assert data["payload"]["requested_seat"] == "NORTH"


async def test_websocket_switch_seat(client: AsyncClient, auth_headers: dict):
    """User selects NORTH then switches to SOUTH — old seat freed."""
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    sync_client = _sync_client()
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "NORTH"}})
        data = ws.receive_json()
        assert data["payload"]["seats"]["NORTH"] == "testplayer"

        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "SOUTH"}})
        data = ws.receive_json()
        assert data["payload"]["seats"]["SOUTH"] == "testplayer"
        assert data["payload"]["seats"]["NORTH"] is None


async def test_websocket_reselect_same_seat(client: AsyncClient, auth_headers: dict):
    """Selecting the same seat again is a no-op success."""
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    sync_client = _sync_client()
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "EAST"}})
        data = ws.receive_json()
        assert data["event"] == "LOBBY_STATE_UPDATED"
        assert data["payload"]["seats"]["EAST"] == "testplayer"

        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "EAST"}})
        data = ws.receive_json()
        assert data["event"] == "LOBBY_STATE_UPDATED"
        assert data["payload"]["seats"]["EAST"] == "testplayer"
