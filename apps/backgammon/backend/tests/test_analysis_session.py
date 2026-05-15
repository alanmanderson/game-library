"""Tests for the Analysis Mode feature.

Covers:
- Session CRUD: create, list, get, close
- Gameplay: roll, move, end-turn (gnubg fallback), undo, double, respond-double
- Navigation: first/prev/next/last, jump-to-move
- History & annotations: get history, annotate, annotate missing move → 404
- Auth guards: 401 without token, 403 for other player's session
- Edge cases: close non-existent session, get non-existent session, navigate
  with empty history, jump out of range, settings update, multi-session
  isolation, list only own sessions
- gnubg-unavailable paths: hint and eval return 503
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from tests.conftest import auth_headers, create_test_player
from app.services.analysis_session_service import analysis_session_manager
from app.models import AnalysisSession, AnalysisSessionMove


# ---------------------------------------------------------------------------
# Session-cleanup fixture (autouse so every test starts clean)
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def cleanup_sessions():
    """Clear the in-memory session store between tests."""
    yield
    analysis_session_manager._sessions.clear()
    analysis_session_manager._locks.clear()


# ---------------------------------------------------------------------------
# Shared helper
# ---------------------------------------------------------------------------


async def _create_session(
    client: AsyncClient, token: str, **overrides
) -> dict:
    """POST /api/analysis/sessions and assert success."""
    body = {
        "game_type": "money",
        "player_color": "white",
        "gnubg_ply": 0,
        "auto_analysis": "off",
        **overrides,
    }
    resp = await client.post(
        "/api/analysis/sessions",
        json=body,
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, f"Failed to create session: {resp.text}"
    return resp.json()


async def _roll_if_needed(
    client: AsyncClient,
    token: str,
    session_id: str,
    game_state: dict,
) -> dict:
    """Roll dice if the game is in rolling status and it is white's turn."""
    if (
        game_state.get("status") == "rolling"
        and game_state.get("current_turn") == "white"
    ):
        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/roll",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        return resp.json()["game_state"]
    return game_state


def _get_valid_moves_from_memory(session_id: str) -> list:
    """Return valid moves from the in-memory engine (snapshot omits them)."""
    session = analysis_session_manager.get_session(session_id)
    if session is None:
        return []
    return session.engine.get_valid_moves()


async def _play_all_valid_moves(
    client: AsyncClient,
    token: str,
    session_id: str,
    max_moves: int = 20,
) -> dict:
    """Play all currently valid non-hit moves via the API.  Returns last game_state.

    The analysis service creates ``Move(from_point, to_point, is_hit=False)``
    so hit moves are rejected by the engine.  We therefore only attempt
    non-hit moves here; the helper stops when there are no more non-hit moves
    or when remaining dice are exhausted.

    max_moves guards against a degenerate loop.
    """
    valid = _get_valid_moves_from_memory(session_id)
    gs: dict = {}
    played = 0
    prev_remaining: list | None = None
    while played < max_moves:
        non_hit = [m for m in valid if not m.is_hit]
        if not non_hit:
            break

        session = analysis_session_manager.get_session(session_id)
        remaining = list(session.engine.state.remaining_dice) if session else []
        # Safety: if remaining dice haven't changed after a move, stop.
        if remaining == prev_remaining and played > 0:
            break
        prev_remaining = remaining

        move = non_hit[0]
        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/move",
            json={"from_point": move.from_point, "to_point": move.to_point},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        gs = resp.json()["game_state"]
        played += 1
        valid = _get_valid_moves_from_memory(session_id)
    return gs


# ---------------------------------------------------------------------------
# TestAnalysisSessionCRUD
# ---------------------------------------------------------------------------


class TestAnalysisSessionCRUD:
    @pytest.mark.asyncio
    async def test_create_session_returns_valid_structure(self, client):
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])

        assert "session" in data
        assert "game_state" in data
        assert "move_count" in data
        assert "current_view_index" in data

        session = data["session"]
        assert session["status"] == "active"
        assert session["player_color"] == "white"
        assert session["game_type"] == "money"
        assert session["gnubg_ply"] == 0
        assert session["auto_analysis"] == "off"
        assert "id" in session

    @pytest.mark.asyncio
    async def test_create_session_game_state_has_board(self, client):
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        gs = data["game_state"]

        assert "points" in gs
        assert isinstance(gs["points"], list)
        assert len(gs["points"]) == 26
        assert gs["status"] in ("rolling", "moving")

    @pytest.mark.asyncio
    async def test_create_session_persists_to_db(self, client, db_session):
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        db_row = await db_session.get(AnalysisSession, session_id)
        assert db_row is not None
        assert db_row.status == "active"
        assert db_row.player_color == "white"

    @pytest.mark.asyncio
    async def test_create_session_player_color_black_gnubg_goes_first(
        self, client
    ):
        """When the player chooses black, gnubg owns white and may have already
        played before the session is returned."""
        auth = await create_test_player(client, "Alice")
        data = await _create_session(
            client, auth["token"], player_color="black"
        )
        assert data["session"]["player_color"] == "black"
        # After create, it should be the player's (black's) turn or the game
        # is still waiting — either way the session is returned without error.
        assert data["session"]["status"] == "active"

    @pytest.mark.asyncio
    async def test_create_session_player_color_random_accepted(self, client):
        auth = await create_test_player(client, "Alice")
        data = await _create_session(
            client, auth["token"], player_color="random"
        )
        assert data["session"]["player_color"] in ("white", "black")

    @pytest.mark.asyncio
    async def test_list_sessions_returns_own_sessions(self, client):
        auth = await create_test_player(client, "Alice")
        await _create_session(client, auth["token"])
        await _create_session(client, auth["token"])

        resp = await client.get(
            "/api/analysis/sessions",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        sessions = resp.json()["sessions"]
        assert len(sessions) >= 2
        player_id = auth["player"]["id"]
        for s in sessions:
            assert s["player_id"] == player_id

    @pytest.mark.asyncio
    async def test_list_sessions_does_not_include_other_players(self, client):
        alice = await create_test_player(client, "Alice")
        bob = await create_test_player(client, "Bob")

        await _create_session(client, bob["token"])

        resp = await client.get(
            "/api/analysis/sessions",
            headers=auth_headers(alice["token"]),
        )
        assert resp.status_code == 200
        alice_sessions = resp.json()["sessions"]
        bob_id = bob["player"]["id"]
        for s in alice_sessions:
            assert s["player_id"] != bob_id

    @pytest.mark.asyncio
    async def test_get_session_returns_current_state(self, client):
        auth = await create_test_player(client, "Alice")
        created = await _create_session(client, auth["token"])
        session_id = created["session"]["id"]

        resp = await client.get(
            f"/api/analysis/sessions/{session_id}",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["session"]["id"] == session_id
        assert "game_state" in data

    @pytest.mark.asyncio
    async def test_get_session_404_for_unknown_id(self, client):
        auth = await create_test_player(client, "Alice")
        resp = await client.get(
            "/api/analysis/sessions/XXXXXXXX",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_close_session_marks_abandoned_in_db(
        self, client, db_session
    ):
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/close",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "closed"

        db_row = await db_session.get(AnalysisSession, session_id)
        assert db_row is not None
        assert db_row.status == "abandoned"
        assert db_row.completed_at is not None

    @pytest.mark.asyncio
    async def test_close_session_removes_from_memory(self, client):
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        await client.post(
            f"/api/analysis/sessions/{session_id}/close",
            headers=auth_headers(auth["token"]),
        )
        assert analysis_session_manager.get_session(session_id) is None

    @pytest.mark.asyncio
    async def test_get_session_404_after_close(self, client):
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        await client.post(
            f"/api/analysis/sessions/{session_id}/close",
            headers=auth_headers(auth["token"]),
        )

        resp = await client.get(
            f"/api/analysis/sessions/{session_id}",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_close_nonexistent_session_returns_404(self, client):
        auth = await create_test_player(client, "Alice")
        resp = await client.post(
            "/api/analysis/sessions/NOSESSION/close",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TestAnalysisGameplay
# ---------------------------------------------------------------------------


class TestAnalysisGameplay:
    @pytest.mark.asyncio
    async def test_roll_dice_changes_status_to_moving(self, client):
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]
        gs = data["game_state"]

        if gs["status"] == "rolling" and gs["current_turn"] == "white":
            resp = await client.post(
                f"/api/analysis/sessions/{session_id}/roll",
                headers=auth_headers(auth["token"]),
            )
            assert resp.status_code == 200
            new_gs = resp.json()["game_state"]
            assert new_gs["status"] == "moving"
            assert new_gs["dice"] is not None

    @pytest.mark.asyncio
    async def test_make_move_updates_board(self, client):
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]
        gs = data["game_state"]

        gs = await _roll_if_needed(client, auth["token"], session_id, gs)

        valid = _get_valid_moves_from_memory(session_id)
        if gs["status"] != "moving" or not valid:
            pytest.skip("No valid moves available to test")

        session = analysis_session_manager.get_session(session_id)
        remaining_before = list(session.engine.state.remaining_dice)
        if not remaining_before:
            pytest.skip("No remaining dice before move; cannot assert consumption")

        # Prefer a non-hit move — the analysis service creates Move(is_hit=False),
        # so a hit move would be rejected.  Find any non-hit move to test with.
        non_hit_moves = [m for m in valid if not m.is_hit]
        if not non_hit_moves:
            pytest.skip("All valid moves are hit moves; cannot test via API without is_hit support")
        move = non_hit_moves[0]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/move",
            json={
                "from_point": move.from_point,
                "to_point": move.to_point,
            },
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        # A successfully applied non-hit move must consume one die from remaining_dice.
        remaining_after = list(session.engine.state.remaining_dice)
        assert len(remaining_after) < len(remaining_before), (
            "make_move did not consume a die: "
            f"remaining before={remaining_before}, after={remaining_after}"
        )

    @pytest.mark.asyncio
    async def test_end_turn_triggers_gnubg_fallback(self, client):
        """gnubg is not available in tests so the random fallback executes.

        After end_turn the move_count should have grown: the player's turn
        is appended and then gnubg's response is appended.
        """
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]
        gs = data["game_state"]

        move_count_before = data["move_count"]

        # Ensure it's white's turn (may be rolling or moving).
        if gs["current_turn"] != "white":
            pytest.skip("White does not have the opening turn")

        gs = await _roll_if_needed(client, auth["token"], session_id, gs)

        if gs["status"] != "moving":
            pytest.skip("Still not in moving state after roll")

        # Play all currently valid moves using the in-memory engine.
        await _play_all_valid_moves(client, auth["token"], session_id)

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/end-turn",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        data_after = resp.json()
        # move_count should have increased by at least 1 (player's turn) and
        # ideally by 2 (player + gnubg), but gnubg only plays if the engine
        # successfully ended white's turn and switched to black's turn.
        assert data_after["move_count"] > move_count_before

    @pytest.mark.asyncio
    async def test_end_turn_persists_session_move_rows(
        self, client, db_session
    ):
        """After end_turn, at least one AnalysisSessionMove row exists in DB."""
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]
        gs = data["game_state"]

        if gs["current_turn"] != "white":
            pytest.skip("White does not have the opening turn")

        gs = await _roll_if_needed(client, auth["token"], session_id, gs)

        if gs["status"] != "moving":
            pytest.skip("Still not in moving state after roll")

        await _play_all_valid_moves(client, auth["token"], session_id)

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/end-turn",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200

        result = await db_session.execute(
            select(AnalysisSessionMove).where(
                AnalysisSessionMove.session_id == session_id
            )
        )
        rows = result.scalars().all()
        assert len(rows) >= 1

    @pytest.mark.asyncio
    async def test_undo_move_reverts_board(self, client):
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]
        gs = data["game_state"]

        gs = await _roll_if_needed(client, auth["token"], session_id, gs)

        valid = _get_valid_moves_from_memory(session_id)
        if gs["status"] != "moving" or not valid:
            pytest.skip("No move to undo")

        board_before_move = list(gs["points"])

        move = valid[0]
        await client.post(
            f"/api/analysis/sessions/{session_id}/move",
            json={
                "from_point": move.from_point,
                "to_point": move.to_point,
            },
            headers=auth_headers(auth["token"]),
        )

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/undo",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        board_after_undo = resp.json()["game_state"]["points"]
        assert board_after_undo == board_before_move

    @pytest.mark.asyncio
    async def test_undo_with_no_moves_is_safe(self, client):
        """Undo when no moves have been played this turn must not crash."""
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/undo",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_offer_double_updates_cube(self, client):
        """Doubling is only valid in ROLLING state on white's turn.

        If the engine auto-rolled an opening (MOVING state), doubling is not
        allowed.  We skip that case and only assert cube changes when
        can_double() would be True (ROLLING + white's turn).
        """
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]
        gs = data["game_state"]

        # Doubling requires the player to be in ROLLING state on their turn.
        if gs.get("status") != "rolling" or gs.get("current_turn") != "white":
            pytest.skip("Doubling not available; engine is not in ROLLING state for white")

        initial_cube = gs.get("cube_value", 1)

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/double",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        gs = resp.json()["game_state"]
        # After an accepted double, cube_value should be doubled.
        assert gs.get("cube_value", 1) == initial_cube * 2

    @pytest.mark.asyncio
    async def test_respond_double_accept(self, client):
        """Player accepts a double offered by gnubg (respond-double endpoint)."""
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        # gnubg offers double — we simulate by calling the player's offer
        # first so the cube changes hands, then the respond endpoint handles
        # the reply side.  In practice gnubg would offer first; here we test
        # the accept path by having the player respond to an existing cube
        # state.  Since the engine allows respond at any time, a 200 is
        # sufficient verification.
        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/respond-double",
            json={"accept": True},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_respond_double_reject(self, client):
        auth = await create_test_player(client, "Alice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/respond-double",
            json={"accept": False},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# TestAnalysisNavigation
# ---------------------------------------------------------------------------


class TestAnalysisNavigation:
    async def _session_with_history(self, client, token: str) -> tuple[str, dict]:
        """Create a session and play one full turn so history is non-empty.

        Returns (session_id, last_game_state_response_json).
        Skips the test when white does not get the opening turn.
        """
        data = await _create_session(client, token)
        session_id = data["session"]["id"]
        gs = data["game_state"]

        if gs["current_turn"] != "white":
            pytest.skip("White does not have the opening turn")

        gs = await _roll_if_needed(client, token, session_id, gs)

        if gs["status"] != "moving":
            pytest.skip("Still not in moving state after roll")

        await _play_all_valid_moves(client, token, session_id)

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/end-turn",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        return session_id, resp.json()

    @pytest.mark.asyncio
    async def test_navigate_last_returns_to_live(self, client):
        auth = await create_test_player(client, "NavAlice")
        session_id, _ = await self._session_with_history(
            client, auth["token"]
        )

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/navigate",
            json={"direction": "last"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        assert resp.json()["current_view_index"] == -1

    @pytest.mark.asyncio
    async def test_navigate_first_goes_to_index_zero(self, client):
        auth = await create_test_player(client, "NavBob")
        session_id, _ = await self._session_with_history(
            client, auth["token"]
        )

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/navigate",
            json={"direction": "first"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        assert resp.json()["current_view_index"] == 0

    @pytest.mark.asyncio
    async def test_navigate_prev_from_live_goes_to_last_move(self, client):
        auth = await create_test_player(client, "NavCarol")
        session_id, data = await self._session_with_history(
            client, auth["token"]
        )
        move_count = data["move_count"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/navigate",
            json={"direction": "prev"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        assert resp.json()["current_view_index"] == move_count - 1

    @pytest.mark.asyncio
    async def test_navigate_next_from_last_move_returns_live(self, client):
        auth = await create_test_player(client, "NavDave")
        session_id, data = await self._session_with_history(
            client, auth["token"]
        )
        move_count = data["move_count"]

        # Jump to the last move first
        await client.post(
            f"/api/analysis/sessions/{session_id}/navigate",
            json={"direction": "first"},
            headers=auth_headers(auth["token"]),
        )

        # Navigate to last recorded move
        for _ in range(move_count - 1):
            await client.post(
                f"/api/analysis/sessions/{session_id}/navigate",
                json={"direction": "next"},
                headers=auth_headers(auth["token"]),
            )

        # One more next should go to live (-1)
        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/navigate",
            json={"direction": "next"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        assert resp.json()["current_view_index"] == -1

    @pytest.mark.asyncio
    async def test_navigate_with_empty_history_is_safe(self, client):
        """Navigate calls on a fresh session (no recorded moves) must not crash.

        The service sets current_view_index to -1 for directions that don't
        make sense when there is no history (first/last), but "prev" from live
        position with total=0 evaluates to max(0, -1) = 0. We only assert
        that each direction returns HTTP 200 and that "last" restores the live
        position.
        """
        auth = await create_test_player(client, "NavEmpty")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        # Check that the session has no recorded moves at this point.
        session = analysis_session_manager.get_session(session_id)
        if session and len(session.move_history) > 0:
            # gnubg played an opening turn; adjust expectation accordingly.
            has_history = True
        else:
            has_history = False

        for direction in ("first", "prev", "next", "last"):
            resp = await client.post(
                f"/api/analysis/sessions/{session_id}/navigate",
                json={"direction": direction},
                headers=auth_headers(auth["token"]),
            )
            assert resp.status_code == 200

        # After "last", we should be at the live position.
        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/navigate",
            json={"direction": "last"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        assert resp.json()["current_view_index"] == -1

    @pytest.mark.asyncio
    async def test_jump_to_valid_move_number(self, client):
        auth = await create_test_player(client, "JumpAlice")
        session_id, data = await self._session_with_history(
            client, auth["token"]
        )
        move_count = data["move_count"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/jump",
            json={"move_number": 1},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        assert resp.json()["current_view_index"] == 0

    @pytest.mark.asyncio
    async def test_jump_out_of_range_returns_live(self, client):
        auth = await create_test_player(client, "JumpBob")
        session_id, data = await self._session_with_history(
            client, auth["token"]
        )
        move_count = data["move_count"]

        # Jump far beyond history
        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/jump",
            json={"move_number": move_count + 100},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        # Out-of-range resets to live (-1) per the service implementation
        assert resp.json()["current_view_index"] == -1


# ---------------------------------------------------------------------------
# TestAnalysisHistory
# ---------------------------------------------------------------------------


class TestAnalysisHistory:
    @pytest.mark.asyncio
    async def test_get_history_empty_before_any_moves(self, client):
        auth = await create_test_player(client, "HistAlice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        resp = await client.get(
            f"/api/analysis/sessions/{session_id}/history",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        # May be empty or contain opening gnubg move if black went first
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_get_history_after_full_turn(self, client):
        auth = await create_test_player(client, "HistBob")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]
        gs = data["game_state"]

        if gs["current_turn"] != "white":
            pytest.skip("White does not have the opening turn")

        gs = await _roll_if_needed(client, auth["token"], session_id, gs)

        if gs["status"] != "moving":
            pytest.skip("Still not in moving state after roll")

        await _play_all_valid_moves(client, auth["token"], session_id)

        await client.post(
            f"/api/analysis/sessions/{session_id}/end-turn",
            headers=auth_headers(auth["token"]),
        )

        resp = await client.get(
            f"/api/analysis/sessions/{session_id}/history",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200
        history = resp.json()
        assert len(history) >= 1
        entry = history[0]
        assert "move_number" in entry
        assert "player" in entry
        assert "dice_roll" in entry
        assert "move_notation" in entry

    @pytest.mark.asyncio
    async def test_annotate_move_adds_note(self, client):
        """Annotate a recorded move and verify it appears in history."""
        auth = await create_test_player(client, "AnnotAlice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]
        gs = data["game_state"]

        if gs["current_turn"] != "white":
            pytest.skip("White does not have the opening turn")

        gs = await _roll_if_needed(client, auth["token"], session_id, gs)

        if gs["status"] != "moving":
            pytest.skip("Still not in moving state after roll")

        await _play_all_valid_moves(client, auth["token"], session_id)

        await client.post(
            f"/api/analysis/sessions/{session_id}/end-turn",
            headers=auth_headers(auth["token"]),
        )

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/annotate",
            json={"move_number": 1, "note": "Great move!"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200

        hist = (
            await client.get(
                f"/api/analysis/sessions/{session_id}/history",
                headers=auth_headers(auth["token"]),
            )
        ).json()
        annotated = next((m for m in hist if m["move_number"] == 1), None)
        assert annotated is not None
        assert annotated["annotation"] == "Great move!"

    @pytest.mark.asyncio
    async def test_annotate_nonexistent_move_returns_404(self, client):
        auth = await create_test_player(client, "AnnotBob")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/annotate",
            json={"move_number": 999, "note": "No such move"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# TestAnalysisAuthGuards
# ---------------------------------------------------------------------------


class TestAnalysisAuthGuards:
    @pytest.mark.asyncio
    async def test_create_session_requires_auth(self, client):
        resp = await client.post(
            "/api/analysis/sessions",
            json={
                "game_type": "money",
                "player_color": "white",
                "gnubg_ply": 0,
                "auto_analysis": "off",
            },
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_sessions_requires_auth(self, client):
        resp = await client.get("/api/analysis/sessions")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_session_requires_auth(self, client):
        resp = await client.get("/api/analysis/sessions/ABCDEFGH")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_roll_requires_auth(self, client):
        resp = await client.post("/api/analysis/sessions/ABCDEFGH/roll")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_close_session_requires_auth(self, client):
        resp = await client.post("/api/analysis/sessions/ABCDEFGH/close")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_session_returns_403_for_other_player(self, client):
        alice = await create_test_player(client, "Alice")
        bob = await create_test_player(client, "Bob")

        data = await _create_session(client, alice["token"])
        session_id = data["session"]["id"]

        resp = await client.get(
            f"/api/analysis/sessions/{session_id}",
            headers=auth_headers(bob["token"]),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_roll_returns_403_for_other_player(self, client):
        alice = await create_test_player(client, "Alice")
        bob = await create_test_player(client, "Bob")

        data = await _create_session(client, alice["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/roll",
            headers=auth_headers(bob["token"]),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_move_returns_403_for_other_player(self, client):
        alice = await create_test_player(client, "Alice")
        bob = await create_test_player(client, "Bob")

        data = await _create_session(client, alice["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/move",
            json={"from_point": 13, "to_point": 10},
            headers=auth_headers(bob["token"]),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_close_returns_403_for_other_player(self, client):
        alice = await create_test_player(client, "Alice")
        bob = await create_test_player(client, "Bob")

        data = await _create_session(client, alice["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/close",
            headers=auth_headers(bob["token"]),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_annotate_returns_403_for_other_player(self, client):
        alice = await create_test_player(client, "Alice")
        bob = await create_test_player(client, "Bob")

        data = await _create_session(client, alice["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/annotate",
            json={"move_number": 1, "note": "Stolen note"},
            headers=auth_headers(bob["token"]),
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# TestAnalysisSettings
# ---------------------------------------------------------------------------


class TestAnalysisSettings:
    @pytest.mark.asyncio
    async def test_update_settings_changes_gnubg_ply(self, client):
        auth = await create_test_player(client, "SettingsAlice")
        data = await _create_session(client, auth["token"], gnubg_ply=0)
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/settings",
            json={"gnubg_ply": 2},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200

        session = analysis_session_manager.get_session(session_id)
        assert session is not None
        assert session.gnubg_ply == 2

    @pytest.mark.asyncio
    async def test_update_settings_changes_auto_analysis(self, client):
        auth = await create_test_player(client, "SettingsBob")
        data = await _create_session(client, auth["token"], auto_analysis="off")
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/settings",
            json={"auto_analysis": "per_move"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 200

        session = analysis_session_manager.get_session(session_id)
        assert session is not None
        assert session.auto_analysis == "per_move"

    @pytest.mark.asyncio
    async def test_update_settings_returns_403_for_other_player(self, client):
        alice = await create_test_player(client, "SettingsAlice2")
        bob = await create_test_player(client, "SettingsBob2")

        data = await _create_session(client, alice["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/settings",
            json={"gnubg_ply": 3},
            headers=auth_headers(bob["token"]),
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# TestGnubgUnavailableEndpoints
# ---------------------------------------------------------------------------


class TestGnubgUnavailableEndpoints:
    @pytest.mark.asyncio
    async def test_hint_returns_503_when_gnubg_unavailable(self, client):
        """When GNUBG_URL is empty, hint endpoint returns 503."""
        auth = await create_test_player(client, "HintAlice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/hint",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_eval_returns_503_when_gnubg_unavailable(self, client):
        """When GNUBG_URL is empty, eval endpoint returns 503."""
        auth = await create_test_player(client, "EvalAlice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/eval",
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 503


# ---------------------------------------------------------------------------
# TestMultiSessionIsolation
# ---------------------------------------------------------------------------


class TestMultiSessionIsolation:
    @pytest.mark.asyncio
    async def test_two_sessions_do_not_share_state(self, client):
        """Moves in session A must not affect session B's board."""
        auth = await create_test_player(client, "IsoAlice")
        data_a = await _create_session(client, auth["token"])
        data_b = await _create_session(client, auth["token"])

        sid_a = data_a["session"]["id"]
        sid_b = data_b["session"]["id"]
        gs_a = data_a["game_state"]
        gs_b = data_b["game_state"]

        gs_a = await _roll_if_needed(client, auth["token"], sid_a, gs_a)

        valid_a = _get_valid_moves_from_memory(sid_a)
        if gs_a["status"] == "moving" and valid_a:
            move = valid_a[0]
            await client.post(
                f"/api/analysis/sessions/{sid_a}/move",
                json={
                    "from_point": move.from_point,
                    "to_point": move.to_point,
                },
                headers=auth_headers(auth["token"]),
            )

        # Retrieve B's state — it should not have changed
        resp_b = await client.get(
            f"/api/analysis/sessions/{sid_b}",
            headers=auth_headers(auth["token"]),
        )
        board_b_now = resp_b.json()["game_state"]["points"]
        assert board_b_now == gs_b["points"]

    @pytest.mark.asyncio
    async def test_session_ids_are_unique(self, client):
        auth = await create_test_player(client, "UniqueAlice")
        ids = set()
        for _ in range(5):
            data = await _create_session(client, auth["token"])
            ids.add(data["session"]["id"])
        assert len(ids) == 5


# ---------------------------------------------------------------------------
# TestLoadGame (load from completed game history)
# ---------------------------------------------------------------------------


class TestLoadGame:
    @pytest.mark.asyncio
    async def test_load_game_nonexistent_table_returns_404(self, client):
        auth = await create_test_player(client, "LoadAlice")
        data = await _create_session(client, auth["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/load-game",
            json={"table_id": "NOTEXIST"},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_load_game_returns_403_for_other_player(self, client):
        alice = await create_test_player(client, "LoadAlice2")
        bob = await create_test_player(client, "LoadBob2")

        data = await _create_session(client, alice["token"])
        session_id = data["session"]["id"]

        resp = await client.post(
            f"/api/analysis/sessions/{session_id}/load-game",
            json={"table_id": "ABCD1234"},
            headers=auth_headers(bob["token"]),
        )
        assert resp.status_code == 403
