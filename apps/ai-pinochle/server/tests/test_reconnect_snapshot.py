"""WS integration tests for `_send_game_state_on_reconnect`.

This is 190 lines of branching logic in `app/websocket/routes.py` that fires
on every WS connect. Each phase has its own snapshot shape. We test each
branch by:

  1. Seating 4 users through the normal flow.
  2. Force-mutating `games.current_state_json` to the target phase.
  3. Opening a fresh WS and asserting the emitted snapshot events.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker
from starlette.testclient import TestClient

from app.models.game import Game
from tests.conftest import engine
from tests.test_websocket import _fill_seats_and_get_tokens

pytestmark = pytest.mark.anyio


async def _set_state(room_code: str, state: dict) -> None:
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        game = (
            await db.execute(select(Game).where(Game.room_code == room_code))
        ).scalar_one()
        await db.execute(
            update(Game).where(Game.id == game.id).values(
                current_state_json=state, version=game.version + 1
            )
        )
        await db.commit()


def _drain_until(ws, event_name: str, max_messages: int = 20) -> dict:
    for _ in range(max_messages):
        msg = ws.receive_json()
        if msg.get("event") == event_name:
            return msg
    raise AssertionError(f"Never received {event_name} in {max_messages} messages")


def _drain_all(ws, max_messages: int = 20) -> list[dict]:
    """Drain messages until none come for a bit. Uses non-blocking pattern."""
    seen = []
    import queue
    # TestClient's websocket queues messages in a deque; we use receive_json
    # with a timeout approach via json fallbacks. But since we don't have
    # a timeout on receive_json, rely on `_drain_until` instead.
    return seen


# ---------------------------------------------------------------------------
# LOBBY_WAITING — snapshot is a no-op (only LOBBY_STATE_UPDATED is sent by
# the normal connect handler, not by _send_game_state_on_reconnect).
# ---------------------------------------------------------------------------


async def test_reconnect_lobby_phase_sends_only_lobby_state(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    # Leave it in LOBBY_WAITING (default post-seating state).
    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        msg = ws.receive_json()
        assert msg["event"] == "LOBBY_STATE_UPDATED"
        assert msg["payload"]["your_seat"] == "NORTH"


# ---------------------------------------------------------------------------
# BIDDING — snapshot sends HAND_DEALT + BIDDING_TURN
# ---------------------------------------------------------------------------


async def test_reconnect_bidding_phase_sends_hand_and_turn(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    await _set_state(room_code, {
        "phase": "BIDDING",
        "game_scores": {"NS": 0, "EW": 0},
        "current_hand": {
            "hand_number": 1,
            "dealer_seat": "NORTH",
            "bidding": {
                "winning_bid": 27,
                "winning_seat": "EAST",
                "is_shoot_the_moon": False,
                "next_to_act_seat": "SOUTH",
                "passed_seats": [],
                "auction": [],
            },
        },
        "player_hands": {
            "NORTH": ["AH", "KH", "QH", "JH", "10H", "9H", "AS", "KS", "QS", "JS", "10S", "9S"],
            "EAST": [], "SOUTH": [], "WEST": [],
        },
    })

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED
        hand_dealt = ws.receive_json()
        assert hand_dealt["event"] == "HAND_DEALT"
        assert len(hand_dealt["payload"]["cards"]) == 12

        bidding_turn = ws.receive_json()
        assert bidding_turn["event"] == "BIDDING_TURN"
        assert bidding_turn["payload"]["current_highest_bid"] == 27
        assert bidding_turn["payload"]["highest_bidder_seat"] == "EAST"
        assert bidding_turn["payload"]["next_to_act_seat"] == "SOUTH"
        assert bidding_turn["payload"]["minimum_valid_bid"] == 28


# ---------------------------------------------------------------------------
# NAMING_TRUMP — snapshot sends BIDDING_COMPLETED
# ---------------------------------------------------------------------------


async def test_reconnect_naming_trump_phase(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    await _set_state(room_code, {
        "phase": "NAMING_TRUMP",
        "game_scores": {"NS": 0, "EW": 0},
        "current_hand": {
            "hand_number": 1,
            "dealer_seat": "WEST",
            "bidding": {
                "winning_bid": 30,
                "winning_seat": "NORTH",
                "is_shoot_the_moon": True,
                "next_to_act_seat": None,
                "passed_seats": ["EAST", "SOUTH", "WEST"],
                "auction": [],
            },
        },
        "player_hands": {s: ["AH"] * 12 for s in ["NORTH", "EAST", "SOUTH", "WEST"]},
    })

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED
        ws.receive_json()  # HAND_DEALT
        bc = ws.receive_json()
        assert bc["event"] == "BIDDING_COMPLETED"
        assert bc["payload"]["winning_seat"] == "NORTH"
        assert bc["payload"]["winning_bid"] == 30
        assert bc["payload"]["is_shoot_the_moon"] is True


# ---------------------------------------------------------------------------
# PASSING_CARDS — snapshot sends TRUMP_NAMED + PASSING_PHASE_STARTED
# (+ CARDS_PASSED if one partner already submitted)
# ---------------------------------------------------------------------------


async def test_reconnect_passing_phase_without_submissions(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    await _set_state(room_code, {
        "phase": "PASSING_CARDS",
        "game_scores": {"NS": 0, "EW": 0},
        "current_hand": {
            "hand_number": 1,
            "dealer_seat": "NORTH",
            "trump_suit": "HEARTS",
            "bidding": {
                "winning_bid": 25,
                "winning_seat": "NORTH",
                "is_shoot_the_moon": False,
            },
            "card_passing": {
                "bidding_team": "NS",
                "bidder_seat": "NORTH",
                "partner_seat": "SOUTH",
                "submitted": {},
            },
        },
        "player_hands": {s: ["AH"] * 12 for s in ["NORTH", "EAST", "SOUTH", "WEST"]},
    })

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED
        ws.receive_json()  # HAND_DEALT
        tn = ws.receive_json()
        assert tn["event"] == "TRUMP_NAMED"
        assert tn["payload"]["trump_suit"] == "HEARTS"
        assert tn["payload"]["bidding_team"] == "NS"

        pp = ws.receive_json()
        assert pp["event"] == "PASSING_PHASE_STARTED"
        assert pp["payload"]["bidder_seat"] == "NORTH"
        assert pp["payload"]["partner_seat"] == "SOUTH"


async def test_reconnect_passing_phase_with_one_submission(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    await _set_state(room_code, {
        "phase": "PASSING_CARDS",
        "game_scores": {"NS": 0, "EW": 0},
        "current_hand": {
            "hand_number": 1,
            "dealer_seat": "NORTH",
            "trump_suit": "SPADES",
            "bidding": {
                "winning_bid": 28,
                "winning_seat": "EAST",
                "is_shoot_the_moon": False,
            },
            "card_passing": {
                "bidding_team": "EW",
                "bidder_seat": "EAST",
                "partner_seat": "WEST",
                "submitted": {"EAST": ["AH", "KH", "QH"]},
            },
        },
        "player_hands": {s: ["AH"] * 12 for s in ["NORTH", "EAST", "SOUTH", "WEST"]},
    })

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED
        ws.receive_json()  # HAND_DEALT
        ws.receive_json()  # TRUMP_NAMED
        ws.receive_json()  # PASSING_PHASE_STARTED
        cp = ws.receive_json()
        assert cp["event"] == "CARDS_PASSED"
        assert cp["payload"]["submitted_seats"] == ["EAST"]
        assert cp["payload"]["seat"] == "EAST"


# ---------------------------------------------------------------------------
# SHOWING_MELD — snapshot sends MELD_BROADCAST (+ MELD_ACKNOWLEDGED if any ack)
# ---------------------------------------------------------------------------


async def test_reconnect_showing_meld_with_acks(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    await _set_state(room_code, {
        "phase": "SHOWING_MELD",
        "game_scores": {"NS": 0, "EW": 0},
        "current_hand": {
            "hand_number": 1,
            "dealer_seat": "NORTH",
            "trump_suit": "DIAMONDS",
            "bidding": {
                "winning_bid": 25,
                "winning_seat": "NORTH",
                "is_shoot_the_moon": False,
            },
            "team_meld": {"NS": 20, "EW": 10},
            "player_melds": {
                "NORTH": {"melds": [], "total": 10},
                "EAST": {"melds": [], "total": 5},
                "SOUTH": {"melds": [], "total": 10},
                "WEST": {"melds": [], "total": 5},
            },
            "meld_acknowledged_seats": ["NORTH", "EAST"],
        },
        "player_hands": {s: ["AH"] * 12 for s in ["NORTH", "EAST", "SOUTH", "WEST"]},
    })

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED
        ws.receive_json()  # HAND_DEALT
        mb = ws.receive_json()
        assert mb["event"] == "MELD_BROADCAST"
        assert mb["payload"]["trump_suit"] == "DIAMONDS"
        assert mb["payload"]["team_meld"] == {"NS": 20, "EW": 10}
        assert mb["payload"]["winning_bid"] == 25
        # Reconnect-only fields so the client can render "Waiting on X" and
        # the cumulative scoreboard without waiting for the next event.
        assert mb["payload"]["acknowledged_seats"] == ["NORTH", "EAST"]
        assert mb["payload"]["game_scores"] == {"NS": 0, "EW": 0}

        ma = ws.receive_json()
        assert ma["event"] == "MELD_ACKNOWLEDGED"
        assert ma["payload"]["seat"] == "EAST"
        assert ma["payload"]["acknowledged_seats"] == ["NORTH", "EAST"]


# ---------------------------------------------------------------------------
# TRICK_PLAYING — most complex branch. Covers MELD_PHASE_COMPLETED + TRICK_STATE
# + card replay + YOUR_TURN with legal_cards when it's this user's turn.
# ---------------------------------------------------------------------------


async def test_reconnect_trick_playing_mid_trick_your_turn(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    # NORTH (tokens[0]) is seated at NORTH, and it's NORTH's turn to act.
    await _set_state(room_code, {
        "phase": "TRICK_PLAYING",
        "game_scores": {"NS": 0, "EW": 0},
        "current_hand": {
            "hand_number": 1,
            "dealer_seat": "WEST",
            "trump_suit": "HEARTS",
            "bidding": {
                "winning_bid": 25,
                "winning_seat": "NORTH",
                "is_shoot_the_moon": False,
            },
            "team_meld": {"NS": 10, "EW": 5},
            "trick_play": {
                "trick_number": 3,
                "next_to_act_seat": "NORTH",
                "led_seat": "WEST",
                "cards_played": [
                    {"seat": "WEST", "card": "9C"},
                ],
                "tricks_taken": {"NS": 1, "EW": 1},
                "trick_scores": {"NS": 3, "EW": 2},
            },
        },
        "player_hands": {
            "NORTH": ["AC", "9H", "KD"],  # has clubs, must follow.
            "EAST": [], "SOUTH": [], "WEST": [],
        },
    })

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED
        ws.receive_json()  # HAND_DEALT
        mpc = ws.receive_json()
        assert mpc["event"] == "MELD_PHASE_COMPLETED"
        assert mpc["payload"]["team_meld"] == {"NS": 10, "EW": 5}
        assert mpc["payload"]["first_to_act_seat"] == "WEST"

        ts = ws.receive_json()
        assert ts["event"] == "TRICK_STATE"
        assert ts["payload"]["trick_number"] == 3
        assert ts["payload"]["tricks_taken"] == {"NS": 1, "EW": 1}

        # Replay card already on the table.
        cp = ws.receive_json()
        assert cp["event"] == "CARD_PLAYED"
        assert cp["payload"]["seat"] == "WEST"
        assert cp["payload"]["card"] == "9C"

        # YOUR_TURN for NORTH with legal_cards computed.
        yt = ws.receive_json()
        assert yt["event"] == "YOUR_TURN"
        assert yt["payload"]["seat"] == "NORTH"
        assert yt["payload"]["trick_number"] == 3
        assert yt["payload"]["led_suit"] == "C"
        # NORTH holds AC — must follow suit; AC wins so must-head applies.
        assert yt["payload"]["legal_cards"] == ["AC"]
        assert yt["payload"]["currently_winning"]["seat"] == "WEST"


async def test_reconnect_trick_playing_not_your_turn(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """Other seat's turn -> no YOUR_TURN sent."""
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    await _set_state(room_code, {
        "phase": "TRICK_PLAYING",
        "game_scores": {"NS": 0, "EW": 0},
        "current_hand": {
            "hand_number": 1,
            "dealer_seat": "WEST",
            "trump_suit": "HEARTS",
            "bidding": {
                "winning_bid": 25,
                "winning_seat": "EAST",
                "is_shoot_the_moon": False,
            },
            "team_meld": {"NS": 10, "EW": 5},
            "trick_play": {
                "trick_number": 5,
                "next_to_act_seat": "EAST",
                "led_seat": "EAST",
                "cards_played": [],
                "tricks_taken": {"NS": 2, "EW": 2},
                "trick_scores": {"NS": 5, "EW": 4},
            },
        },
        "player_hands": {
            "NORTH": ["AC"], "EAST": ["9H"], "SOUTH": [], "WEST": [],
        },
    })

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED
        ws.receive_json()  # HAND_DEALT
        # MELD_PHASE_COMPLETED + TRICK_STATE. No cards replayed (empty trick).
        msgs = []
        for _ in range(2):
            msgs.append(ws.receive_json())
        event_names = [m["event"] for m in msgs]
        assert event_names == ["MELD_PHASE_COMPLETED", "TRICK_STATE"]

        # Send a PING to flush the channel; should NOT have a YOUR_TURN queued.
        ws.send_json({"action": "PING", "payload": {}})
        pong = ws.receive_json()
        assert pong["event"] == "PONG"


# ---------------------------------------------------------------------------
# HAND_COMPLETE — snapshot sends HAND_COMPLETED (+ HAND_RESULT_ACKNOWLEDGED)
# ---------------------------------------------------------------------------


async def test_reconnect_hand_complete_with_acks(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    await _set_state(room_code, {
        "phase": "HAND_COMPLETE",
        "game_scores": {"NS": 50, "EW": 30},
        "current_hand": {
            "hand_number": 2,
            "dealer_seat": "NORTH",
            "bidding": {
                "winning_bid": 25,
                "winning_seat": "NORTH",
                "is_shoot_the_moon": False,
            },
            "team_meld": {"NS": 15, "EW": 5},
            "trick_play": {
                "trick_number": 12,
                "tricks_taken": {"NS": 8, "EW": 4},
                "trick_scores": {"NS": 15, "EW": 10},
            },
            "score_deltas": {"NS": 30, "EW": 15},
            "hand_result_acknowledged_seats": ["NORTH"],
        },
        "player_hands": {s: [] for s in ["NORTH", "EAST", "SOUTH", "WEST"]},
    })

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED
        ws.receive_json()  # HAND_DEALT (empty list for HAND_COMPLETE reconnect)
        hc = ws.receive_json()
        assert hc["event"] == "HAND_COMPLETED"
        assert hc["payload"]["bid"] == 25
        assert hc["payload"]["bidding_team"] == "NS"
        assert hc["payload"]["score_deltas"] == {"NS": 30, "EW": 15}
        assert hc["payload"]["game_scores"] == {"NS": 50, "EW": 30}
        # Reconnect-only: "Waiting on X" state from the HandResult screen.
        assert hc["payload"]["acknowledged_seats"] == ["NORTH"]

        hra = ws.receive_json()
        assert hra["event"] == "HAND_RESULT_ACKNOWLEDGED"
        assert hra["payload"]["seat"] == "NORTH"
        assert hra["payload"]["acknowledged_seats"] == ["NORTH"]


# ---------------------------------------------------------------------------
# GAME_OVER — snapshot re-emits GAME_OVER (+ REMATCH_REQUESTED if any pending)
# ---------------------------------------------------------------------------


async def test_reconnect_game_over_with_pending_rematch_votes(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """2 of 4 players have requested rematch → pending_rematch_seats mirrors."""
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    # The game must be COMPLETED to accept connections in GAME_OVER phase;
    # _set_state only writes current_state_json, so also flip status.
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        game = (
            await db.execute(select(Game).where(Game.room_code == room_code))
        ).scalar_one()
        await db.execute(
            update(Game).where(Game.id == game.id).values(
                status="COMPLETED",
                current_state_json={
                    "phase": "GAME_OVER",
                    "winner_team": "NS",
                    "game_scores": {"NS": 152, "EW": 88},
                    "pending_rematch_seats": ["NORTH", "EAST"],
                    "current_hand": {},
                    "player_hands": {s: [] for s in ["NORTH", "EAST", "SOUTH", "WEST"]},
                },
                version=game.version + 1,
            )
        )
        await db.commit()

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED
        ws.receive_json()  # HAND_DEALT (empty hand)
        go = ws.receive_json()
        assert go["event"] == "GAME_OVER"
        assert go["payload"]["winner_team"] == "NS"
        assert go["payload"]["final_scores"] == {"NS": 152, "EW": 88}
        assert go["payload"]["pending_rematch_seats"] == ["NORTH", "EAST"]

        rr = ws.receive_json()
        assert rr["event"] == "REMATCH_REQUESTED"
        assert rr["payload"]["seat"] == "EAST"
        assert rr["payload"]["pending_seats"] == ["NORTH", "EAST"]


async def test_reconnect_game_over_without_pending_rematch_votes(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """No rematch votes yet → GAME_OVER only, no trailing REMATCH_REQUESTED."""
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        game = (
            await db.execute(select(Game).where(Game.room_code == room_code))
        ).scalar_one()
        await db.execute(
            update(Game).where(Game.id == game.id).values(
                status="COMPLETED",
                current_state_json={
                    "phase": "GAME_OVER",
                    "winner_team": "EW",
                    "game_scores": {"NS": 120, "EW": 150},
                    "pending_rematch_seats": [],
                    "current_hand": {},
                    "player_hands": {s: [] for s in ["NORTH", "EAST", "SOUTH", "WEST"]},
                },
                version=game.version + 1,
            )
        )
        await db.commit()

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED
        ws.receive_json()  # HAND_DEALT
        go = ws.receive_json()
        assert go["event"] == "GAME_OVER"
        assert go["payload"]["pending_rematch_seats"] == []

        # No trailing REMATCH_REQUESTED — flush via PING to prove it.
        ws.send_json({"action": "PING", "payload": {}})
        pong = ws.receive_json()
        assert pong["event"] == "PONG"


# ---------------------------------------------------------------------------
# game_scores always present — mid-hand reconnect across phases.
# ---------------------------------------------------------------------------


async def test_reconnect_mid_hand_includes_nonzero_cumulative_game_scores(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """A reconnect during TRICK_PLAYING in hand 3 must carry the cumulative
    scoreboard so the on-screen number doesn't blink back to 0/0."""
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    await _set_state(room_code, {
        "phase": "TRICK_PLAYING",
        "game_scores": {"NS": 74, "EW": 61},
        "current_hand": {
            "hand_number": 3,
            "dealer_seat": "EAST",
            "trump_suit": "SPADES",
            "bidding": {
                "winning_bid": 28,
                "winning_seat": "SOUTH",
                "is_shoot_the_moon": False,
            },
            "team_meld": {"NS": 12, "EW": 8},
            "trick_play": {
                "trick_number": 2,
                "next_to_act_seat": "EAST",
                "led_seat": "EAST",
                "cards_played": [],
                "tricks_taken": {"NS": 1, "EW": 0},
                "trick_scores": {"NS": 4, "EW": 0},
            },
        },
        "player_hands": {
            "NORTH": ["AC", "KD"], "EAST": ["9H"], "SOUTH": [], "WEST": [],
        },
    })

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED
        ws.receive_json()  # HAND_DEALT
        mpc = ws.receive_json()
        assert mpc["event"] == "MELD_PHASE_COMPLETED"
        assert mpc["payload"]["game_scores"] == {"NS": 74, "EW": 61}

        ts = ws.receive_json()
        assert ts["event"] == "TRICK_STATE"
        assert ts["payload"]["game_scores"] == {"NS": 74, "EW": 61}


async def test_reconnect_bidding_includes_nonzero_cumulative_game_scores(
    client: AsyncClient, sync_client: TestClient, auth_headers: dict
):
    """Same cumulative-score guarantee but for the BIDDING-phase snapshot."""
    room_code, tokens = await _fill_seats_and_get_tokens(
        client, sync_client, auth_headers
    )
    await _set_state(room_code, {
        "phase": "BIDDING",
        "game_scores": {"NS": 42, "EW": 35},
        "current_hand": {
            "hand_number": 2,
            "dealer_seat": "NORTH",
            "bidding": {
                "winning_bid": 26,
                "winning_seat": "EAST",
                "is_shoot_the_moon": False,
                "next_to_act_seat": "SOUTH",
                "passed_seats": [],
                "auction": [],
            },
        },
        "player_hands": {s: ["AH"] * 12 for s in ["NORTH", "EAST", "SOUTH", "WEST"]},
    })

    with sync_client.websocket_connect(f"/ws/{room_code}?token={tokens[0]}") as ws:
        ws.receive_json()  # LOBBY_STATE_UPDATED
        ws.receive_json()  # HAND_DEALT
        bt = ws.receive_json()
        assert bt["event"] == "BIDDING_TURN"
        assert bt["payload"]["game_scores"] == {"NS": 42, "EW": 35}
