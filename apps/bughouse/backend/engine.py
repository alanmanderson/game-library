"""
Bughouse Chess Game Engine

Uses python-chess CrazyhouseBoard as the foundation for each board,
with custom capture-transfer logic for bughouse rules.

Bughouse is a 4-player chess variant on 2 boards with 2 teams:
  Team A: Seat 0 (White, Board A) + Seat 3 (Black, Board B)
  Team B: Seat 1 (Black, Board A) + Seat 2 (White, Board B)

Captured pieces transfer to the partner's pocket on the OTHER board.
"""

import chess
import chess.variant
import uuid
import time
from typing import Optional
from enum import Enum


class Seat(int, Enum):
    """Player seats. Partners: 0<->3, 1<->2."""
    BOARD_A_WHITE = 0  # Team A
    BOARD_A_BLACK = 1  # Team B
    BOARD_B_WHITE = 2  # Team B
    BOARD_B_BLACK = 3  # Team A


class Team(str, Enum):
    A = "a"
    B = "b"


class GameResult(str, Enum):
    CHECKMATE = "checkmate"
    STALEMATE = "stalemate"
    RESIGNATION = "resignation"
    TIMEOUT = "timeout"


# Seat -> Team mapping
SEAT_TEAM = {
    Seat.BOARD_A_WHITE: Team.A,
    Seat.BOARD_A_BLACK: Team.B,
    Seat.BOARD_B_WHITE: Team.B,
    Seat.BOARD_B_BLACK: Team.A,
}

# Partner mapping: seat -> partner seat
PARTNER = {
    Seat.BOARD_A_WHITE: Seat.BOARD_B_BLACK,
    Seat.BOARD_A_BLACK: Seat.BOARD_B_WHITE,
    Seat.BOARD_B_WHITE: Seat.BOARD_A_BLACK,
    Seat.BOARD_B_BLACK: Seat.BOARD_A_WHITE,
}

# Seat -> (board_index, color)
SEAT_BOARD_COLOR = {
    Seat.BOARD_A_WHITE: (0, chess.WHITE),
    Seat.BOARD_A_BLACK: (0, chess.BLACK),
    Seat.BOARD_B_WHITE: (1, chess.WHITE),
    Seat.BOARD_B_BLACK: (1, chess.BLACK),
}

# Reverse: (board_index, color) -> seat
BOARD_COLOR_SEAT = {v: k for k, v in SEAT_BOARD_COLOR.items()}

PIECE_NAMES = {
    chess.PAWN: "p",
    chess.KNIGHT: "n",
    chess.BISHOP: "b",
    chess.ROOK: "r",
    chess.QUEEN: "q",
    chess.KING: "k",
}

PIECE_FROM_NAME = {v: k for k, v in PIECE_NAMES.items()}


class BughouseGame:
    """
    Manages a complete bughouse game: two CrazyhouseBoard instances,
    cross-board pocket transfers on capture, and win condition checking.
    """

    def __init__(self, game_id: Optional[str] = None):
        self.game_id = game_id or str(uuid.uuid4())
        self.boards: list[chess.variant.CrazyhouseBoard] = [
            chess.variant.CrazyhouseBoard(),
            chess.variant.CrazyhouseBoard(),
        ]
        self.game_over = False
        self.winner: Optional[Team] = None
        self.result_reason: Optional[GameResult] = None
        self.created_at = time.time()
        self.started_at: Optional[float] = None
        self.ended_at: Optional[float] = None
        self.move_history: list[dict] = []
        # Last move per board for highlighting
        self.last_move: list[Optional[dict]] = [None, None]

    def _current_seat(self, board_index: int) -> Seat:
        """Return the seat whose turn it is on the given board."""
        board = self.boards[board_index]
        return BOARD_COLOR_SEAT[(board_index, board.turn)]

    def _partner_board_index(self, board_index: int) -> int:
        """Return the other board's index."""
        return 1 - board_index

    def _transfer_capture_to_partner(
        self, board_index: int, captured_piece_type: int, capturing_color: bool
    ):
        """
        After a capture on board_index by capturing_color:
        1. Remove the auto-added piece from the capturing side's pocket on this board.
        2. Add the piece to the partner's pocket on the OTHER board.

        CrazyhouseBoard auto-adds captured pieces to the capturer's pocket.
        In bughouse, captured pieces go to the partner's pocket on the other board.
        """
        this_board = self.boards[board_index]
        other_board = self.boards[self._partner_board_index(board_index)]

        # CrazyhouseBoard already added the piece to capturing_color's pocket on this_board.
        # Remove it from there.
        if this_board.pockets[capturing_color].count(captured_piece_type) > 0:
            this_board.pockets[capturing_color].remove(captured_piece_type)

        # The partner plays the SAME color as the capturer but on the other board.
        # Actually: the partner plays the OPPOSITE color on the other board.
        # Seat 0 (Board A White) partners with Seat 3 (Board B Black).
        # If White captures on Board A, the piece goes to Board B Black's pocket.
        # In CrazyhouseBoard terms, that's other_board.pockets[BLACK].
        #
        # Partner color on the other board:
        capturing_seat = BOARD_COLOR_SEAT[(board_index, capturing_color)]
        partner_seat = PARTNER[capturing_seat]
        _, partner_color = SEAT_BOARD_COLOR[partner_seat]

        other_board.pockets[partner_color].add(captured_piece_type)

    def make_move(
        self,
        board_index: int,
        from_sq: str,
        to_sq: str,
        promotion: Optional[str] = None,
    ) -> dict:
        """
        Make a standard chess move on the specified board.

        Args:
            board_index: 0 for Board A, 1 for Board B
            from_sq: Source square in algebraic notation (e.g. "e2")
            to_sq: Target square in algebraic notation (e.g. "e4")
            promotion: Promotion piece letter if applicable ("q", "r", "b", "n")

        Returns:
            dict with move details

        Raises:
            ValueError: If the move is invalid or game is over
        """
        if self.game_over:
            raise ValueError("Game is already over.")

        if board_index not in (0, 1):
            raise ValueError("board_index must be 0 or 1.")

        board = self.boards[board_index]

        # Build UCI string
        uci = from_sq + to_sq
        if promotion:
            uci += promotion.lower()

        try:
            move = chess.Move.from_uci(uci)
        except (ValueError, chess.InvalidMoveError) as e:
            raise ValueError(f"Invalid move format: {uci} - {e}")

        if move not in board.legal_moves:
            raise ValueError(
                f"Illegal move: {uci} on board {board_index}. "
                f"Turn: {'white' if board.turn == chess.WHITE else 'black'}."
            )

        # Check if this is a capture and what piece is being captured
        is_capture = board.is_capture(move)
        captured_piece_type = None
        was_promoted = False

        if is_capture:
            # Determine captured piece info BEFORE pushing the move
            captured_sq = move.to_square
            # Handle en passant: captured pawn is not on to_square
            if board.is_en_passant(move):
                captured_piece_type = chess.PAWN
            else:
                captured_piece = board.piece_at(captured_sq)
                if captured_piece is not None:
                    captured_piece_type = captured_piece.piece_type
                    # Check if the captured piece was a promoted pawn
                    was_promoted = bool(
                        board.promoted & chess.BB_SQUARES[captured_sq]
                    )

        capturing_color = board.turn

        # Push the move
        board.push(move)

        # Handle bughouse capture transfer
        if is_capture and captured_piece_type is not None:
            # If the captured piece was promoted, CrazyhouseBoard already
            # reverts it to a pawn in the pocket. So captured_piece_type
            # for transfer should be PAWN if it was promoted.
            transfer_type = chess.PAWN if was_promoted else captured_piece_type
            self._transfer_capture_to_partner(
                board_index, transfer_type, capturing_color
            )

        # Record move
        move_record = {
            "type": "move",
            "board": board_index,
            "from": from_sq,
            "to": to_sq,
            "promotion": promotion,
            "capture": is_capture,
            "seat": BOARD_COLOR_SEAT[(board_index, capturing_color)].value,
            "timestamp": time.time(),
        }
        self.move_history.append(move_record)
        self.last_move[board_index] = {"from": from_sq, "to": to_sq}

        # Check game-over conditions
        self._check_game_over()

        return move_record

    def drop_piece(
        self, board_index: int, piece_name: str, to_sq: str
    ) -> dict:
        """
        Drop a piece from the current player's pocket onto the board.

        Args:
            board_index: 0 for Board A, 1 for Board B
            piece_name: Piece letter ("p", "n", "b", "r", "q")
            to_sq: Target square in algebraic notation (e.g. "e4")

        Returns:
            dict with drop details

        Raises:
            ValueError: If the drop is invalid
        """
        if self.game_over:
            raise ValueError("Game is already over.")

        if board_index not in (0, 1):
            raise ValueError("board_index must be 0 or 1.")

        piece_name = piece_name.lower()
        if piece_name not in PIECE_FROM_NAME:
            raise ValueError(
                f"Invalid piece type: {piece_name}. "
                f"Must be one of: {list(PIECE_FROM_NAME.keys())}"
            )

        piece_type = PIECE_FROM_NAME[piece_name]
        if piece_type == chess.KING:
            raise ValueError("Cannot drop a king.")

        board = self.boards[board_index]
        color = board.turn

        # Check pocket has the piece
        if board.pockets[color].count(piece_type) <= 0:
            raise ValueError(
                f"No {piece_name} in pocket for "
                f"{'white' if color == chess.WHITE else 'black'} "
                f"on board {board_index}."
            )

        # Build drop UCI: e.g. "N@e4"
        uci = piece_name.upper() + "@" + to_sq

        try:
            move = chess.Move.from_uci(uci)
        except (ValueError, chess.InvalidMoveError) as e:
            raise ValueError(f"Invalid drop format: {uci} - {e}")

        if move not in board.legal_moves:
            raise ValueError(
                f"Illegal drop: {uci} on board {board_index}."
            )

        seat = BOARD_COLOR_SEAT[(board_index, color)]

        # Push the drop move (CrazyhouseBoard handles pocket decrement)
        board.push(move)

        # Record
        drop_record = {
            "type": "drop",
            "board": board_index,
            "piece": piece_name,
            "square": to_sq,
            "seat": seat.value,
            "timestamp": time.time(),
        }
        self.move_history.append(drop_record)
        self.last_move[board_index] = {"drop": piece_name, "to": to_sq}

        # Check game-over
        self._check_game_over()

        return drop_record

    def resign(self, seat: int) -> dict:
        """
        A player resigns. Their team loses.

        Args:
            seat: The seat number (0-3) of the resigning player.

        Returns:
            dict with game over details.

        Raises:
            ValueError: If game is already over or seat invalid.
        """
        if self.game_over:
            raise ValueError("Game is already over.")

        try:
            seat_enum = Seat(seat)
        except ValueError:
            raise ValueError(f"Invalid seat: {seat}. Must be 0-3.")

        losing_team = SEAT_TEAM[seat_enum]
        winning_team = Team.A if losing_team == Team.B else Team.B

        self.game_over = True
        self.winner = winning_team
        self.result_reason = GameResult.RESIGNATION
        self.ended_at = time.time()

        return {
            "game_over": True,
            "winner": winning_team.value,
            "reason": GameResult.RESIGNATION.value,
            "resigned_seat": seat,
        }

    def _check_game_over(self):
        """Check both boards for checkmate or stalemate."""
        for bi in range(2):
            board = self.boards[bi]
            outcome = board.outcome()
            if outcome is not None:
                if outcome.termination == chess.Termination.CHECKMATE:
                    self.game_over = True
                    self.ended_at = time.time()
                    self.result_reason = GameResult.CHECKMATE
                    # The side that just moved delivered checkmate
                    # board.turn is now the LOSING side (the one in checkmate)
                    losing_color = board.turn
                    losing_seat = BOARD_COLOR_SEAT[(bi, losing_color)]
                    losing_team = SEAT_TEAM[losing_seat]
                    self.winner = (
                        Team.A if losing_team == Team.B else Team.B
                    )
                elif outcome.termination == chess.Termination.STALEMATE:
                    # NOTE: Stalemate in bughouse is debatable — a partner
                    # could send a piece to break the stalemate. Treating it
                    # as a draw for now; revisit if house rules differ.
                    self.game_over = True
                    self.ended_at = time.time()
                    self.result_reason = GameResult.STALEMATE
                    self.winner = None  # Draw
                else:
                    # Other terminations (INSUFFICIENT_MATERIAL,
                    # FIVEFOLD_REPETITION, SEVENTYFIVE_MOVES, etc.) do not
                    # apply in bughouse — partner can send pieces, and
                    # repetition / move-count rules are not used.
                    continue

                break

    def get_legal_moves(self, board_index: int) -> list[str]:
        """
        Get all legal standard moves (non-drops) for the current player
        on the given board, as UCI strings.
        """
        if board_index not in (0, 1):
            raise ValueError("board_index must be 0 or 1.")

        board = self.boards[board_index]
        return [
            move.uci()
            for move in board.legal_moves
            if move.drop is None
        ]

    def get_legal_drops(self, board_index: int) -> list[str]:
        """
        Get all legal drop moves for the current player on the given board,
        as UCI strings (e.g. "N@e4").
        """
        if board_index not in (0, 1):
            raise ValueError("board_index must be 0 or 1.")

        board = self.boards[board_index]
        return [
            move.uci()
            for move in board.legal_moves
            if move.drop is not None
        ]

    def get_pocket(self, board_index: int, color: bool) -> dict[str, int]:
        """
        Get the pocket contents for a color on a board as a dict
        mapping piece letter to count. Always includes all 5 piece types.
        """
        pocket = self.boards[board_index].pockets[color]
        return {
            "p": pocket.count(chess.PAWN),
            "n": pocket.count(chess.KNIGHT),
            "b": pocket.count(chess.BISHOP),
            "r": pocket.count(chess.ROOK),
            "q": pocket.count(chess.QUEEN),
        }

    def get_state(self) -> dict:
        """
        Return the full serializable game state for clients.
        """
        boards_state = []
        for bi in range(2):
            board = self.boards[bi]
            board_state = {
                "fen": board.fen(),
                "turn": "white" if board.turn == chess.WHITE else "black",
                "legal_moves": self.get_legal_moves(bi),
                "legal_drops": self.get_legal_drops(bi),
                "in_check": board.is_check(),
                "last_move": self.last_move[bi],
                "move_number": board.fullmove_number,
            }
            boards_state.append(board_state)

        pockets = {
            "board_a_white": self.get_pocket(0, chess.WHITE),
            "board_a_black": self.get_pocket(0, chess.BLACK),
            "board_b_white": self.get_pocket(1, chess.WHITE),
            "board_b_black": self.get_pocket(1, chess.BLACK),
        }

        return {
            "game_id": self.game_id,
            "boards": boards_state,
            "pockets": pockets,
            "game_over": self.game_over,
            "winner": self.winner.value if self.winner else None,
            "result_reason": (
                self.result_reason.value if self.result_reason else None
            ),
            "created_at": self.created_at,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
        }

    def is_game_over(self) -> bool:
        return self.game_over

    def get_board_ascii(self, board_index: int) -> str:
        """Get ASCII representation of a board (for debugging)."""
        return str(self.boards[board_index])
