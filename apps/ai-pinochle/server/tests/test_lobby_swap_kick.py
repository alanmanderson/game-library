"""Tests for SWAP_SEAT_REQUEST, SWAP_SEAT_ACCEPT, KICK_PLAYER lobby actions.

All three operate only in LOBBY_WAITING and are adapter-only (not state-machine
reducers). Tests exercise:
  - Happy paths (request → accept full swap; kick a player)
  - Error paths (wrong phase, not seated, invalid seat, non-creator kick, etc.)
  - State side-effects (pending_swap persisted; seats updated correctly)
  - LOBBY_STATE_UPDATED payload now carries created_by and pending_swap
"""
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.game import Game
from app.models.user import User
from app.websocket.handlers import (
    handle_kick_player,
    handle_swap_seat_accept,
    handle_swap_seat_request,
)
from tests.conftest import engine

pytestmark = pytest.mark.anyio


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _mock_ws() -> MagicMock:
    ws = MagicMock()
    ws.send_json = AsyncMock()
    return ws


def _events(ws: MagicMock) -> list[str]:
    return [call.args[0]["event"] for call in ws.send_json.call_args_list]


def _first_payload(ws: MagicMock, event: str) -> dict:
    for call in ws.send_json.call_args_list:
        msg = call.args[0]
        if msg["event"] == event:
            return msg["payload"]
    raise AssertionError(f"Event {event!r} not found in calls")


async def _make_game_with_users(
    n_users: int,
    room_code: str = "SWAPX1",
    creator_index: int = 0,
) -> tuple[uuid.UUID, list[uuid.UUID]]:
    """Insert a LOBBY_WAITING game and n users; return (game_id, [user_ids])."""
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        users = [
            User(
                username=f"player{i}",
                first_name=f"Player{i}",
                last_name="Test",
                email=f"player{i}_{room_code}@test.com",
                password_hash="x",
            )
            for i in range(n_users)
        ]
        db.add_all(users)
        await db.flush()
        user_ids = [u.id for u in users]

        creator_id = user_ids[creator_index]
        game = Game(
            room_code=room_code,
            status="IN_PROGRESS",
            current_state_json={
                "phase": "LOBBY_WAITING",
                "created_by": str(creator_id),
            },
        )
        db.add(game)
        await db.flush()
        game_id = game.id
        await db.commit()
    return game_id, user_ids


async def _seat_user(game_id: uuid.UUID, user_id: uuid.UUID, seat: str) -> None:
    col = {
        "NORTH": "north_player_id",
        "EAST": "east_player_id",
        "SOUTH": "south_player_id",
        "WEST": "west_player_id",
    }[seat]
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        from sqlalchemy import update
        await db.execute(
            update(Game).where(Game.id == game_id).values(**{col: user_id})
        )
        await db.commit()


async def _get_game(game_id: uuid.UUID) -> Game:
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        return (await db.execute(select(Game).where(Game.id == game_id))).scalar_one()


# ---------------------------------------------------------------------------
# LOBBY_STATE_UPDATED payload enrichment
# ---------------------------------------------------------------------------


async def test_lobby_state_includes_is_host_and_no_pending_swap():
    """On fresh connect, creator gets is_host=True; pending_swap is None."""
    from app.websocket.handlers import _build_lobby_payload, _build_seats_dict

    game_id, user_ids = await _make_game_with_users(2, room_code="ENRICH1")
    creator_id = user_ids[0]
    other_id = user_ids[1]

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        game = (await db.execute(select(Game).where(Game.id == game_id))).scalar_one()
        seats = await _build_seats_dict(game, db)
        creator_payload = await _build_lobby_payload(game, db, seats, creator_id)
        other_payload = await _build_lobby_payload(game, db, seats, other_id)

    assert creator_payload["is_host"] is True
    assert other_payload["is_host"] is False
    assert creator_payload["pending_swap"] is None


# ---------------------------------------------------------------------------
# SWAP_SEAT_REQUEST — happy path
# ---------------------------------------------------------------------------


async def test_swap_seat_request_stores_pending_swap():
    """Requester (NORTH) targets EAST; pending_swap written to state JSON."""
    game_id, user_ids = await _make_game_with_users(2, room_code="SWP001")
    north_id, east_id = user_ids
    await _seat_user(game_id, north_id, "NORTH")
    await _seat_user(game_id, east_id, "EAST")

    ws = _mock_ws()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        await handle_swap_seat_request(
            ws, {"target_seat": "EAST"}, "SWP001", north_id, db
        )
        await db.commit()

    game = await _get_game(game_id)
    state = game.current_state_json
    assert state["pending_swap"] == {
        "from_seat": "NORTH",
        "to_seat": "EAST",
        "requested_by": str(north_id),
    }
    assert "ERROR" not in _events(ws)


async def test_swap_seat_request_overwrites_previous_pending():
    """A second request replaces the first pending_swap."""
    game_id, user_ids = await _make_game_with_users(3, room_code="SWP002")
    north_id, east_id, south_id = user_ids
    await _seat_user(game_id, north_id, "NORTH")
    await _seat_user(game_id, east_id, "EAST")
    await _seat_user(game_id, south_id, "SOUTH")

    Session = async_sessionmaker(engine, expire_on_commit=False)
    # First request: NORTH → EAST
    async with Session() as db:
        await handle_swap_seat_request(_mock_ws(), {"target_seat": "EAST"}, "SWP002", north_id, db)
        await db.commit()

    # Second request: SOUTH → NORTH (different requester)
    ws = _mock_ws()
    async with Session() as db:
        await handle_swap_seat_request(ws, {"target_seat": "NORTH"}, "SWP002", south_id, db)
        await db.commit()

    game = await _get_game(game_id)
    pending = game.current_state_json["pending_swap"]
    assert pending["from_seat"] == "SOUTH"
    assert pending["to_seat"] == "NORTH"


# ---------------------------------------------------------------------------
# SWAP_SEAT_REQUEST — error paths
# ---------------------------------------------------------------------------


async def test_swap_seat_request_wrong_phase():
    game_id, user_ids = await _make_game_with_users(2, room_code="SWP003")
    north_id, east_id = user_ids
    await _seat_user(game_id, north_id, "NORTH")
    # Force game into BIDDING phase.
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        game = (await db.execute(select(Game).where(Game.id == game_id))).scalar_one()
        game.current_state_json = {**game.current_state_json, "phase": "BIDDING"}
        await db.commit()

    ws = _mock_ws()
    async with Session() as db:
        await handle_swap_seat_request(ws, {"target_seat": "EAST"}, "SWP003", north_id, db)

    assert "ERROR" in _events(ws)
    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "WRONG_PHASE"


async def test_swap_seat_request_not_seated():
    game_id, user_ids = await _make_game_with_users(2, room_code="SWP004")
    unseated_id, east_id = user_ids
    await _seat_user(game_id, east_id, "EAST")

    ws = _mock_ws()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        await handle_swap_seat_request(ws, {"target_seat": "EAST"}, "SWP004", unseated_id, db)

    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "NOT_SEATED"


async def test_swap_seat_request_target_is_empty():
    game_id, user_ids = await _make_game_with_users(1, room_code="SWP005")
    north_id = user_ids[0]
    await _seat_user(game_id, north_id, "NORTH")

    ws = _mock_ws()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        await handle_swap_seat_request(ws, {"target_seat": "EAST"}, "SWP005", north_id, db)

    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "INVALID_SEAT"


async def test_swap_seat_request_self_target():
    game_id, user_ids = await _make_game_with_users(1, room_code="SWP006")
    north_id = user_ids[0]
    await _seat_user(game_id, north_id, "NORTH")

    ws = _mock_ws()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        await handle_swap_seat_request(ws, {"target_seat": "NORTH"}, "SWP006", north_id, db)

    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "INVALID_SEAT"


async def test_swap_seat_request_invalid_seat_string():
    game_id, user_ids = await _make_game_with_users(1, room_code="SWP007")
    north_id = user_ids[0]
    await _seat_user(game_id, north_id, "NORTH")

    ws = _mock_ws()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        await handle_swap_seat_request(ws, {"target_seat": "CENTER"}, "SWP007", north_id, db)

    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "INVALID_SEAT"


# ---------------------------------------------------------------------------
# SWAP_SEAT_ACCEPT — happy path
# ---------------------------------------------------------------------------


async def test_swap_seat_accept_swaps_seats_in_db():
    """After accept, NORTH↔EAST are swapped and pending_swap is cleared."""
    game_id, user_ids = await _make_game_with_users(2, room_code="ACC001")
    north_id, east_id = user_ids
    await _seat_user(game_id, north_id, "NORTH")
    await _seat_user(game_id, east_id, "EAST")

    Session = async_sessionmaker(engine, expire_on_commit=False)
    # Plant the pending swap directly so we don't depend on the request handler.
    async with Session() as db:
        game = (await db.execute(select(Game).where(Game.id == game_id))).scalar_one()
        game.current_state_json = {
            **game.current_state_json,
            "pending_swap": {
                "from_seat": "NORTH",
                "to_seat": "EAST",
                "requested_by": str(north_id),
            },
        }
        await db.commit()

    ws = _mock_ws()
    async with Session() as db:
        # east_id occupies to_seat=EAST so they are the acceptor.
        await handle_swap_seat_accept(ws, {}, "ACC001", east_id, db)
        await db.commit()

    assert "ERROR" not in _events(ws)

    game = await _get_game(game_id)
    # After swap: the player who was NORTH is now EAST and vice versa.
    assert game.north_player_id == east_id
    assert game.east_player_id == north_id
    assert game.current_state_json.get("pending_swap") is None


# ---------------------------------------------------------------------------
# SWAP_SEAT_ACCEPT — error paths
# ---------------------------------------------------------------------------


async def test_swap_seat_accept_no_pending():
    game_id, user_ids = await _make_game_with_users(2, room_code="ACC002")
    north_id, east_id = user_ids
    await _seat_user(game_id, east_id, "EAST")

    ws = _mock_ws()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        await handle_swap_seat_accept(ws, {}, "ACC002", east_id, db)

    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "NO_PENDING_SWAP"


async def test_swap_seat_accept_wrong_player():
    """Only the player in to_seat can accept. A third party gets SWAP_NOT_FOR_YOU."""
    game_id, user_ids = await _make_game_with_users(3, room_code="ACC003")
    north_id, east_id, south_id = user_ids
    await _seat_user(game_id, north_id, "NORTH")
    await _seat_user(game_id, east_id, "EAST")
    await _seat_user(game_id, south_id, "SOUTH")

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        game = (await db.execute(select(Game).where(Game.id == game_id))).scalar_one()
        game.current_state_json = {
            **game.current_state_json,
            "pending_swap": {
                "from_seat": "NORTH",
                "to_seat": "EAST",
                "requested_by": str(north_id),
            },
        }
        await db.commit()

    # south_id tries to accept a swap meant for east_id
    ws = _mock_ws()
    async with Session() as db:
        await handle_swap_seat_accept(ws, {}, "ACC003", south_id, db)

    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "SWAP_NOT_FOR_YOU"


async def test_swap_seat_accept_wrong_phase():
    game_id, user_ids = await _make_game_with_users(2, room_code="ACC004")
    north_id, east_id = user_ids
    await _seat_user(game_id, east_id, "EAST")

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        game = (await db.execute(select(Game).where(Game.id == game_id))).scalar_one()
        game.current_state_json = {
            **game.current_state_json,
            "phase": "BIDDING",
            "pending_swap": {
                "from_seat": "NORTH",
                "to_seat": "EAST",
                "requested_by": str(north_id),
            },
        }
        await db.commit()

    ws = _mock_ws()
    async with Session() as db:
        await handle_swap_seat_accept(ws, {}, "ACC004", east_id, db)

    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "WRONG_PHASE"


# ---------------------------------------------------------------------------
# KICK_PLAYER — happy path
# ---------------------------------------------------------------------------


async def test_kick_player_removes_occupant():
    """Host kicks EAST; east seat becomes None, pending_swap cleared if involved."""
    game_id, user_ids = await _make_game_with_users(2, room_code="KCK001")
    creator_id, east_id = user_ids
    await _seat_user(game_id, creator_id, "NORTH")
    await _seat_user(game_id, east_id, "EAST")

    # Plant a pending swap involving EAST so we verify it is cleared.
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        game = (await db.execute(select(Game).where(Game.id == game_id))).scalar_one()
        game.current_state_json = {
            **game.current_state_json,
            "pending_swap": {
                "from_seat": "NORTH",
                "to_seat": "EAST",
                "requested_by": str(creator_id),
            },
        }
        await db.commit()

    ws = _mock_ws()
    async with Session() as db:
        await handle_kick_player(ws, {"seat": "EAST"}, "KCK001", creator_id, db)
        await db.commit()

    assert "ERROR" not in _events(ws)

    game = await _get_game(game_id)
    assert game.east_player_id is None
    assert game.current_state_json.get("pending_swap") is None


async def test_kick_player_unrelated_pending_swap_preserved():
    """Kicking WEST should NOT clear a pending swap between NORTH and EAST."""
    game_id, user_ids = await _make_game_with_users(3, room_code="KCK002")
    creator_id, east_id, west_id = user_ids
    await _seat_user(game_id, creator_id, "NORTH")
    await _seat_user(game_id, east_id, "EAST")
    await _seat_user(game_id, west_id, "WEST")

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        game = (await db.execute(select(Game).where(Game.id == game_id))).scalar_one()
        game.current_state_json = {
            **game.current_state_json,
            "pending_swap": {
                "from_seat": "NORTH",
                "to_seat": "EAST",
                "requested_by": str(creator_id),
            },
        }
        await db.commit()

    ws = _mock_ws()
    async with Session() as db:
        await handle_kick_player(ws, {"seat": "WEST"}, "KCK002", creator_id, db)
        await db.commit()

    assert "ERROR" not in _events(ws)

    game = await _get_game(game_id)
    assert game.west_player_id is None
    # Swap between NORTH/EAST is untouched.
    pending = game.current_state_json.get("pending_swap")
    assert pending is not None
    assert pending["from_seat"] == "NORTH"
    assert pending["to_seat"] == "EAST"


# ---------------------------------------------------------------------------
# KICK_PLAYER — error paths
# ---------------------------------------------------------------------------


async def test_kick_player_non_creator_rejected():
    game_id, user_ids = await _make_game_with_users(2, room_code="KCK003")
    creator_id, east_id = user_ids
    await _seat_user(game_id, creator_id, "NORTH")
    await _seat_user(game_id, east_id, "EAST")

    ws = _mock_ws()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        # east_id (not creator) tries to kick NORTH.
        await handle_kick_player(ws, {"seat": "NORTH"}, "KCK003", east_id, db)

    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "NOT_GAME_CREATOR"


async def test_kick_player_self_kick_rejected():
    game_id, user_ids = await _make_game_with_users(1, room_code="KCK004")
    creator_id = user_ids[0]
    await _seat_user(game_id, creator_id, "NORTH")

    ws = _mock_ws()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        await handle_kick_player(ws, {"seat": "NORTH"}, "KCK004", creator_id, db)

    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "CANNOT_KICK_SELF"


async def test_kick_player_empty_seat_rejected():
    game_id, user_ids = await _make_game_with_users(1, room_code="KCK005")
    creator_id = user_ids[0]
    await _seat_user(game_id, creator_id, "NORTH")

    ws = _mock_ws()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        await handle_kick_player(ws, {"seat": "EAST"}, "KCK005", creator_id, db)

    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "INVALID_SEAT"


async def test_kick_player_wrong_phase():
    game_id, user_ids = await _make_game_with_users(2, room_code="KCK006")
    creator_id, east_id = user_ids
    await _seat_user(game_id, creator_id, "NORTH")
    await _seat_user(game_id, east_id, "EAST")

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        game = (await db.execute(select(Game).where(Game.id == game_id))).scalar_one()
        game.current_state_json = {**game.current_state_json, "phase": "BIDDING"}
        await db.commit()

    ws = _mock_ws()
    async with Session() as db:
        await handle_kick_player(ws, {"seat": "EAST"}, "KCK006", creator_id, db)

    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "WRONG_PHASE"


async def test_kick_player_invalid_seat_string():
    game_id, user_ids = await _make_game_with_users(1, room_code="KCK007")
    creator_id = user_ids[0]
    await _seat_user(game_id, creator_id, "NORTH")

    ws = _mock_ws()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        await handle_kick_player(ws, {"seat": "DIAGONAL"}, "KCK007", creator_id, db)

    payload = _first_payload(ws, "ERROR")
    assert payload["code"] == "INVALID_SEAT"


# ---------------------------------------------------------------------------
# Full round-trip: request → accept via WebSocket frames
# ---------------------------------------------------------------------------


async def test_swap_request_then_accept_full_roundtrip(
    client, sync_client, auth_headers
):
    """End-to-end: two connected players complete a seat swap via WS frames."""
    from httpx import AsyncClient

    # Create a game and register a second user.
    resp = await client.post("/games/create", headers=auth_headers)
    room_code = resp.json()["room_code"]
    token1 = auth_headers["Authorization"].removeprefix("Bearer ")

    resp2 = await client.post(
        "/auth/register",
        json={
            "first_name": "Bob",
            "last_name": "Test",
            "email": "bob_swap@test.com",
            "password": "securepass123",
        },
    )
    token2 = resp2.json()["access_token"]

    # Player 1 → NORTH, Player 2 → EAST via WS.
    def _drain_until_seated(ws, seat_name, player_name):
        """Drain messages until we see the lobby update with the named player seated."""
        for _ in range(10):
            msg = ws.receive_json()
            if msg["event"] == "LOBBY_STATE_UPDATED":
                if msg["payload"]["seats"].get(seat_name) == player_name:
                    return msg
        raise AssertionError(f"Never saw {player_name} in {seat_name}")

    with sync_client.websocket_connect(f"/ws/{room_code}?token={token1}") as ws1:
        ws1.receive_json()  # initial LOBBY_STATE_UPDATED
        ws1.send_json({"action": "SELECT_SEAT", "payload": {"seat": "NORTH"}})
        _drain_until_seated(ws1, "NORTH", "Test")

        with sync_client.websocket_connect(f"/ws/{room_code}?token={token2}") as ws2:
            ws2.receive_json()  # initial LOBBY_STATE_UPDATED (ws2 sees NORTH taken)
            ws2.send_json({"action": "SELECT_SEAT", "payload": {"seat": "EAST"}})
            _drain_until_seated(ws2, "EAST", "Bob")
            # Drain ws1's LOBBY_STATE_UPDATED from ws2 seating.
            ws1.receive_json()

            # Player 1 (NORTH) requests to swap with Player 2 (EAST).
            ws1.send_json(
                {"action": "SWAP_SEAT_REQUEST", "payload": {"target_seat": "EAST"}}
            )

            # Both players receive LOBBY_STATE_UPDATED with pending_swap.
            def _drain_pending(ws):
                for _ in range(5):
                    msg = ws.receive_json()
                    if msg["event"] == "LOBBY_STATE_UPDATED":
                        if msg["payload"].get("pending_swap"):
                            return msg
                raise AssertionError("Never received pending_swap in LOBBY_STATE_UPDATED")

            update1 = _drain_pending(ws1)
            ps = update1["payload"]["pending_swap"]
            assert ps["from_seat"] == "NORTH"
            assert ps["to_seat"] == "EAST"

            # Player 2 accepts.
            ws2.send_json({"action": "SWAP_SEAT_ACCEPT", "payload": {}})

            # Both players receive the swapped LOBBY_STATE_UPDATED.
            def _drain_swapped(ws, expected_your_seat):
                for _ in range(5):
                    msg = ws.receive_json()
                    if msg["event"] == "LOBBY_STATE_UPDATED":
                        p = msg["payload"]
                        if p.get("pending_swap") is None and p.get("your_seat") == expected_your_seat:
                            return msg
                raise AssertionError(f"Never saw swapped state with your_seat={expected_your_seat}")

            post_swap1 = _drain_swapped(ws1, "EAST")
            assert post_swap1["payload"]["seats"]["EAST"] == "Test"
            assert post_swap1["payload"]["seats"]["NORTH"] == "Bob"

            post_swap2 = _drain_swapped(ws2, "NORTH")
            assert post_swap2["payload"]["seats"]["NORTH"] == "Bob"
