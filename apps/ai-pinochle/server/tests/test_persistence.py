"""Verify hands/bids/tricks rows are written at the right transition points."""
import pytest
from httpx import AsyncClient
from starlette.testclient import TestClient

from tests.conftest import _persistent_conn
from tests.test_websocket import (
    SEATS,
    _declare_trump_and_get_meld,
    _end_bidding,
    _fill_seats_and_get_tokens,
    _start_game_and_get_bidding_state,
)

pytestmark = pytest.mark.anyio


def _count(table: str) -> int:
    cur = _persistent_conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    return cur.fetchone()[0]


def _query_one(sql: str):
    cur = _persistent_conn.cursor()
    cur.execute(sql)
    return cur.fetchone()


def _query_all(sql: str):
    cur = _persistent_conn.cursor()
    cur.execute(sql)
    return cur.fetchall()


async def test_hand_and_bids_inserted_after_declare_trump(
    client: AsyncClient,
    sync_client: TestClient,
    auth_headers: dict,
):
    """After DECLARE_TRUMP completes, a `hands` row + N `bids` rows exist."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt, hands = _start_game_and_get_bidding_state(
        sync_client, room_code, tokens
    )
    try:
        winner_seat, winner_idx = _end_bidding(websockets, bt)
        _declare_trump_and_get_meld(websockets, winner_idx, hands, "HEARTS")
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)

    assert _count("hands") == 1
    # 1 bid + 3 passes = 4 auction entries.
    assert _count("bids") == 4

    hand_row = _query_one(
        "SELECT hand_number, winning_bid_amount, trump_suit FROM hands"
    )
    assert hand_row[0] == 1
    assert hand_row[1] == 25
    assert hand_row[2] == "HEARTS"

    bid_rows = _query_all("SELECT bid_amount FROM bids ORDER BY bid_sequence")
    bid_amounts = [r[0] for r in bid_rows]
    assert bid_amounts.count(25) == 1
    assert bid_amounts.count(None) == 3


async def test_no_persistence_until_trump_declared(
    client: AsyncClient,
    sync_client: TestClient,
    auth_headers: dict,
):
    """Bidding alone (no DECLARE_TRUMP yet) should not write hands/bids rows."""
    room_code, tokens = await _fill_seats_and_get_tokens(client, sync_client, auth_headers)
    websockets, contexts, bt, hands = _start_game_and_get_bidding_state(
        sync_client, room_code, tokens
    )
    try:
        # First player bids 25, no further moves.
        first_bidder = bt["next_to_act_seat"]
        idx = SEATS.index(first_bidder)
        websockets[idx].send_json({"action": "SUBMIT_BID", "payload": {"amount": 25}})
        for ws in websockets:
            ws.receive_json()  # drain BIDDING_TURN broadcast
    finally:
        for ctx in contexts:
            ctx.__exit__(None, None, None)

    assert _count("hands") == 0
    assert _count("bids") == 0
    assert _count("tricks") == 0
