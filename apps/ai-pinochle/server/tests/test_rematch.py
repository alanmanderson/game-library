"""Rematch / leave-to-lobby flow tests."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from starlette.testclient import TestClient

from app.models.game import Game
from tests.conftest import _persistent_conn, engine
from tests.test_websocket import (
    SEATS,
    _fill_seats_and_get_tokens,
    _open_four_ws,
)

pytestmark = pytest.mark.anyio


async def _force_game_over(room_code: str) -> None:
    """Promote a freshly-seated game to GAME_OVER directly via DB.

    Bypasses playing through 12 tricks; we're testing the rematch transition,
    not full game flow.
    """
    from sqlalchemy.ext.asyncio import async_sessionmaker

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        result = await db.execute(select(Game).where(Game.room_code == room_code))
        game = result.scalar_one()
        # Build a minimal GAME_OVER state with the 4 seats.
        new_state = dict(game.current_state_json or {})
        new_state.update({
            "phase": "GAME_OVER",
            "game_scores": {"NS": 152, "EW": 80},
            "winner_team": "NS",
            "pending_rematch_seats": [],
            "current_hand": new_state.get("current_hand") or {
                "hand_number": 5,
                "dealer_seat": "WEST",
                "bidding": {
                    "winning_bid": 30,
                    "winning_seat": "NORTH",
                    "is_shoot_the_moon": False,
                    "next_to_act_seat": "WEST",
                    "passed_seats": [],
                },
            },
        })
        await db.execute(
            update(Game).where(Game.id == game.id).values(
                current_state_json=new_state,
                status="COMPLETED",
                ended_at=datetime.now(timezone.utc),
                version=game.version + 1,
            )
        )
        await db.commit()


async def test_rematch_request_when_not_game_over(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """REMATCH_REQUEST during LOBBY_WAITING returns REMATCH_NOT_AVAILABLE."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # initial LOBBY_STATE_UPDATED
        ws.send_json({"action": "REMATCH_REQUEST", "payload": {}})
        data = ws.receive_json()
        assert data["event"] == "ERROR"
        assert data["payload"]["code"] == "REMATCH_NOT_AVAILABLE"


async def test_rematch_happy_path(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """All 4 players request rematch → REMATCH_STARTED + fresh BIDDING phase."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    await _force_game_over(room_code)

    websockets, contexts = _open_four_ws(sync_client, room_code, tokens)
    try:
        # First 3 players request — each gets a REMATCH_REQUESTED broadcast.
        for i in range(3):
            websockets[i].send_json({"action": "REMATCH_REQUEST", "payload": {}})
            for ws in websockets:
                msg = ws.receive_json()
                assert msg["event"] == "REMATCH_REQUESTED"
                assert msg["payload"]["seat"] == SEATS[i]
                assert len(msg["payload"]["pending_seats"]) == i + 1

        # Duplicate from player 0 should be rejected.
        websockets[0].send_json({"action": "REMATCH_REQUEST", "payload": {}})
        msg = websockets[0].receive_json()
        assert msg["event"] == "ERROR"
        assert msg["payload"]["code"] == "ALREADY_REQUESTED_REMATCH"

        # 4th player triggers REMATCH_STARTED + HAND_DEALT (private) + BIDDING_TURN
        websockets[3].send_json({"action": "REMATCH_REQUEST", "payload": {}})
        events_seen = {seat: [] for seat in SEATS}
        for i, ws in enumerate(websockets):
            for _ in range(3):
                msg = ws.receive_json()
                events_seen[SEATS[i]].append(msg["event"])

        for seat in SEATS:
            assert "REMATCH_STARTED" in events_seen[seat]
            assert "HAND_DEALT" in events_seen[seat]
            assert "BIDDING_TURN" in events_seen[seat]
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)

    # Game scores reset, status back to IN_PROGRESS.
    cur = _persistent_conn.cursor()
    cur.execute(
        "SELECT status, ns_total_score, ew_total_score FROM games WHERE room_code = ?",
        (room_code,),
    )
    row = cur.fetchone()
    assert row[0] == "IN_PROGRESS"
    assert row[1] == 0
    assert row[2] == 0


async def test_leave_to_lobby_closes_socket(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """LEAVE_TO_LOBBY sends LEFT_TO_LOBBY then closes the WS from server side."""
    from starlette.websockets import WebSocketDisconnect

    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)

    saw_left_event = False
    saw_close = False
    try:
        with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
            ws.receive_json()  # LOBBY_STATE_UPDATED
            ws.send_json({"action": "LEAVE_TO_LOBBY", "payload": {}})
            for _ in range(3):
                try:
                    msg = ws.receive_json()
                    if msg.get("event") == "LEFT_TO_LOBBY":
                        saw_left_event = True
                except WebSocketDisconnect:
                    saw_close = True
                    break
                except RuntimeError:
                    saw_close = True
                    break
    except (WebSocketDisconnect, RuntimeError):
        saw_close = True

    assert saw_left_event
    assert saw_close
