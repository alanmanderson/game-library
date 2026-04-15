"""Game service managing in-memory game engines and database coordination."""

import asyncio
import logging
import secrets
import string
import random
from typing import Optional
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models import Table, MoveRecord, Player
from app.game_engine import (
    BackgammonEngine, Color, DiceRoll, Move, GameStatus, WinType,
)

logger = logging.getLogger(__name__)

# Time control presets: mode -> (total_time_ms, increment_ms)
TIME_CONTROL_PRESETS: dict[str, tuple[int | None, int | None]] = {
    "blitz": (180_000, 2_000),       # 3 min + 2s increment
    "rapid": (420_000, 5_000),       # 7 min + 5s increment
    "classical": (900_000, 10_000),  # 15 min + 10s increment
    "unlimited": (None, None),
}


async def _increment_cube_counter(
    db: AsyncSession, player_id: str, field: str
) -> None:
    """Increment one of the player's cube action counters.

    Skips the bot player so the bot's cube stats don't pollute leaderboards.
    No-ops silently if the player row is missing.
    """
    from app.services.bot_service import BOT_PLAYER_ID
    if not player_id or player_id == BOT_PLAYER_ID:
        return
    player = await db.get(Player, player_id)
    if not player:
        return
    setattr(player, field, (getattr(player, field) or 0) + 1)


class GameManager:
    """Manages active game engines in memory, keyed by table_id.

    Each active game has an associated BackgammonEngine and a mapping of
    player IDs to their assigned Color.  Engines are created when a second
    player joins a table and removed when the game finishes.
    """

    def __init__(self) -> None:
        self._engines: dict[str, BackgammonEngine] = {}
        self._player_colors: dict[str, dict[str, Color]] = {}  # table_id -> {player_id: color}
        self._locks: dict[str, asyncio.Lock] = {}
        self._crawford_used: dict[str, bool] = {}  # table_id -> whether Crawford game has been used
        # In-memory time tracking: table_id -> {time_control, white_time_ms, black_time_ms, turn_started_at}
        self._time_state: dict[str, dict] = {}

    @property
    def engines(self) -> dict:
        """Public read-only access to the active engine mapping."""
        return self._engines

    def generate_table_id(self) -> str:
        """Generate a short, unique, human-friendly table ID (6 uppercase alphanumeric chars)."""
        chars = string.ascii_uppercase + string.digits
        return "".join(secrets.choice(chars) for _ in range(6))

    def _get_lock(self, table_id: str) -> asyncio.Lock:
        """Return (creating if needed) the per-table asyncio lock."""
        if table_id not in self._locks:
            self._locks[table_id] = asyncio.Lock()
        return self._locks[table_id]

    # ------------------------------------------------------------------
    # Time control helpers
    # ------------------------------------------------------------------

    def init_time_state(self, table_id: str, time_control: str, white_ms: int | None, black_ms: int | None) -> None:
        """Initialize in-memory time tracking for a table."""
        if time_control == "unlimited" or white_ms is None or black_ms is None:
            return
        self._time_state[table_id] = {
            "time_control": time_control,
            "white_time_ms": white_ms,
            "black_time_ms": black_ms,
            "turn_started_at": None,
        }

    def start_turn_timer(self, table_id: str) -> None:
        """Record the start time of the current turn's clock."""
        ts = self._time_state.get(table_id)
        if ts is None:
            return
        ts["turn_started_at"] = datetime.now(timezone.utc)

    def end_turn_timer(self, table_id: str, color: Color) -> None:
        """Stop the clock for the given color, deduct elapsed time, add increment.

        Should be called when a turn ends (end_turn, auto-switch after last move).
        Bot players are exempt from time deduction.
        """
        from app.services.bot_service import BOT_PLAYER_ID
        ts = self._time_state.get(table_id)
        if ts is None:
            return

        # Check if the current player is the bot -- exempt bot from time pressure
        colors = self._player_colors.get(table_id, {})
        for pid, c in colors.items():
            if c == color and pid == BOT_PLAYER_ID:
                ts["turn_started_at"] = None
                return

        started_at = ts.get("turn_started_at")
        if started_at is None:
            return

        now = datetime.now(timezone.utc)
        elapsed_ms = int((now - started_at).total_seconds() * 1000)

        time_key = "white_time_ms" if color == Color.WHITE else "black_time_ms"
        ts[time_key] = max(0, ts[time_key] - elapsed_ms)

        # Add increment
        _total, increment_ms = TIME_CONTROL_PRESETS.get(ts["time_control"], (None, None))
        if increment_ms is not None and ts[time_key] > 0:
            ts[time_key] += increment_ms

        ts["turn_started_at"] = None

    def check_timeout(self, table_id: str) -> Color | None:
        """Check if the current player's time has expired.

        Returns the Color of the player who timed out, or None if no timeout.
        """
        ts = self._time_state.get(table_id)
        if ts is None:
            return None

        engine = self._engines.get(table_id)
        if engine is None or engine.state.status == GameStatus.FINISHED:
            return None

        started_at = ts.get("turn_started_at")
        if started_at is None:
            return None

        # Check if current player is bot -- bots never time out
        from app.services.bot_service import BOT_PLAYER_ID
        current_color = engine.state.current_turn
        colors = self._player_colors.get(table_id, {})
        for pid, c in colors.items():
            if c == current_color and pid == BOT_PLAYER_ID:
                return None

        now = datetime.now(timezone.utc)
        elapsed_ms = int((now - started_at).total_seconds() * 1000)

        time_key = "white_time_ms" if current_color == Color.WHITE else "black_time_ms"
        remaining = ts[time_key] - elapsed_ms

        if remaining <= 0:
            ts[time_key] = 0
            ts["turn_started_at"] = None
            return current_color

        return None

    def get_time_remaining(self, table_id: str) -> tuple[int | None, int | None]:
        """Return (white_time_ms, black_time_ms) with live elapsed deducted.

        Returns (None, None) for unlimited games.
        """
        ts = self._time_state.get(table_id)
        if ts is None:
            return (None, None)

        white_ms = ts["white_time_ms"]
        black_ms = ts["black_time_ms"]

        # If a turn is in progress, deduct live elapsed from the active player
        started_at = ts.get("turn_started_at")
        if started_at is not None:
            engine = self._engines.get(table_id)
            if engine and engine.state.status not in (GameStatus.FINISHED, GameStatus.WAITING):
                now = datetime.now(timezone.utc)
                elapsed_ms = int((now - started_at).total_seconds() * 1000)
                if engine.state.current_turn == Color.WHITE:
                    white_ms = max(0, white_ms - elapsed_ms)
                else:
                    black_ms = max(0, black_ms - elapsed_ms)

        return (white_ms, black_ms)

    def persist_time_to_table(self, table: "Table") -> None:
        """Write in-memory time state back to a Table model for DB persistence."""
        ts = self._time_state.get(table.id)
        if ts is None:
            return
        table.white_time_remaining_ms = ts["white_time_ms"]
        table.black_time_remaining_ms = ts["black_time_ms"]
        table.turn_started_at = ts.get("turn_started_at")

    # ------------------------------------------------------------------
    # Table lifecycle
    # ------------------------------------------------------------------

    async def create_table(self, db: AsyncSession, player_id: str, preferred_color: Optional[str] = None, match_points: int = 5, is_public: bool = False, time_control: str = "unlimited", is_ranked: bool = True) -> Table:
        """Create a new table. The creating player is assigned based on preferred_color."""
        table_id = self.generate_table_id()

        # Validate and apply time control preset
        if time_control not in TIME_CONTROL_PRESETS:
            time_control = "unlimited"
        total_time_ms, _increment_ms = TIME_CONTROL_PRESETS[time_control]

        if preferred_color == "black":
            table = Table(id=table_id, black_player_id=player_id, status="waiting", match_points=match_points, is_public=is_public, time_control=time_control, is_ranked=is_ranked)
        else:
            table = Table(id=table_id, white_player_id=player_id, status="waiting", match_points=match_points, is_public=is_public, time_control=time_control, is_ranked=is_ranked)

        # Initialize time banks if timed game
        if total_time_ms is not None:
            table.white_time_remaining_ms = total_time_ms
            table.black_time_remaining_ms = total_time_ms

        db.add(table)
        await db.flush()
        return table

    async def join_table(self, db: AsyncSession, table_id: str, player_id: str) -> Table:
        """Second player joins an existing table.

        Colors are randomly assigned (unless creator chose a specific color),
        a BackgammonEngine is created, and the game is started.  The opening
        roll determines who goes first (handled by the engine).
        """
        table = await db.get(Table, table_id)
        if not table:
            raise ValueError("Table not found")
        if table.status != "waiting":
            raise ValueError("Table is not waiting for players")
        if table.white_player_id == player_id or table.black_player_id == player_id:
            raise ValueError("Cannot join your own table")

        if table.white_player_id and not table.black_player_id:
            # Creator chose white (or default); joiner gets black
            # Randomly swap unless creator explicitly picked a slot
            if random.random() < 0.5:
                table.black_player_id = player_id
            else:
                table.black_player_id = table.white_player_id
                table.white_player_id = player_id
        elif table.black_player_id and not table.white_player_id:
            # Creator chose black; joiner gets white
            table.white_player_id = player_id
        else:
            # Fallback
            table.black_player_id = player_id

        table.status = "playing"

        # Create engine and start game
        engine = BackgammonEngine()
        engine.start_game()
        self._engines[table_id] = engine
        self._player_colors[table_id] = {
            table.white_player_id: Color.WHITE,
            table.black_player_id: Color.BLACK,
        }

        # Initialize time tracking
        self.init_time_state(
            table_id, table.time_control,
            table.white_time_remaining_ms, table.black_time_remaining_ms,
        )

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

    async def restore_engine(self, table_id: str, db: AsyncSession) -> Optional[BackgammonEngine]:
        """Restore an engine from the database game_state JSON snapshot.

        Used when the in-memory engine is missing (e.g. after a server
        restart) but the game is still in progress in the database.
        Returns the restored engine, or None if restoration is not possible.
        """
        table = await db.get(Table, table_id)
        if table is None or table.status not in ("playing", "game_over") or table.game_state is None:
            return None

        snap = table.game_state

        engine = BackgammonEngine()
        s = engine.state

        # Restore board position
        s.points = list(snap["points"])
        s.bar_white = snap["bar_white"]
        s.bar_black = snap["bar_black"]
        s.off_white = snap["off_white"]
        s.off_black = snap["off_black"]

        # Restore turn / status
        s.current_turn = Color(snap["current_turn"])
        s.status = GameStatus(snap["status"])

        # Restore dice
        if snap.get("dice"):
            s.dice = DiceRoll(snap["dice"]["die1"], snap["dice"]["die2"])
        else:
            s.dice = None
        s.remaining_dice = list(snap.get("remaining_dice", []))

        # Restore winner / win_type
        s.winner = Color(snap["winner"]) if snap.get("winner") else None
        if snap.get("win_type"):
            s.win_type = WinType[snap["win_type"].upper()]
        else:
            s.win_type = None

        # Restore opening roll
        s.opening_roll = snap.get("opening_roll")

        # Restore doubling cube
        s.cube_value = snap.get("cube_value", 1)
        s.cube_owner = Color(snap["cube_owner"]) if snap.get("cube_owner") else None
        s.double_offered = snap.get("double_offered", False)
        s.double_offered_by = Color(snap["double_offered_by"]) if snap.get("double_offered_by") else None
        s.is_crawford_game = snap.get("is_crawford_game", False)

        # Moves history and turn_moves cannot be fully restored from the
        # snapshot (it only stores turn_moves_count), so initialise them
        # as empty.  This means undo will not work for the first turn
        # after restoration, which is an acceptable trade-off.
        s.moves_history = []
        s.turn_moves = []

        # Prepare the internal _turn_snapshot so undo works for future
        # moves made after restoration (snapshot of current board).
        if s.status == GameStatus.MOVING:
            engine._turn_snapshot = engine._snapshot_internals()
            engine._turn_snapshot["remaining_dice"] = list(s.remaining_dice)
            engine._turn_snapshot["turn_moves"] = []

        # Store the restored engine
        self._engines[table_id] = engine

        # Restore Crawford state from snapshot
        if snap.get("crawford_game_used"):
            self._crawford_used[table_id] = True
        elif s.is_crawford_game:
            self._crawford_used[table_id] = True

        # Restore player color mappings
        self._player_colors[table_id] = {}
        if table.white_player_id:
            self._player_colors[table_id][table.white_player_id] = Color.WHITE
        if table.black_player_id:
            self._player_colors[table_id][table.black_player_id] = Color.BLACK

        # Restore time state from the table record
        if table.time_control and table.time_control != "unlimited":
            self.init_time_state(
                table_id, table.time_control,
                table.white_time_remaining_ms, table.black_time_remaining_ms,
            )
            # Restore turn_started_at if there was a running clock
            ts = self._time_state.get(table_id)
            if ts and table.turn_started_at:
                ts["turn_started_at"] = table.turn_started_at

        logger.info("Restored engine for table %s from database", table_id)
        return engine

    async def get_or_restore_engine(
        self, table_id: str, db: AsyncSession
    ) -> Optional[BackgammonEngine]:
        """Return the in-memory engine, restoring from DB if necessary."""
        engine = self.get_engine(table_id)
        if engine is not None:
            return engine
        return await self.restore_engine(table_id, db)

    async def restore_engine_from_snapshot(
        self, table_id: str, engine: BackgammonEngine, snap: dict
    ) -> None:
        """Restore an engine's state in-place from a snapshot dict.

        Used to roll back in-memory engine state when a DB commit fails,
        preventing divergence between engine and database state.
        """
        s = engine.state

        s.points = list(snap["points"])
        s.bar_white = snap["bar_white"]
        s.bar_black = snap["bar_black"]
        s.off_white = snap["off_white"]
        s.off_black = snap["off_black"]

        s.current_turn = Color(snap["current_turn"])
        s.status = GameStatus(snap["status"])

        if snap.get("dice"):
            s.dice = DiceRoll(snap["dice"]["die1"], snap["dice"]["die2"])
        else:
            s.dice = None
        s.remaining_dice = list(snap.get("remaining_dice", []))

        s.winner = Color(snap["winner"]) if snap.get("winner") else None
        if snap.get("win_type"):
            s.win_type = WinType[snap["win_type"].upper()]
        else:
            s.win_type = None

        s.opening_roll = snap.get("opening_roll")

        s.cube_value = snap.get("cube_value", 1)
        s.cube_owner = Color(snap["cube_owner"]) if snap.get("cube_owner") else None
        s.double_offered = snap.get("double_offered", False)
        s.double_offered_by = Color(snap["double_offered_by"]) if snap.get("double_offered_by") else None
        s.is_crawford_game = snap.get("is_crawford_game", False)

        s.moves_history = []
        s.turn_moves = []

        if s.status == GameStatus.MOVING:
            engine._turn_snapshot = engine._snapshot_internals()
            engine._turn_snapshot["remaining_dice"] = list(s.remaining_dice)
            engine._turn_snapshot["turn_moves"] = []

        logger.info("Restored engine state from snapshot for table %s", table_id)

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

        # Include time control info
        white_time_ms, black_time_ms = self.get_time_remaining(table_id)
        ts = self._time_state.get(table_id)
        snapshot["time_control"] = ts["time_control"] if ts else "unlimited"
        snapshot["white_time_remaining_ms"] = white_time_ms
        snapshot["black_time_remaining_ms"] = black_time_ms

        # Calculate pip counts
        pip_white = 0
        pip_black = 0
        points = snapshot.get("points", [])
        for i in range(1, 25):
            val = points[i] if i < len(points) else 0
            if val > 0:
                pip_white += i * val
            elif val < 0:
                pip_black += (25 - i) * (-val)
        pip_white += 25 * snapshot.get("bar_white", 0)
        pip_black += 25 * snapshot.get("bar_black", 0)
        snapshot["pip_white"] = pip_white
        snapshot["pip_black"] = pip_black

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

        # Start the turn timer (clock starts ticking after roll)
        self.start_turn_timer(table_id)

        # If the turn was auto-skipped (no valid moves), record the
        # turn so it appears in move history and stop the timer.
        if engine.state.current_turn != color:
            self.end_turn_timer(table_id, color)
            await self._record_moves(db, table_id, player_id, engine)

        # Persist updated game state (including time)
        table = await db.get(Table, table_id)
        if table:
            table.game_state = engine.get_state_snapshot()
            self.persist_time_to_table(table)

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
            self.end_turn_timer(table_id, moving_color)
            await self._record_moves(db, table_id, player_id, engine)

        # Persist time state
        if table:
            self.persist_time_to_table(table)

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

        # Stop clock and add increment
        self.end_turn_timer(table_id, color)

        await self._record_moves(db, table_id, player_id, engine)

        # Persist updated game state (including time)
        table = await db.get(Table, table_id)
        if table:
            table.game_state = engine.get_state_snapshot()
            self.persist_time_to_table(table)

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
        await _increment_cube_counter(db, player_id, "cube_offers")
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
        await _increment_cube_counter(db, player_id, "cube_accepts")
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
        await _increment_cube_counter(db, player_id, "cube_declines")
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

    async def handle_timeout(self, db: AsyncSession, table_id: str) -> Color | None:
        """Check for timeout and finish the game if a player's time expired.

        Returns the Color of the player who timed out, or None.
        """
        timed_out_color = self.check_timeout(table_id)
        if timed_out_color is None:
            return None

        engine = self._engines.get(table_id)
        if not engine or engine.state.status == GameStatus.FINISHED:
            return None

        # Force the game to end -- the player who timed out loses
        winner_color = Color.BLACK if timed_out_color == Color.WHITE else Color.WHITE
        engine.state.winner = winner_color
        engine.state.win_type = WinType.NORMAL
        engine.state.status = GameStatus.FINISHED

        await self._finish_game(db, table_id, engine)

        table = await db.get(Table, table_id)
        if table:
            table.game_state = engine.get_state_snapshot()
            self.persist_time_to_table(table)

        return timed_out_color

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
            select(func.count(MoveRecord.id)).where(MoveRecord.table_id == table_id)
        )
        existing_count = result.scalar()

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
        """Handle game completion: update the table record and player stats.

        If neither player has reached match_points, the table status is set to
        "game_over" (individual game over, match continues).  Otherwise the
        status is set to "finished" (match over).
        """
        from app.services.stats_service import update_stats
        from app.services.rating_service import update_ratings

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

        # Update match scores
        if winner_color == Color.WHITE:
            table.white_match_score += cube_score
        elif winner_color == Color.BLACK:
            table.black_match_score += cube_score

        # Check if match is over
        match_over = (
            table.white_match_score >= table.match_points
            or table.black_match_score >= table.match_points
        )

        if match_over:
            table.status = "finished"
            table.finished_at = datetime.now(timezone.utc)
        else:
            table.status = "game_over"

        # Persist game state with crawford_game_used for match continuity
        snap = engine.get_state_snapshot()
        snap["crawford_game_used"] = self._crawford_used.get(table_id, False)
        table.game_state = snap

        # Update player statistics
        await update_stats(
            db,
            table.white_player_id,
            table.black_player_id,
            table.winner_id,
            win_type,
            cube_value=engine.state.cube_value,
        )

        # Update ELO ratings (only for ranked matches between registered players)
        if match_over and table.winner_id and table.is_ranked:
            loser_id = (
                table.black_player_id
                if table.winner_id == table.white_player_id
                else table.white_player_id
            )
            await update_ratings(db, table.winner_id, loser_id, table_id=table_id)

        # Advance tournament bracket if this table is part of a tournament match
        if match_over and table.winner_id:
            await self._process_tournament_advancement(db, table_id, table.winner_id)

        # NOTE: Engine cleanup is deferred to cleanup_finished_game() so that
        # the WebSocket handler can still broadcast the final game state.

    async def _process_tournament_advancement(
        self, db: AsyncSession, table_id: str, winner_id: str
    ) -> None:
        """If the table belongs to a tournament match, advance the winner."""
        from app.models import TournamentMatch
        from app.services.tournament_service import process_match_completion
        from sqlalchemy import select as sa_select

        result = await db.execute(
            sa_select(TournamentMatch).where(TournamentMatch.table_id == table_id)
        )
        match = result.scalars().first()
        if match:
            await process_match_completion(db, match.tournament_id, table_id, winner_id)

    async def start_next_game(self, db: AsyncSession, table_id: str) -> Table:
        """Start the next game in a match after a game_over.

        Resets per-game fields, creates a fresh engine, and sets status
        back to "playing".  Applies the Crawford rule when applicable:
        if either player's match score is exactly match_points - 1 and
        the Crawford game hasn't been used yet, the next game is a
        Crawford game (no doubling allowed).
        """
        table = await db.get(Table, table_id)
        if not table:
            raise ValueError("Table not found")
        if table.status != "game_over":
            raise ValueError("No game to continue")

        # Clear per-game fields
        table.winner_id = None
        table.win_type = None
        table.final_score = None

        # Create fresh engine and start game
        engine = BackgammonEngine()
        engine.start_game()
        self._engines[table_id] = engine
        self._player_colors[table_id] = {
            table.white_player_id: Color.WHITE,
            table.black_player_id: Color.BLACK,
        }

        # Crawford rule: if either player is at match point (needs exactly 1
        # more point to win) and Crawford hasn't been used yet for this match,
        # this is the Crawford game (no doubling allowed).
        crawford_used = self._crawford_used.get(table_id, False)
        is_crawford = False
        if not crawford_used and table.match_points > 1:
            at_match_point = (
                table.white_match_score == table.match_points - 1
                or table.black_match_score == table.match_points - 1
            )
            if at_match_point:
                is_crawford = True
                self._crawford_used[table_id] = True

        engine.state.is_crawford_game = is_crawford

        table.status = "playing"
        snap = engine.get_state_snapshot()
        snap["crawford_game_used"] = self._crawford_used.get(table_id, False)
        table.game_state = snap

        # Re-initialize time banks for the next game
        if table.time_control and table.time_control != "unlimited":
            total_time_ms, _increment = TIME_CONTROL_PRESETS.get(table.time_control, (None, None))
            if total_time_ms is not None:
                table.white_time_remaining_ms = total_time_ms
                table.black_time_remaining_ms = total_time_ms
                table.turn_started_at = None
                self.init_time_state(table_id, table.time_control, total_time_ms, total_time_ms)

        await db.flush()
        return table

    def cleanup_finished_game(self, table_id: str) -> None:
        """Remove the in-memory engine for a finished game.

        Called by the WebSocket handler after the final state has been
        broadcast to all connected players.
        """
        self._engines.pop(table_id, None)
        self._player_colors.pop(table_id, None)
        self._locks.pop(table_id, None)
        self._crawford_used.pop(table_id, None)
        self._time_state.pop(table_id, None)

    async def cleanup_stale_engines(self, db: AsyncSession) -> int:
        """Remove in-memory engines for games that are finished or abandoned.

        A game is considered stale if:
        - The table no longer exists in the database.
        - The table status is "finished".
        - The table has been inactive for more than 1 hour (based on
          updated_at, falling back to created_at).

        Returns the number of engines cleaned up.
        """
        now = datetime.now(timezone.utc)
        stale_timeout_seconds = 3600  # 1 hour
        cleaned = 0

        for table_id in list(self._engines.keys()):
            table = await db.get(Table, table_id)

            should_remove = False
            if table is None:
                should_remove = True
            elif table.status == "finished":
                should_remove = True
            else:
                last_activity = table.updated_at or table.created_at
                if last_activity:
                    # Ensure both datetimes are offset-aware for comparison
                    if last_activity.tzinfo is None:
                        last_activity = last_activity.replace(tzinfo=timezone.utc)
                    elapsed = (now - last_activity).total_seconds()
                    if elapsed > stale_timeout_seconds:
                        should_remove = True

            if should_remove:
                self._engines.pop(table_id, None)
                self._player_colors.pop(table_id, None)
                self._locks.pop(table_id, None)
                self._crawford_used.pop(table_id, None)
                self._time_state.pop(table_id, None)
                cleaned += 1
                logger.info("Cleaned up stale engine for table %s", table_id)

        return cleaned


# Global singleton -- shared by all routes and WebSocket handlers
game_manager = GameManager()
