"""Test that create-vs-ai + WebSocket connect auto-starts correctly,
and that a manual START_GAME also works for bot games.
"""
import pytest
from httpx import AsyncClient
from starlette.testclient import TestClient

pytestmark = pytest.mark.anyio


async def _create_vs_ai(client: AsyncClient, auth_headers: dict) -> tuple[str, str]:
    """Create a vs-AI game and return (room_code, token)."""
    resp = await client.post(
        "/games/create-vs-ai",
        json={"hints_enabled": True},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    room_code = resp.json()["room_code"]
    token = auth_headers["Authorization"].removeprefix("Bearer ")
    return room_code, token


async def test_vs_ai_auto_start_on_connect(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """When a human connects to a vs-AI game (all seats pre-filled),
    the server should auto-start and send HAND_DEALT + BIDDING_TURN."""
    room_code, token = await _create_vs_ai(client, auth_headers)

    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        events = []
        for _ in range(5):
            data = ws.receive_json()
            events.append(data)
            if data["event"] == "BIDDING_TURN":
                break

        event_types = [e["event"] for e in events]
        print(f"Events received: {event_types}")
        assert "LOBBY_STATE_UPDATED" in event_types
        assert "HAND_DEALT" in event_types, (
            f"Expected HAND_DEALT from auto-start, got: {event_types}"
        )
        assert "BIDDING_TURN" in event_types


async def test_vs_ai_manual_start_game(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """Even if auto-start fires, manually sending START_GAME should NOT crash
    the connection — it should return an error or succeed gracefully."""
    room_code, token = await _create_vs_ai(client, auth_headers)

    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        # Drain all auto-start events
        events = []
        for _ in range(5):
            data = ws.receive_json()
            events.append(data)
            if data["event"] == "BIDDING_TURN":
                break

        # Now try START_GAME manually — game is already in BIDDING
        ws.send_json({"action": "START_GAME", "payload": {}})
        data = ws.receive_json()
        # Should get a WRONG_PHASE error, NOT a disconnect
        assert data["event"] == "ERROR"
        assert "lobby" in data["payload"]["message"].lower()


async def _create_game_and_fill_bots(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
) -> tuple[str, str]:
    """Create a regular game, sit the user, fill with bots."""
    token = auth_headers["Authorization"].removeprefix("Bearer ")

    # Create game
    resp = await client.post("/games/create", headers=auth_headers)
    assert resp.status_code == 201
    room_code = resp.json()["room_code"]

    # Connect, sit, fill with bots
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED (initial)

        # Sit in SOUTH
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "SOUTH"}})
        ws.receive_json()  # LOBBY_STATE_UPDATED

        # Fill remaining seats with bots
        ws.send_json({"action": "FILL_AI", "payload": {}})
        data = ws.receive_json()
        assert data["event"] == "LOBBY_STATE_UPDATED"
        # Verify all seats filled
        seats = data["payload"]["seats"]
        for seat_name in ["NORTH", "EAST", "SOUTH", "WEST"]:
            assert seats[seat_name] is not None, f"Seat {seat_name} is empty"

    return room_code, token


async def test_create_room_fill_bots_start_game(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """Create Room → Sit → Fill AI → reconnect → START_GAME should work.

    This is the flow where auto-start fires on reconnect because all
    conditions are met (bot_seats is set, all seats filled).
    """
    room_code, token = await _create_game_and_fill_bots(
        client, sync_client, auth_headers
    )

    # Reconnect — auto-start fires because conditions are now met
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        events = []
        for _ in range(5):
            data = ws.receive_json()
            events.append(data)
            if data["event"] == "BIDDING_TURN":
                break

        event_types = [e["event"] for e in events]
        print(f"Events on reconnect: {event_types}")
        assert "HAND_DEALT" in event_types


async def test_fill_ai_auto_starts_game(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """Create Room → Sit → Fill AI should auto-start the game immediately.

    After FILL_AI fills all seats, the server auto-starts the game so the
    user never needs to click "Start Game" for bot games. This prevents
    stale-connection issues where the user clicks Start Game but the
    WebSocket has silently disconnected.
    """
    token = auth_headers["Authorization"].removeprefix("Bearer ")

    resp = await client.post("/games/create", headers=auth_headers)
    assert resp.status_code == 201
    room_code = resp.json()["room_code"]

    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED (initial)

        # Sit in SOUTH
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "SOUTH"}})
        ws.receive_json()  # LOBBY_STATE_UPDATED

        # Fill remaining seats with bots — game should auto-start
        ws.send_json({"action": "FILL_AI", "payload": {}})

        events = []
        for _ in range(5):
            data = ws.receive_json()
            events.append(data)
            if data["event"] == "BIDDING_TURN":
                break

        event_types = [e["event"] for e in events]
        print(f"Events after FILL_AI: {event_types}")

        # FILL_AI should send LOBBY_STATE_UPDATED, then auto-start
        # sends HAND_DEALT + BIDDING_TURN
        assert "LOBBY_STATE_UPDATED" in event_types
        assert "HAND_DEALT" in event_types, (
            f"Expected auto-start HAND_DEALT after FILL_AI, got: {event_types}"
        )
        assert "BIDDING_TURN" in event_types
