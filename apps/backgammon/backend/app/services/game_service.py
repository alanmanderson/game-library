"""Game service managing in-memory game engines and database coordination."""

import string
import random
from typing import Optional
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Table, MoveRecord, Player
from app.game_engine import BackgammonEngine, Color, Move, GameStatus, WinType


class GameManager:
    """Manages active game engines in memory, keyed by table_id.

    Each active game has an associated BackgammonEngine and a mapping of
    player IDs to their assigned Color.  Engines are created when a second
    player joins a table and removed when the game finishes.
    """

    def __init__(self) -> None:
        self._engines: dict[str, BackgammonEngine] = {}
        self._player_colors: dict[str, dict[str, Color]] = {}  # table_id -> {player_id: color}

    def generate_table_id(self) -> str:
        """Generate a short, unique, human-friendly table ID (6 uppercase alphanumeric chars)."""
        chars = string.ascii_uppercase + string.digits
        return "".join(random.choices(chars, k=6))

    # ------------------------------------------------------------------
    # Table lifecycle
    # ------------------------------------------------------------------

    async def create_table(self, db: AsyncSession, player_id: str) -> Table:
        """Create a new table. The creating player is initially assigned as white (will be randomized on join)."""
        table_id = self.generate_table_id()
        table = Table(id=table_id, white_player_id=player_id, status="waiting")
        db.add(table)
        await db.flush()
        return table

    async def join_table(self, db: AsyncSession, table_id: str, player_id: str) -> Table:
        """Second player joins an existing table.

        Colors are randomly assigned, a BackgammonEngine is created, and
        the game is started.  The opening roll determines who goes first
        (handled by the engine).
        """
        table = await db.get(Table, table_id)
        if not table:
            raise ValueError("Table not found")
        if table.status != "waiting":
            raise ValueError("Table is not waiting for players")
        if table.white_player_id == player_id:
            raise ValueError("Cannot join your own table")

        # Randomly assign colors between the two players
        if random.random() < 0.5:
            table.black_player_id = player_id
        else:
            # Swap: joining player becomes white, creator becomes black
            table.black_player_id = table.white_player_id
            table.white_player_id = player_id

        table.status = "playing"

        # Create engine and start game
        engine = BackgammonEngine()
        engine.start_game()
        self._engines[table_id] = engine
        self._player_colors[table_id] = {
            table.white_player_id: Color.WHITE,
            table.black_player_id: Color.BLACK,
        }

        # Persist initial game state
        table.game_state = engine.get_state_snapshot()
        await db.flush()
        return table

    # ------------------------------------------------------------------
    # Engine access
    # ------------------------------------------------------------------

    def get_engine(self, table_id: str) -> Optional[BackgammonEngine]:
        """Return the in-memory engine for a table, or None if not active."""
        return self._engines.get(table_id)

    def get_player_color(self, table_id: str, player_id: str) -> Optional[Color]:
        """Return the Color assigned to a player at a table, or None."""
        colors = self._player_colors.get(table_id, {})
        return colors.get(player_id)

    # ------------------------------------------------------------------
    # Game state
    # ------------------------------------------------------------------

    def build_game_state_response(self, table_id: str, player_id: str) -> dict:
        """Build a personalized game state response for a specific player.

        Only the current player whose turn it is to move will see their
        valid_moves populated; the opponent sees an empty list.
        """
        engine = self._engines[table_id]
        snapshot = engine.get_state_snapshot()
        color = self.get_player_color(table_id, player_id)

        valid_moves: list[dict] = []
        if (
            color
            and engine.state.current_turn == color
            and engine.state.status == GameStatus.MOVING
        ):
            valid_moves = [
                {
                    "from_point": m.from_point,
                    "to_point": m.to_point,
                    "is_hit": m.is_hit,
                }
                for m in engine.get_valid_moves()
            ]

        snapshot["valid_moves"] = valid_moves
        snapshot["can_double"] = engine.can_double(color) if color else False
        return snapshot

    # ------------------------------------------------------------------
    # Game actions
    # ------------------------------------------------------------------

    async def roll_dice(self, db: AsyncSession, table_id: str, player_id: str) -> dict:
        """Roll dice for the current player.

        Validates turn ownership and game status before rolling.
        Returns a dict with die1 and die2.
        """
        engine = self._engines.get(table_id)
        if not engine:
            raise ValueError("Game not found")

        color = self.get_player_color(table_id, player_id)
        if not color or engine.state.current_turn != color:
            raise ValueError("Not your turn")
        if engine.state.status != GameStatus.ROLLING:
            raise ValueError("Cannot roll now")

        roll = engine.roll_dice()

        # If the turn was auto-skipped (no valid moves), record the
        # turn so it appears in move history.
        if engine.state.current_turn != color:
            await self._record_moves(db, table_id, player_id, engine)

        # Persist updated game state
        table = await db.get(Table, table_id)
        if table:
            table.game_state = engine.get_state_snapshot()

        return {"die1": roll.die1, "die2": roll.die2}

    async def make_move(
        self, db: AsyncSession, table_id: str, player_id: str, from_point: int, to_point: int
    ) -> bool:
        """Execute a move for the current player.

        Validates turn ownership, finds the matching valid move (which
        includes hit information), applies it via the engine, records the
        turn if it has ended, and handles game completion.
        """
        engine = self._engines.get(table_id)
        if not engine:
            raise ValueError("Game not found")

        color = self.get_player_color(table_id, player_id)
        if not color or engine.state.current_turn != color:
            raise ValueError("Not your turn")

        # Find the matching valid move (which includes is_hit info from the engine)
        valid_moves = engine.get_valid_moves()
        target_move: Optional[Move] = None
        for m in valid_moves:
            if m.from_point == from_point and m.to_point == to_point:
                target_move = m
                break

        if target_move is None:
            raise ValueError("Invalid move")

        # Track which color is moving so we can detect auto-turn-switch
        moving_color = color

        success = engine.make_move(target_move)
        if not success:
            raise ValueError("Move failed")

        # Persist updated game state
        table = await db.get(Table, table_id)
        if table:
            table.game_state = engine.get_state_snapshot()

        # Detect whether the turn ended (auto-switched by the engine)
        turn_ended = (
            engine.state.current_turn != moving_color
            or engine.state.status == GameStatus.FINISHED
        )

        if turn_ended:
            await self._record_moves(db, table_id, player_id, engine)

        # Handle game completion
        if engine.state.status == GameStatus.FINISHED:
            await self._finish_game(db, table_id, engine)

        return True

    async def end_turn(self, db: AsyncSession, table_id: str, player_id: str) -> bool:
        """Manually end the current player's turn when no valid moves remain.

        This is used when the player has rolled but cannot make any moves,
        or has made some moves but cannot use all remaining dice.
        """
        engine = self._engines.get(table_id)
        if not engine:
            raise ValueError("Game not found")

        color = self.get_player_color(table_id, player_id)
        if not color or engine.state.current_turn != color:
            raise ValueError("Not your turn")

        success = engine.end_turn()
        if not success:
            raise ValueError("Cannot end turn now")

        await self._record_moves(db, table_id, player_id, engine)

        # Persist updated game state
        table = await db.get(Table, table_id)
        if table:
            table.game_state = engine.get_state_snapshot()

        return True

    async def offer_double(self, db: AsyncSession, table_id: str, player_id: str) -> bool:
        """Offer to double the stakes."""
        engine = self._engines.get(table_id)
        if not engine:
            raise ValueError("Game not found")
        color = self.get_player_color(table_id, player_id)
        if not color:
            raise ValueError("Not a player at this table")
        if not engine.offer_double(color):
            raise ValueError("Cannot double now")
        table = await db.get(Table, table_id)
        if table:
            table.game_state = engine.get_state_snapshot()
        return True

    async def accept_double(self, db: AsyncSession, table_id: str, player_id: str) -> bool:
        """Accept a pending double offer."""
        engine = self._engines.get(table_id)
        if not engine:
            raise ValueError("Game not found")
        color = self.get_player_color(table_id, player_id)
        if not color:
            raise ValueError("Not a player at this table")
        if not engine.accept_double(color):
            raise ValueError("No double to accept")
        table = await db.get(Table, table_id)
        if table:
            table.game_state = engine.get_state_snapshot()
        return True

    async def decline_double(self, db: AsyncSession, table_id: str, player_id: str) -> dict:
        """Decline a pending double offer."""
        engine = self._engines.get(table_id)
        if not engine:
            raise ValueError("Game not found")
        color = self.get_player_color(table_id, player_id)
        if not color:
            raise ValueError("Not a player at this table")
        success, winner = engine.decline_double(color)
        if not success:
            raise ValueError("No double to decline")
        await self._finish_game(db, table_id, engine)
        table = await db.get(Table, table_id)
        if table:
            table.game_state = engine.get_state_snapshot()
        return {"winner": winner.value if winner else None}

    async def undo_turn(self, db: AsyncSession, table_id: str, player_id: str) -> bool:
        """Undo all moves made this turn, restoring the board to post-roll state."""
        engine = self._engines.get(table_id)
        if not engine:
            raise ValueError("Game not found")

        color = self.get_player_color(table_id, player_id)
        if not color or engine.state.current_turn != color:
            raise ValueError("Not your turn")

        success = engine.undo_turn()
        if not success:
            raise ValueError("Nothing to undo")

        table = await db.get(Table, table_id)
        if table:
            table.game_state = engine.get_state_snapshot()

        return True

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _record_moves(
        self, db: AsyncSession, table_id: str, player_id: str, engine: BackgammonEngine
    ) -> None:
        """Record the most recent turn's moves in the database."""
        if not engine.state.moves_history:
            return

        # Get the latest history entry
        latest = engine.state.moves_history[-1]
        color, dice, moves = latest

        # Count existing move records for this table to determine move_number
        result = await db.execute(
            select(MoveRecord).where(MoveRecord.table_id == table_id)
        )
        existing_count = len(result.scalars().all())

        notation = (
            " ".join(m.to_notation(color) for m in moves) if moves else "(no moves)"
        )

        record = MoveRecord(
            table_id=table_id,
            player_id=player_id,
            move_number=existing_count + 1,
            dice_roll=f"{dice.die1}-{dice.die2}",
            moves_notation=notation,
            game_state_after=engine.get_state_snapshot(),
        )
        db.add(record)

    async def _finish_game(
        self, db: AsyncSession, table_id: str, engine: BackgammonEngine
    ) -> None:
        """Handle game completion: update the table record and player stats."""
        from app.services.stats_service import update_stats

        table = await db.get(Table, table_id)
        if not table:
            return

        winner_color = engine.state.winner
        win_type = engine.state.win_type

        if winner_color == Color.WHITE:
            table.winner_id = table.white_player_id
        elif winner_color == Color.BLACK:
            table.winner_id = table.black_player_id

        table.win_type = win_type.name.lower() if win_type else "normal"
        # Score = win_type_value * cube_value
        base_score = win_type.value if win_type else 1
        cube_score = base_score * engine.state.cube_value
        table.final_score = cube_score
        table.status = "finished"
        table.finished_at = datetime.utcnow()

        # Update match scores
        if winner_color == Color.WHITE:
            table.white_match_score += cube_score
        elif winner_color == Color.BLACK:
            table.black_match_score += cube_score

        table.game_state = engine.get_state_snapshot()

        # Update player statistics
        await update_stats(
            db,
            table.white_player_id,
            table.black_player_id,
            table.winner_id,
            win_type,
        )

        # NOTE: Engine cleanup is deferred to cleanup_finished_game() so that
        # the WebSocket handler can still broadcast the final game state.

    def cleanup_finished_game(self, table_id: str) -> None:
        """Remove the in-memory engine for a finished game.

        Called by the WebSocket handler after the final state has been
        broadcast to all connected players.
        """
        self._engines.pop(table_id, None)
        self._player_colors.pop(table_id, None)


# Global singleton -- shared by all routes and WebSocket handlers
game_manager = GameManager()
