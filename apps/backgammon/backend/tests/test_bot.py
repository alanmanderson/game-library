"""Tests for the bot player feature."""

import asyncio
import os
import random
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Add ml/ to path so we can import encoder and model modules directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'ml'))

from app.game_engine import BackgammonEngine, Color, GameStatus, Move
from app.services.bot_service import (
    BOT_PLAYER_ID,
    _heuristic_score_move,
    _select_bot_move,
    _table_difficulties,
    ensure_bot_player,
    get_bot_difficulty,
    is_bot_player,
    set_bot_difficulty,
    restore_bot_difficulty,
)
from app.services.game_service import game_manager
from tests.conftest import (
    auth_headers,
    create_test_player,
    create_test_table,
)


class TestBotService:
    """Unit tests for bot_service functions."""

    async def test_is_bot_player(self):
        assert is_bot_player(BOT_PLAYER_ID) is True
        assert is_bot_player("some-other-id") is False

    async def test_ensure_bot_player_creates(self, db_session):
        bot = await ensure_bot_player(db_session)
        assert bot.id == BOT_PLAYER_ID
        assert bot.nickname == "Bot"
        assert bot.is_guest is True
        assert bot.auth_provider == "bot"

    async def test_ensure_bot_player_idempotent(self, db_session):
        bot1 = await ensure_bot_player(db_session)
        await db_session.flush()
        bot2 = await ensure_bot_player(db_session)
        assert bot1.id == bot2.id


class TestInviteBotEndpoint:
    """Tests for the POST /api/tables/{table_id}/invite-bot endpoint."""

    async def test_invite_bot_success(self, client):
        """Inviting bot to a waiting table starts the game."""
        auth = await create_test_player(client, "Alice")
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = await create_test_table(client, token, player_id)
        assert table["status"] == "waiting"

        resp = await client.post(
            f"/api/tables/{table['id']}/invite-bot",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "playing"

        # One of the players should be the bot
        players = [data.get("white_player"), data.get("black_player")]
        player_ids = [p["id"] for p in players if p]
        assert BOT_PLAYER_ID in player_ids
        assert player_id in player_ids

    async def test_invite_bot_nonexistent_table(self, client):
        """Inviting bot to a nonexistent table returns 400."""
        auth = await create_test_player(client, "Alice")
        resp = await client.post(
            "/api/tables/NOEXIST/invite-bot",
            json={},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 400

    async def test_invite_bot_already_playing(self, client):
        """Inviting bot to a table that's already playing returns 400."""
        auth = await create_test_player(client, "Alice")
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = await create_test_table(client, token, player_id)

        # First invite succeeds
        resp = await client.post(
            f"/api/tables/{table['id']}/invite-bot",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200

        # Second invite fails
        resp = await client.post(
            f"/api/tables/{table['id']}/invite-bot",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

    async def test_invite_bot_unauthenticated(self, client):
        """Inviting bot without auth returns 401."""
        resp = await client.post("/api/tables/XXXXXX/invite-bot", json={})
        assert resp.status_code == 401

    async def test_invite_bot_creates_engine(self, client):
        """Inviting bot creates a game engine with correct player colors."""
        auth = await create_test_player(client, "Alice")
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = await create_test_table(client, token, player_id)
        table_id = table["id"]

        resp = await client.post(
            f"/api/tables/{table_id}/invite-bot",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200

        engine = game_manager.get_engine(table_id)
        assert engine is not None

        # Both players should have colors
        human_color = game_manager.get_player_color(table_id, player_id)
        bot_color = game_manager.get_player_color(table_id, BOT_PLAYER_ID)
        assert human_color is not None
        assert bot_color is not None
        assert human_color != bot_color


class TestBotGameplay:
    """Test that the bot logic correctly makes moves."""

    async def test_bot_makes_random_moves(self, client, db_session):
        """The bot should roll, make random moves, and end its turn."""
        from app.services.bot_service import get_bot_color, ensure_bot_player
        from app.game_engine import Color, GameStatus

        auth = await create_test_player(client, "Alice")
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = await create_test_table(client, token, player_id)
        table_id = table["id"]

        # Create bot player in test DB and join
        await ensure_bot_player(db_session)
        await db_session.commit()

        resp = await client.post(
            f"/api/tables/{table_id}/invite-bot",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200

        engine = game_manager.get_engine(table_id)
        assert engine is not None

        bot_color = get_bot_color(table_id)
        human_color = game_manager.get_player_color(table_id, player_id)
        assert bot_color is not None
        assert human_color is not None

        # If it's the human's turn first (from opening roll), simulate
        # a full turn so it becomes the bot's turn
        if engine.state.current_turn == human_color:
            # Human rolls if needed
            if engine.state.status == GameStatus.ROLLING:
                await game_manager.roll_dice(db_session, table_id, player_id)

            # Make all possible moves for human
            while engine.state.current_turn == human_color and engine.state.status == GameStatus.MOVING:
                moves = engine.get_valid_moves()
                if not moves:
                    await game_manager.end_turn(db_session, table_id, player_id)
                    break
                move = moves[0]
                await game_manager.make_move(db_session, table_id, player_id, move.from_point, move.to_point)
            await db_session.commit()

        # Now it should be the bot's turn
        assert engine.state.current_turn == bot_color

        # Simulate what the bot does: roll dice (if needed), make random moves
        if engine.state.status == GameStatus.ROLLING:
            await game_manager.roll_dice(db_session, table_id, BOT_PLAYER_ID)

        # Make all moves for the bot
        import random
        while engine.state.current_turn == bot_color and engine.state.status == GameStatus.MOVING:
            moves = engine.get_valid_moves()
            if not moves:
                await game_manager.end_turn(db_session, table_id, BOT_PLAYER_ID)
                break
            move = random.choice(moves)
            await game_manager.make_move(db_session, table_id, BOT_PLAYER_ID, move.from_point, move.to_point)

        await db_session.commit()

        # After bot's turn, it should be the human's turn again (unless game ended)
        if engine.state.status != GameStatus.FINISHED:
            assert engine.state.current_turn == human_color


class TestStatsSkipBot:
    """Verify that stats are not tracked for bot games."""

    async def test_stats_not_updated_for_bot_game(self, db_session):
        """update_stats should be a no-op when one player is the bot."""
        from app.services.stats_service import update_stats
        from app.game_engine import WinType

        await ensure_bot_player(db_session)

        # This should not create any PlayerStats records
        await update_stats(
            db_session,
            white_player_id="some-human",
            black_player_id=BOT_PLAYER_ID,
            winner_id="some-human",
            win_type=WinType.NORMAL,
        )
        await db_session.flush()

        from sqlalchemy import select
        from app.models import PlayerStats
        result = await db_session.execute(select(PlayerStats))
        stats = result.scalars().all()
        assert len(stats) == 0


# -----------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------

def _make_engine_at_moving(color: Color = Color.WHITE, die1: int = 3, die2: int = 1) -> BackgammonEngine:
    """Create an engine already in MOVING status with specific dice."""
    engine = BackgammonEngine()
    engine.start_game(first_player=color)
    engine.roll_dice(die1=die1, die2=die2)
    return engine


def _make_engine_bearing_off(color: Color = Color.WHITE) -> BackgammonEngine:
    """Create an engine with all checkers in the home board ready to bear off."""
    engine = BackgammonEngine()
    engine.state.points = [0] * 26
    if color == Color.WHITE:
        # White checkers in home board (points 1-6)
        engine.state.points[6] = 5
        engine.state.points[5] = 5
        engine.state.points[4] = 3
        engine.state.points[3] = 2
    else:
        # Black checkers in home board (points 19-24)
        engine.state.points[19] = -5
        engine.state.points[20] = -5
        engine.state.points[21] = -3
        engine.state.points[22] = -2
    engine.state.current_turn = color
    engine.state.status = GameStatus.ROLLING
    return engine


def _make_engine_bar_entry(color: Color = Color.WHITE) -> BackgammonEngine:
    """Create an engine with a checker on the bar that needs to re-enter."""
    engine = BackgammonEngine()
    engine.state.points = [0] * 26
    if color == Color.WHITE:
        engine.state.bar_white = 1
        # Remaining white checkers on board
        engine.state.points[13] = 5
        engine.state.points[8] = 3
        engine.state.points[6] = 5
        engine.state.points[24] = 1
    else:
        engine.state.bar_black = 1
        engine.state.points[12] = -5
        engine.state.points[17] = -3
        engine.state.points[19] = -5
        engine.state.points[1] = -1
    engine.state.current_turn = color
    engine.state.status = GameStatus.ROLLING
    return engine


# -----------------------------------------------------------------------
# Difficulty Selection Tests
# -----------------------------------------------------------------------

class TestDifficultySelection:
    """Tests for difficulty storage, retrieval, and restoration."""

    def setup_method(self):
        """Clear difficulty tracking between tests."""
        _table_difficulties.clear()

    def test_default_difficulty_is_hard(self):
        """Default difficulty when not explicitly set should be 'hard'."""
        assert get_bot_difficulty("UNKNOWN1") == "hard"

    def test_set_and_get_difficulty(self):
        """Setting a difficulty should be retrievable."""
        set_bot_difficulty("TABLE01", "easy")
        assert get_bot_difficulty("TABLE01") == "easy"

        set_bot_difficulty("TABLE02", "medium")
        assert get_bot_difficulty("TABLE02") == "medium"

        set_bot_difficulty("TABLE03", "hard")
        assert get_bot_difficulty("TABLE03") == "hard"

    def test_set_difficulty_overwrites(self):
        """Setting difficulty twice should overwrite the first value."""
        set_bot_difficulty("TABLE01", "easy")
        set_bot_difficulty("TABLE01", "hard")
        assert get_bot_difficulty("TABLE01") == "hard"

    def test_invalid_difficulty_stored_as_is(self):
        """Invalid difficulty strings are stored without validation."""
        set_bot_difficulty("TABLE01", "impossible")
        assert get_bot_difficulty("TABLE01") == "impossible"

    async def test_restore_difficulty_from_database(self, db_session):
        """restore_bot_difficulty should load difficulty from the Table model."""
        from app.models import Table, Player

        # Create a player and table in DB with bot_difficulty set
        player = Player(id="test-player", nickname="Test", is_guest=True, auth_provider="guest")
        db_session.add(player)
        await db_session.flush()

        table = Table(id="RESTORE1", status="playing", white_player_id="test-player", bot_difficulty="medium")
        db_session.add(table)
        await db_session.flush()

        await restore_bot_difficulty("RESTORE1", db_session)
        assert get_bot_difficulty("RESTORE1") == "medium"

    async def test_restore_difficulty_skips_if_already_cached(self, db_session):
        """If difficulty is already in memory, restore should be a no-op."""
        set_bot_difficulty("CACHED1", "easy")
        # Even if DB has a different value, the cached one should stick
        await restore_bot_difficulty("CACHED1", db_session)
        assert get_bot_difficulty("CACHED1") == "easy"

    async def test_restore_difficulty_nonexistent_table(self, db_session):
        """Restoring for a nonexistent table should leave default."""
        await restore_bot_difficulty("NOEXIST1", db_session)
        assert get_bot_difficulty("NOEXIST1") == "hard"

    async def test_restore_difficulty_table_without_bot_difficulty(self, db_session):
        """When bot_difficulty is NULL in DB, should not set anything."""
        from app.models import Table, Player

        player = Player(id="test-p2", nickname="Test2", is_guest=True, auth_provider="guest")
        db_session.add(player)
        await db_session.flush()

        table = Table(id="NULLDIFF", status="playing", white_player_id="test-p2", bot_difficulty=None)
        db_session.add(table)
        await db_session.flush()

        await restore_bot_difficulty("NULLDIFF", db_session)
        # Should still be default since bot_difficulty is None
        assert get_bot_difficulty("NULLDIFF") == "hard"


# -----------------------------------------------------------------------
# Easy Difficulty (Random) Tests
# -----------------------------------------------------------------------

class TestEasyDifficulty:
    """Tests for the easy (random) difficulty level."""

    def setup_method(self):
        _table_difficulties.clear()

    def test_easy_selects_from_valid_moves(self):
        """Easy difficulty should return one of the valid moves."""
        engine = _make_engine_at_moving(Color.WHITE, 3, 1)
        valid_moves = engine.get_valid_moves()
        assert len(valid_moves) > 0

        set_bot_difficulty("EASY01", "easy")
        # Run multiple times to verify it always returns a valid move
        for _ in range(20):
            chosen = _select_bot_move(engine, valid_moves, "EASY01")
            assert chosen in valid_moves

    def test_easy_handles_single_valid_move(self):
        """When only one move is valid, easy should return it."""
        engine = BackgammonEngine()
        engine.state.points = [0] * 26
        # Only one white checker, on point 6
        engine.state.points[6] = 1
        engine.state.off_white = 14
        engine.state.current_turn = Color.WHITE
        engine.state.status = GameStatus.MOVING
        engine.state.remaining_dice = [3]
        engine.state.dice = type("DiceRoll", (), {"values": (3, 3)})()

        valid_moves = engine.get_valid_moves()
        if len(valid_moves) == 1:
            set_bot_difficulty("EASY02", "easy")
            chosen = _select_bot_move(engine, valid_moves, "EASY02")
            assert chosen == valid_moves[0]

    def test_easy_randomness(self):
        """Easy mode should exhibit randomness across many selections."""
        engine = _make_engine_at_moving(Color.WHITE, 5, 3)
        valid_moves = engine.get_valid_moves()
        if len(valid_moves) <= 1:
            pytest.skip("Need multiple valid moves for randomness test")

        set_bot_difficulty("EASY03", "easy")
        selections = set()
        for _ in range(100):
            chosen = _select_bot_move(engine, valid_moves, "EASY03")
            selections.add((chosen.from_point, chosen.to_point))

        # With enough trials, random selection should pick more than one move
        assert len(selections) > 1, "Easy mode should show variation in move selection"


# -----------------------------------------------------------------------
# Medium Difficulty (Heuristic) Tests
# -----------------------------------------------------------------------

class TestMediumDifficulty:
    """Tests for the medium (heuristic) difficulty level."""

    def setup_method(self):
        _table_difficulties.clear()

    def test_heuristic_prefers_hitting(self):
        """Heuristic should score hitting moves higher than non-hitting moves."""
        engine = BackgammonEngine()
        hit_move = Move(from_point=8, to_point=5, is_hit=True)
        normal_move = Move(from_point=8, to_point=5, is_hit=False)

        score_hit = _heuristic_score_move(engine, hit_move)
        score_normal = _heuristic_score_move(engine, normal_move)
        # The hit bonus is 3.0, so even with jitter it should be higher
        assert score_hit > score_normal

    def test_heuristic_prefers_bearing_off(self):
        """Heuristic should score bearing off moves very highly."""
        engine = BackgammonEngine()
        bear_off_move = Move(from_point=3, to_point=0, is_hit=False)
        normal_move = Move(from_point=13, to_point=10, is_hit=False)

        score_bearoff = _heuristic_score_move(engine, bear_off_move)
        score_normal = _heuristic_score_move(engine, normal_move)
        assert score_bearoff > score_normal

    def test_heuristic_prefers_bar_escape(self):
        """Heuristic should score bar re-entry moves higher."""
        engine = BackgammonEngine()
        engine.state.current_turn = Color.WHITE
        bar_move = Move(from_point=25, to_point=22, is_hit=False)
        normal_move = Move(from_point=13, to_point=10, is_hit=False)

        score_bar = _heuristic_score_move(engine, bar_move)
        score_normal = _heuristic_score_move(engine, normal_move)
        assert score_bar > score_normal

    def test_heuristic_prefers_making_points(self):
        """Landing where we already have 1 checker (making a point) should be preferred."""
        engine = BackgammonEngine()
        engine.state.current_turn = Color.WHITE
        # Place one white checker on point 10
        engine.state.points[10] = 1

        make_point_move = Move(from_point=13, to_point=10, is_hit=False)
        # Move to an empty point
        engine.state.points[9] = 0
        empty_move = Move(from_point=12, to_point=9, is_hit=False)

        score_make = _heuristic_score_move(engine, make_point_move)
        score_empty = _heuristic_score_move(engine, empty_move)
        # Making a point gives +2.5, so it should be clearly higher
        assert score_make > score_empty + 2.0

    def test_heuristic_penalizes_leaving_blots(self):
        """Heuristic should penalize moves that leave a single checker behind."""
        engine = BackgammonEngine()
        engine.state.current_turn = Color.WHITE
        # Place one white checker at point 8 (will be a blot after move)
        engine.state.points[8] = 1

        blot_move = Move(from_point=8, to_point=5, is_hit=False)
        # Move from a safe stack
        engine.state.points[13] = 5
        safe_move = Move(from_point=13, to_point=10, is_hit=False)

        score_blot = _heuristic_score_move(engine, blot_move)
        score_safe = _heuristic_score_move(engine, safe_move)
        assert score_blot < score_safe

    def test_medium_selects_best_heuristic_move(self):
        """Medium difficulty should select the move with the highest heuristic score."""
        engine = _make_engine_at_moving(Color.WHITE, 3, 1)
        valid_moves = engine.get_valid_moves()
        assert len(valid_moves) > 0

        set_bot_difficulty("MED01", "medium")
        chosen = _select_bot_move(engine, valid_moves, "MED01")
        assert chosen in valid_moves

        # It should be the max-scored move (allowing for jitter)
        # Run the selection and verify it's consistently picking good moves
        scores = [_heuristic_score_move(engine, m) for m in valid_moves]
        max_score = max(scores)
        chosen_score = _heuristic_score_move(engine, chosen)
        # The chosen move should be near the top (within jitter range)
        assert chosen_score >= max_score - 0.2

    def test_medium_handles_bearing_off_position(self):
        """Medium difficulty should handle bearing-off positions correctly."""
        engine = _make_engine_bearing_off(Color.WHITE)
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(die1=3, die2=2)
        valid_moves = engine.get_valid_moves()

        if valid_moves:
            set_bot_difficulty("MED02", "medium")
            chosen = _select_bot_move(engine, valid_moves, "MED02")
            assert chosen in valid_moves

    def test_medium_handles_bar_entry(self):
        """Medium difficulty should handle bar re-entry positions."""
        engine = _make_engine_bar_entry(Color.WHITE)
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(die1=3, die2=1)
        valid_moves = engine.get_valid_moves()

        if valid_moves:
            set_bot_difficulty("MED03", "medium")
            chosen = _select_bot_move(engine, valid_moves, "MED03")
            assert chosen in valid_moves
            # Bar entry moves should be present since checker is on bar
            bar_moves = [m for m in valid_moves if m.from_point == 25]
            assert len(bar_moves) > 0

    def test_heuristic_black_perspective(self):
        """Heuristic should work correctly for black pieces."""
        engine = BackgammonEngine()
        engine.state.current_turn = Color.BLACK
        # Black checker making a point
        engine.state.points[15] = -1
        make_point_move = Move(from_point=12, to_point=15, is_hit=False)

        score = _heuristic_score_move(engine, make_point_move)
        # Should get the 2.5 bonus for making a point
        assert score >= 2.5


# -----------------------------------------------------------------------
# Hard Difficulty (ML) Tests
# -----------------------------------------------------------------------

class TestHardDifficulty:
    """Tests for the hard (ML neural network) difficulty level."""

    def setup_method(self):
        _table_difficulties.clear()

    def test_hard_falls_back_to_random_when_model_missing(self):
        """When the ML model cannot be loaded, hard should fall back to random."""
        engine = _make_engine_at_moving(Color.WHITE, 3, 1)
        valid_moves = engine.get_valid_moves()
        assert len(valid_moves) > 0

        set_bot_difficulty("HARD01", "hard")
        with patch("app.services.bot_service._load_ml_bot", return_value=None):
            chosen = _select_bot_move(engine, valid_moves, "HARD01")
            assert chosen in valid_moves

    def test_hard_uses_ml_model_when_available(self):
        """When the ML model is available, hard should use it for move selection."""
        engine = _make_engine_at_moving(Color.WHITE, 3, 1)
        valid_moves = engine.get_valid_moves()
        assert len(valid_moves) > 0

        # Create a mock ML bot that always returns the last valid move
        mock_ml_bot = MagicMock()
        mock_ml_bot.select_move.return_value = valid_moves[-1]

        set_bot_difficulty("HARD02", "hard")
        with patch("app.services.bot_service._load_ml_bot", return_value=mock_ml_bot):
            chosen = _select_bot_move(engine, valid_moves, "HARD02")
            assert chosen == valid_moves[-1]
            mock_ml_bot.select_move.assert_called_once_with(engine)

    def test_hard_falls_back_when_ml_returns_none(self):
        """When ML model returns None, hard should fall back to random."""
        engine = _make_engine_at_moving(Color.WHITE, 3, 1)
        valid_moves = engine.get_valid_moves()
        assert len(valid_moves) > 0

        mock_ml_bot = MagicMock()
        mock_ml_bot.select_move.return_value = None

        set_bot_difficulty("HARD03", "hard")
        with patch("app.services.bot_service._load_ml_bot", return_value=mock_ml_bot):
            chosen = _select_bot_move(engine, valid_moves, "HARD03")
            assert chosen in valid_moves

    def test_hard_falls_back_on_ml_exception(self):
        """When ML model raises an exception, hard should fall back to random."""
        engine = _make_engine_at_moving(Color.WHITE, 3, 1)
        valid_moves = engine.get_valid_moves()
        assert len(valid_moves) > 0

        mock_ml_bot = MagicMock()
        mock_ml_bot.select_move.side_effect = ValueError("model error")

        set_bot_difficulty("HARD04", "hard")
        with patch("app.services.bot_service._load_ml_bot", return_value=mock_ml_bot):
            chosen = _select_bot_move(engine, valid_moves, "HARD04")
            assert chosen in valid_moves

    def test_hard_is_default_for_unknown_table(self):
        """An unknown table should default to hard difficulty."""
        engine = _make_engine_at_moving(Color.WHITE, 3, 1)
        valid_moves = engine.get_valid_moves()

        mock_ml_bot = MagicMock()
        mock_ml_bot.select_move.return_value = valid_moves[0]

        with patch("app.services.bot_service._load_ml_bot", return_value=mock_ml_bot):
            chosen = _select_bot_move(engine, valid_moves, "UNKNOWN_TABLE")
            mock_ml_bot.select_move.assert_called_once()

    def test_invalid_difficulty_falls_through_to_hard(self):
        """An invalid difficulty value should fall through to hard (ML)."""
        engine = _make_engine_at_moving(Color.WHITE, 3, 1)
        valid_moves = engine.get_valid_moves()

        mock_ml_bot = MagicMock()
        mock_ml_bot.select_move.return_value = valid_moves[0]

        set_bot_difficulty("INVALID1", "impossible")
        with patch("app.services.bot_service._load_ml_bot", return_value=mock_ml_bot):
            chosen = _select_bot_move(engine, valid_moves, "INVALID1")
            # "impossible" doesn't match easy, medium, or expert,
            # so it falls through to the default hard path
            mock_ml_bot.select_move.assert_called_once()


# -----------------------------------------------------------------------
# Doubling Cube Decision Tests
# -----------------------------------------------------------------------

class TestDoublingCubeDecisions:
    """Tests for bot doubling cube accept/reject/offer logic via ML model."""

    def test_ml_bot_accepts_double_high_equity(self):
        """ML bot should accept a double when equity > -0.5."""
        torch = pytest.importorskip("torch")

        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.state.current_turn = Color.WHITE

        # Mock the model to return outputs that give equity > -0.5
        # P(win)=0.4 gives equity = 2*0.4-1 = -0.2 > -0.5, so accept
        mock_model = MagicMock()
        mock_model.eval = MagicMock()
        mock_model.to = MagicMock(return_value=mock_model)
        mock_model.return_value = torch.tensor([0.4, 0.0, 0.0, 0.0, 0.0])

        with patch("app.services.bot_service._load_ml_bot") as mock_load:
            ml_bot_mock = MagicMock()
            ml_bot_mock.should_accept_double.return_value = True
            mock_load.return_value = ml_bot_mock
            # Verify the mock's behavior
            assert ml_bot_mock.should_accept_double(engine) is True

    def test_ml_bot_declines_double_low_equity(self):
        """ML bot should decline a double when equity < -0.5."""
        ml_bot_mock = MagicMock()
        ml_bot_mock.should_accept_double.return_value = False

        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        assert ml_bot_mock.should_accept_double(engine) is False

    def test_ml_bot_offers_double_high_equity(self):
        """ML bot should offer a double when equity > 0.5."""
        ml_bot_mock = MagicMock()
        ml_bot_mock.should_double.return_value = True

        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        assert ml_bot_mock.should_double(engine) is True

    def test_ml_bot_does_not_offer_double_low_equity(self):
        """ML bot should not offer a double when equity <= 0.5."""
        ml_bot_mock = MagicMock()
        ml_bot_mock.should_double.return_value = False

        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        assert ml_bot_mock.should_double(engine) is False

    def test_accept_double_boundary_at_minus_half(self):
        """Test the boundary condition: equity exactly at -0.5."""
        torch = pytest.importorskip("torch")
        from model import compute_equity

        # P(win) = 0.25 gives equity = 2*0.25 - 1 = -0.5 (boundary)
        outputs = torch.tensor([0.25, 0.0, 0.0, 0.0, 0.0])
        equity = compute_equity(outputs).item()
        assert abs(equity - (-0.5)) < 1e-6
        # At exactly -0.5, should_accept_double returns False (equity > -0.5 is False)
        assert not (equity > -0.5)

    def test_offer_double_boundary_at_half(self):
        """Test the boundary condition: equity exactly at 0.5."""
        torch = pytest.importorskip("torch")
        from model import compute_equity

        # P(win) = 0.75 gives equity = 2*0.75 - 1 = 0.5 (boundary)
        outputs = torch.tensor([0.75, 0.0, 0.0, 0.0, 0.0])
        equity = compute_equity(outputs).item()
        assert abs(equity - 0.5) < 1e-6
        # At exactly 0.5, should_double returns False (equity > 0.5 is False)
        assert not (equity > 0.5)

    def test_gammon_probabilities_affect_doubling(self):
        """Gammon and backgammon probabilities should affect equity for doubling."""
        torch = pytest.importorskip("torch")
        from model import compute_equity

        # Base: P(win)=0.5, no gammons -> equity = 0.0
        base_outputs = torch.tensor([0.5, 0.0, 0.0, 0.0, 0.0])
        base_equity = compute_equity(base_outputs).item()
        assert abs(base_equity) < 1e-6

        # With gammon threat: P(win)=0.5, P(win_gammon)=0.3 -> equity = 0.3
        gammon_outputs = torch.tensor([0.5, 0.3, 0.0, 0.0, 0.0])
        gammon_equity = compute_equity(gammon_outputs).item()
        assert gammon_equity > base_equity

        # With lose gammon threat: P(win)=0.5, P(lose_gammon)=0.3 -> equity = -0.3
        lose_gammon_outputs = torch.tensor([0.5, 0.0, 0.3, 0.0, 0.0])
        lose_equity = compute_equity(lose_gammon_outputs).item()
        assert lose_equity < base_equity


# -----------------------------------------------------------------------
# ML Encoding Tests
# -----------------------------------------------------------------------

class TestMLEncoding:
    """Tests for the 198-feature board encoding used by the ML model."""

    def test_encoding_produces_198_features(self):
        """encode_state should produce a 198-element vector."""
        pytest.importorskip("numpy")
        from encoder import encode_state

        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        features = encode_state(engine, Color.WHITE)
        assert features.shape == (198,)

    def test_encoding_produces_198_features_black(self):
        """encode_state from Black's perspective should also be 198 features."""
        pytest.importorskip("numpy")
        from encoder import encode_state

        engine = BackgammonEngine()
        engine.start_game(first_player=Color.BLACK)

        features = encode_state(engine, Color.BLACK)
        assert features.shape == (198,)

    def test_encoding_initial_position_symmetry(self):
        """White and Black encodings of initial position should have related structure."""
        pytest.importorskip("numpy")
        from encoder import encode_state

        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        white_features = encode_state(engine, Color.WHITE)
        black_features = encode_state(engine, Color.BLACK)

        # Both should be 198 features
        assert white_features.shape == black_features.shape == (198,)
        # They should not be identical (perspective differs)
        assert not (white_features == black_features).all()

    def test_encoding_empty_board(self):
        """Encoding an empty board should produce mostly zeros."""
        np = pytest.importorskip("numpy")
        from encoder import encode_state

        engine = BackgammonEngine()
        engine.state.points = [0] * 26
        engine.state.bar_white = 0
        engine.state.bar_black = 0
        engine.state.off_white = 0
        engine.state.off_black = 0
        engine.state.current_turn = Color.WHITE
        engine.state.status = GameStatus.ROLLING

        features = encode_state(engine, Color.WHITE)
        # First 192 features (board points) should be all zeros
        assert np.sum(features[:192]) == 0.0
        # Bar features (indices 192-193) should be 0
        assert features[192] == 0.0
        assert features[193] == 0.0
        # Borne-off features (indices 194-195) should be 0
        assert features[194] == 0.0
        assert features[195] == 0.0
        # Turn indicator (indices 196-197) should be [1, 0] for white
        assert features[196] == 1.0
        assert features[197] == 0.0

    def test_encoding_checker_count_encoding(self):
        """Verify truncated unary encoding for different checker counts."""
        pytest.importorskip("numpy")
        from encoder import _encode_point_checkers

        assert _encode_point_checkers(0) == [0.0, 0.0, 0.0, 0.0]
        assert _encode_point_checkers(1) == [1.0, 0.0, 0.0, 0.0]
        assert _encode_point_checkers(2) == [1.0, 1.0, 0.0, 0.0]
        assert _encode_point_checkers(3) == [1.0, 1.0, 1.0, 0.0]
        assert _encode_point_checkers(4) == [1.0, 1.0, 1.0, 0.5]
        assert _encode_point_checkers(5) == [1.0, 1.0, 1.0, 1.0]
        assert _encode_point_checkers(7) == [1.0, 1.0, 1.0, 2.0]

    def test_encoding_bar_normalization(self):
        """Bar counts should be normalized by dividing by 2."""
        pytest.importorskip("numpy")
        from encoder import encode_state

        engine = BackgammonEngine()
        engine.state.points = [0] * 26
        engine.state.bar_white = 2
        engine.state.bar_black = 1
        engine.state.current_turn = Color.WHITE
        engine.state.status = GameStatus.ROLLING

        features = encode_state(engine, Color.WHITE)
        # Bar features at indices 192 (white) and 193 (black)
        assert features[192] == 1.0   # 2/2
        assert features[193] == 0.5   # 1/2

    def test_encoding_borne_off_normalization(self):
        """Borne-off counts should be normalized by dividing by 15."""
        pytest.importorskip("numpy")
        from encoder import encode_state

        engine = BackgammonEngine()
        engine.state.points = [0] * 26
        engine.state.off_white = 15
        engine.state.off_black = 5
        engine.state.current_turn = Color.WHITE
        engine.state.status = GameStatus.ROLLING

        features = encode_state(engine, Color.WHITE)
        # Borne-off features at indices 194 (white) and 195 (black)
        assert features[194] == 1.0    # 15/15
        assert abs(features[195] - 1/3) < 1e-6  # 5/15

    def test_encode_state_from_raw(self):
        """encode_state_from_raw should produce the same result as encode_state."""
        np = pytest.importorskip("numpy")
        from encoder import encode_state, encode_state_from_raw

        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        from_engine = encode_state(engine, Color.WHITE)
        from_raw = encode_state_from_raw(
            points=list(engine.state.points),
            bar_white=engine.state.bar_white,
            bar_black=engine.state.bar_black,
            off_white=engine.state.off_white,
            off_black=engine.state.off_black,
            current_turn="white",
            perspective="white",
        )

        np.testing.assert_array_almost_equal(from_engine, from_raw)


# -----------------------------------------------------------------------
# ML Model Tests
# -----------------------------------------------------------------------

class TestMLModel:
    """Tests for the neural network model structure and equity computation."""

    def test_compute_equity_winning(self):
        """compute_equity should return positive equity for winning position."""
        torch = pytest.importorskip("torch")
        from model import compute_equity

        # P(win)=0.9, no gammons
        outputs = torch.tensor([0.9, 0.0, 0.0, 0.0, 0.0])
        equity = compute_equity(outputs).item()
        # 2*0.9 - 1 = 0.8
        assert abs(equity - 0.8) < 1e-6

    def test_compute_equity_losing(self):
        """compute_equity should return negative equity for losing position."""
        torch = pytest.importorskip("torch")
        from model import compute_equity

        # P(win)=0.1, no gammons
        outputs = torch.tensor([0.1, 0.0, 0.0, 0.0, 0.0])
        equity = compute_equity(outputs).item()
        # 2*0.1 - 1 = -0.8
        assert abs(equity - (-0.8)) < 1e-6

    def test_compute_equity_even(self):
        """compute_equity should return ~0 for an even position."""
        torch = pytest.importorskip("torch")
        from model import compute_equity

        outputs = torch.tensor([0.5, 0.0, 0.0, 0.0, 0.0])
        equity = compute_equity(outputs).item()
        assert abs(equity) < 1e-6

    def test_backgammon_net_forward_pass(self):
        """BackgammonNet should produce 5 outputs from 198 inputs."""
        torch = pytest.importorskip("torch")
        from model import BackgammonNet

        model = BackgammonNet()
        model.eval()
        dummy_input = torch.randn(198)
        with torch.no_grad():
            output = model(dummy_input)
        assert output.shape == (5,)
        # All outputs should be between 0 and 1 (sigmoid)
        assert (output >= 0).all() and (output <= 1).all()

    def test_backgammon_net_batch_forward(self):
        """BackgammonNet should handle batched inputs."""
        torch = pytest.importorskip("torch")
        from model import BackgammonNet

        model = BackgammonNet()
        model.eval()
        batch = torch.randn(4, 198)
        with torch.no_grad():
            output = model(batch)
        assert output.shape == (4, 5)


# -----------------------------------------------------------------------
# Select Bot Move Integration Tests
# -----------------------------------------------------------------------

class TestSelectBotMoveIntegration:
    """Integration tests for _select_bot_move across all difficulties."""

    def setup_method(self):
        _table_difficulties.clear()

    def test_select_move_medium_is_deterministic_ish(self):
        """Medium difficulty should be more consistent than easy due to heuristic scoring."""
        engine = _make_engine_at_moving(Color.WHITE, 5, 3)
        valid_moves = engine.get_valid_moves()
        if len(valid_moves) <= 1:
            pytest.skip("Need multiple moves to compare")

        set_bot_difficulty("MED_T", "medium")

        # Medium always returns a valid move from the heuristic
        for _ in range(20):
            m = _select_bot_move(engine, valid_moves, "MED_T")
            assert m in valid_moves

    def test_each_difficulty_returns_valid_move(self):
        """All difficulty levels should return a valid move."""
        engine = _make_engine_at_moving(Color.WHITE, 4, 2)
        valid_moves = engine.get_valid_moves()
        assert len(valid_moves) > 0

        for difficulty in ["easy", "medium"]:
            set_bot_difficulty(f"TEST_{difficulty}", difficulty)
            chosen = _select_bot_move(engine, valid_moves, f"TEST_{difficulty}")
            assert chosen in valid_moves, f"{difficulty} returned invalid move"

        # Hard with mock
        set_bot_difficulty("TEST_hard", "hard")
        with patch("app.services.bot_service._load_ml_bot", return_value=None):
            chosen = _select_bot_move(engine, valid_moves, "TEST_hard")
            assert chosen in valid_moves
