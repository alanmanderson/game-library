"""Unit tests for the GameManager service.

Tests that do NOT require a database session exercise pure in-memory logic
(table-ID generation, engine lookup, player colour mapping).

Tests that DO need a database use the ``db_session`` fixture from conftest.
"""

import pytest

from app.services.game_service import GameManager
from app.game_engine import Color, GameStatus
from app.models import Player


# -----------------------------------------------------------------------
# Pure in-memory tests (no DB required)
# -----------------------------------------------------------------------


class TestGenerateTableId:
    def test_length_is_six(self):
        gm = GameManager()
        tid = gm.generate_table_id()
        assert len(tid) == 6

    def test_alphanumeric(self):
        gm = GameManager()
        tid = gm.generate_table_id()
        assert tid.isalnum()

    def test_uppercase(self):
        gm = GameManager()
        tid = gm.generate_table_id()
        assert tid == tid.upper()

    def test_ids_mostly_unique(self):
        gm = GameManager()
        ids = {gm.generate_table_id() for _ in range(200)}
        # With 36^6 possible IDs, 200 draws should be overwhelmingly unique.
        assert len(ids) > 180


class TestEngineAccess:
    def test_get_engine_none_when_empty(self):
        gm = GameManager()
        assert gm.get_engine("NONEXISTENT") is None

    def test_get_player_color_none_when_empty(self):
        gm = GameManager()
        assert gm.get_player_color("NONEXISTENT", "some-player") is None


# -----------------------------------------------------------------------
# Database-dependent tests
# -----------------------------------------------------------------------


class TestCreateTable:
    async def test_create_table_returns_table(self, db_session):
        gm = GameManager()
        player = Player(nickname="Alice")
        db_session.add(player)
        await db_session.flush()

        table = await gm.create_table(db_session, player.id)
        assert table is not None
        assert table.status == "waiting"
        assert table.white_player_id == player.id
        assert table.black_player_id is None

    async def test_create_table_id_is_6_chars(self, db_session):
        gm = GameManager()
        player = Player(nickname="Bob")
        db_session.add(player)
        await db_session.flush()

        table = await gm.create_table(db_session, player.id)
        assert len(table.id) == 6


    async def test_create_table_custom_match_points(self, db_session):
        gm = GameManager()
        player = Player(nickname="Carol")
        db_session.add(player)
        await db_session.flush()

        table = await gm.create_table(db_session, player.id, match_points=7)
        assert table.match_points == 7

    async def test_create_table_default_match_points(self, db_session):
        gm = GameManager()
        player = Player(nickname="Dave")
        db_session.add(player)
        await db_session.flush()

        table = await gm.create_table(db_session, player.id)
        assert table.match_points == 5


class TestJoinTable:
    async def test_join_table_starts_game(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        table = await gm.join_table(db_session, table.id, p2.id)
        assert table.status == "playing"
        assert table.white_player_id is not None
        assert table.black_player_id is not None

    async def test_join_table_creates_engine(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        await gm.join_table(db_session, table.id, p2.id)
        engine = gm.get_engine(table.id)
        assert engine is not None
        assert engine.state.status in (GameStatus.ROLLING, GameStatus.MOVING)

    async def test_join_table_assigns_colors(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        await gm.join_table(db_session, table.id, p2.id)

        white_color = gm.get_player_color(table.id, table.white_player_id)
        black_color = gm.get_player_color(table.id, table.black_player_id)
        assert white_color == Color.WHITE
        assert black_color == Color.BLACK

    async def test_join_nonexistent_table_raises(self, db_session):
        gm = GameManager()
        p = Player(nickname="Lonely")
        db_session.add(p)
        await db_session.flush()

        with pytest.raises(ValueError, match="Table not found"):
            await gm.join_table(db_session, "NOPE00", p.id)

    async def test_join_own_table_raises(self, db_session):
        gm = GameManager()
        p = Player(nickname="SoloPlayer")
        db_session.add(p)
        await db_session.flush()

        table = await gm.create_table(db_session, p.id)
        with pytest.raises(ValueError, match="Cannot join your own table"):
            await gm.join_table(db_session, table.id, p.id)

    async def test_join_already_playing_raises(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        p3 = Player(nickname="Charlie")
        db_session.add_all([p1, p2, p3])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        await gm.join_table(db_session, table.id, p2.id)

        with pytest.raises(ValueError, match="not waiting"):
            await gm.join_table(db_session, table.id, p3.id)


class TestBuildGameStateResponse:
    async def test_response_contains_valid_moves(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        await gm.join_table(db_session, table.id, p2.id)

        engine = gm.get_engine(table.id)
        # Force into MOVING state for deterministic test
        engine.state.status = GameStatus.MOVING
        engine.state.remaining_dice = [3, 1]
        engine.state.valid_moves = engine.get_valid_moves()

        current_player_id = table.white_player_id if engine.state.current_turn == Color.WHITE else table.black_player_id
        response = gm.build_game_state_response(table.id, current_player_id)
        assert "valid_moves" in response
        assert len(response["valid_moves"]) > 0

    async def test_opponent_sees_empty_valid_moves(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        await gm.join_table(db_session, table.id, p2.id)

        engine = gm.get_engine(table.id)
        # Force into MOVING state for deterministic test
        engine.state.status = GameStatus.MOVING
        engine.state.remaining_dice = [3, 1]

        # The player who is NOT the current turn should see no valid moves
        opponent_id = table.black_player_id if engine.state.current_turn == Color.WHITE else table.white_player_id
        response = gm.build_game_state_response(table.id, opponent_id)
        assert response["valid_moves"] == []


class TestRollDice:
    async def test_roll_dice_not_your_turn(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        await gm.join_table(db_session, table.id, p2.id)

        engine = gm.get_engine(table.id)
        # Force the engine into ROLLING state for the current turn
        engine.state.status = GameStatus.ROLLING

        # Find the player who is NOT the current turn
        wrong_player_id = table.black_player_id if engine.state.current_turn == Color.WHITE else table.white_player_id

        with pytest.raises(ValueError, match="Not your turn"):
            await gm.roll_dice(db_session, table.id, wrong_player_id)

    async def test_roll_dice_game_not_found(self, db_session):
        gm = GameManager()
        with pytest.raises(ValueError, match="Game not found"):
            await gm.roll_dice(db_session, "NOPE00", "some-player")


class TestUndoTurn:
    async def test_undo_after_move(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        await gm.join_table(db_session, table.id, p2.id)

        engine = gm.get_engine(table.id)
        # Force into ROLLING state so we can roll deterministic dice
        engine.state.status = GameStatus.ROLLING

        current_player_id = (
            table.white_player_id
            if engine.state.current_turn == Color.WHITE
            else table.black_player_id
        )

        # Roll dice with known values
        engine.roll_dice(die1=3, die2=1)
        assert engine.state.status == GameStatus.MOVING

        # Get valid moves and make one
        valid_moves = engine.get_valid_moves()
        assert len(valid_moves) > 0
        move = valid_moves[0]

        # Snapshot the board before the move
        points_before = list(engine.state.points)
        bar_white_before = engine.state.bar_white
        bar_black_before = engine.state.bar_black
        off_white_before = engine.state.off_white
        off_black_before = engine.state.off_black

        await gm.make_move(
            db_session, table.id, current_player_id,
            move.from_point, move.to_point,
        )

        # Board should have changed after the move
        board_changed = (
            engine.state.points != points_before
            or engine.state.bar_white != bar_white_before
            or engine.state.bar_black != bar_black_before
            or engine.state.off_white != off_white_before
            or engine.state.off_black != off_black_before
        )
        assert board_changed

        # Undo the turn
        result = await gm.undo_turn(db_session, table.id, current_player_id)
        assert result is True

        # Board should be restored to pre-move state
        assert engine.state.points == points_before
        assert engine.state.bar_white == bar_white_before
        assert engine.state.bar_black == bar_black_before
        assert engine.state.off_white == off_white_before
        assert engine.state.off_black == off_black_before
        assert engine.state.turn_moves == []

    async def test_undo_with_no_moves(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        await gm.join_table(db_session, table.id, p2.id)

        engine = gm.get_engine(table.id)
        # Force into ROLLING, then roll so we get MOVING with no turn_moves yet
        engine.state.status = GameStatus.ROLLING

        current_player_id = (
            table.white_player_id
            if engine.state.current_turn == Color.WHITE
            else table.black_player_id
        )

        engine.roll_dice(die1=5, die2=2)

        # If auto-skip happened (no valid moves), the engine may have switched turns.
        # In that case undo is not applicable. Only test undo if still MOVING.
        if engine.state.status == GameStatus.MOVING:
            # No moves made yet, undo should fail
            with pytest.raises(ValueError, match="Nothing to undo"):
                await gm.undo_turn(db_session, table.id, current_player_id)


class TestDoubling:
    async def test_offer_double(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        await gm.join_table(db_session, table.id, p2.id)

        engine = gm.get_engine(table.id)
        # Force into ROLLING so doubling is possible
        engine.state.status = GameStatus.ROLLING
        # Cube starts centered (cube_owner = None), so current player can double
        engine.state.cube_owner = None
        engine.state.double_offered = False

        current_player_id = (
            table.white_player_id
            if engine.state.current_turn == Color.WHITE
            else table.black_player_id
        )

        result = await gm.offer_double(db_session, table.id, current_player_id)
        assert result is True
        assert engine.state.double_offered is True
        assert engine.state.double_offered_by == engine.state.current_turn

    async def test_accept_double(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        await gm.join_table(db_session, table.id, p2.id)

        engine = gm.get_engine(table.id)
        # Force into ROLLING so doubling is possible
        engine.state.status = GameStatus.ROLLING
        engine.state.cube_owner = None
        engine.state.cube_value = 1

        current_player_id = (
            table.white_player_id
            if engine.state.current_turn == Color.WHITE
            else table.black_player_id
        )
        opponent_id = (
            table.black_player_id
            if engine.state.current_turn == Color.WHITE
            else table.white_player_id
        )

        # Offer the double
        await gm.offer_double(db_session, table.id, current_player_id)
        assert engine.state.cube_value == 1

        # Accept the double
        result = await gm.accept_double(db_session, table.id, opponent_id)
        assert result is True
        assert engine.state.cube_value == 2
        assert engine.state.double_offered is False
        # The accepting player now owns the cube
        opponent_color = gm.get_player_color(table.id, opponent_id)
        assert engine.state.cube_owner == opponent_color

    async def test_decline_double(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        await gm.join_table(db_session, table.id, p2.id)

        engine = gm.get_engine(table.id)
        # Force into ROLLING so doubling is possible
        engine.state.status = GameStatus.ROLLING
        engine.state.cube_owner = None

        current_color = engine.state.current_turn
        current_player_id = (
            table.white_player_id
            if current_color == Color.WHITE
            else table.black_player_id
        )
        opponent_id = (
            table.black_player_id
            if current_color == Color.WHITE
            else table.white_player_id
        )

        # Offer the double
        await gm.offer_double(db_session, table.id, current_player_id)

        # Decline the double
        result = await gm.decline_double(db_session, table.id, opponent_id)
        assert result["winner"] == current_color.value
        assert engine.state.status == GameStatus.FINISHED
        assert engine.state.winner == current_color


class TestCrawfordRule:
    """Tests for the Crawford Rule in the GameManager.

    The Crawford Rule triggers when either player reaches match_points - 1.
    The next game is a Crawford game (no doubling). It only triggers once
    per match.
    """

    async def test_crawford_triggers_at_match_point(self, db_session):
        """Crawford game triggers when a player reaches match_points - 1."""
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id, match_points=5)
        await gm.join_table(db_session, table.id, p2.id)

        # Simulate: white wins and reaches 4 (match_points - 1)
        engine = gm.get_engine(table.id)
        table.white_match_score = 4
        table.black_match_score = 0
        table.status = "game_over"
        table.game_state = engine.get_state_snapshot()
        await db_session.flush()

        # Start the next game -- should be a Crawford game
        table = await gm.start_next_game(db_session, table.id)
        new_engine = gm.get_engine(table.id)
        assert new_engine.state.is_crawford_game is True

    async def test_crawford_only_triggers_once(self, db_session):
        """Crawford game only happens once, even if still at match point."""
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id, match_points=5)
        await gm.join_table(db_session, table.id, p2.id)

        # Simulate: white at match_points - 1
        engine = gm.get_engine(table.id)
        table.white_match_score = 4
        table.black_match_score = 0
        table.status = "game_over"
        table.game_state = engine.get_state_snapshot()
        await db_session.flush()

        # First next game: Crawford
        table = await gm.start_next_game(db_session, table.id)
        engine = gm.get_engine(table.id)
        assert engine.state.is_crawford_game is True

        # Simulate: black wins the Crawford game, white still at 4
        table.status = "game_over"
        table.game_state = engine.get_state_snapshot()
        await db_session.flush()

        # Second next game: NOT Crawford (already used)
        table = await gm.start_next_game(db_session, table.id)
        engine = gm.get_engine(table.id)
        assert engine.state.is_crawford_game is False

    async def test_no_crawford_for_1_point_match(self, db_session):
        """Crawford rule doesn't apply to 1-point matches."""
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id, match_points=1)
        await gm.join_table(db_session, table.id, p2.id)

        engine = gm.get_engine(table.id)
        table.white_match_score = 0
        table.black_match_score = 0
        table.status = "game_over"
        table.game_state = engine.get_state_snapshot()
        await db_session.flush()

        table = await gm.start_next_game(db_session, table.id)
        engine = gm.get_engine(table.id)
        assert engine.state.is_crawford_game is False

    async def test_crawford_blocks_doubling_in_game_service(self, db_session):
        """During a Crawford game, offering a double raises an error."""
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id, match_points=5)
        await gm.join_table(db_session, table.id, p2.id)

        # Simulate: white at match_points - 1
        engine = gm.get_engine(table.id)
        table.white_match_score = 4
        table.black_match_score = 0
        table.status = "game_over"
        table.game_state = engine.get_state_snapshot()
        await db_session.flush()

        # Start Crawford game
        table = await gm.start_next_game(db_session, table.id)
        engine = gm.get_engine(table.id)
        assert engine.state.is_crawford_game is True

        # Force into ROLLING so doubling would normally be possible
        engine.state.status = GameStatus.ROLLING
        engine.state.cube_owner = None

        current_player_id = (
            table.white_player_id
            if engine.state.current_turn == Color.WHITE
            else table.black_player_id
        )

        # Attempt to double -- should fail
        with pytest.raises(ValueError, match="Cannot double now"):
            await gm.offer_double(db_session, table.id, current_player_id)

    async def test_crawford_game_used_persists_in_snapshot(self, db_session):
        """crawford_game_used flag is persisted in the game_state JSON."""
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id, match_points=5)
        await gm.join_table(db_session, table.id, p2.id)

        # Simulate: white at match_points - 1
        engine = gm.get_engine(table.id)
        table.white_match_score = 4
        table.black_match_score = 0
        table.status = "game_over"
        table.game_state = engine.get_state_snapshot()
        await db_session.flush()

        # Start Crawford game
        table = await gm.start_next_game(db_session, table.id)
        assert table.game_state.get("crawford_game_used") is True
        assert table.game_state.get("is_crawford_game") is True
