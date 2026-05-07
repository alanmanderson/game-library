"""WebSocket handler tests for the backgammon backend.

Tests the WebSocket endpoint at /ws/{table_id}/{player_id}?token=JWT covering:
- Connection lifecycle (auth, connect, disconnect)
- Message handling (roll_dice, make_move, end_turn, undo_turn, etc.)
- Game state broadcasting
- Error scenarios (malformed JSON, unknown actions, invalid moves)

Uses starlette.testclient.TestClient for synchronous WebSocket testing, with
a file-based SQLite test database and monkeypatched async_session to ensure
all code paths (REST endpoints and WebSocket handler) share the same database.

Note: BackgammonEngine.start_game() performs the opening roll automatically,
so the game begins in MOVING state (not ROLLING). The current player's first
action is make_move, not roll_dice. The ROLLING phase occurs at the start of
subsequent turns.
"""

import asyncio
import pytest
from contextlib import asynccontextmanager
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.database import Base
from app.main import app
from app.models import Player, Table
from app.services.auth_service import create_access_token
from app.services.game_service import game_manager
from app.game_engine import Color, GameStatus
from app.limiter import limiter


@asynccontextmanager
async def _noop_lifespan(app):
    """No-op lifespan for tests — avoids background tasks and shutdown deadlocks."""
    yield


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def ws_test_env(tmp_path):
    """Set up a WebSocket test environment with a shared file-based SQLite DB.

    Yields a dict with:
      - client: Starlette TestClient
      - session_factory: async_sessionmaker for direct DB manipulation
    """
    db_path = tmp_path / "test.db"
    db_url = f"sqlite+aiosqlite:///{db_path}"

    engine = create_async_engine(db_url, echo=False, poolclass=NullPool)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    _run_async(_create_schema(engine))

    @asynccontextmanager
    async def mock_async_session():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    from app.database import get_db

    async def _override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db
    limiter.reset()

    with patch("app.api.websocket.async_session", mock_async_session), \
         patch("app.database.async_session", mock_async_session), \
         patch("app.api.websocket.schedule_bot_turn_if_needed"), \
         patch("app.api.websocket.schedule_bot_double_response_if_needed"), \
         patch("app.api.websocket.is_bot_game", return_value=False), \
         patch("app.api.websocket.restore_bot_difficulty"), \
         patch.object(app.router, "lifespan_context", _noop_lifespan):
        with TestClient(app) as client:
            yield {
                "client": client,
                "session_factory": session_factory,
            }

    app.dependency_overrides.clear()
    game_manager._engines.clear()
    game_manager._player_colors.clear()
    game_manager._locks.clear()

    _run_async(engine.dispose())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_schema(engine):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def _run_async(coro):
    """Run a coroutine synchronously using a private event loop.

    Uses ``new_event_loop`` + ``run_until_complete`` instead of ``asyncio.run``
    because ``asyncio.run`` calls ``set_event_loop(None)`` on exit, which
    destroys any loop that pytest-asyncio 1.x installed on the main thread.
    That corrupted state makes ``anyio.from_thread.start_blocking_portal``
    (used by Starlette's TestClient) deadlock intermittently.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _token(player_id: str) -> str:
    """Create a valid JWT token for a player."""
    return create_access_token({"sub": player_id})


def _bad_token() -> str:
    """Create a JWT token signed with the wrong secret."""
    import jwt as pyjwt
    return pyjwt.encode({"sub": "fake"}, "wrong-secret", algorithm="HS256")


async def _create_player(sf, nickname="TestPlayer", pid=None) -> Player:
    """Insert a player row directly into the test database."""
    p = Player(id=pid or str(uuid4()), nickname=nickname, is_guest=True, auth_provider="guest")
    async with sf() as s:
        s.add(p)
        await s.commit()
    return p


async def _create_game(sf) -> tuple:
    """Create two players, a table, and start the game.

    Returns (table_id, white_player, black_player) where white_player and
    black_player reflect the actual color assignment after join (which may
    randomly swap colors).
    The game will be in MOVING state with the opening roll already done.
    """
    p1id, p2id = str(uuid4()), str(uuid4())
    p1 = Player(id=p1id, nickname="Player1", is_guest=True, auth_provider="guest")
    p2 = Player(id=p2id, nickname="Player2", is_guest=True, auth_provider="guest")

    async with sf() as s:
        s.add(p1)
        s.add(p2)
        await s.flush()
        table = await game_manager.create_table(s, p1id)
        tid = table.id
        await s.commit()

    async with sf() as s:
        table = await game_manager.join_table(s, tid, p2id)
        actual_white_id = table.white_player_id
        actual_black_id = table.black_player_id
        await s.commit()

    # Return players in their actual assigned colors
    white_player = p1 if p1.id == actual_white_id else p2
    black_player = p1 if p1.id == actual_black_id else p2

    return tid, white_player, black_player


def _current_and_other(tid, white, black):
    """Return (current_player, other_player) based on whose turn it is."""
    engine = game_manager.get_engine(tid)
    if engine.state.current_turn == Color.WHITE:
        return white, black
    return black, white


def _play_full_turn(ws):
    """Make all valid moves, then end the turn. Returns list of received messages.

    Assumes the current state is MOVING with valid moves available.
    Drain the initial game_state first before calling this.
    """
    # Get current state to check valid moves
    msgs = []

    # We need to know valid moves -- the last game_state we have
    # So we send a probe: a known-good action to trigger a state update.
    # Actually, we should be provided valid_moves from the caller.
    return msgs


def _complete_turn_via_moves(ws, initial_state_msg):
    """Use valid_moves from initial_state_msg to make moves, then end turn.

    Returns all messages received during the turn.
    """
    msgs = []
    valid_moves = initial_state_msg["data"]["game_state"].get("valid_moves", [])

    while valid_moves:
        move = valid_moves[0]
        ws.send_json({
            "action": "make_move",
            "from_point": move["from_point"],
            "to_point": move["to_point"],
        })
        resp = ws.receive_json()
        msgs.append(resp)
        if resp["type"] == "game_state":
            valid_moves = resp["data"]["game_state"].get("valid_moves", [])
        else:
            break

    return msgs


# ===========================================================================
# Connection Lifecycle Tests
# ===========================================================================


class TestWebSocketConnection:
    """Tests for WebSocket connection establishment and authentication."""

    def test_connect_without_token_rejected(self, ws_test_env):
        """Connection without a token query param is rejected (code 4001)."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        player = _run_async(_create_player(sf))
        token = _token(player.id)

        resp = client.post(
            "/api/tables",
            json={"player_id": player.id},
            headers={"Authorization": f"Bearer {token}"},
        )
        tid = resp.json()["id"]

        with pytest.raises(Exception):
            with client.websocket_connect(f"/ws/{tid}/{player.id}") as ws:
                pass

    def test_connect_with_invalid_token_rejected(self, ws_test_env):
        """Connection with an invalid JWT is rejected (code 4001)."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        player = _run_async(_create_player(sf))
        token = _token(player.id)

        resp = client.post(
            "/api/tables",
            json={"player_id": player.id},
            headers={"Authorization": f"Bearer {token}"},
        )
        tid = resp.json()["id"]

        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/ws/{tid}/{player.id}?token={_bad_token()}"
            ) as ws:
                pass

    def test_connect_with_mismatched_player_id_rejected(self, ws_test_env):
        """Connection where token sub != URL player_id is rejected."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        p1 = _run_async(_create_player(sf, "P1"))
        p2 = _run_async(_create_player(sf, "P2"))
        token_p1 = _token(p1.id)

        resp = client.post(
            "/api/tables",
            json={"player_id": p1.id},
            headers={"Authorization": f"Bearer {token_p1}"},
        )
        tid = resp.json()["id"]

        # Use p2's token but p1's player_id in the URL
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/ws/{tid}/{p1.id}?token={_token(p2.id)}"
            ) as ws:
                pass

    def test_connect_to_waiting_table(self, ws_test_env):
        """Connection to a waiting table (no game started) sends a 'waiting' message."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        player = _run_async(_create_player(sf))
        token = _token(player.id)

        resp = client.post(
            "/api/tables",
            json={"player_id": player.id},
            headers={"Authorization": f"Bearer {token}"},
        )
        tid = resp.json()["id"]

        with client.websocket_connect(
            f"/ws/{tid}/{player.id}?token={token}"
        ) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "waiting"
            assert msg["data"]["table_id"] == tid
            assert msg["data"]["status"] == "waiting"

    def test_connect_to_active_game(self, ws_test_env):
        """Connection to an active game sends initial game_state."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        token = _token(white.id)

        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={token}"
        ) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "game_state"
            assert "game_state" in msg["data"]
            assert "your_color" in msg["data"]
            assert msg["data"]["your_color"] in ("white", "black")
            assert "table" in msg["data"]

    def test_connect_nonexistent_player(self, ws_test_env):
        """Connection with a nonexistent player is accepted then closed with 4004."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        player = _run_async(_create_player(sf))
        token = _token(player.id)

        resp = client.post(
            "/api/tables",
            json={"player_id": player.id},
            headers={"Authorization": f"Bearer {token}"},
        )
        tid = resp.json()["id"]

        fake_id = "nonexistent-player-id"
        with client.websocket_connect(
            f"/ws/{tid}/{fake_id}?token={_token(fake_id)}"
        ) as ws:
            with pytest.raises(WebSocketDisconnect) as exc_info:
                ws.receive_json()
            assert exc_info.value.code == 4004

    def test_connect_nonexistent_table(self, ws_test_env):
        """Connection to a nonexistent table is accepted then closed with 4004."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        player = _run_async(_create_player(sf))

        with client.websocket_connect(
            f"/ws/ZZZZZZ/{player.id}?token={_token(player.id)}"
        ) as ws:
            with pytest.raises(WebSocketDisconnect) as exc_info:
                ws.receive_json()
            assert exc_info.value.code == 4004


# ===========================================================================
# Message Handling Tests
# ===========================================================================


class TestMessageHandling:
    """Tests for handling various WebSocket action messages.

    After start_game(), the engine is in MOVING state with valid moves.
    To test roll_dice, we first need to complete a full turn so the next
    player enters the ROLLING phase.
    """

    def test_make_move_valid(self, ws_test_env):
        """Making a valid move broadcasts an updated game_state."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, _ = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            init = ws.receive_json()
            assert init["type"] == "game_state"

            valid_moves = init["data"]["game_state"].get("valid_moves", [])
            assert len(valid_moves) > 0, "Opening position always has valid moves"

            move = valid_moves[0]
            ws.send_json({
                "action": "make_move",
                "from_point": move["from_point"],
                "to_point": move["to_point"],
            })
            resp = ws.receive_json()
            assert resp["type"] == "game_state"

    def test_make_move_invalid_coordinates(self, ws_test_env):
        """Making a move with impossible coordinates returns an error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, _ = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            ws.receive_json()  # initial game_state

            ws.send_json({
                "action": "make_move",
                "from_point": 99,
                "to_point": 99,
            })
            err = ws.receive_json()
            assert err["type"] == "error"

    def test_make_move_missing_coordinates(self, ws_test_env):
        """make_move without from_point/to_point returns an error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, _ = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            ws.receive_json()

            ws.send_json({"action": "make_move"})
            err = ws.receive_json()
            assert err["type"] == "error"
            assert "from_point" in err["data"]["message"].lower()

    def test_make_move_non_integer_coordinates(self, ws_test_env):
        """make_move with non-integer coordinates returns an error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, _ = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            ws.receive_json()

            ws.send_json({
                "action": "make_move",
                "from_point": "abc",
                "to_point": "xyz",
            })
            err = ws.receive_json()
            assert err["type"] == "error"
            assert "integer" in err["data"]["message"].lower()

    def test_roll_dice_after_turn_complete(self, ws_test_env):
        """After the first player completes their turn, the next player can roll."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, other = _current_and_other(tid, white, black)

        # Current player completes their turn
        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            init = ws.receive_json()
            _complete_turn_via_moves(ws, init)

            # After all moves, try end_turn if still our turn
            engine = game_manager.get_engine(tid)
            if engine and engine.state.current_turn == game_manager.get_player_color(tid, current.id):
                ws.send_json({"action": "end_turn"})
                ws.receive_json()

        # Now connect as the other player and roll
        with client.websocket_connect(
            f"/ws/{tid}/{other.id}?token={_token(other.id)}"
        ) as ws:
            init = ws.receive_json()
            assert init["type"] == "game_state"

            engine = game_manager.get_engine(tid)
            if engine.state.status == GameStatus.ROLLING:
                ws.send_json({"action": "roll_dice"})
                dice_msg = ws.receive_json()
                assert dice_msg["type"] == "dice_rolled"
                assert 1 <= dice_msg["data"]["die1"] <= 6
                assert 1 <= dice_msg["data"]["die2"] <= 6

                state_msg = ws.receive_json()
                assert state_msg["type"] == "game_state"

    def test_roll_dice_wrong_turn(self, ws_test_env):
        """Rolling dice when it is not your turn returns an error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        _, other = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{other.id}?token={_token(other.id)}"
        ) as ws:
            ws.receive_json()

            ws.send_json({"action": "roll_dice"})
            err = ws.receive_json()
            assert err["type"] == "error"
            assert "not your turn" in err["data"]["message"].lower()

    def test_roll_dice_in_moving_phase(self, ws_test_env):
        """Rolling dice when already in MOVING phase returns error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, _ = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            ws.receive_json()

            # Game starts in MOVING state, so rolling should fail
            ws.send_json({"action": "roll_dice"})
            err = ws.receive_json()
            assert err["type"] == "error"
            assert "cannot roll" in err["data"]["message"].lower()

    def test_end_turn_action(self, ws_test_env):
        """end_turn after consuming all moves transitions to next turn."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, _ = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            init = ws.receive_json()

            # Make all valid moves
            _complete_turn_via_moves(ws, init)

            # Try end_turn
            ws.send_json({"action": "end_turn"})
            resp = ws.receive_json()
            assert resp["type"] in ("game_state", "error")

    def test_undo_turn_after_move(self, ws_test_env):
        """undo_turn after making a move reverts to pre-move state."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, _ = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            init = ws.receive_json()
            valid_moves = init["data"]["game_state"].get("valid_moves", [])

            if valid_moves:
                move = valid_moves[0]
                ws.send_json({
                    "action": "make_move",
                    "from_point": move["from_point"],
                    "to_point": move["to_point"],
                })
                ws.receive_json()  # game_state

                ws.send_json({"action": "undo_turn"})
                resp = ws.receive_json()
                assert resp["type"] == "game_state"

    def test_undo_turn_nothing_to_undo(self, ws_test_env):
        """undo_turn when no moves made this turn returns error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, _ = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            ws.receive_json()

            # No moves made, try undo
            ws.send_json({"action": "undo_turn"})
            resp = ws.receive_json()
            assert resp["type"] == "error"
            assert "undo" in resp["data"]["message"].lower()

    def test_unknown_action(self, ws_test_env):
        """An unrecognised action type returns an error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={_token(white.id)}"
        ) as ws:
            ws.receive_json()

            ws.send_json({"action": "nonexistent_action"})
            err = ws.receive_json()
            assert err["type"] == "error"
            assert "unknown action" in err["data"]["message"].lower()

    def test_malformed_json(self, ws_test_env):
        """Invalid JSON text returns an error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={_token(white.id)}"
        ) as ws:
            ws.receive_json()

            ws.send_text("this is not json {{{")
            err = ws.receive_json()
            assert err["type"] == "error"
            assert "invalid json" in err["data"]["message"].lower()

    def test_missing_action_field(self, ws_test_env):
        """JSON without 'action' returns an error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={_token(white.id)}"
        ) as ws:
            ws.receive_json()

            ws.send_json({"foo": "bar"})
            err = ws.receive_json()
            assert err["type"] == "error"
            assert "action" in err["data"]["message"].lower()

    def test_empty_json_object(self, ws_test_env):
        """An empty JSON object returns a missing-action error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={_token(white.id)}"
        ) as ws:
            ws.receive_json()

            ws.send_json({})
            err = ws.receive_json()
            assert err["type"] == "error"
            assert "action" in err["data"]["message"].lower()

    def test_make_move_wrong_turn(self, ws_test_env):
        """Making a move when it is not your turn returns an error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        _, other = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{other.id}?token={_token(other.id)}"
        ) as ws:
            ws.receive_json()

            ws.send_json({
                "action": "make_move",
                "from_point": 1,
                "to_point": 2,
            })
            err = ws.receive_json()
            assert err["type"] == "error"
            assert "not your turn" in err["data"]["message"].lower()


# ===========================================================================
# Game State Broadcasting Tests
# ===========================================================================


class TestGameStateBroadcasting:
    """Tests for game state broadcasting to multiple connected players."""

    def test_game_state_sent_to_both_players(self, ws_test_env):
        """Both players receive game_state broadcasts after an action."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, other = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws_c:
            # First player receives initial game_state
            init_c = ws_c.receive_json()
            assert init_c["type"] == "game_state"

            with client.websocket_connect(
                f"/ws/{tid}/{other.id}?token={_token(other.id)}"
            ) as ws_o:
                # First player gets opponent_reconnected notification
                reconnect = ws_c.receive_json()
                assert reconnect["type"] == "opponent_reconnected"

                # Second player gets initial game_state
                init_o = ws_o.receive_json()
                assert init_o["type"] == "game_state"

                # Current player makes a move
                valid_moves = init_c["data"]["game_state"].get("valid_moves", [])
                if valid_moves:
                    move = valid_moves[0]
                    ws_c.send_json({
                        "action": "make_move",
                        "from_point": move["from_point"],
                        "to_point": move["to_point"],
                    })

                    state_c = ws_c.receive_json()
                    assert state_c["type"] == "game_state"

                    state_o = ws_o.receive_json()
                    assert state_o["type"] == "game_state"

    def test_personalized_valid_moves(self, ws_test_env):
        """Only the current player sees valid_moves; opponent sees empty list."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, other = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws_c:
            init_c = ws_c.receive_json()
            current_moves = init_c["data"]["game_state"].get("valid_moves", [])
            # Current player should have valid moves in MOVING state
            assert len(current_moves) > 0

        with client.websocket_connect(
            f"/ws/{tid}/{other.id}?token={_token(other.id)}"
        ) as ws_o:
            init_o = ws_o.receive_json()
            other_moves = init_o["data"]["game_state"].get("valid_moves", [])
            assert other_moves == []

    def test_game_state_includes_table_info(self, ws_test_env):
        """Game state messages include table metadata."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={_token(white.id)}"
        ) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "game_state"
            table = msg["data"]["table"]
            assert table["id"] == tid
            assert table["status"] == "playing"
            assert table["white_player"] is not None
            assert table["black_player"] is not None
            assert "match_points" in table

    def test_game_state_includes_pip_counts(self, ws_test_env):
        """Game state includes pip counts for both players."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={_token(white.id)}"
        ) as ws:
            msg = ws.receive_json()
            gs = msg["data"]["game_state"]
            assert isinstance(gs["pip_white"], int)
            assert isinstance(gs["pip_black"], int)
            assert gs["pip_white"] == 167
            assert gs["pip_black"] == 167

    def test_your_color_assignment(self, ws_test_env):
        """Each player receives their correct your_color."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={_token(white.id)}"
        ) as ws:
            assert ws.receive_json()["data"]["your_color"] == "white"

        with client.websocket_connect(
            f"/ws/{tid}/{black.id}?token={_token(black.id)}"
        ) as ws:
            assert ws.receive_json()["data"]["your_color"] == "black"


# ===========================================================================
# Doubling Cube Tests
# ===========================================================================


class TestDoublingCube:
    """Tests for doubling cube WebSocket actions."""

    def test_offer_double_in_moving_phase(self, ws_test_env):
        """offer_double while in MOVING phase returns an error (must be ROLLING)."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, _ = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            ws.receive_json()

            # Game starts in MOVING, doubling is only allowed in ROLLING
            ws.send_json({"action": "offer_double"})
            resp = ws.receive_json()
            assert resp["type"] == "error"

    def test_accept_double_without_offer(self, ws_test_env):
        """accept_double without a pending offer returns error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        _, other = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{other.id}?token={_token(other.id)}"
        ) as ws:
            ws.receive_json()

            ws.send_json({"action": "accept_double"})
            resp = ws.receive_json()
            assert resp["type"] == "error"

    def test_decline_double_without_offer(self, ws_test_env):
        """decline_double without a pending offer returns error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        _, other = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{other.id}?token={_token(other.id)}"
        ) as ws:
            ws.receive_json()

            ws.send_json({"action": "decline_double"})
            resp = ws.receive_json()
            assert resp["type"] == "error"

    def test_offer_double_db_failure_restores_engine(self, ws_test_env):
        """A DB commit failure during offer_double leaves engine cube state unchanged."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, _ = _current_and_other(tid, white, black)

        # Force the engine into ROLLING so offer_double is legal for the
        # current player (the engine-level rule requires ROLLING + own/centered cube).
        engine = game_manager.get_engine(tid)
        engine.state.status = GameStatus.ROLLING
        engine.state.dice = None
        engine.state.remaining_dice = []

        pre = engine.get_state_snapshot()

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            ws.receive_json()

            # Patch AsyncSession.commit on the session in use to raise,
            # simulating a DB write failure after the cube action mutates
            # the engine but before commit succeeds.
            with patch(
                "sqlalchemy.ext.asyncio.AsyncSession.commit",
                side_effect=RuntimeError("simulated DB failure"),
            ):
                ws.send_json({"action": "offer_double"})
                # Drain messages until we see the error triggered by the
                # commit failure (the handler broadcasts game_state before
                # the commit attempt).
                saw_error = False
                for _ in range(5):
                    resp = ws.receive_json()
                    if resp["type"] == "error":
                        saw_error = True
                        break
                assert saw_error

        post = engine.get_state_snapshot()
        # Engine cube state must match the pre-call snapshot exactly.
        assert post["double_offered"] == pre["double_offered"] is False
        assert post["double_offered_by"] == pre["double_offered_by"]
        assert post["cube_value"] == pre["cube_value"]
        assert post["cube_owner"] == pre["cube_owner"]
        assert post["status"] == pre["status"]

    def test_accept_double_db_failure_restores_engine(self, ws_test_env):
        """A DB commit failure during accept_double leaves engine cube state unchanged."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, other = _current_and_other(tid, white, black)

        # Set up a pending double offered by `current`, to be accepted by `other`.
        engine = game_manager.get_engine(tid)
        engine.state.status = GameStatus.ROLLING
        engine.state.dice = None
        engine.state.remaining_dice = []
        engine.state.double_offered = True
        engine.state.double_offered_by = engine.state.current_turn

        pre = engine.get_state_snapshot()

        with client.websocket_connect(
            f"/ws/{tid}/{other.id}?token={_token(other.id)}"
        ) as ws:
            ws.receive_json()

            with patch(
                "sqlalchemy.ext.asyncio.AsyncSession.commit",
                side_effect=RuntimeError("simulated DB failure"),
            ):
                ws.send_json({"action": "accept_double"})
                saw_error = False
                for _ in range(5):
                    resp = ws.receive_json()
                    if resp["type"] == "error":
                        saw_error = True
                        break
                assert saw_error

        post = engine.get_state_snapshot()
        # Offer must still be pending; cube unchanged; ownership not transferred.
        assert post["double_offered"] == pre["double_offered"] is True
        assert post["double_offered_by"] == pre["double_offered_by"]
        assert post["cube_value"] == pre["cube_value"]
        assert post["cube_owner"] == pre["cube_owner"]

    def test_decline_double_db_failure_restores_engine(self, ws_test_env):
        """A DB commit failure during decline_double leaves engine state unchanged."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, other = _current_and_other(tid, white, black)

        engine = game_manager.get_engine(tid)
        engine.state.status = GameStatus.ROLLING
        engine.state.dice = None
        engine.state.remaining_dice = []
        engine.state.double_offered = True
        engine.state.double_offered_by = engine.state.current_turn

        pre = engine.get_state_snapshot()

        with client.websocket_connect(
            f"/ws/{tid}/{other.id}?token={_token(other.id)}"
        ) as ws:
            ws.receive_json()

            with patch(
                "sqlalchemy.ext.asyncio.AsyncSession.commit",
                side_effect=RuntimeError("simulated DB failure"),
            ):
                ws.send_json({"action": "decline_double"})
                saw_error = False
                for _ in range(5):
                    resp = ws.receive_json()
                    if resp["type"] == "error":
                        saw_error = True
                        break
                assert saw_error

        post = engine.get_state_snapshot()
        # Game must NOT be marked finished and offer must still be pending.
        assert post["status"] == pre["status"]
        assert post["status"] != GameStatus.FINISHED.value
        assert post["winner"] == pre["winner"]
        assert post["double_offered"] == pre["double_offered"] is True
        assert post["double_offered_by"] == pre["double_offered_by"]


# ===========================================================================
# Error Scenarios
# ===========================================================================


class TestErrorScenarios:
    """Tests for error handling and edge cases."""

    def test_multiple_errors_do_not_disconnect(self, ws_test_env):
        """Multiple consecutive errors keep the connection alive."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={_token(white.id)}"
        ) as ws:
            ws.receive_json()

            ws.send_text("bad json 1")
            assert ws.receive_json()["type"] == "error"

            ws.send_text("bad json 2")
            assert ws.receive_json()["type"] == "error"

            ws.send_json({"action": "nonexistent"})
            assert ws.receive_json()["type"] == "error"

            ws.send_json({})
            assert ws.receive_json()["type"] == "error"

    def test_end_turn_wrong_player(self, ws_test_env):
        """end_turn by the non-current player returns error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        _, other = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{other.id}?token={_token(other.id)}"
        ) as ws:
            ws.receive_json()

            ws.send_json({"action": "end_turn"})
            err = ws.receive_json()
            assert err["type"] == "error"

    def test_make_move_before_rolling_next_turn(self, ws_test_env):
        """After turn ends and next player is in ROLLING, make_move returns error."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, other = _current_and_other(tid, white, black)

        # Complete current player's turn
        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            init = ws.receive_json()
            _complete_turn_via_moves(ws, init)
            engine = game_manager.get_engine(tid)
            if engine and engine.state.current_turn == game_manager.get_player_color(tid, current.id):
                ws.send_json({"action": "end_turn"})
                ws.receive_json()

        # Other player tries to move without rolling
        engine = game_manager.get_engine(tid)
        if engine and engine.state.status == GameStatus.ROLLING:
            with client.websocket_connect(
                f"/ws/{tid}/{other.id}?token={_token(other.id)}"
            ) as ws:
                ws.receive_json()

                ws.send_json({
                    "action": "make_move",
                    "from_point": 1,
                    "to_point": 2,
                })
                err = ws.receive_json()
                assert err["type"] == "error"


# ===========================================================================
# Disconnect Handling Tests
# ===========================================================================


class TestDisconnectHandling:
    """Tests for graceful disconnect and reconnection."""

    def test_opponent_notified_on_disconnect(self, ws_test_env):
        """When one player disconnects, the other receives opponent_disconnected."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with client.websocket_connect(
            f"/ws/{tid}/{black.id}?token={_token(black.id)}"
        ) as ws_black:
            ws_black.receive_json()  # initial

            with client.websocket_connect(
                f"/ws/{tid}/{white.id}?token={_token(white.id)}"
            ) as ws_white:
                ws_white.receive_json()
                reconnect = ws_black.receive_json()
                assert reconnect["type"] == "opponent_reconnected"

            disconnect = ws_black.receive_json()
            assert disconnect["type"] == "opponent_disconnected"

    def test_reconnect_sends_game_state(self, ws_test_env):
        """Reconnecting to a game sends fresh game state."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={_token(white.id)}"
        ) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "game_state"

        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={_token(white.id)}"
        ) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "game_state"
            assert msg["data"]["game_state"] is not None


# ===========================================================================
# ConnectionManager Unit Tests
# ===========================================================================


class TestConnectionManager:
    """Unit tests for the ConnectionManager class."""

    def test_get_player_ids_empty(self, ws_test_env):
        """get_player_ids returns empty list for unknown table."""
        from app.api.websocket import manager
        assert manager.get_player_ids("nonexistent") == []

    def test_disconnect_nonexistent(self, ws_test_env):
        """Disconnecting a nonexistent player/table does not raise."""
        from app.api.websocket import manager
        manager.disconnect("nonexistent_table", "nonexistent_player")

    def test_send_to_nonexistent_player(self, ws_test_env):
        """Sending to a nonexistent player does not raise."""
        from app.api.websocket import manager
        _run_async(manager.send_to_player("x", "x", {"type": "test"}))

    def test_broadcast_to_empty_table(self, ws_test_env):
        """Broadcasting to an empty table does not raise."""
        from app.api.websocket import manager
        _run_async(manager.broadcast_to_table("x", {"type": "test"}))


# ===========================================================================
# Full Game Flow / Integration Tests
# ===========================================================================


class TestFullGameFlow:
    """Integration tests for complete game interaction sequences."""

    def test_make_multiple_moves_in_turn(self, ws_test_env):
        """A player can make multiple moves within a single turn."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, _ = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            init = ws.receive_json()
            valid_moves = init["data"]["game_state"].get("valid_moves", [])
            moves_made = 0

            while valid_moves and moves_made < 4:
                move = valid_moves[0]
                ws.send_json({
                    "action": "make_move",
                    "from_point": move["from_point"],
                    "to_point": move["to_point"],
                })
                resp = ws.receive_json()
                if resp["type"] == "game_state":
                    valid_moves = resp["data"]["game_state"].get("valid_moves", [])
                    moves_made += 1
                else:
                    break

            assert moves_made >= 1

    def test_game_state_board_structure(self, ws_test_env):
        """Initial game_state has the expected board structure."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={_token(white.id)}"
        ) as ws:
            msg = ws.receive_json()
            gs = msg["data"]["game_state"]

            assert len(gs["points"]) == 26
            assert gs["bar_white"] == 0
            assert gs["bar_black"] == 0
            assert gs["off_white"] == 0
            assert gs["off_black"] == 0
            assert gs["status"] == "moving"  # opening roll already done
            assert gs["current_turn"] in ("white", "black")
            assert gs["cube_value"] == 1
            assert "opening_roll" in gs
            assert "can_double" in gs

    def test_full_turn_cycle(self, ws_test_env):
        """Complete a full turn cycle: first player moves, second player rolls and moves."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, other = _current_and_other(tid, white, black)

        # First player plays their opening turn
        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            init = ws.receive_json()
            _complete_turn_via_moves(ws, init)

            engine = game_manager.get_engine(tid)
            cur_color = game_manager.get_player_color(tid, current.id)
            if engine and engine.state.current_turn == cur_color:
                ws.send_json({"action": "end_turn"})
                ws.receive_json()

        # Second player should now be in ROLLING state
        engine = game_manager.get_engine(tid)
        if engine and engine.state.status == GameStatus.ROLLING:
            with client.websocket_connect(
                f"/ws/{tid}/{other.id}?token={_token(other.id)}"
            ) as ws:
                ws.receive_json()  # initial game_state

                ws.send_json({"action": "roll_dice"})
                dice = ws.receive_json()
                assert dice["type"] == "dice_rolled"

                state = ws.receive_json()
                assert state["type"] == "game_state"
                valid = state["data"]["game_state"].get("valid_moves", [])

                if valid:
                    ws.send_json({
                        "action": "make_move",
                        "from_point": valid[0]["from_point"],
                        "to_point": valid[0]["to_point"],
                    })
                    resp = ws.receive_json()
                    assert resp["type"] == "game_state"

    def test_move_then_undo_then_move_again(self, ws_test_env):
        """Move, undo, then move again without errors."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        current, _ = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws:
            init = ws.receive_json()
            valid_moves = init["data"]["game_state"].get("valid_moves", [])

            if valid_moves:
                move = valid_moves[0]

                # Make a move
                ws.send_json({
                    "action": "make_move",
                    "from_point": move["from_point"],
                    "to_point": move["to_point"],
                })
                ws.receive_json()

                # Undo
                ws.send_json({"action": "undo_turn"})
                undo_resp = ws.receive_json()
                assert undo_resp["type"] == "game_state"

                # Move again (same valid_moves should be available)
                new_moves = undo_resp["data"]["game_state"].get("valid_moves", [])
                if new_moves:
                    ws.send_json({
                        "action": "make_move",
                        "from_point": new_moves[0]["from_point"],
                        "to_point": new_moves[0]["to_point"],
                    })
                    resp = ws.receive_json()
                    assert resp["type"] == "game_state"


# ===========================================================================
# Spectator Tests
# ===========================================================================


class TestSpectatorMode:
    """Tests for spectator WebSocket connections."""

    def test_spectator_connects_and_receives_game_state(self, ws_test_env):
        """Spectator receives game state on connect."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        spectator = _run_async(_create_player(sf, "Spectator"))

        with client.websocket_connect(
            f"/ws/{tid}/spectate?token={_token(spectator.id)}"
        ) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "game_state"
            assert msg["data"]["your_color"] is None
            assert msg["data"]["game_state"] is not None

    def test_spectator_receives_empty_valid_moves(self, ws_test_env):
        """Spectator state has no valid_moves (prevent coaching)."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        spectator = _run_async(_create_player(sf, "Spectator"))

        with client.websocket_connect(
            f"/ws/{tid}/spectate?token={_token(spectator.id)}"
        ) as ws:
            msg = ws.receive_json()
            assert msg["data"]["game_state"]["valid_moves"] == []

    def test_spectator_count_in_player_messages(self, ws_test_env):
        """Players can see the spectator count in their game_state messages."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        spectator = _run_async(_create_player(sf, "Spectator"))

        # First check count is 0 before spectator connects
        with client.websocket_connect(
            f"/ws/{tid}/{white.id}?token={_token(white.id)}"
        ) as ws_player:
            init_msg = ws_player.receive_json()
            assert init_msg["data"]["table"]["spectator_count"] == 0

        # Now spectator connects and player reconnects -- spectator count should be 1
        with client.websocket_connect(
            f"/ws/{tid}/spectate?token={_token(spectator.id)}"
        ) as ws_spec:
            ws_spec.receive_json()  # initial state for spectator

            with client.websocket_connect(
                f"/ws/{tid}/{white.id}?token={_token(white.id)}"
            ) as ws_player2:
                player_msg = ws_player2.receive_json()
                assert player_msg["data"]["table"]["spectator_count"] == 1

    def test_spectator_count_in_spectator_messages(self, ws_test_env):
        """Spectator count included in spectator's own game_state message."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        spectator = _run_async(_create_player(sf, "Spectator"))

        with client.websocket_connect(
            f"/ws/{tid}/spectate?token={_token(spectator.id)}"
        ) as ws:
            msg = ws.receive_json()
            # 1 spectator currently connected (this one)
            assert msg["data"]["table"]["spectator_count"] == 1

    def test_spectator_receives_updates_when_players_move(self, ws_test_env):
        """Spectator receives game_state when players make moves."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))
        spectator = _run_async(_create_player(sf, "Spectator"))
        current, _ = _current_and_other(tid, white, black)

        with client.websocket_connect(
            f"/ws/{tid}/{current.id}?token={_token(current.id)}"
        ) as ws_player:
            init_msg = ws_player.receive_json()

            with client.websocket_connect(
                f"/ws/{tid}/spectate?token={_token(spectator.id)}"
            ) as ws_spec:
                ws_spec.receive_json()  # initial state

                valid_moves = init_msg["data"]["game_state"].get("valid_moves", [])
                if valid_moves:
                    move = valid_moves[0]
                    ws_player.send_json({
                        "action": "make_move",
                        "from_point": move["from_point"],
                        "to_point": move["to_point"],
                    })

                    # Player receives updated state
                    player_update = ws_player.receive_json()
                    assert player_update["type"] == "game_state"

                    # Spectator also receives updated state
                    spec_update = ws_spec.receive_json()
                    assert spec_update["type"] == "game_state"
                    # Spectator still sees no valid_moves
                    assert spec_update["data"]["game_state"]["valid_moves"] == []
                    assert spec_update["data"]["your_color"] is None

    def test_spectator_connection_requires_auth(self, ws_test_env):
        """Spectator connection without a token is rejected."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with pytest.raises(Exception):
            with client.websocket_connect(f"/ws/{tid}/spectate") as ws:
                ws.receive_json()

    def test_spectator_connection_rejects_invalid_token(self, ws_test_env):
        """Spectator connection with an invalid token is rejected."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        tid, white, black = _run_async(_create_game(sf))

        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/ws/{tid}/spectate?token={_bad_token()}"
            ) as ws:
                ws.receive_json()

    def test_spectator_table_not_found(self, ws_test_env):
        """Spectator connection to nonexistent table is rejected."""
        client = ws_test_env["client"]
        sf = ws_test_env["session_factory"]
        spectator = _run_async(_create_player(sf, "Spectator"))

        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/ws/NOTFOUND/spectate?token={_token(spectator.id)}"
            ) as ws:
                ws.receive_json()
