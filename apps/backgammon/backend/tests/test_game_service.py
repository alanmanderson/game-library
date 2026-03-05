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
        # If the game started with a MOVING status (opening roll provided),
        # the current player should see valid_moves.
        if engine.state.status == GameStatus.MOVING:
            current_player_id = table.white_player_id if engine.state.current_turn == Color.WHITE else table.black_player_id
            response = gm.build_game_state_response(table.id, current_player_id)
            assert "valid_moves" in response
            assert isinstance(response["valid_moves"], list)

    async def test_opponent_sees_empty_valid_moves(self, db_session):
        gm = GameManager()
        p1 = Player(nickname="Alice")
        p2 = Player(nickname="Bob")
        db_session.add_all([p1, p2])
        await db_session.flush()

        table = await gm.create_table(db_session, p1.id)
        await gm.join_table(db_session, table.id, p2.id)

        engine = gm.get_engine(table.id)
        if engine.state.status == GameStatus.MOVING:
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
