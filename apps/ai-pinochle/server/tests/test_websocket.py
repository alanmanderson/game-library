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


async def _register_user(client: AsyncClient, username: str) -> str:
    """Register a user and return their token."""
    resp = await client.post(
        "/auth/register",
        json={"username": username, "password": "securepass123"},
    )
    return resp.json()["access_token"]


async def _fill_seats_and_get_tokens(
    client: AsyncClient, auth_headers: dict
) -> tuple[str, list[str]]:
    """Create a game, register 4 users, seat them all, return (room_code, [token1..4])."""
    room_code, token1 = await _create_game_and_get_token(client, auth_headers)
    tokens = [token1]
    seats = ["NORTH", "EAST", "SOUTH", "WEST"]

    for i in range(3):
        tokens.append(await _register_user(client, f"player{i + 2}"))

    sync_client = _sync_client()
    for token, seat in zip(tokens, seats):
        with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
            ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": seat}})
            ws.receive_json()  # LOBBY_STATE_UPDATED

    return room_code, tokens


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


async def test_start_game_success(client: AsyncClient, auth_headers: dict):
    """Fill all 4 seats, START_GAME → receive HAND_DEALT then BIDDING_TURN."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, auth_headers)

    sync_client = _sync_client()
    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.send_json({"action": "START_GAME", "payload": {}})
        hand_dealt = ws.receive_json()
        assert hand_dealt["event"] == "HAND_DEALT"
        assert len(hand_dealt["payload"]["cards"]) == 12

        bidding_turn = ws.receive_json()
        assert bidding_turn["event"] == "BIDDING_TURN"
        assert bidding_turn["payload"]["minimum_valid_bid"] == 20
        assert bidding_turn["payload"]["current_highest_bid"] is None
        assert bidding_turn["payload"]["next_to_act_seat"] in [
            "NORTH", "EAST", "SOUTH", "WEST"
        ]


async def test_start_game_seats_not_full(client: AsyncClient, auth_headers: dict):
    """Only 1 seat filled → ERROR."""
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    sync_client = _sync_client()
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "NORTH"}})
        ws.receive_json()  # LOBBY_STATE_UPDATED

        ws.send_json({"action": "START_GAME", "payload": {}})
        data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert "seats must be occupied" in data["payload"]["message"].lower()


async def test_start_game_wrong_phase(client: AsyncClient, auth_headers: dict):
    """Game not in LOBBY_WAITING phase → ERROR."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, auth_headers)

    sync_client = _sync_client()
    # Start the game first
    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.send_json({"action": "START_GAME", "payload": {}})
        ws.receive_json()  # HAND_DEALT
        ws.receive_json()  # BIDDING_TURN

    # Try to start again — phase is now BIDDING
    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.send_json({"action": "START_GAME", "payload": {}})
        data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert "lobby" in data["payload"]["message"].lower()


async def test_start_game_unique_hands(client: AsyncClient, auth_headers: dict):
    """All 4 players get different cards, 48 total."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, auth_headers)

    sync_client = _sync_client()
    all_cards = []
    contexts = []
    websockets = []
    for token in tokens:
        ctx = sync_client.websocket_connect(f"/ws/{room_code}?token={token}")
        ws = ctx.__enter__()
        contexts.append(ctx)
        websockets.append(ws)

    try:
        websockets[0].send_json({"action": "START_GAME", "payload": {}})

        for ws in websockets:
            data = ws.receive_json()
            assert data["event"] == "HAND_DEALT"
            cards = data["payload"]["cards"]
            assert len(cards) == 12
            all_cards.extend(cards)

        assert len(all_cards) == 48
        from collections import Counter
        counts = Counter(all_cards)
        for card, count in counts.items():
            assert count == 2, f"{card} appears {count} times, expected 2"
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)
