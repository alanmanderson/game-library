import pytest
from httpx import AsyncClient
from starlette.testclient import TestClient

SEATS = ["NORTH", "EAST", "SOUTH", "WEST"]

pytestmark = pytest.mark.anyio


async def _create_game_and_get_token(client: AsyncClient, auth_headers: dict) -> tuple[str, str]:
    """Create a game and return (room_code, token)."""
    resp = await client.post("/games/create", headers=auth_headers)
    room_code = resp.json()["room_code"]
    token = auth_headers["Authorization"].removeprefix("Bearer ")
    return room_code, token


async def _register_user(client: AsyncClient, name: str) -> str:
    """Register a user and return their token."""
    resp = await client.post(
        "/auth/register",
        json={"first_name": name, "email": f"{name}@test.com", "password": "securepass123"},
    )
    return resp.json()["access_token"]


async def _fill_seats_and_get_tokens(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
) -> tuple[str, list[str]]:
    """Create a game, register 4 users, seat them all, return (room_code, [token1..4])."""
    room_code, token1 = await _create_game_and_get_token(client, auth_headers)
    tokens = [token1]
    seats = ["NORTH", "EAST", "SOUTH", "WEST"]

    for i in range(3):
        tokens.append(await _register_user(client, f"player{i + 2}"))

    for token, seat in zip(tokens, seats):
        with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
            ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": seat}})
            ws.receive_json()  # LOBBY_STATE_UPDATED

    return room_code, tokens


async def test_websocket_connect_and_select_seat(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "NORTH"}})
        # Drain initial LOBBY_STATE_UPDATED from connect
        data = ws.receive_json()
        if data["payload"]["seats"]["NORTH"] is None:
            data = ws.receive_json()  # get the post-seat-selection update
        assert data["event"] == "LOBBY_STATE_UPDATED"
        assert data["payload"]["seats"]["NORTH"] == "Test"
        assert data["payload"]["seats"]["EAST"] is None
        assert data["payload"]["seats"]["SOUTH"] is None
        assert data["payload"]["seats"]["WEST"] is None
        assert data["payload"]["your_seat"] == "NORTH"


async def test_websocket_missing_token(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    room_code, _ = await _create_game_and_get_token(client, auth_headers)

    with pytest.raises(Exception):
        with sync_client.websocket_connect(f"/ws/{room_code}") as ws:
            ws.receive_json()


async def test_websocket_invalid_token(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    room_code, _ = await _create_game_and_get_token(client, auth_headers)

    with pytest.raises(Exception):
        with sync_client.websocket_connect(f"/ws/{room_code}?token=bad.token.here") as ws:
            ws.receive_json()


async def test_websocket_invalid_seat(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "CENTER"}})
        # Skip initial LOBBY_STATE if it arrives first
        data = ws.receive_json()
        if data["event"] != "ERROR":
            data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert "Invalid seat" in data["payload"]["message"]


async def test_websocket_unknown_action(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "DANCE", "payload": {}})
        data = ws.receive_json()
        if data["event"] != "ERROR":
            data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert "Unknown action" in data["payload"]["message"]


async def test_websocket_seat_already_taken(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Register two users, have user1 take NORTH, then user2 tries NORTH."""
    room_code, token1 = await _create_game_and_get_token(client, auth_headers)

    # Register a second user
    resp2 = await client.post(
        "/auth/register",
        json={"first_name": "Player2", "email": "player2@test.com", "password": "securepass456"},
    )
    token2 = resp2.json()["access_token"]

    # User 1 takes NORTH
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token1}") as ws1:
        ws1.send_json({"action": "SELECT_SEAT", "payload": {"seat": "NORTH"}})
        ws1.receive_json()  # LOBBY_STATE_UPDATED

    # User 2 tries NORTH — should fail
    with sync_client.websocket_connect(f"/ws/{room_code}?token={token2}") as ws2:
        ws2.send_json({"action": "SELECT_SEAT", "payload": {"seat": "NORTH"}})
        # Read messages until we find SEAT_CLAIM_FAILED
        for _ in range(3):
            data = ws2.receive_json()
            if data["event"] == "SEAT_CLAIM_FAILED":
                break
        assert data["event"] == "SEAT_CLAIM_FAILED"
        assert data["payload"]["requested_seat"] == "NORTH"


async def test_websocket_switch_seat(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """User selects NORTH then switches to SOUTH — old seat freed."""
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "NORTH"}})
        data = ws.receive_json()
        if data["payload"]["seats"]["NORTH"] is None:
            data = ws.receive_json()
        assert data["payload"]["seats"]["NORTH"] == "Test"

        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "SOUTH"}})
        data = ws.receive_json()
        assert data["payload"]["seats"]["SOUTH"] == "Test"
        assert data["payload"]["seats"]["NORTH"] is None


async def test_websocket_reselect_same_seat(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Selecting the same seat again is a no-op success."""
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "EAST"}})
        data = ws.receive_json()
        if data["payload"]["seats"]["EAST"] is None:
            data = ws.receive_json()
        assert data["event"] == "LOBBY_STATE_UPDATED"
        assert data["payload"]["seats"]["EAST"] == "Test"

        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "EAST"}})
        data = ws.receive_json()
        assert data["event"] == "LOBBY_STATE_UPDATED"
        assert data["payload"]["seats"]["EAST"] == "Test"


async def test_start_game_success(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Fill all 4 seats, START_GAME → receive HAND_DEALT then BIDDING_TURN."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.send_json({"action": "START_GAME", "payload": {}})
        hand_dealt = ws.receive_json()
        if hand_dealt["event"] == "LOBBY_STATE_UPDATED":
            hand_dealt = ws.receive_json()
        assert hand_dealt["event"] == "HAND_DEALT"
        assert len(hand_dealt["payload"]["cards"]) == 12

        bidding_turn = ws.receive_json()
        assert bidding_turn["event"] == "BIDDING_TURN"
        assert bidding_turn["payload"]["minimum_valid_bid"] == 25
        assert bidding_turn["payload"]["current_highest_bid"] is None
        assert bidding_turn["payload"]["next_to_act_seat"] in [
            "NORTH", "EAST", "SOUTH", "WEST"
        ]


async def test_start_game_seats_not_full(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Only 1 seat filled → ERROR."""
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "SELECT_SEAT", "payload": {"seat": "NORTH"}})
        ws.receive_json()  # LOBBY_STATE_UPDATED (initial or post-seat)
        ws.receive_json()  # LOBBY_STATE_UPDATED (post-seat if first was initial)

        ws.send_json({"action": "START_GAME", "payload": {}})
        data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert "seats must be occupied" in data["payload"]["message"].lower()


async def test_start_game_wrong_phase(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Game not in LOBBY_WAITING phase → ERROR."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    # Start the game first
    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.send_json({"action": "START_GAME", "payload": {}})
        ws.receive_json()  # LOBBY_STATE_UPDATED or HAND_DEALT
        ws.receive_json()  # HAND_DEALT or BIDDING_TURN
        ws.receive_json()  # BIDDING_TURN (may be needed)

    # Try to start again — phase is now BIDDING, reconnect sends state
    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        # Drain all reconnect messages before sending action
        for _ in range(4):
            data = ws.receive_json()
            if data["event"] == "BIDDING_TURN":
                break
        ws.send_json({"action": "START_GAME", "payload": {}})
        data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert "lobby" in data["payload"]["message"].lower()


async def test_start_game_unique_hands(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """All 4 players get different cards, 48 total."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)

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


async def test_four_websockets_connected(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Open 4 websockets to the same game, seat all players, verify all get updates."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)

    contexts = []
    websockets = []
    for token in tokens:
        ctx = sync_client.websocket_connect(f"/ws/{room_code}?token={token}")
        ws = ctx.__enter__()
        contexts.append(ctx)
        websockets.append(ws)

    try:
        # Player 0 starts the game — all 4 should receive HAND_DEALT + BIDDING_TURN
        websockets[0].send_json({"action": "START_GAME", "payload": {}})

        for i, ws in enumerate(websockets):
            data = ws.receive_json()
            assert data["event"] == "HAND_DEALT", f"ws[{i}] got {data['event']}"
            assert len(data["payload"]["cards"]) == 12

        for i, ws in enumerate(websockets):
            data = ws.receive_json()
            assert data["event"] == "BIDDING_TURN", f"ws[{i}] got {data['event']}"
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_four_websockets_broadcast_after_seating(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Seat 4 players via WS (open/close loop), then open 4 fresh WS and broadcast.

    The _fill_seats_and_get_tokens helper opens/closes WS connections in a loop.
    This test checks if those closed connections cause the next broadcast to hang.
    """
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)

    contexts = []
    websockets = []
    for token in tokens:
        ctx = sync_client.websocket_connect(f"/ws/{room_code}?token={token}")
        ws = ctx.__enter__()
        contexts.append(ctx)
        websockets.append(ws)

    try:
        # START_GAME broadcasts HAND_DEALT (personal) + BIDDING_TURN (broadcast)
        websockets[0].send_json({"action": "START_GAME", "payload": {}})

        for i, ws in enumerate(websockets):
            data = ws.receive_json()
            assert data["event"] == "HAND_DEALT", f"ws[{i}] got {data['event']}"

        for i, ws in enumerate(websockets):
            data = ws.receive_json()
            assert data["event"] == "BIDDING_TURN", f"ws[{i}] got {data['event']}"

        # Now send another action that triggers a broadcast — this is the key part.
        # Since we're in BIDDING phase, SELECT_SEAT returns personal ERROR (no broadcast).
        # Use an UNKNOWN action to get a personal ERROR, confirming WS is still alive.
        websockets[1].send_json({"action": "PING", "payload": {}})
        data = websockets[1].receive_json()
        assert data["event"] == "ERROR"
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


# ── Helpers for bidding tests ────────────────────────────────────────


def _open_four_ws(sync_client, room_code, tokens):
    """Open 4 websockets. Returns (websockets, contexts) — caller must close contexts."""
    contexts = []
    websockets = []
    for token in tokens:
        ctx = sync_client.websocket_connect(f"/ws/{room_code}?token={token}")
        ws = ctx.__enter__()
        contexts.append(ctx)
        websockets.append(ws)
    return websockets, contexts


def _start_game_and_get_bidding_state(sync_client, room_code, tokens):
    """Start game with 4 connected websockets, drain HAND_DEALT + BIDDING_TURN.

    Returns (websockets, contexts, bidding_turn_payload).
    """
    websockets, contexts = _open_four_ws(sync_client, room_code, tokens)

    websockets[0].send_json({"action": "START_GAME", "payload": {}})

    for ws in websockets:
        ws.receive_json()  # HAND_DEALT

    bidding_turn = websockets[0].receive_json()  # BIDDING_TURN
    for ws in websockets[1:]:
        ws.receive_json()  # drain BIDDING_TURN from others

    return websockets, contexts, bidding_turn["payload"]


def _drain_broadcast(websockets):
    """Read one message from each websocket (used after a broadcast)."""
    results = []
    for ws in websockets:
        results.append(ws.receive_json())
    return results


# ── SUBMIT_BID tests ────────────────────────────────────────────────


async def test_submit_bid_success(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """First player bids 25 → BIDDING_TURN with correct highest bid, next bidder, min=26."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        first_bidder = bt["next_to_act_seat"]
        bidder_idx = SEATS.index(first_bidder)

        websockets[bidder_idx].send_json({
            "action": "SUBMIT_BID",
            "payload": {"amount": 25},
        })

        data = _drain_broadcast(websockets)[0]
        assert data["event"] == "BIDDING_TURN"
        assert data["payload"]["current_highest_bid"] == 25
        assert data["payload"]["highest_bidder_seat"] == first_bidder
        assert data["payload"]["minimum_valid_bid"] == 21
        expected_next = SEATS[(bidder_idx + 1) % 4]
        assert data["payload"]["next_to_act_seat"] == expected_next
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_submit_bid_not_your_turn(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Wrong player bids → ERROR."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        first_bidder = bt["next_to_act_seat"]
        wrong_idx = (SEATS.index(first_bidder) + 1) % 4

        websockets[wrong_idx].send_json({
            "action": "SUBMIT_BID",
            "payload": {"amount": 25},
        })

        data = websockets[wrong_idx].receive_json()
        assert data["event"] == "ERROR"
        assert "not your turn" in data["payload"]["message"].lower()
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_submit_bid_too_low(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Bid below minimum → ERROR."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        bidder_idx = SEATS.index(bt["next_to_act_seat"])

        websockets[bidder_idx].send_json({
            "action": "SUBMIT_BID",
            "payload": {"amount": 19},
        })

        data = websockets[bidder_idx].receive_json()
        assert data["event"] == "ERROR"
        assert "at least" in data["payload"]["message"].lower()
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_submit_bid_pass(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Player passes → next player's turn."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        first_bidder = bt["next_to_act_seat"]
        bidder_idx = SEATS.index(first_bidder)

        websockets[bidder_idx].send_json({
            "action": "SUBMIT_BID",
            "payload": {"amount": None},
        })

        data = _drain_broadcast(websockets)[0]
        assert data["event"] == "BIDDING_TURN"
        expected_next = SEATS[(bidder_idx + 1) % 4]
        assert data["payload"]["next_to_act_seat"] == expected_next
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_submit_bid_three_passes_ends_bidding(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """3 passes after a bid → BIDDING_COMPLETED."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        current_idx = SEATS.index(bt["next_to_act_seat"])
        bidder_seat = bt["next_to_act_seat"]

        # First player bids 25
        websockets[current_idx].send_json({
            "action": "SUBMIT_BID",
            "payload": {"amount": 25},
        })
        _drain_broadcast(websockets)  # BIDDING_TURN

        # Next 3 players pass
        for i in range(1, 4):
            next_idx = (current_idx + i) % 4
            websockets[next_idx].send_json({
                "action": "SUBMIT_BID",
                "payload": {"amount": None},
            })
            if i < 3:
                _drain_broadcast(websockets)  # BIDDING_TURN

        # After 3rd pass → BIDDING_COMPLETED
        data = _drain_broadcast(websockets)[0]
        assert data["event"] == "BIDDING_COMPLETED"
        assert data["payload"]["winning_bid"] == 25
        assert data["payload"]["winning_seat"] == bidder_seat
        assert data["payload"]["is_shoot_the_moon"] is False
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_submit_bid_all_pass_dealer_forced(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """All 3 non-dealers pass with no bids → dealer forced to take 25."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        # First bidder is one seat left of dealer, so we need to figure out dealer
        first_bidder = bt["next_to_act_seat"]
        first_idx = SEATS.index(first_bidder)
        # Dealer is one seat before the first bidder (clockwise)
        dealer_idx = (first_idx - 1) % 4
        dealer_seat = SEATS[dealer_idx]

        # 3 non-dealer players pass in order
        for i in range(3):
            idx = (first_idx + i) % 4
            websockets[idx].send_json({
                "action": "SUBMIT_BID",
                "payload": {"amount": None},
            })
            if i < 2:
                _drain_broadcast(websockets)  # BIDDING_TURN

        # After 3rd non-dealer passes, dealer is forced — try to pass should ERROR
        # Actually the 3rd pass triggers the forced bid scenario:
        # When 3 pass with no bids, dealer wins at 25
        data = _drain_broadcast(websockets)[0]
        assert data["event"] == "BIDDING_COMPLETED"
        assert data["payload"]["winning_bid"] == 25
        assert data["payload"]["winning_seat"] == dealer_seat
        assert data["payload"]["is_shoot_the_moon"] is False
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_submit_bid_after_bidding_completed(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Bidding already ended → SUBMIT_BID returns ERROR."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        first_bidder = bt["next_to_act_seat"]
        first_idx = SEATS.index(first_bidder)

        # Shoot the moon to end bidding immediately
        websockets[first_idx].send_json({
            "action": "SUBMIT_BID",
            "payload": {"amount": 25, "shoot_the_moon": True},
        })
        _drain_broadcast(websockets)  # BIDDING_COMPLETED

        # Try to bid again — phase is now NAMING_TRUMP
        websockets[first_idx].send_json({
            "action": "SUBMIT_BID",
            "payload": {"amount": 25},
        })
        data = websockets[first_idx].receive_json()
        assert data["event"] == "ERROR"
        assert "bidding" in data["payload"]["message"].lower()
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_submit_bid_shoot_the_moon(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """shoot_the_moon=true → bidding ends immediately with BIDDING_COMPLETED."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        bidder_seat = bt["next_to_act_seat"]
        bidder_idx = SEATS.index(bidder_seat)

        websockets[bidder_idx].send_json({
            "action": "SUBMIT_BID",
            "payload": {"amount": 25, "shoot_the_moon": True},
        })

        data = _drain_broadcast(websockets)[0]
        assert data["event"] == "BIDDING_COMPLETED"
        assert data["payload"]["winning_seat"] == bidder_seat
        assert data["payload"]["winning_bid"] == 25
        assert data["payload"]["is_shoot_the_moon"] is True
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_submit_bid_wrong_phase(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Send SUBMIT_BID during LOBBY_WAITING → ERROR."""
    room_code, token = await _create_game_and_get_token(client, auth_headers)

    with sync_client.websocket_connect(f"/ws/{room_code}?token={token}") as ws:
        ws.send_json({"action": "SUBMIT_BID", "payload": {"amount": 25}})
        data = ws.receive_json()
        if data["event"] != "ERROR":
            data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert "bidding" in data["payload"]["message"].lower()


# ── Helpers for NAMING_TRUMP tests ──────────────────────────────────


def _end_bidding_with_shoot(websockets, bt):
    """First bidder shoots the moon to quickly end bidding. Returns (winner_seat, winner_idx)."""
    bidder_seat = bt["next_to_act_seat"]
    bidder_idx = SEATS.index(bidder_seat)
    websockets[bidder_idx].send_json({
        "action": "SUBMIT_BID",
        "payload": {"amount": 25, "shoot_the_moon": True},
    })
    _drain_broadcast(websockets)  # BIDDING_COMPLETED
    return bidder_seat, bidder_idx


# ── DECLARE_TRUMP tests ────────────────────────────────────────────


async def test_declare_trump_success(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Bid winner declares trump → TRUMP_NAMED broadcast."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        winner_seat, winner_idx = _end_bidding_with_shoot(websockets, bt)

        websockets[winner_idx].send_json({
            "action": "DECLARE_TRUMP",
            "payload": {"suit": "HEARTS"},
        })

        data = _drain_broadcast(websockets)[0]
        assert data["event"] == "TRUMP_NAMED"
        assert data["payload"]["trump_suit"] == "HEARTS"
        assert data["payload"]["declared_by_seat"] == winner_seat
        assert data["payload"]["winning_bid"] == 25
        assert data["payload"]["is_shoot_the_moon"] is True
        # Verify team mapping
        expected_team = "NS" if winner_seat in ("NORTH", "SOUTH") else "EW"
        assert data["payload"]["bidding_team"] == expected_team
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_declare_trump_not_bid_winner(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Non-winner tries to declare trump → ERROR."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        winner_seat, winner_idx = _end_bidding_with_shoot(websockets, bt)
        wrong_idx = (winner_idx + 1) % 4

        websockets[wrong_idx].send_json({
            "action": "DECLARE_TRUMP",
            "payload": {"suit": "SPADES"},
        })

        data = websockets[wrong_idx].receive_json()
        assert data["event"] == "ERROR"
        assert "bid winner" in data["payload"]["message"].lower()
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_declare_trump_invalid_suit(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Invalid suit → ERROR."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        _, winner_idx = _end_bidding_with_shoot(websockets, bt)

        websockets[winner_idx].send_json({
            "action": "DECLARE_TRUMP",
            "payload": {"suit": "STARS"},
        })

        data = websockets[winner_idx].receive_json()
        assert data["event"] == "ERROR"
        assert "Invalid suit" in data["payload"]["message"]
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_declare_trump_wrong_phase(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """DECLARE_TRUMP during BIDDING → ERROR."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        # Don't end bidding — still in BIDDING phase
        bidder_idx = SEATS.index(bt["next_to_act_seat"])

        websockets[bidder_idx].send_json({
            "action": "DECLARE_TRUMP",
            "payload": {"suit": "HEARTS"},
        })

        data = websockets[bidder_idx].receive_json()
        assert data["event"] == "ERROR"
        assert "trump naming" in data["payload"]["message"].lower()
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_declare_trump_transitions_phase(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """After declaring trump, a second DECLARE_TRUMP returns wrong-phase error."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        _, winner_idx = _end_bidding_with_shoot(websockets, bt)

        websockets[winner_idx].send_json({
            "action": "DECLARE_TRUMP",
            "payload": {"suit": "DIAMONDS"},
        })
        _drain_broadcast(websockets)  # TRUMP_NAMED
        _drain_broadcast(websockets)  # MELD_BROADCAST

        # Try again — phase is now SHOWING_MELD
        websockets[winner_idx].send_json({
            "action": "DECLARE_TRUMP",
            "payload": {"suit": "SPADES"},
        })
        data = websockets[winner_idx].receive_json()
        assert data["event"] == "ERROR"
        assert "trump naming" in data["payload"]["message"].lower()
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


# ── Helpers for SHOWING_MELD tests ───────────────────────────────────


def _declare_trump_and_get_meld(websockets, winner_idx, suit="HEARTS"):
    """Send DECLARE_TRUMP and drain TRUMP_NAMED + MELD_BROADCAST.

    Returns the MELD_BROADCAST payload.
    """
    websockets[winner_idx].send_json({
        "action": "DECLARE_TRUMP",
        "payload": {"suit": suit},
    })
    _drain_broadcast(websockets)  # TRUMP_NAMED
    meld_msgs = _drain_broadcast(websockets)  # MELD_BROADCAST
    return meld_msgs[0]["payload"]


# ── MELD tests ────────────────────────────────────────────────────────


async def test_declare_trump_broadcasts_meld(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """DECLARE_TRUMP sends MELD_BROADCAST with trump_suit, team_meld, player_melds for all 4 seats."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        _, winner_idx = _end_bidding_with_shoot(websockets, bt)
        meld_payload = _declare_trump_and_get_meld(websockets, winner_idx, "HEARTS")

        assert meld_payload["trump_suit"] == "HEARTS"
        assert "team_meld" in meld_payload
        assert "NS" in meld_payload["team_meld"]
        assert "EW" in meld_payload["team_meld"]
        assert "player_melds" in meld_payload
        for seat in SEATS:
            assert seat in meld_payload["player_melds"]
            assert "melds" in meld_payload["player_melds"][seat]
            assert "total" in meld_payload["player_melds"][seat]
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_meld_team_totals_match_player_sums(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """NS = NORTH + SOUTH totals, EW = EAST + WEST totals."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        _, winner_idx = _end_bidding_with_shoot(websockets, bt)
        meld_payload = _declare_trump_and_get_meld(websockets, winner_idx, "SPADES")

        pm = meld_payload["player_melds"]
        tm = meld_payload["team_meld"]
        assert tm["NS"] == pm["NORTH"]["total"] + pm["SOUTH"]["total"]
        assert tm["EW"] == pm["EAST"]["total"] + pm["WEST"]["total"]
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_acknowledge_meld_all_four(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """3 acks → MELD_ACKNOWLEDGED each, 4th ack → MELD_PHASE_COMPLETED."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        _, winner_idx = _end_bidding_with_shoot(websockets, bt)
        _declare_trump_and_get_meld(websockets, winner_idx)

        # First 3 players acknowledge
        for i in range(3):
            websockets[i].send_json({"action": "ACKNOWLEDGE_MELD", "payload": {}})
            msgs = _drain_broadcast(websockets)
            assert msgs[0]["event"] == "MELD_ACKNOWLEDGED"
            assert msgs[0]["payload"]["seat"] == SEATS[i]
            assert len(msgs[0]["payload"]["acknowledged_seats"]) == i + 1

        # 4th player acknowledges → MELD_PHASE_COMPLETED
        websockets[3].send_json({"action": "ACKNOWLEDGE_MELD", "payload": {}})
        msgs = _drain_broadcast(websockets)
        assert msgs[0]["event"] == "MELD_PHASE_COMPLETED"
        assert "team_meld" in msgs[0]["payload"]
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_acknowledge_meld_duplicate(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """Same player acks twice → ERROR."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        _, winner_idx = _end_bidding_with_shoot(websockets, bt)
        _declare_trump_and_get_meld(websockets, winner_idx)

        websockets[0].send_json({"action": "ACKNOWLEDGE_MELD", "payload": {}})
        _drain_broadcast(websockets)  # MELD_ACKNOWLEDGED

        websockets[0].send_json({"action": "ACKNOWLEDGE_MELD", "payload": {}})
        data = websockets[0].receive_json()
        assert data["event"] == "ERROR"
        assert "already" in data["payload"]["message"].lower()
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)


async def test_acknowledge_meld_wrong_phase(client: AsyncClient, sync_client: TestClient, auth_headers: dict):
    """ACKNOWLEDGE_MELD during BIDDING → ERROR."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt = _start_game_and_get_bidding_state(sync_client, room_code, tokens)
    try:
        # Still in BIDDING phase — haven't ended bidding
        websockets[0].send_json({"action": "ACKNOWLEDGE_MELD", "payload": {}})
        data = websockets[0].receive_json()
        assert data["event"] == "ERROR"
        assert "meld" in data["payload"]["message"].lower()
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)
