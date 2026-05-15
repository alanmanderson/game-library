"""
Comprehensive tests for Bughouse Chess application.

Covers:
  - Engine (engine.py): game creation, moves, captures, drops, promotions,
    en passant, checkmate, resignation, legal moves/drops, state serialization.
  - Manager (manager.py): game creation, joining, seat assignment, spectators,
    listing, tokens.
  - API (main.py): REST endpoints for game lifecycle.
"""

import os
os.environ.setdefault("BUGHOUSE_ENV", "development")

import json
import time
import pytest
import chess
import chess.variant

from engine import (
    BughouseGame,
    Seat,
    Team,
    GameResult,
    SEAT_TEAM,
    PARTNER,
    SEAT_BOARD_COLOR,
    BOARD_COLOR_SEAT,
    PIECE_NAMES,
)
from manager import GameManager, GameRoom
from models import GameStatus, SeatName


# ============================================================
# Helper: play a Scholar's Mate sequence on a given board_index
# ============================================================

def play_scholars_mate(game: BughouseGame, board_index: int):
    """
    Execute Scholar's Mate on the given board.
    1. e4  e5
    2. Bc4 Nc6
    3. Qh5 Nf6??
    4. Qxf7#
    """
    game.make_move(board_index, "e2", "e4")
    game.make_move(board_index, "e7", "e5")
    game.make_move(board_index, "f1", "c4")
    game.make_move(board_index, "b8", "c6")
    game.make_move(board_index, "d1", "h5")
    game.make_move(board_index, "g8", "f6")
    game.make_move(board_index, "h5", "f7")  # Qxf7#


# ============================================================
# ENGINE TESTS
# ============================================================

class TestEngineGameCreation:
    """Test 1: Game creation - initial state is correct."""

    def test_initial_state(self):
        game = BughouseGame()
        assert game.game_over is False
        assert game.winner is None
        assert game.result_reason is None
        assert len(game.boards) == 2
        assert game.move_history == []
        assert game.last_move == [None, None]

    def test_initial_boards_are_starting_position(self):
        game = BughouseGame()
        for board in game.boards:
            assert board.turn == chess.WHITE
            assert board.fullmove_number == 1

    def test_custom_game_id(self):
        game = BughouseGame(game_id="TEST123")
        assert game.game_id == "TEST123"

    def test_auto_generated_game_id(self):
        game = BughouseGame()
        assert game.game_id is not None
        assert len(game.game_id) > 0


class TestEngineBasicMoves:
    """Tests 2-4: Basic moves on boards A and B, independent moves."""

    def test_basic_move_board_a(self):
        """Test 2: Basic move on board A."""
        game = BughouseGame()
        result = game.make_move(0, "e2", "e4")
        assert result["type"] == "move"
        assert result["board"] == 0
        assert result["from"] == "e2"
        assert result["to"] == "e4"
        assert result["capture"] is False
        # After white moves, it is black's turn
        assert game.boards[0].turn == chess.BLACK

    def test_basic_move_board_b(self):
        """Test 3: Basic move on board B."""
        game = BughouseGame()
        result = game.make_move(1, "d2", "d4")
        assert result["type"] == "move"
        assert result["board"] == 1
        assert result["from"] == "d2"
        assert result["to"] == "d4"
        assert game.boards[1].turn == chess.BLACK

    def test_independent_moves_both_boards(self):
        """Test 4: Independent moves on both boards."""
        game = BughouseGame()
        # Move on board A
        game.make_move(0, "e2", "e4")
        # Move on board B (still white's turn there)
        game.make_move(1, "d2", "d4")
        # Board A should have black to move
        assert game.boards[0].turn == chess.BLACK
        # Board B should have black to move
        assert game.boards[1].turn == chess.BLACK
        # Board A's move shouldn't affect board B's position
        assert game.boards[0].piece_at(chess.E4) is not None
        assert game.boards[1].piece_at(chess.D4) is not None


class TestEngineCaptureTransfer:
    """Tests 5-6: Capture transfers piece to partner's pocket."""

    def test_capture_transfers_to_partner_pocket(self):
        """Test 5: Capture transfers piece to partner's pocket on other board."""
        game = BughouseGame()
        # Board A: play moves leading to a capture
        # 1. e4 d5 2. exd5 (white captures black pawn)
        game.make_move(0, "e2", "e4")
        game.make_move(0, "d7", "d5")
        game.make_move(0, "e4", "d5")  # White captures pawn on d5

        # White captured on Board A -> piece goes to partner (Seat 3 = Board B Black)
        # So Board B black's pocket should have a pawn
        pocket_b_black = game.get_pocket(1, chess.BLACK)
        assert pocket_b_black["p"] == 1

        # Board A white's pocket should NOT have the pawn (bughouse transfer)
        pocket_a_white = game.get_pocket(0, chess.WHITE)
        assert pocket_a_white["p"] == 0

    def test_multiple_captures_accumulate(self):
        """Test 6: Multiple captures accumulate in partner's pocket."""
        game = BughouseGame()
        # Board A: 1.e4 d5 2.exd5 Qxd5 3.Nc3 Qd8
        game.make_move(0, "e2", "e4")
        game.make_move(0, "d7", "d5")
        game.make_move(0, "e4", "d5")  # White captures pawn
        game.make_move(0, "d8", "d5")  # Black captures pawn

        # After first capture by white: Board B black gets a pawn
        # After second capture by black: Board B white gets a pawn
        pocket_b_black = game.get_pocket(1, chess.BLACK)
        pocket_b_white = game.get_pocket(1, chess.WHITE)

        # Board B Black should have a pawn (from white's capture on Board A)
        assert pocket_b_black["p"] == 1
        # Board B White should have a pawn (from black's capture on Board A)
        assert pocket_b_white["p"] == 1


class TestEngineDrop:
    """Tests 7-12: Piece drops from pocket."""

    def _setup_game_with_pocket_piece(self):
        """Helper: create a game where Board B Black has a pawn in pocket."""
        game = BughouseGame()
        # Board A: 1.e4 d5 2.exd5 (white captures pawn on Board A)
        game.make_move(0, "e2", "e4")
        game.make_move(0, "d7", "d5")
        game.make_move(0, "e4", "d5")
        # Now Board B Black has a pawn in pocket.
        # Make it black's turn on Board B:
        game.make_move(1, "e2", "e4")  # Board B white moves
        return game

    def test_piece_drop_from_pocket(self):
        """Test 7: Piece drop from pocket."""
        game = self._setup_game_with_pocket_piece()
        # Board B, black to move, has a pawn in pocket
        pocket = game.get_pocket(1, chess.BLACK)
        assert pocket["p"] == 1

        # Drop the pawn on an empty square (e.g. e5)
        result = game.drop_piece(1, "p", "e5")
        assert result["type"] == "drop"
        assert result["board"] == 1
        assert result["piece"] == "p"
        assert result["square"] == "e5"

    def test_drop_removes_piece_from_pocket(self):
        """Test 8: Drop removes piece from pocket."""
        game = self._setup_game_with_pocket_piece()
        pocket_before = game.get_pocket(1, chess.BLACK)
        assert pocket_before["p"] == 1

        game.drop_piece(1, "p", "e5")

        pocket_after = game.get_pocket(1, chess.BLACK)
        assert pocket_after["p"] == 0

    def test_pawn_cannot_drop_on_1st_rank(self):
        """Test 9: Pawn cannot be dropped on 1st rank."""
        game = self._setup_game_with_pocket_piece()
        with pytest.raises(ValueError, match="[Ii]llegal"):
            game.drop_piece(1, "p", "a1")

    def test_pawn_cannot_drop_on_8th_rank(self):
        """Test 10: Pawn cannot be dropped on 8th rank."""
        game = self._setup_game_with_pocket_piece()
        with pytest.raises(ValueError, match="[Ii]llegal"):
            game.drop_piece(1, "p", "a8")

    def test_cannot_drop_king(self):
        """Test 11: Cannot drop a king."""
        game = BughouseGame()
        with pytest.raises(ValueError, match="[Cc]annot drop a king"):
            game.drop_piece(0, "k", "e4")

    def test_cannot_drop_with_empty_pocket(self):
        """Test 12: Cannot drop with empty pocket."""
        game = BughouseGame()
        # No pieces in any pocket at start
        with pytest.raises(ValueError, match="[Nn]o .* in pocket"):
            game.drop_piece(0, "n", "e4")


class TestEnginePromotedPawnCapture:
    """Test 13: Promoted pawn captured reverts to pawn in partner pocket."""

    def test_promoted_pawn_reverts_to_pawn(self):
        game = BughouseGame()
        board = game.boards[0]

        # Set up a custom position where white has a promoted queen
        # and black can capture it. We'll directly manipulate the board.
        board.clear()
        board.set_piece_at(chess.E1, chess.Piece(chess.KING, chess.WHITE))
        board.set_piece_at(chess.E8, chess.Piece(chess.KING, chess.BLACK))
        # Place a white queen on d7 that was promoted from a pawn
        board.set_piece_at(chess.D7, chess.Piece(chess.QUEEN, chess.WHITE))
        board.promoted |= chess.BB_SQUARES[chess.D7]  # Mark as promoted
        board.turn = chess.BLACK

        # Black king captures the promoted queen: Kxd7
        game.make_move(0, "e8", "d7")

        # The captured promoted queen should revert to a PAWN in partner's pocket
        # Black captured on Board A -> partner is Seat 2 (Board B White)
        pocket_b_white = game.get_pocket(1, chess.WHITE)
        assert pocket_b_white["p"] == 1
        assert pocket_b_white["q"] == 0  # NOT a queen


class TestEngineEnPassant:
    """Test 14: En passant capture transfers pawn correctly."""

    def test_en_passant_transfers_pawn(self):
        game = BughouseGame()
        # 1.e4 a6 2.e5 d5 3.exd6 (en passant)
        game.make_move(0, "e2", "e4")
        game.make_move(0, "a7", "a6")
        game.make_move(0, "e4", "e5")
        game.make_move(0, "d7", "d5")
        game.make_move(0, "e5", "d6")  # en passant capture

        # White captured a pawn via en passant on Board A
        # Partner (Board B Black) should have a pawn
        pocket_b_black = game.get_pocket(1, chess.BLACK)
        assert pocket_b_black["p"] == 1


class TestEngineCheckmate:
    """Tests 15-16: Checkmate on board A/B ends entire game."""

    def test_checkmate_board_a(self):
        """Test 15: Checkmate on board A ends entire game."""
        game = BughouseGame()
        play_scholars_mate(game, 0)
        assert game.game_over is True
        assert game.result_reason == GameResult.CHECKMATE
        # White wins on Board A -> Black is checkmated
        # Black on Board A is Seat 1 (Team B), so Team A wins
        assert game.winner == Team.A

    def test_checkmate_board_b(self):
        """Test 16: Checkmate on board B ends entire game."""
        game = BughouseGame()
        play_scholars_mate(game, 1)
        assert game.game_over is True
        assert game.result_reason == GameResult.CHECKMATE
        # White wins on Board B -> Black is checkmated
        # Black on Board B is Seat 3 (Team A), so Team B wins
        assert game.winner == Team.B


class TestEngineResignation:
    """Test 17: Resignation - correct team loses."""

    def test_resign_seat_0_team_a_loses(self):
        game = BughouseGame()
        result = game.resign(0)
        assert result["game_over"] is True
        # Seat 0 is Team A, so Team B wins
        assert result["winner"] == "b"
        assert result["reason"] == "resignation"
        assert game.game_over is True
        assert game.winner == Team.B

    def test_resign_seat_1_team_b_loses(self):
        game = BughouseGame()
        result = game.resign(1)
        assert result["winner"] == "a"

    def test_resign_seat_2_team_b_loses(self):
        game = BughouseGame()
        result = game.resign(2)
        assert result["winner"] == "a"

    def test_resign_seat_3_team_a_loses(self):
        game = BughouseGame()
        result = game.resign(3)
        assert result["winner"] == "b"


class TestEngineCannotMoveAfterGameOver:
    """Test 18: Cannot move after game is over."""

    def test_cannot_move_after_checkmate(self):
        game = BughouseGame()
        play_scholars_mate(game, 0)
        assert game.game_over is True
        with pytest.raises(ValueError, match="[Gg]ame is already over"):
            game.make_move(1, "e2", "e4")

    def test_cannot_drop_after_game_over(self):
        game = BughouseGame()
        game.resign(0)
        with pytest.raises(ValueError, match="[Gg]ame is already over"):
            game.drop_piece(0, "n", "e4")

    def test_cannot_resign_after_game_over(self):
        game = BughouseGame()
        game.resign(0)
        with pytest.raises(ValueError, match="[Gg]ame is already over"):
            game.resign(1)


class TestEngineLegalMoves:
    """Tests 19-20: Legal moves and drops generation."""

    def test_legal_moves_at_start(self):
        """Test 19: Legal moves generation - correct count at start (20)."""
        game = BughouseGame()
        moves = game.get_legal_moves(0)
        assert len(moves) == 20  # 16 pawn moves + 4 knight moves

    def test_legal_drops_at_start(self):
        """Test 20: Legal drops generation - 0 at start."""
        game = BughouseGame()
        drops = game.get_legal_drops(0)
        assert len(drops) == 0


class TestEngineGetState:
    """Test 21: get_state is JSON serializable."""

    def test_get_state_json_serializable(self):
        game = BughouseGame()
        state = game.get_state()
        # Should not raise
        serialized = json.dumps(state)
        assert isinstance(serialized, str)
        # Verify round-trip
        parsed = json.loads(serialized)
        assert parsed["game_id"] == game.game_id
        assert parsed["game_over"] is False
        assert len(parsed["boards"]) == 2

    def test_get_state_after_move(self):
        game = BughouseGame()
        game.make_move(0, "e2", "e4")
        state = game.get_state()
        serialized = json.dumps(state)
        parsed = json.loads(serialized)
        assert parsed["boards"][0]["turn"] == "black"


class TestEnginePocketFormat:
    """Test 22: Pocket format always has all 5 piece types."""

    def test_pocket_has_all_piece_types(self):
        game = BughouseGame()
        for bi in range(2):
            for color in (chess.WHITE, chess.BLACK):
                pocket = game.get_pocket(bi, color)
                assert set(pocket.keys()) == {"p", "n", "b", "r", "q"}
                # All zero at start
                for v in pocket.values():
                    assert v == 0

    def test_pocket_format_after_capture(self):
        game = BughouseGame()
        game.make_move(0, "e2", "e4")
        game.make_move(0, "d7", "d5")
        game.make_move(0, "e4", "d5")
        # Check all pockets still have all 5 keys
        for bi in range(2):
            for color in (chess.WHITE, chess.BLACK):
                pocket = game.get_pocket(bi, color)
                assert set(pocket.keys()) == {"p", "n", "b", "r", "q"}


class TestEnginePartnerMapping:
    """Test 23: Partner mapping correctness."""

    def test_partner_mapping(self):
        assert PARTNER[Seat.BOARD_A_WHITE] == Seat.BOARD_B_BLACK
        assert PARTNER[Seat.BOARD_A_BLACK] == Seat.BOARD_B_WHITE
        assert PARTNER[Seat.BOARD_B_WHITE] == Seat.BOARD_A_BLACK
        assert PARTNER[Seat.BOARD_B_BLACK] == Seat.BOARD_A_WHITE

    def test_partner_is_symmetric(self):
        for seat, partner in PARTNER.items():
            assert PARTNER[partner] == seat

    def test_partners_are_on_same_team(self):
        for seat, partner in PARTNER.items():
            assert SEAT_TEAM[seat] == SEAT_TEAM[partner]


class TestEngineInvalidMove:
    """Test 24: Invalid move rejected."""

    def test_completely_illegal_move(self):
        game = BughouseGame()
        with pytest.raises(ValueError):
            game.make_move(0, "e2", "e5")  # Pawn can't move 3 squares

    def test_move_opponents_piece(self):
        game = BughouseGame()
        with pytest.raises(ValueError):
            game.make_move(0, "e7", "e5")  # White can't move black's pawn


class TestEngineWrongBoard:
    """Test 25: Wrong board move rejected (game validates board index)."""

    def test_invalid_board_index(self):
        game = BughouseGame()
        with pytest.raises(ValueError, match="board_index must be 0 or 1"):
            game.make_move(2, "e2", "e4")

    def test_invalid_board_index_negative(self):
        game = BughouseGame()
        with pytest.raises(ValueError, match="board_index must be 0 or 1"):
            game.make_move(-1, "e2", "e4")

    def test_invalid_board_index_drops(self):
        game = BughouseGame()
        with pytest.raises(ValueError, match="board_index must be 0 or 1"):
            game.drop_piece(3, "n", "e4")


# ============================================================
# MANAGER TESTS
# ============================================================

class TestManagerCreateGame:
    """Tests 1-2: Create game - unique ID and first player assignment."""

    def test_create_game_generates_unique_id(self):
        """Manager Test 1: Create game generates unique ID."""
        mgr = GameManager()
        room1, _ = mgr.create_game("Alice")
        room2, _ = mgr.create_game("Bob")
        assert room1.game_id != room2.game_id

    def test_create_game_id_is_6_chars(self):
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        assert len(room.game_id) == 6

    def test_first_player_assigned_correctly(self):
        """Manager Test 2: First player assigned correctly."""
        mgr = GameManager()
        room, session = mgr.create_game("Alice")
        assert session.name == "Alice"
        assert session.seat == Seat.BOARD_A_WHITE  # First available seat
        assert room.player_count == 1


class TestManagerJoinGame:
    """Tests 3-5: Join game scenarios."""

    def test_second_player_gets_different_seat(self):
        """Manager Test 3: Second player gets different seat."""
        mgr = GameManager()
        room, s1 = mgr.create_game("Alice")
        _, s2 = mgr.join_game(room.game_id, "Bob")
        assert s1.seat != s2.seat
        assert s2.seat == Seat.BOARD_A_BLACK  # Next available

    def test_game_starts_when_4_players_join(self):
        """Manager Test 4: Game starts when 4 players join."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        assert room.status == GameStatus.WAITING

        mgr.join_game(room.game_id, "Bob")
        assert room.status == GameStatus.WAITING

        mgr.join_game(room.game_id, "Charlie")
        assert room.status == GameStatus.WAITING

        mgr.join_game(room.game_id, "Diana")
        assert room.status == GameStatus.IN_PROGRESS

    def test_join_full_game_rejected(self):
        """Manager Test 5: Join full game - rejected."""
        mgr = GameManager()
        room, _ = mgr.create_game("P1")
        mgr.join_game(room.game_id, "P2")
        mgr.join_game(room.game_id, "P3")
        mgr.join_game(room.game_id, "P4")

        with pytest.raises(ValueError, match="[Ff]ull"):
            mgr.join_game(room.game_id, "P5")


class TestManagerSpectator:
    """Test 6: Spectator can join."""

    def test_spectator_can_join(self):
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        _, spectator = mgr.watch_game(room.game_id, "Watcher")
        assert spectator.name == "Watcher"
        assert spectator.token is not None
        assert room.spectator_count == 1

    def test_multiple_spectators(self):
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        mgr.watch_game(room.game_id, "W1")
        mgr.watch_game(room.game_id, "W2")
        assert room.spectator_count == 2


class TestManagerListWaitingGames:
    """Test 7: List waiting games - only shows waiting games."""

    def test_list_waiting_games(self):
        mgr = GameManager()
        room1, _ = mgr.create_game("Alice")
        room2, _ = mgr.create_game("Bob")
        # Fill room1 to start it
        mgr.join_game(room1.game_id, "P2")
        mgr.join_game(room1.game_id, "P3")
        mgr.join_game(room1.game_id, "P4")
        assert room1.status == GameStatus.IN_PROGRESS

        waiting = mgr.list_waiting_games()
        game_ids = [g.game_id for g in waiting]
        assert room2.game_id in game_ids
        assert room1.game_id not in game_ids


class TestManagerPreferredSeat:
    """Tests 8-9: Preferred seat assignment."""

    def test_preferred_seat_assignment_works(self):
        """Manager Test 8: Preferred seat assignment works."""
        mgr = GameManager()
        room, session = mgr.create_game(
            "Alice", preferred_seat=SeatName.BOARD_B_BLACK
        )
        assert session.seat == Seat.BOARD_B_BLACK

    def test_preferred_seat_taken_rejected(self):
        """Manager Test 9: Preferred seat taken - rejected."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice", preferred_seat=SeatName.BOARD_A_WHITE)
        with pytest.raises(ValueError, match="[Tt]aken"):
            mgr.join_game(
                room.game_id, "Bob",
                preferred_seat=SeatName.BOARD_A_WHITE,
            )


class TestManagerPlayerTokens:
    """Test 10: Player tokens are unique."""

    def test_player_tokens_are_unique(self):
        mgr = GameManager()
        room, s1 = mgr.create_game("Alice")
        _, s2 = mgr.join_game(room.game_id, "Bob")
        _, s3 = mgr.join_game(room.game_id, "Charlie")
        _, s4 = mgr.join_game(room.game_id, "Diana")

        tokens = {s1.token, s2.token, s3.token, s4.token}
        assert len(tokens) == 4  # All unique

    def test_token_lookup_works(self):
        mgr = GameManager()
        room, session = mgr.create_game("Alice")
        looked_up = room.get_player_by_token(session.token)
        assert looked_up is session


# ============================================================
# API TESTS
# ============================================================

from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport
from main import app, manager as app_manager
from auth.database import engine, Base
from auth.jwt_handler import create_access_token


@pytest.fixture(autouse=True)
def reset_app_manager():
    """Reset the global game manager before each API test."""
    app_manager.games.clear()
    yield
    app_manager.games.clear()


@pytest.fixture()
async def auth_db():
    """Reset auth database tables for auth tests."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest.fixture
def base_url():
    return "http://testserver"


class TestAPICreateGame:
    """API Test 1: POST /api/games creates game."""

    @pytest.mark.anyio
    async def test_create_game(self, transport, base_url):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            resp = await client.post(
                "/api/games",
                json={"player_name": "Alice"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "game_id" in data
        assert data["player_name"] == "Alice"
        assert "player_token" in data
        assert isinstance(data["seat"], int)


class TestAPIListGames:
    """API Test 2: GET /api/games lists waiting games."""

    @pytest.mark.anyio
    async def test_list_games(self, transport, base_url):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            # Create a game first
            await client.post("/api/games", json={"player_name": "Alice"})
            resp = await client.get("/api/games")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["status"] == "waiting"


class TestAPIJoinGame:
    """API Test 3: POST /api/games/{id}/join works."""

    @pytest.mark.anyio
    async def test_join_game(self, transport, base_url):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            create_resp = await client.post(
                "/api/games", json={"player_name": "Alice"}
            )
            game_id = create_resp.json()["game_id"]

            join_resp = await client.post(
                f"/api/games/{game_id}/join",
                json={"player_name": "Bob"},
            )
        assert join_resp.status_code == 200
        data = join_resp.json()
        assert data["game_id"] == game_id
        assert data["player_name"] == "Bob"
        assert isinstance(data["seat"], int)
        assert data["seat"] != create_resp.json()["seat"]


class TestAPIGetGame:
    """API Test 4: GET /api/games/{id} returns game info."""

    @pytest.mark.anyio
    async def test_get_game(self, transport, base_url):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            create_resp = await client.post(
                "/api/games", json={"player_name": "Alice"}
            )
            game_id = create_resp.json()["game_id"]

            resp = await client.get(f"/api/games/{game_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["game_id"] == game_id
        assert data["status"] == "waiting"
        assert isinstance(data["players"], list)


class TestAPIWatchGame:
    """API Test 5: POST /api/games/{id}/watch works."""

    @pytest.mark.anyio
    async def test_watch_game(self, transport, base_url):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            create_resp = await client.post(
                "/api/games", json={"player_name": "Alice"}
            )
            game_id = create_resp.json()["game_id"]

            resp = await client.post(
                f"/api/games/{game_id}/watch",
                json={"spectator_name": "Viewer"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["game_id"] == game_id
        assert "spectator_token" in data


class TestAPIJoinNonExistentGame:
    """API Test 6: Join non-existent game returns 400."""

    @pytest.mark.anyio
    async def test_join_nonexistent_game(self, transport, base_url):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            resp = await client.post(
                "/api/games/XXXXXX/join",
                json={"player_name": "Bob"},
            )
        assert resp.status_code in (400, 404)


class TestAPIResponseFormat:
    """API Test 7: Response format - seat is int, players is dict."""

    @pytest.mark.anyio
    async def test_create_response_seat_is_int(self, transport, base_url):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            resp = await client.post(
                "/api/games", json={"player_name": "Alice"}
            )
        data = resp.json()
        assert isinstance(data["seat"], int)
        assert 0 <= data["seat"] <= 3

    @pytest.mark.anyio
    async def test_list_response_players_is_dict(self, transport, base_url):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            await client.post("/api/games", json={"player_name": "Alice"})
            resp = await client.get("/api/games")
        data = resp.json()
        assert len(data) >= 1
        players = data[0]["players"]
        assert isinstance(players, dict)


# ============================================================
# AUTH TESTS
# ============================================================


class TestAuthRegistration:
    """Auth Test: Registration flow."""

    @pytest.mark.anyio
    async def test_register_success(self, transport, base_url, auth_db):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            resp = await client.post("/api/auth/register", json={
                "email": "alice@example.com",
                "display_name": "Alice",
                "password": "secret123",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "alice@example.com"
        assert data["user"]["display_name"] == "Alice"

    @pytest.mark.anyio
    async def test_register_duplicate_email(self, transport, base_url, auth_db):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            await client.post("/api/auth/register", json={
                "email": "alice@example.com",
                "display_name": "Alice",
                "password": "secret123",
            })
            resp = await client.post("/api/auth/register", json={
                "email": "alice@example.com",
                "display_name": "Alice2",
                "password": "secret456",
            })
        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"]

    @pytest.mark.anyio
    async def test_register_short_password(self, transport, base_url, auth_db):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            resp = await client.post("/api/auth/register", json={
                "email": "bob@example.com",
                "display_name": "Bob",
                "password": "short",
            })
        assert resp.status_code == 422  # Validation error


class TestAuthLogin:
    """Auth Test: Login flow."""

    @pytest.mark.anyio
    async def test_login_success(self, transport, base_url, auth_db):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            await client.post("/api/auth/register", json={
                "email": "alice@example.com",
                "display_name": "Alice",
                "password": "secret123",
            })
            resp = await client.post("/api/auth/login", json={
                "email": "alice@example.com",
                "password": "secret123",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["display_name"] == "Alice"

    @pytest.mark.anyio
    async def test_login_invalid_password(self, transport, base_url, auth_db):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            await client.post("/api/auth/register", json={
                "email": "alice@example.com",
                "display_name": "Alice",
                "password": "secret123",
            })
            resp = await client.post("/api/auth/login", json={
                "email": "alice@example.com",
                "password": "wrongpass",
            })
        assert resp.status_code == 401

    @pytest.mark.anyio
    async def test_login_nonexistent_email(self, transport, base_url, auth_db):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            resp = await client.post("/api/auth/login", json={
                "email": "nobody@example.com",
                "password": "secret123",
            })
        assert resp.status_code == 401


class TestAuthMe:
    """Auth Test: Profile endpoint."""

    @pytest.mark.anyio
    async def test_get_me_authenticated(self, transport, base_url, auth_db):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            reg_resp = await client.post("/api/auth/register", json={
                "email": "alice@example.com",
                "display_name": "Alice",
                "password": "secret123",
            })
            token = reg_resp.json()["access_token"]
            resp = await client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "Alice"

    @pytest.mark.anyio
    async def test_get_me_unauthenticated(self, transport, base_url, auth_db):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            resp = await client.get("/api/auth/me")
        assert resp.status_code == 401

    @pytest.mark.anyio
    async def test_update_display_name(self, transport, base_url, auth_db):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            reg_resp = await client.post("/api/auth/register", json={
                "email": "alice@example.com",
                "display_name": "Alice",
                "password": "secret123",
            })
            token = reg_resp.json()["access_token"]
            resp = await client.patch(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {token}"},
                json={"display_name": "AliceNew"},
            )
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "AliceNew"


class TestAuthGameIntegration:
    """Auth Test: Authenticated game creation uses display name."""

    @pytest.mark.anyio
    async def test_authenticated_create_game(self, transport, base_url, auth_db):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            reg_resp = await client.post("/api/auth/register", json={
                "email": "alice@example.com",
                "display_name": "AuthAlice",
                "password": "secret123",
            })
            token = reg_resp.json()["access_token"]
            resp = await client.post(
                "/api/games",
                headers={"Authorization": f"Bearer {token}"},
                json={"player_name": "IgnoredName"},
            )
        assert resp.status_code == 200
        assert resp.json()["player_name"] == "AuthAlice"

    @pytest.mark.anyio
    async def test_guest_create_game_still_works(self, transport, base_url, auth_db):
        """Guest mode: no auth header, uses player_name from request."""
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            resp = await client.post(
                "/api/games",
                json={"player_name": "GuestBob"},
            )
        assert resp.status_code == 200
        assert resp.json()["player_name"] == "GuestBob"

    @pytest.mark.anyio
    async def test_authenticated_join_game(self, transport, base_url, auth_db):
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            # Create game as guest
            create_resp = await client.post(
                "/api/games",
                json={"player_name": "Host"},
            )
            game_id = create_resp.json()["game_id"]

            # Register and join as auth user
            reg_resp = await client.post("/api/auth/register", json={
                "email": "bob@example.com",
                "display_name": "AuthBob",
                "password": "secret123",
            })
            token = reg_resp.json()["access_token"]
            join_resp = await client.post(
                f"/api/games/{game_id}/join",
                headers={"Authorization": f"Bearer {token}"},
                json={"player_name": "IgnoredName"},
            )
        assert join_resp.status_code == 200
        assert join_resp.json()["player_name"] == "AuthBob"


class TestAuthGoogleOAuth:
    """Auth Test: Google OAuth (mocked)."""

    @pytest.mark.anyio
    async def test_google_redirect_not_configured(self, transport, base_url, auth_db):
        """When Google OAuth is not configured, returns 501."""
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            resp = await client.get("/api/auth/google", follow_redirects=False)
        # Either 501 (not configured) or 307 (redirect) depending on config
        assert resp.status_code in (501, 307)

    @pytest.mark.anyio
    async def test_google_callback_mock(self, transport, base_url, auth_db):
        """Test Google OAuth callback with mocked external calls."""
        from auth.routes import _oauth_states
        import time

        mock_token_response = MagicMock()
        mock_token_response.status_code = 200
        mock_token_response.json.return_value = {"access_token": "mock_google_token"}

        mock_userinfo_response = MagicMock()
        mock_userinfo_response.status_code = 200
        mock_userinfo_response.json.return_value = {
            "id": "google_123",
            "email": "googleuser@gmail.com",
            "name": "Google User",
            "picture": "https://example.com/photo.jpg",
        }

        # Pre-populate a valid CSRF state token
        test_state = "test-csrf-state-token"
        _oauth_states[test_state] = time.time()

        with patch("auth.config.auth_settings.google_client_id", "fake-client-id"), \
             patch("auth.config.auth_settings.google_client_secret", "fake-secret"):
            with patch("auth.routes.httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=False)
                mock_client.post = AsyncMock(return_value=mock_token_response)
                mock_client.get = AsyncMock(return_value=mock_userinfo_response)
                mock_client_cls.return_value = mock_client

                async with AsyncClient(transport=transport, base_url=base_url) as client:
                    resp = await client.get(
                        f"/api/auth/google/callback?code=mock_code&state={test_state}",
                        follow_redirects=False,
                    )

        assert resp.status_code == 307
        location = resp.headers.get("location", "")
        assert "#token=" in location
        # State should be consumed (removed from store)
        assert test_state not in _oauth_states


# ============================================================
# BOT ADDITION TESTS
# ============================================================


class TestBotAddition:
    """Test the add_bot() method on GameRoom and the REST endpoint."""

    def test_add_bot_assigns_seat(self):
        """Create a game, add a bot, verify bot is in players dict with is_bot=True."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        bot_session = room.add_bot()
        assert bot_session.is_bot is True
        assert bot_session.seat in room.players
        assert room.players[bot_session.seat] is bot_session

    def test_add_bot_auto_assigns_seat(self):
        """Create a game with 1 player, add a bot without preferred seat, verify it gets an available seat."""
        mgr = GameManager()
        room, player_session = mgr.create_game("Alice")
        bot_session = room.add_bot()
        # Bot should get a different seat from the human player
        assert bot_session.seat != player_session.seat
        assert bot_session.seat in room.players
        assert room.player_count == 2

    def test_add_bot_preferred_seat(self):
        """Add a bot to a specific seat, verify it lands there."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        bot_session = room.add_bot(preferred_seat=SeatName.BOARD_B_BLACK)
        assert bot_session.seat == Seat.BOARD_B_BLACK

    def test_add_bot_full_game_rejected(self):
        """Fill all 4 seats, try to add a bot, expect ValueError."""
        mgr = GameManager()
        room, _ = mgr.create_game("P1")
        mgr.join_game(room.game_id, "P2")
        mgr.join_game(room.game_id, "P3")
        mgr.join_game(room.game_id, "P4")
        with pytest.raises(ValueError, match="[Ff]ull"):
            room.add_bot()

    def test_add_bot_starts_game(self):
        """Create a game with 1 player, add 3 bots, verify game status is IN_PROGRESS."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        room.add_bot()
        room.add_bot()
        room.add_bot()
        assert room.status == GameStatus.IN_PROGRESS

    @pytest.mark.anyio
    async def test_add_bot_api_endpoint(self, transport, base_url):
        """Use AsyncClient to POST to /api/games/{id}/add-bot, verify 200 response."""
        async with AsyncClient(transport=transport, base_url=base_url) as client:
            create_resp = await client.post(
                "/api/games", json={"player_name": "Alice"}
            )
            game_id = create_resp.json()["game_id"]

            resp = await client.post(
                f"/api/games/{game_id}/add-bot",
                json={},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "seat" in data
        assert isinstance(data["seat"], int)
        assert "player_name" in data
        assert "Bot" in data["player_name"]


# ============================================================
# BOT MOVES TESTS
# ============================================================


class TestBotMoves:
    """Test bot session flags."""

    def test_bot_session_has_is_bot_flag(self):
        """Create a bot, verify session.is_bot is True."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        bot_session = room.add_bot()
        assert bot_session.is_bot is True

    def test_regular_player_is_not_bot(self):
        """Create a regular player, verify session.is_bot is False."""
        mgr = GameManager()
        room, player_session = mgr.create_game("Alice")
        assert player_session.is_bot is False


# ============================================================
# VALIDATE PLAYER TURN TESTS
# ============================================================

from main import validate_player_turn, build_full_game_state


class TestValidatePlayerTurn:
    """Test the validate_player_turn function."""

    def test_validates_correct_board(self):
        """Player on board 0 can act on board 0."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        mgr.join_game(room.game_id, "Bob")
        mgr.join_game(room.game_id, "Charlie")
        mgr.join_game(room.game_id, "Diana")
        # Seat 0 = Board A White, it is white's turn on board 0 at start
        session = room.players[Seat.BOARD_A_WHITE]
        # Should not raise
        validate_player_turn(room, session, 0)

    def test_rejects_wrong_board(self):
        """Player on board 0 cannot act on board 1."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        mgr.join_game(room.game_id, "Bob")
        mgr.join_game(room.game_id, "Charlie")
        mgr.join_game(room.game_id, "Diana")
        # Seat 0 = Board A (board 0)
        session = room.players[Seat.BOARD_A_WHITE]
        with pytest.raises(ValueError, match="not board 1"):
            validate_player_turn(room, session, 1)

    def test_rejects_wrong_turn(self):
        """Player whose turn it isn't gets an error."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        mgr.join_game(room.game_id, "Bob")
        mgr.join_game(room.game_id, "Charlie")
        mgr.join_game(room.game_id, "Diana")
        # It's white's turn at start on board 0; black (Seat 1) should be rejected
        session = room.players[Seat.BOARD_A_BLACK]
        with pytest.raises(ValueError, match="not your turn"):
            validate_player_turn(room, session, 0)

    def test_rejects_when_game_not_in_progress(self):
        """Game in WAITING status rejects moves."""
        mgr = GameManager()
        room, player_session = mgr.create_game("Alice")
        # Only 1 player, game is WAITING
        assert room.status == GameStatus.WAITING
        with pytest.raises(ValueError, match="not in progress"):
            validate_player_turn(room, player_session, 0)


# ============================================================
# BUILD FULL GAME STATE TESTS
# ============================================================


class TestBuildFullGameState:
    """Test the build_full_game_state function."""

    def test_state_has_required_keys(self):
        """Create a game with players, build state, check all expected keys."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        mgr.join_game(room.game_id, "Bob")
        mgr.join_game(room.game_id, "Charlie")
        mgr.join_game(room.game_id, "Diana")

        state = build_full_game_state(room)
        expected_keys = {
            "type", "game_id", "boards", "pockets", "players",
            "status", "turn", "game_over", "legal_moves", "legal_drops",
        }
        assert expected_keys.issubset(set(state.keys()))

    def test_status_mapping(self):
        """Verify 'in_progress' maps to 'playing'."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        mgr.join_game(room.game_id, "Bob")
        mgr.join_game(room.game_id, "Charlie")
        mgr.join_game(room.game_id, "Diana")
        assert room.status == GameStatus.IN_PROGRESS

        state = build_full_game_state(room)
        assert state["status"] == "playing"

    def test_players_format(self):
        """Verify players is a dict with string keys and name/null values."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        mgr.join_game(room.game_id, "Bob")

        state = build_full_game_state(room)
        players = state["players"]
        assert isinstance(players, dict)
        # Should have 4 keys: "0", "1", "2", "3"
        assert set(players.keys()) == {"0", "1", "2", "3"}
        # Two players filled, two are None
        filled = [v for v in players.values() if v is not None]
        nulls = [v for v in players.values() if v is None]
        assert len(filled) == 2
        assert len(nulls) == 2


# ============================================================
# CLEANUP OLD GAMES TESTS
# ============================================================


class TestCleanupOldGames:
    """Test the cleanup logic."""

    def test_cleanup_finished_games(self):
        """Create a finished game with finished_at in the past, run cleanup, verify it's removed."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        room.status = GameStatus.FINISHED
        room.finished_at = time.time() - 7200  # 2 hours ago
        game_id = room.game_id

        mgr.cleanup_old_games(max_age_seconds=3600)
        assert mgr.get_game(game_id) is None

    def test_cleanup_stale_waiting_games(self):
        """Create a waiting game with old created_at, run cleanup, verify removed."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        room.created_at = time.time() - 7200  # 2 hours ago
        game_id = room.game_id

        mgr.cleanup_old_games(max_age_seconds=3600)
        assert mgr.get_game(game_id) is None

    def test_cleanup_keeps_recent_games(self):
        """Create a recently finished game, run cleanup, verify it's NOT removed."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        room.status = GameStatus.FINISHED
        room.finished_at = time.time() - 60  # 1 minute ago
        game_id = room.game_id

        mgr.cleanup_old_games(max_age_seconds=3600)
        assert mgr.get_game(game_id) is not None

    def test_cleanup_keeps_in_progress_games(self):
        """Create an in-progress game with old created_at, run cleanup, verify it's NOT removed."""
        mgr = GameManager()
        room, _ = mgr.create_game("Alice")
        mgr.join_game(room.game_id, "Bob")
        mgr.join_game(room.game_id, "Charlie")
        mgr.join_game(room.game_id, "Diana")
        assert room.status == GameStatus.IN_PROGRESS
        room.created_at = time.time() - 7200  # 2 hours ago
        game_id = room.game_id

        mgr.cleanup_old_games(max_age_seconds=3600)
        assert mgr.get_game(game_id) is not None


# ============================================================
# PROMOTION TESTS
# ============================================================


class TestPromotion:
    """Test pawn promotion."""

    def test_pawn_promotion_to_queen(self):
        """Set up a board where a pawn can promote, make the promotion move, verify piece changed."""
        game = BughouseGame()
        board = game.boards[0]

        # Set up position: White pawn on e7, kings away from promotion square
        board.clear()
        board.set_piece_at(chess.A1, chess.Piece(chess.KING, chess.WHITE))
        board.set_piece_at(chess.H8, chess.Piece(chess.KING, chess.BLACK))
        board.set_piece_at(chess.E7, chess.Piece(chess.PAWN, chess.WHITE))
        board.turn = chess.WHITE

        # Make promotion move
        result = game.make_move(0, "e7", "e8", "q")
        assert result["promotion"] == "q"

        # Verify the piece on e8 is a queen
        piece = board.piece_at(chess.E8)
        assert piece is not None
        assert piece.piece_type == chess.QUEEN
        assert piece.color == chess.WHITE


# ============================================================
# STALEMATE TESTS
# ============================================================


class TestStalemate:
    """Test stalemate detection."""

    def test_stalemate_is_draw(self):
        """Set up a stalemate position on one board, verify game_over is True and winner is None."""
        game = BughouseGame()
        board = game.boards[0]

        # Set up stalemate position:
        # White king on a1, White queen on b6, Black king on a8
        # Black to move: no legal moves, not in check
        board.clear()
        board.set_piece_at(chess.A1, chess.Piece(chess.KING, chess.WHITE))
        board.set_piece_at(chess.A8, chess.Piece(chess.KING, chess.BLACK))
        board.set_piece_at(chess.B6, chess.Piece(chess.QUEEN, chess.WHITE))
        board.turn = chess.WHITE

        # White needs to make a move that causes stalemate.
        # Move queen from b6 to b7: after this, black king on a8 has no legal moves
        # but is not in check (queen on b7 doesn't check a8... actually b7 does
        # attack a8). Let's use a known working approach instead.
        #
        # Direct setup: set board to stalemate position with black to move,
        # then trigger _check_game_over.
        board.clear()
        board.set_piece_at(chess.A1, chess.Piece(chess.KING, chess.WHITE))
        board.set_piece_at(chess.A8, chess.Piece(chess.KING, chess.BLACK))
        board.set_piece_at(chess.B6, chess.Piece(chess.QUEEN, chess.WHITE))
        board.turn = chess.BLACK

        # Black is stalemated: king on a8 can't go anywhere
        # (b6 queen controls a7, b7, b8; white king controls a2, b1, b2)
        assert board.is_stalemate() is True

        # Trigger game-over check
        game._check_game_over()

        assert game.game_over is True
        assert game.winner is None  # Stalemate is a draw
        assert game.result_reason == GameResult.STALEMATE
