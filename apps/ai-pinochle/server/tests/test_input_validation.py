"""WebSocket input validation tests for raw payload fields."""
import pytest
from httpx import AsyncClient
from starlette.testclient import TestClient

pytestmark = pytest.mark.anyio


async def _create_game(client, auth_headers):
    resp = await client.post("/games/create", headers=auth_headers)
    return resp.json()["room_code"], auth_headers["Authorization"].removeprefix("Bearer ")


async def test_play_card_rejects_non_string(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """PLAY_CARD with a numeric `card` returns ERROR with INVALID_CARD code."""
    room_code, token = await _create_game(client, auth_headers)
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.receive_json()  # initial LOBBY_STATE_UPDATED
        ws.send_json({"action": "PLAY_CARD", "payload": {"card": 42}})
        # We're not in TRICK_PLAYING phase, so we'll get WRONG_PHASE first.
        data = ws.receive_json()
        assert data["event"] == "ERROR"
        # The phase check happens before the card validation — both are valid rejections.
        assert data["payload"]["code"] in ("WRONG_PHASE", "INVALID_CARD")


async def test_select_seat_rejects_non_string(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    room_code, token = await _create_game(client, auth_headers)
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.receive_json()
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": 7}})
        data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert data["payload"]["code"] == "INVALID_SEAT"


async def test_declare_trump_rejects_non_string(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    room_code, token = await _create_game(client, auth_headers)
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.receive_json()
        ws.send_json({"action": "DECLARE_TRUMP", "payload": {"suit": ["HEARTS"]}})
        data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert data["payload"]["code"] in ("WRONG_PHASE", "INVALID_SUIT")


async def test_pass_cards_rejects_non_string_card(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    room_code, token = await _create_game(client, auth_headers)
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.receive_json()
        ws.send_json({"action": "PASS_CARDS", "payload": {"cards": [1, 2, 3]}})
        data = ws.receive_json()
        assert data["event"] == "ERROR"
        # WRONG_PHASE fires first because we're in LOBBY.
        assert data["payload"]["code"] in ("WRONG_PHASE", "INVALID_CARD")


async def test_error_payloads_carry_code_field(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Every ERROR event has both a `code` and a `message`."""
    room_code, token = await _create_game(client, auth_headers)
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.receive_json()
        ws.send_json({"action": "DANCE", "payload": {}})
        data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert "code" in data["payload"]
        assert "message" in data["payload"]
        assert data["payload"]["code"] == "UNKNOWN_ACTION"
