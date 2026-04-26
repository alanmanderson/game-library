"""End-to-end integration tests for critical user flows.

Exercises full user flows across the REST API and WebSocket handler,
using an in-memory (file-based) SQLite database for isolation.

Covered flows
-------------
Flow 1 – Guest game vs bot:
    Guest auth → table creation → bot invite → WebSocket gameplay →
    stats restriction verified.

Flow 2 – Registered player game:
    Register → login → table creation → second player joins →
    WebSocket state updates confirmed for both players.

Flow 3 – Match play:
    Table created with match_points → bot game started →
    match configuration verified via WebSocket game state.

Flow 4 – Authentication:
    Register / login / guest / Google OAuth (mocked) / invalid
    credentials → every auth path returns the expected response.

Flow 5 – Reconnection:
    Player connects, disconnects, reconnects →
    fresh game_state delivered on every reconnect.
"""

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from starlette.testclient import TestClient

from app.database import Base, get_db
from app.limiter import limiter
from app.main import app
from app.services.game_service import game_manager


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run_async(coro):
    """Run a coroutine synchronously using a dedicated event loop."""
    return asyncio.run(coro)


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_schema(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# ---------------------------------------------------------------------------
# Fixture – shared test environment (REST + WebSocket)
# ---------------------------------------------------------------------------


@pytest.fixture
def e2e_client(tmp_path):
    """Provide a ``starlette.testclient.TestClient`` backed by an isolated
    file-based SQLite database.

    Both REST endpoints and WebSocket connections share the same database,
    making true end-to-end flows possible within a single test.

    The bot scheduling functions are patched out so tests remain fast and
    deterministic (no artificial delays or ML inference).
    """
    db_path = tmp_path / "e2e.db"
    db_url = f"sqlite+aiosqlite:///{db_path}"

    engine = create_async_engine(db_url, echo=False)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    _run_async(_create_schema(engine))

    @asynccontextmanager
    async def _mock_async_session():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

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

    with (
        patch("app.api.websocket.async_session", _mock_async_session),
        patch("app.database.async_session", _mock_async_session),
        patch("app.services.bot_service.schedule_bot_turn_if_needed"),
        patch("app.services.bot_service.schedule_bot_double_response_if_needed"),
    ):
        client = TestClient(app)
        yield client

    app.dependency_overrides.clear()
    game_manager._engines.clear()
    game_manager._player_colors.clear()
    game_manager._locks.clear()

    _run_async(engine.dispose())


# ---------------------------------------------------------------------------
# Turn-play helper
# ---------------------------------------------------------------------------


def _play_turn_from_state(ws, initial_gs: dict) -> dict:
    """Drive a complete turn given an initial game-state dict.

    Makes each valid move in turn until no more valid moves or no dice
    remain, then sends ``end_turn``.  Returns the last game_state dict
    received (the state after end_turn).
    """
    gs = initial_gs
    moves_made = 0

    while True:
        valid_moves = gs.get("valid_moves", [])
        remaining_dice = gs.get("remaining_dice", [])

        # Stop if no moves are left or all dice have been used
        if not valid_moves or not remaining_dice:
            break

        move = valid_moves[0]
        ws.send_json(
            {
                "action": "make_move",
                "from_point": move["from_point"],
                "to_point": move["to_point"],
            }
        )
        resp = ws.receive_json()
        assert resp["type"] == "game_state", (
            f"Expected game_state after make_move, got {resp['type']}"
        )
        gs = resp["data"]["game_state"]
        moves_made += 1

        # Game finished mid-turn (e.g., bearing off the last checker)
        if gs["status"] == "finished":
            return gs

    # Attempt to end the turn
    ws.send_json({"action": "end_turn"})
    end_resp = ws.receive_json()
    assert end_resp["type"] in (
        "game_state",
        "game_over",
    ), f"Unexpected message type after end_turn: {end_resp['type']}"
    if end_resp["type"] == "game_state":
        return end_resp["data"]["game_state"]
    # game_over received
    return {"status": "finished", "game_over_data": end_resp["data"]}


# ===========================================================================
# Flow 1 – Guest game vs bot
# ===========================================================================


class TestFlow1GuestVsBot:
    """Full flow: guest auth → table creation → bot game → WS play → stats denied."""

    def test_complete_guest_bot_flow(self, e2e_client):
        """End-to-end flow: guest creates account, starts bot game, plays opening
        turn via WebSocket, and is correctly denied stats access afterward."""
        client = e2e_client

        # ── Step 1: Create guest account ──────────────────────────────────
        resp = client.post("/api/auth/guest", json={"nickname": "E2EGuest"})
        assert resp.status_code == 200
        auth = resp.json()
        token = auth["token"]
        player_id = auth["player"]["id"]
        assert auth["player"]["is_guest"] is True
        assert auth["player"]["auth_provider"] == "guest"

        # ── Step 2: Create a table ─────────────────────────────────────────
        resp = client.post(
            "/api/tables",
            json={"player_id": player_id},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        table = resp.json()
        table_id = table["id"]
        assert table["status"] == "waiting"
        assert len(table_id) == 6  # 6-char uppercase alphanumeric

        # ── Step 3: Invite bot (starts the game) ──────────────────────────
        resp = client.post(
            f"/api/tables/{table_id}/invite-bot",
            json={},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        table = resp.json()
        assert table["status"] == "playing"

        # Both player slots should be filled (human + bot)
        assert table["white_player"] is not None
        assert table["black_player"] is not None
        assigned_ids = {table["white_player"]["id"], table["black_player"]["id"]}
        assert player_id in assigned_ids

        # ── Step 4: Connect via WebSocket ─────────────────────────────────
        with client.websocket_connect(
            f"/ws/{table_id}/{player_id}?token={token}"
        ) as ws:
            init = ws.receive_json()
            assert init["type"] == "game_state"

            gs = init["data"]["game_state"]
            my_color = init["data"]["your_color"]
            assert my_color in ("white", "black")

            # Opening roll is performed automatically in start_game, so the
            # game begins in MOVING state.
            assert gs["status"] in ("moving", "rolling", "finished")

            # ── Step 5: Play opening turn if it is our turn ────────────────
            if gs["status"] == "moving" and gs["current_turn"] == my_color:
                final_gs = _play_turn_from_state(ws, gs)
                # After the turn the game advances (now bot's turn or game over)
                assert final_gs["status"] in (
                    "rolling",
                    "moving",
                    "finished",
                )

        # ── Step 6: Verify stats are not available for guests ──────────────
        resp = client.get(
            f"/api/players/{player_id}/stats",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 403
        assert "guest" in resp.json()["detail"].lower()

    def test_table_persisted_in_database(self, e2e_client):
        """A table created via the API is immediately retrievable by its ID."""
        client = e2e_client

        auth = client.post("/api/auth/guest", json={"nickname": "PersistGuest"}).json()
        table = client.post(
            "/api/tables",
            json={"player_id": auth["player"]["id"]},
            headers=_auth_headers(auth["token"]),
        ).json()

        resp = client.get(f"/api/tables/{table['id']}")
        assert resp.status_code == 200
        fetched = resp.json()
        assert fetched["id"] == table["id"]
        assert fetched["status"] == "waiting"

    def test_bot_game_board_structure(self, e2e_client):
        """After joining, the initial WebSocket game_state has valid board geometry."""
        client = e2e_client

        auth = client.post("/api/auth/guest", json={"nickname": "BoardGuest"}).json()
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = client.post(
            "/api/tables",
            json={"player_id": player_id},
            headers=_auth_headers(token),
        ).json()

        client.post(
            f"/api/tables/{table['id']}/invite-bot",
            json={},
            headers=_auth_headers(token),
        )

        with client.websocket_connect(
            f"/ws/{table['id']}/{player_id}?token={token}"
        ) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "game_state"
            gs = msg["data"]["game_state"]

            # Standard backgammon board: 26 points (0-25, padding at 0 and 25)
            assert len(gs["points"]) == 26
            assert gs["bar_white"] == 0
            assert gs["bar_black"] == 0
            assert gs["off_white"] == 0
            assert gs["off_black"] == 0
            assert gs["cube_value"] == 1
            assert gs["current_turn"] in ("white", "black")

    def test_guest_dashboard_forbidden(self, e2e_client):
        """Dashboard endpoint returns 403 for guest players."""
        client = e2e_client

        auth = client.post("/api/auth/guest", json={"nickname": "DashGuest"}).json()
        token = auth["token"]
        player_id = auth["player"]["id"]

        resp = client.get(
            f"/api/players/{player_id}/dashboard",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 403

    def test_bot_game_difficulty_stored(self, e2e_client):
        """The selected difficulty is stored on the table."""
        client = e2e_client

        auth = client.post("/api/auth/guest", json={"nickname": "DiffGuest"}).json()
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = client.post(
            "/api/tables",
            json={"player_id": player_id},
            headers=_auth_headers(token),
        ).json()

        resp = client.post(
            f"/api/tables/{table['id']}/invite-bot",
            json={"difficulty": "easy"},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["bot_difficulty"] == "easy"


# ===========================================================================
# Flow 2 – Registered player game
# ===========================================================================


class TestFlow2RegisteredPlayerGame:
    """Register → login → table creation → second player joins → WebSocket play."""

    def test_register_login_create_join_play(self, e2e_client):
        """Full flow: register, login (verify same player), create table, second
        player joins, both receive valid game state over WebSocket."""
        client = e2e_client

        # ── Step 1: Register ───────────────────────────────────────────────
        resp = client.post(
            "/api/auth/register",
            json={
                "email": "player1@example.com",
                "password": "Securepass1!",
                "nickname": "RegPlayer1",
            },
        )
        assert resp.status_code == 200
        reg = resp.json()
        assert reg["player"]["auth_provider"] == "local"
        assert reg["player"]["is_guest"] is False

        # ── Step 2: Login ──────────────────────────────────────────────────
        resp = client.post(
            "/api/auth/login",
            json={"email": "player1@example.com", "password": "Securepass1!"},
        )
        assert resp.status_code == 200
        login = resp.json()
        # Login returns the same player
        assert login["player"]["id"] == reg["player"]["id"]
        token1 = login["token"]
        player1_id = login["player"]["id"]

        # ── Step 3: Create table ───────────────────────────────────────────
        resp = client.post(
            "/api/tables",
            json={"player_id": player1_id},
            headers=_auth_headers(token1),
        )
        assert resp.status_code == 200
        table = resp.json()
        table_id = table["id"]
        assert table["status"] == "waiting"

        # ── Step 4: Second player joins ────────────────────────────────────
        auth2 = client.post(
            "/api/auth/guest", json={"nickname": "GuestJoiner"}
        ).json()
        token2 = auth2["token"]
        player2_id = auth2["player"]["id"]

        resp = client.post(
            f"/api/tables/{table_id}/join",
            json={"player_id": player2_id},
            headers=_auth_headers(token2),
        )
        assert resp.status_code == 200
        joined = resp.json()
        assert joined["status"] == "playing"

        assigned_ids = {joined["white_player"]["id"], joined["black_player"]["id"]}
        assert player1_id in assigned_ids
        assert player2_id in assigned_ids

        # ── Step 5: Both players receive initial game state ────────────────
        with client.websocket_connect(
            f"/ws/{table_id}/{player1_id}?token={token1}"
        ) as ws1:
            msg1 = ws1.receive_json()
            assert msg1["type"] == "game_state"
            color1 = msg1["data"]["your_color"]
            gs1 = msg1["data"]["game_state"]
            assert gs1["status"] in ("moving", "rolling")

        with client.websocket_connect(
            f"/ws/{table_id}/{player2_id}?token={token2}"
        ) as ws2:
            msg2 = ws2.receive_json()
            assert msg2["type"] == "game_state"
            color2 = msg2["data"]["your_color"]

        # Players must hold opposite colors
        assert color1 != color2

    def test_second_player_cannot_join_own_table(self, e2e_client):
        """A player cannot join a table they created."""
        client = e2e_client

        auth = client.post(
            "/api/auth/register",
            json={
                "email": "solo@example.com",
                "password": "Securepass1!",
                "nickname": "SoloPlayer",
            },
        ).json()
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = client.post(
            "/api/tables",
            json={"player_id": player_id},
            headers=_auth_headers(token),
        ).json()

        resp = client.post(
            f"/api/tables/{table['id']}/join",
            json={"player_id": player_id},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 400
        assert "own table" in resp.json()["detail"].lower()

    def test_registered_player_stats_accessible(self, e2e_client):
        """Stats endpoint is accessible for registered (non-guest) players."""
        client = e2e_client

        auth = client.post(
            "/api/auth/register",
            json={
                "email": "stats@example.com",
                "password": "Securepass1!",
                "nickname": "StatsPlayer",
            },
        ).json()
        token = auth["token"]
        player_id = auth["player"]["id"]

        resp = client.get(
            f"/api/players/{player_id}/stats",
            headers=_auth_headers(token),
        )
        # Registered player with no games returns empty stats (200), not 403
        assert resp.status_code == 200

    def test_game_state_consistent_for_both_players(self, e2e_client):
        """Both players' game_state messages describe the same board position."""
        client = e2e_client

        # Register player 1
        auth1 = client.post(
            "/api/auth/register",
            json={
                "email": "p1state@example.com",
                "password": "Securepass1!",
                "nickname": "P1State",
            },
        ).json()
        token1 = auth1["token"]
        pid1 = auth1["player"]["id"]

        # Guest player 2
        auth2 = client.post("/api/auth/guest", json={"nickname": "P2State"}).json()
        token2 = auth2["token"]
        pid2 = auth2["player"]["id"]

        # Create and join table
        table = client.post(
            "/api/tables",
            json={"player_id": pid1},
            headers=_auth_headers(token1),
        ).json()
        tid = table["id"]

        client.post(
            f"/api/tables/{tid}/join",
            json={"player_id": pid2},
            headers=_auth_headers(token2),
        )

        # Connect both and compare board positions
        with client.websocket_connect(f"/ws/{tid}/{pid1}?token={token1}") as ws1:
            gs1 = ws1.receive_json()["data"]["game_state"]

        with client.websocket_connect(f"/ws/{tid}/{pid2}?token={token2}") as ws2:
            gs2 = ws2.receive_json()["data"]["game_state"]

        # The board (points array) must be identical for both perspectives
        assert gs1["points"] == gs2["points"]
        assert gs1["current_turn"] == gs2["current_turn"]
        assert gs1["cube_value"] == gs2["cube_value"]


# ===========================================================================
# Flow 3 – Match play
# ===========================================================================


class TestFlow3MatchPlay:
    """Table with match_points → game starts → match configuration verified."""

    def test_match_table_configuration(self, e2e_client):
        """A table created with match_points=7 reflects the setting in the
        WebSocket game state and REST response."""
        client = e2e_client

        auth = client.post("/api/auth/guest", json={"nickname": "MatchGuest"}).json()
        token = auth["token"]
        player_id = auth["player"]["id"]

        resp = client.post(
            "/api/tables",
            json={"player_id": player_id, "match_points": 7},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200
        table = resp.json()
        assert table["match_points"] == 7
        table_id = table["id"]

        # Invite bot and start the game
        client.post(
            f"/api/tables/{table_id}/invite-bot",
            json={},
            headers=_auth_headers(token),
        )

        # WebSocket should expose match_points and initial match scores
        with client.websocket_connect(
            f"/ws/{table_id}/{player_id}?token={token}"
        ) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "game_state"
            table_data = msg["data"]["table"]
            assert table_data["match_points"] == 7
            assert table_data["white_match_score"] == 0
            assert table_data["black_match_score"] == 0

    def test_match_points_default(self, e2e_client):
        """Default match_points is 5 when not specified."""
        client = e2e_client

        auth = client.post("/api/auth/guest", json={"nickname": "DefaultMP"}).json()
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = client.post(
            "/api/tables",
            json={"player_id": player_id},
            headers=_auth_headers(token),
        ).json()
        assert table["match_points"] == 5

    def test_match_points_invalid_rejected(self, e2e_client):
        """Out-of-range match_points values are rejected with 422."""
        client = e2e_client

        auth = client.post("/api/auth/guest", json={"nickname": "BadMP"}).json()
        token = auth["token"]
        player_id = auth["player"]["id"]

        resp = client.post(
            "/api/tables",
            json={"player_id": player_id, "match_points": 0},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 422

        resp = client.post(
            "/api/tables",
            json={"player_id": player_id, "match_points": 11},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 422


# ===========================================================================
# Flow 4 – Authentication
# ===========================================================================


class TestFlow4Authentication:
    """Comprehensive authentication flow tests."""

    # ── Registration ─────────────────────────────────────────────────────

    def test_register_returns_jwt_and_player(self, e2e_client):
        """POST /api/auth/register returns a JWT and player object."""
        resp = e2e_client.post(
            "/api/auth/register",
            json={"email": "reg@example.com", "password": "Pass1234!", "nickname": "RegUser"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["player"]["nickname"] == "RegUser"
        assert data["player"]["is_guest"] is False
        assert data["player"]["auth_provider"] == "local"

    def test_register_duplicate_email_returns_409(self, e2e_client):
        """Registering with the same e-mail twice returns 409 Conflict."""
        payload = {
            "email": "dup@example.com",
            "password": "Pass1234!",
            "nickname": "First",
        }
        e2e_client.post("/api/auth/register", json=payload)
        resp = e2e_client.post(
            "/api/auth/register",
            json={**payload, "nickname": "Second"},
        )
        assert resp.status_code == 409
        assert "already registered" in resp.json()["detail"].lower()

    def test_register_weak_password_returns_422(self, e2e_client):
        """Passwords shorter than 6 characters are rejected (422)."""
        resp = e2e_client.post(
            "/api/auth/register",
            json={"email": "weak@example.com", "password": "abc", "nickname": "Weak"},
        )
        assert resp.status_code == 422

    # ── Login ─────────────────────────────────────────────────────────────

    def test_login_with_valid_credentials(self, e2e_client):
        """Login returns a JWT for the same player that was registered."""
        e2e_client.post(
            "/api/auth/register",
            json={"email": "login@example.com", "password": "Pass1234!", "nickname": "LoginUser"},
        )
        resp = e2e_client.post(
            "/api/auth/login",
            json={"email": "login@example.com", "password": "Pass1234!"},
        )
        assert resp.status_code == 200
        assert "token" in resp.json()

    def test_login_wrong_password_returns_401(self, e2e_client):
        """Wrong password → 401."""
        e2e_client.post(
            "/api/auth/register",
            json={"email": "badpw@example.com", "password": "Correct1!", "nickname": "PwUser"},
        )
        resp = e2e_client.post(
            "/api/auth/login",
            json={"email": "badpw@example.com", "password": "wrong"},
        )
        assert resp.status_code == 401

    def test_login_unknown_email_returns_401(self, e2e_client):
        """Logging in with an e-mail that was never registered → 401."""
        resp = e2e_client.post(
            "/api/auth/login",
            json={"email": "ghost@example.com", "password": "any"},
        )
        assert resp.status_code == 401

    # ── Guest ─────────────────────────────────────────────────────────────

    def test_guest_creation(self, e2e_client):
        """POST /api/auth/guest creates a guest player with JWT."""
        resp = e2e_client.post("/api/auth/guest", json={"nickname": "FlowGuest"})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["player"]["is_guest"] is True
        assert data["player"]["auth_provider"] == "guest"
        assert data["player"]["nickname"] == "FlowGuest"

    def test_guest_empty_nickname_returns_422(self, e2e_client):
        """An empty nickname is rejected (422)."""
        resp = e2e_client.post("/api/auth/guest", json={"nickname": ""})
        assert resp.status_code == 422

    def test_guest_stats_returns_403(self, e2e_client):
        """Guests cannot access the stats endpoint."""
        guest = e2e_client.post("/api/auth/guest", json={"nickname": "NoStatsGuest"}).json()
        resp = e2e_client.get(
            f"/api/players/{guest['player']['id']}/stats",
            headers=_auth_headers(guest["token"]),
        )
        assert resp.status_code == 403
        assert "guest" in resp.json()["detail"].lower()

    # ── JWT validation ────────────────────────────────────────────────────

    def test_me_endpoint_with_valid_token(self, e2e_client):
        """GET /api/auth/me returns the authenticated player."""
        reg = e2e_client.post(
            "/api/auth/register",
            json={"email": "me@example.com", "password": "Pass1234!", "nickname": "MeUser"},
        ).json()
        resp = e2e_client.get(
            "/api/auth/me",
            headers=_auth_headers(reg["token"]),
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == reg["player"]["id"]

    def test_me_endpoint_without_token_returns_401(self, e2e_client):
        """GET /api/auth/me without a token returns 401."""
        resp = e2e_client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_me_endpoint_with_invalid_token_returns_401(self, e2e_client):
        """GET /api/auth/me with a forged token returns 401."""
        resp = e2e_client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer this.is.not.valid"},
        )
        assert resp.status_code == 401

    def test_protected_endpoint_requires_auth(self, e2e_client):
        """Creating a table without a token returns 401."""
        resp = e2e_client.post("/api/tables", json={"player_id": "some-id"})
        assert resp.status_code == 401

    # ── Google OAuth (mocked) ─────────────────────────────────────────────

    @patch("app.api.auth_routes.verify_google_token")
    def test_google_oauth_creates_account(self, mock_verify, e2e_client):
        """A valid Google token creates a new account and returns a JWT."""
        mock_verify.return_value = {
            "sub": "g-sub-001",
            "email": "guser@gmail.com",
            "name": "Google User",
        }
        resp = e2e_client.post(
            "/api/auth/google",
            json={"id_token": "valid-google-token"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["player"]["auth_provider"] == "google"
        assert data["player"]["is_guest"] is False

    @patch("app.api.auth_routes.verify_google_token")
    def test_google_oauth_existing_user(self, mock_verify, e2e_client):
        """The same Google sub returns the same player on the second login."""
        mock_verify.return_value = {
            "sub": "g-sub-002",
            "email": "repeat@gmail.com",
            "name": "Repeat",
        }
        resp1 = e2e_client.post("/api/auth/google", json={"id_token": "tok1"})
        resp2 = e2e_client.post("/api/auth/google", json={"id_token": "tok2"})
        assert resp1.status_code == 200
        assert resp2.status_code == 200
        assert resp1.json()["player"]["id"] == resp2.json()["player"]["id"]

    @patch("app.api.auth_routes.verify_google_token")
    def test_google_oauth_invalid_token_returns_401(self, mock_verify, e2e_client):
        """A token that fails Google verification returns 401."""
        mock_verify.return_value = None
        resp = e2e_client.post("/api/auth/google", json={"id_token": "bad-token"})
        assert resp.status_code == 401

    def test_google_oauth_not_configured_returns_401(self, e2e_client):
        """Without GOOGLE_CLIENT_ID set, the endpoint returns 401."""
        resp = e2e_client.post("/api/auth/google", json={"id_token": "any-token"})
        assert resp.status_code == 401


# ===========================================================================
# Flow 5 – Reconnection
# ===========================================================================


class TestFlow5Reconnection:
    """Player connects, disconnects, then reconnects and receives fresh game state."""

    def _setup_bot_game(self, client):
        """Helper: create a guest player, a table, invite the bot, and return
        ``(table_id, player_id, token)``."""
        auth = client.post("/api/auth/guest", json={"nickname": "ReconnGuest"}).json()
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = client.post(
            "/api/tables",
            json={"player_id": player_id},
            headers=_auth_headers(token),
        ).json()
        table_id = table["id"]

        client.post(
            f"/api/tables/{table_id}/invite-bot",
            json={},
            headers=_auth_headers(token),
        )
        return table_id, player_id, token

    def test_reconnect_delivers_game_state(self, e2e_client):
        """A player who disconnects and reconnects receives a fresh game_state."""
        client = e2e_client
        table_id, player_id, token = self._setup_bot_game(client)
        ws_url = f"/ws/{table_id}/{player_id}?token={token}"

        # First connection – receive initial state then disconnect
        with client.websocket_connect(ws_url) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "game_state"
            first_state = msg["data"]["game_state"]

        # Second connection – should receive game state again
        with client.websocket_connect(ws_url) as ws:
            msg = ws.receive_json()
            assert msg["type"] == "game_state"
            second_state = msg["data"]["game_state"]

        # Board positions must be identical (no moves happened between connections)
        assert second_state["points"] == first_state["points"]
        assert second_state["current_turn"] == first_state["current_turn"]

    def test_multiple_reconnects(self, e2e_client):
        """Multiple reconnect cycles all deliver valid game state."""
        client = e2e_client
        table_id, player_id, token = self._setup_bot_game(client)
        ws_url = f"/ws/{table_id}/{player_id}?token={token}"

        for _ in range(3):
            with client.websocket_connect(ws_url) as ws:
                msg = ws.receive_json()
                assert msg["type"] == "game_state"
                assert "game_state" in msg["data"]
                assert "your_color" in msg["data"]

    def test_reconnect_after_move(self, e2e_client):
        """Game state after reconnecting reflects moves already made."""
        client = e2e_client
        table_id, player_id, token = self._setup_bot_game(client)
        ws_url = f"/ws/{table_id}/{player_id}?token={token}"

        points_after_move = None

        with client.websocket_connect(ws_url) as ws:
            init = ws.receive_json()
            gs = init["data"]["game_state"]
            my_color = init["data"]["your_color"]

            # Make one move if it's our turn
            if gs["status"] == "moving" and gs["current_turn"] == my_color:
                valid_moves = gs.get("valid_moves", [])
                if valid_moves:
                    move = valid_moves[0]
                    ws.send_json(
                        {
                            "action": "make_move",
                            "from_point": move["from_point"],
                            "to_point": move["to_point"],
                        }
                    )
                    resp = ws.receive_json()
                    assert resp["type"] == "game_state"
                    points_after_move = resp["data"]["game_state"]["points"]

        if points_after_move is not None:
            # Reconnect and verify the move is reflected
            with client.websocket_connect(ws_url) as ws:
                msg = ws.receive_json()
                assert msg["type"] == "game_state"
                assert msg["data"]["game_state"]["points"] == points_after_move
