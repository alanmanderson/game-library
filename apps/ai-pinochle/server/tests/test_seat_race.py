"""Concurrency tests that require real DB state.

Covers:
  1. Two users racing for the same seat — verifies the atomic
     `UPDATE ... WHERE col IS NULL` pattern lets exactly one win and the
     other gets SEAT_CLAIM_FAILED (or at least does NOT end up seated).
  2. Same user opening a second WebSocket from a "second tab" —
     ConnectionManager.connect closes the first connection with code 4002
     ("Superseded by new connection"), so only one tab can drive state.

These bypass the WS layer to exercise the DB-level invariants directly,
using the pattern from test_optimistic_lock.py.
"""
import asyncio
import uuid
from unittest.mock import MagicMock, AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from starlette.testclient import TestClient

from app.models.game import Game
from app.models.user import User
from app.websocket.handlers import handle_select_seat
from tests.conftest import engine
from tests.test_websocket import (
    _create_game_and_get_token,
    _fill_seats_and_get_tokens,
    _register_user,
)

pytestmark = pytest.mark.anyio


def _mock_ws() -> MagicMock:
    """A websocket stand-in that records send_json calls."""
    ws = MagicMock()
    ws.send_json = AsyncMock()
    return ws


async def _make_lobby_game_with_users(n_users: int) -> tuple[uuid.UUID, list[uuid.UUID], str]:
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        users = [
            User(
                username=f"racer{i}",
                first_name=f"Racer{i}",
                last_name="Test",
                email=f"racer{i}@test.com",
                password_hash="x",
            )
            for i in range(n_users)
        ]
        db.add_all(users)
        await db.flush()
        user_ids = [u.id for u in users]

        game = Game(
            room_code="RACE01",
            status="IN_PROGRESS",
            current_state_json={"phase": "LOBBY_WAITING"},
        )
        db.add(game)
        await db.flush()
        game_id = game.id
        await db.commit()
    return game_id, user_ids, "RACE01"


# ---------------------------------------------------------------------------
# SELECT_SEAT race — two users trying NORTH at the same time
# ---------------------------------------------------------------------------


async def test_concurrent_select_seat_only_one_winner():
    """Two users racing for NORTH — the atomic `WHERE col IS NULL` UPDATE
    must let exactly one claim it. The loser gets SEAT_CLAIM_FAILED."""
    game_id, user_ids, room_code = await _make_lobby_game_with_users(2)
    user_a, user_b = user_ids

    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def claim(user_id: uuid.UUID, ws):
        async with Session() as db:
            await handle_select_seat(
                ws, {"seat": "NORTH"}, room_code, user_id, db
            )
            await db.commit()

    ws_a = _mock_ws()
    ws_b = _mock_ws()

    # Launch both claims concurrently on separate sessions.
    await asyncio.gather(claim(user_a, ws_a), claim(user_b, ws_b))

    # Exactly one of NORTH is owned at the DB level.
    async with Session() as db:
        game = (
            await db.execute(select(Game).where(Game.id == game_id))
        ).scalar_one()
        assert game.north_player_id in (user_a, user_b)

    winner_id = game.north_player_id

    # Collect the emitted events.
    a_events = [call.args[0]["event"] for call in ws_a.send_json.call_args_list]
    b_events = [call.args[0]["event"] for call in ws_b.send_json.call_args_list]

    if winner_id == user_a:
        # A should have sent LOBBY_STATE_UPDATED (to everyone connected; mocked
        # ws receives it via _send_lobby_state iterating manager connections —
        # but since our mock ws isn't registered in the manager, it won't
        # receive a broadcast. The winner's `_send_lobby_state` sends to all
        # manager-registered connections, not to ws_a directly. So the winner
        # may have zero send_json calls from this handler. Verify via DB.)
        assert "SEAT_CLAIM_FAILED" not in a_events
        assert "SEAT_CLAIM_FAILED" in b_events
        assert b_events.count("SEAT_CLAIM_FAILED") == 1
    else:
        assert "SEAT_CLAIM_FAILED" not in b_events
        assert "SEAT_CLAIM_FAILED" in a_events
        assert a_events.count("SEAT_CLAIM_FAILED") == 1


async def test_select_seat_already_taken_rejects_cleanly():
    """Second claim on an already-taken seat — SEAT_CLAIM_FAILED, seat holder
    unchanged. Sequential variant (no race) to lock in the happy path of the
    atomic-UPDATE's short-circuit branch."""
    game_id, user_ids, room_code = await _make_lobby_game_with_users(2)
    user_a, user_b = user_ids

    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        ws_a = _mock_ws()
        await handle_select_seat(ws_a, {"seat": "EAST"}, room_code, user_a, db)
        await db.commit()

    async with Session() as db:
        ws_b = _mock_ws()
        await handle_select_seat(ws_b, {"seat": "EAST"}, room_code, user_b, db)
        await db.commit()

    b_events = [c.args[0]["event"] for c in ws_b.send_json.call_args_list]
    assert b_events.count("SEAT_CLAIM_FAILED") == 1

    async with Session() as db:
        game = (
            await db.execute(select(Game).where(Game.id == game_id))
        ).scalar_one()
        assert game.east_player_id == user_a


async def test_select_seat_switches_vacates_old_seat():
    """User re-selects a new seat — the old seat is cleared atomically."""
    game_id, user_ids, room_code = await _make_lobby_game_with_users(1)
    (user_a,) = user_ids

    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        ws = _mock_ws()
        await handle_select_seat(ws, {"seat": "NORTH"}, room_code, user_a, db)
        await db.commit()

    async with Session() as db:
        ws = _mock_ws()
        await handle_select_seat(ws, {"seat": "SOUTH"}, room_code, user_a, db)
        await db.commit()

    async with Session() as db:
        game = (
            await db.execute(select(Game).where(Game.id == game_id))
        ).scalar_one()
        assert game.north_player_id is None
        assert game.south_player_id == user_a


# ---------------------------------------------------------------------------
# Duplicate connection from the same user — ConnectionManager.connect closes
# the existing socket before accepting the new one.
# ---------------------------------------------------------------------------


async def test_second_ws_from_same_user_closes_first(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """Opening a second WS for the same user triggers the manager to close
    the first with code 4002. The first WS's receive_json must eventually
    raise to signal the close."""
    from starlette.websockets import WebSocketDisconnect

    room_code, token = await _create_game_and_get_token(client, auth_headers)

    ctx1 = sync_client.websocket_connect(f"/ws/{room_code}?token={token}")
    ws1 = ctx1.__enter__()
    ws1.receive_json()  # initial LOBBY_STATE_UPDATED

    # Opening a second connection from the same user.
    ctx2 = sync_client.websocket_connect(f"/ws/{room_code}?token={token}")
    ws2 = ctx2.__enter__()
    # Second connection receives LOBBY_STATE_UPDATED as part of connect flow.
    ws2.receive_json()

    # First WS should be closed now. receive_json raises WebSocketDisconnect
    # on the close frame.
    with pytest.raises((WebSocketDisconnect, RuntimeError)):
        # Drain any buffered messages and then the close should surface.
        for _ in range(5):
            ws1.receive_json()

    # Second WS is still functional — PING/PONG proves it.
    ws2.send_json({"action": "PING", "payload": {}})
    pong = ws2.receive_json()
    assert pong["event"] == "PONG"

    try:
        ctx1.__exit__(None, None, None)
    except Exception:
        pass
    ctx2.__exit__(None, None, None)


async def test_duplicate_play_card_second_tab_wins(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """The 'two tabs' scenario: the second WS takes over and can drive state;
    the first WS is closed by the manager before any PLAY_CARD races can
    occur. This encodes the duplicate-connection-handling invariant."""
    from starlette.websockets import WebSocketDisconnect

    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    # Open one WS for the NORTH player.
    ctx1 = sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}")
    ws1 = ctx1.__enter__()
    ws1.receive_json()  # LOBBY_STATE_UPDATED

    # A second tab for the same user.
    ctx2 = sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}")
    ws2 = ctx2.__enter__()
    ws2.receive_json()  # LOBBY_STATE_UPDATED

    # ws1 is closed; sending on it may raise.
    try:
        ws1.send_json({"action": "PING", "payload": {}})
        # Receive should surface the close regardless.
        with pytest.raises((WebSocketDisconnect, RuntimeError)):
            for _ in range(5):
                ws1.receive_json()
    except (WebSocketDisconnect, RuntimeError):
        pass

    # ws2 remains the sole authoritative connection.
    ws2.send_json({"action": "PING", "payload": {}})
    assert ws2.receive_json()["event"] == "PONG"

    try:
        ctx1.__exit__(None, None, None)
    except Exception:
        pass
    ctx2.__exit__(None, None, None)
