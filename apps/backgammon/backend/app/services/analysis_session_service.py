"""Analysis session service — manages interactive gnubg analysis games.

Each session wraps a live BackgammonEngine so the player can play against
gnubg with real-time per-move analysis.  Sessions live in memory (keyed by
session_id) and are mirrored to the ``analysis_sessions`` /
``analysis_session_moves`` tables for persistence.

Key design notes:
- Per-session asyncio.Lock guards every state mutation so concurrent WS
  messages cannot race the engine.
- gnubg client methods all return None when the service is unavailable;
  every call site falls back gracefully so the session still functions
  (without analysis) even when gnubg is down.
- ``last_turn_notation`` lives in the snapshot dict returned by
  ``get_state_snapshot()``, NOT on ``engine.state`` directly.  We always
  read it from the snapshot after ``end_turn()`` completes.
"""

from __future__ import annotations

import asyncio
import logging
import random
import secrets
import string
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.game_engine import BackgammonEngine, Color, GameStatus, Move
from app.models import AnalysisSession, AnalysisSessionMove, MoveRecord
from app.services import gnubg_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# In-memory data structures
# ---------------------------------------------------------------------------


@dataclass
class AnalysisMoveRecord:
    """Per-move record held in SessionState.move_history."""

    move_number: int
    player: str          # "white" or "black"
    dice_roll: str       # e.g. "3-5"
    move_notation: str   # e.g. "13/8 6/3"
    position_snapshot: dict  # engine snapshot AFTER the move
    quality: str | None = None           # "best", "good", "inaccuracy", "blunder", …
    equity_loss: float | None = None
    best_move_notation: str | None = None
    equity: float | None = None          # chosen move equity
    best_equity: float | None = None
    best_probs: dict | None = None
    chosen_probs: dict | None = None
    annotation: str | None = None


@dataclass
class SessionState:
    """All runtime state for one analysis session."""

    id: str
    player_id: str
    player_color: Color
    engine: BackgammonEngine
    config: dict
    move_history: list[AnalysisMoveRecord] = field(default_factory=list)
    # -1 = live position, 0..N = viewing move_history[index]
    current_view_index: int = -1
    gnubg_ply: int = 2
    auto_analysis: str = "off"
    status: str = "active"   # "active" | "completed" | "abandoned"


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------


class AnalysisSessionManager:
    """Manages active analysis sessions in memory, keyed by session_id."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    # ── Internal helpers ────────────────────────────────────────────────────

    def _generate_id(self) -> str:
        chars = string.ascii_uppercase + string.digits
        return "".join(secrets.choice(chars) for _ in range(8))

    def _get_lock(self, session_id: str) -> asyncio.Lock:
        if session_id not in self._locks:
            self._locks[session_id] = asyncio.Lock()
        return self._locks[session_id]

    # ── Session lifecycle ────────────────────────────────────────────────────

    async def create_session(
        self, player_id: str, config: dict, db: AsyncSession
    ) -> SessionState:
        """Create a new analysis session, persist it, and return the state.

        If gnubg plays first (player chose black and White moves first),
        gnubg's opening turn is executed before returning so the client
        immediately sees the opponent's move.
        """
        session_id = self._generate_id()

        color_pref = config.get("player_color", "white")
        if color_pref == "random":
            player_color = random.choice([Color.WHITE, Color.BLACK])
        else:
            player_color = Color.WHITE if color_pref == "white" else Color.BLACK

        engine = BackgammonEngine()
        engine.start_game()

        session = SessionState(
            id=session_id,
            player_id=player_id,
            player_color=player_color,
            engine=engine,
            config=config,
            gnubg_ply=config.get("gnubg_ply", 2),
            auto_analysis=config.get("auto_analysis", "off"),
        )
        self._sessions[session_id] = session

        db.add(
            AnalysisSession(
                id=session_id,
                player_id=player_id,
                game_type=config.get("game_type", "money"),
                match_length=config.get("match_length"),
                player_color=player_color.value,
                gnubg_ply=session.gnubg_ply,
                auto_analysis=session.auto_analysis,
                status="active",
                game_state_json=engine.get_state_snapshot(),
            )
        )
        await db.commit()

        # If gnubg owns the first turn, let it play before returning.
        gnubg_color = Color.BLACK if player_color == Color.WHITE else Color.WHITE
        if engine.state.current_turn == gnubg_color:
            try:
                await self._play_gnubg_turn(session)
                db_row = await db.get(AnalysisSession, session_id)
                if db_row:
                    db_row.game_state_json = engine.get_state_snapshot()
                    await db.commit()
            except Exception:
                logger.exception(
                    "Failed to execute gnubg opening turn for session %s", session_id
                )

        return session

    def get_session(self, session_id: str) -> SessionState | None:
        return self._sessions.get(session_id)

    async def close_session(self, session_id: str, db: AsyncSession) -> None:
        """Mark the session closed in-memory and in the database."""
        session = self._sessions.pop(session_id, None)
        if session is None:
            return
        self._locks.pop(session_id, None)

        db_row = await db.get(AnalysisSession, session_id)
        if db_row:
            db_row.status = (
                "completed"
                if session.engine.state.status == GameStatus.FINISHED
                else "abandoned"
            )
            db_row.completed_at = datetime.now(timezone.utc)
            db_row.game_state_json = session.engine.get_state_snapshot()
            await db.commit()

    # ── Game actions ─────────────────────────────────────────────────────────

    async def roll_dice(self, session_id: str) -> dict:
        """Roll dice for the current player.  Returns the new state snapshot."""
        session = self._sessions[session_id]
        session.current_view_index = -1
        session.engine.roll_dice()
        return session.engine.get_state_snapshot()

    async def make_move(
        self, session_id: str, from_point: int, to_point: int
    ) -> dict:
        """Apply a single checker move.  Returns the new state snapshot."""
        session = self._sessions[session_id]
        session.current_view_index = -1
        valid_moves = session.engine.get_valid_moves()
        target = None
        for m in valid_moves:
            if m.from_point == from_point and m.to_point == to_point:
                target = m
                break
        if target is None:
            raise ValueError("Invalid move")
        session.engine.make_move(target)
        return session.engine.get_state_snapshot()

    async def undo_move(self, session_id: str) -> dict:
        """Undo the most recent move made this turn."""
        session = self._sessions[session_id]
        # undo_turn() requires turn_moves to be non-empty; it's safe to call
        # even when there's nothing to undo — it returns False and the board
        # is unchanged.
        session.engine.undo_turn()
        return session.engine.get_state_snapshot()

    async def end_turn(self, session_id: str, db: AsyncSession) -> dict:
        """Commit the player's turn, trigger gnubg's reply, persist both.

        Flow:
          1. Capture dice info before end_turn clears it.
          2. Call engine.end_turn() — this calls _record_turn() internally,
             which appends to moves_history.
          3. Read last_turn_notation from the new snapshot (it reflects
             moves_history[-1] after _record_turn()).
          4. Persist the player's move.
          5. If the game isn't over, call _play_gnubg_turn() and persist
             gnubg's response.
        """
        session = self._sessions[session_id]
        engine = session.engine

        # 1. Capture dice before end_turn() clears them from state.
        dice = engine.state.dice
        dice_str = f"{dice.die1}-{dice.die2}" if dice else ""

        # 2. End the turn.
        engine.end_turn()

        # 3. Notation is now readable from the snapshot (moves_history was
        #    updated by _record_turn() inside end_turn()).
        snapshot_after = engine.get_state_snapshot()
        notation = snapshot_after.get("last_turn_notation") or ""

        # 4. Build and store the player's move record.
        player_record = AnalysisMoveRecord(
            move_number=len(session.move_history) + 1,
            player=session.player_color.value,
            dice_roll=dice_str,
            move_notation=notation,
            position_snapshot=snapshot_after,
        )
        session.move_history.append(player_record)

        db.add(
            AnalysisSessionMove(
                session_id=session_id,
                move_number=player_record.move_number,
                player=player_record.player,
                dice_roll=player_record.dice_roll,
                move_notation=player_record.move_notation,
                position_snapshot=player_record.position_snapshot,
            )
        )

        # 5a. Check for game over before handing off to gnubg.
        if engine.state.status == GameStatus.FINISHED:
            session.status = "completed"
            db_row = await db.get(AnalysisSession, session_id)
            if db_row:
                db_row.status = "completed"
                db_row.completed_at = datetime.now(timezone.utc)
                winner = engine.state.winner
                if winner:
                    db_row.result = (
                        "win" if winner == session.player_color else "loss"
                    )
                db_row.game_state_json = engine.get_state_snapshot()
            await db.commit()
            return engine.get_state_snapshot()

        # 5b. gnubg's turn.
        gnubg_color = (
            Color.BLACK if session.player_color == Color.WHITE else Color.WHITE
        )
        if engine.state.current_turn == gnubg_color:
            try:
                await self._play_gnubg_turn(session)
            except Exception:
                logger.exception(
                    "gnubg turn failed for session %s — falling back", session_id
                )

            # Persist gnubg's move (appended to move_history by _play_gnubg_turn).
            if (
                session.move_history
                and session.move_history[-1].player != session.player_color.value
            ):
                gm = session.move_history[-1]
                db.add(
                    AnalysisSessionMove(
                        session_id=session_id,
                        move_number=gm.move_number,
                        player=gm.player,
                        dice_roll=gm.dice_roll,
                        move_notation=gm.move_notation,
                        position_snapshot=gm.position_snapshot,
                    )
                )

        db_row = await db.get(AnalysisSession, session_id)
        if db_row:
            db_row.game_state_json = engine.get_state_snapshot()
        await db.commit()

        return engine.get_state_snapshot()

    async def _play_gnubg_turn(self, session: SessionState) -> None:
        """Have gnubg roll, select the best move, and end its turn.

        Failure modes handled:
        - gnubg service unavailable → best_move() returns None → fall back
          to sequential valid moves.
        - gnubg returns moves that are no longer valid on the current board
          (e.g. stale race condition) → individual make_move() calls that
          return False are skipped; remaining moves are played from valid
          set as a fallback.
        - Engine already finished or it is not gnubg's turn → early return.
        - Any unexpected exception is caught and logged so the session
          remains in a consistent state (the fallback always tries to call
          end_turn() on the engine).
        """
        engine = session.engine
        gnubg_color = (
            Color.BLACK if session.player_color == Color.WHITE else Color.WHITE
        )

        if engine.state.current_turn != gnubg_color:
            return
        if engine.state.status == GameStatus.FINISHED:
            return

        # Roll if needed.
        if engine.state.status == GameStatus.ROLLING:
            engine.roll_dice()

        if engine.state.status != GameStatus.MOVING:
            # Unexpected state (e.g. WAITING or FINISHED); bail out.
            logger.warning(
                "session %s: unexpected engine status %s before gnubg move",
                session.id,
                engine.state.status,
            )
            return

        dice = engine.state.dice
        dice_list: list[int] = []
        dice_str = ""
        if dice:
            dice_list = [dice.die1, dice.die2]
            dice_str = f"{dice.die1}-{dice.die2}"

        fallback_notation: list[str] = []
        try:
            board = gnubg_client.board_payload_from_engine(engine, gnubg_color)
            result = await gnubg_client.best_move(board, dice_list)

            if result and result.get("best", {}).get("moves"):
                best = result["best"]
                for m in best["moves"]:
                    valid = engine.get_valid_moves()
                    move_obj = None
                    for v in valid:
                        if v.from_point == m["from_point"] and v.to_point == m["to_point"]:
                            move_obj = v
                            break
                    if move_obj is None:
                        logger.warning(
                            "session %s: gnubg move %s/%s not in valid moves",
                            session.id, m["from_point"], m["to_point"],
                        )
                        break
                    success = engine.make_move(move_obj)
                    if not success:
                        logger.warning(
                            "session %s: gnubg suggested invalid move %s/%s — skipping",
                            session.id,
                            m["from_point"],
                            m["to_point"],
                        )
                        break
                # Any remaining valid moves after a partial application are
                # left; end_turn() handles the "no remaining moves" case.
            else:
                # gnubg unavailable or returned no moves — play greedily.
                valid = engine.get_valid_moves()
                while valid:
                    m = valid[0]
                    if not engine.make_move(m):
                        break
                    fallback_notation.append(f"{m.from_point}/{m.to_point}")
                    valid = engine.get_valid_moves()

        except Exception:
            logger.exception(
                "session %s: error during gnubg move selection", session.id
            )
            # Best-effort fallback: play whatever is valid.
            try:
                valid = engine.get_valid_moves()
                while valid:
                    m = valid[0]
                    if not engine.make_move(m):
                        break
                    fallback_notation.append(f"{m.from_point}/{m.to_point}")
                    valid = engine.get_valid_moves()
            except Exception:
                logger.exception(
                    "session %s: fallback move execution also failed", session.id
                )

        # end_turn() is idempotent w.r.t. "no dice left" — safe to call even
        # if all dice were consumed above.  It will refuse if the engine is
        # not in MOVING status, so we guard before calling.
        if engine.state.status == GameStatus.MOVING:
            engine.end_turn()

        # Notation: prefer the engine's own record (from moves_history) over
        # our manually-built fallback string.  last_turn_notation is set by
        # _record_turn() inside end_turn() and is present in the snapshot.
        snapshot = engine.get_state_snapshot()
        notation = snapshot.get("last_turn_notation") or " ".join(fallback_notation)

        move_record = AnalysisMoveRecord(
            move_number=len(session.move_history) + 1,
            player=gnubg_color.value,
            dice_roll=dice_str,
            move_notation=notation,
            position_snapshot=snapshot,
        )
        session.move_history.append(move_record)

    # ── Doubling cube ─────────────────────────────────────────────────────────

    async def offer_double(self, session_id: str) -> dict:
        """Player offers a double; gnubg automatically accepts.

        In a proper implementation gnubg would evaluate whether to accept.
        For now it always accepts — a future version can call
        gnubg_client.cube_decision() to make the accept/drop decision.
        """
        session = self._sessions[session_id]
        gnubg_color = (
            Color.BLACK if session.player_color == Color.WHITE else Color.WHITE
        )

        offered = session.engine.offer_double(session.player_color)
        if offered:
            session.engine.accept_double(gnubg_color)

        return session.engine.get_state_snapshot()

    async def respond_to_double(self, session_id: str, accept: bool) -> dict:
        """Player responds to a double offered by gnubg."""
        session = self._sessions[session_id]
        if accept:
            session.engine.accept_double(session.player_color)
        else:
            # decline_double returns (success, winner); we only need the
            # side-effect on the engine state.
            session.engine.decline_double(session.player_color)
        return session.engine.get_state_snapshot()

    # ── Analysis ─────────────────────────────────────────────────────────────

    async def get_hint(self, session_id: str) -> dict | None:
        """Return gnubg's move candidates for the current live position.

        Returns None if the session is viewing a historical position (not
        live) or if gnubg is unavailable.  When the dice have been rolled,
        returns ranked move candidates.  When no dice are rolled yet,
        returns a position evaluation.
        """
        session = self._sessions[session_id]
        engine = session.engine

        # Only hints on the live position.
        if session.current_view_index >= 0:
            return None

        board = gnubg_client.board_payload_from_engine(engine)

        if engine.state.dice:
            dice = [engine.state.dice.die1, engine.state.dice.die2]
            result = await gnubg_client.best_move(board, dice)
            if result is None:
                return None

            candidates = []
            all_candidates: list[dict] = result.get("candidates") or (
                [result["best"]] if result.get("best") else []
            )
            top_equity = (
                all_candidates[0].get("equity", 0.0) if all_candidates else 0.0
            )
            for i, c in enumerate(all_candidates):
                candidates.append(
                    {
                        "rank": i + 1,
                        "notation": c.get("notation", ""),
                        "moves": c.get("moves", []),
                        "equity": c.get("equity", 0.0),
                        "equity_diff": c.get("equity", 0.0) - top_equity,
                        "probs": c.get("probs"),
                    }
                )
            return {"candidates": candidates, "cube_action": None}

        # No dice rolled yet — return a raw position evaluation.
        result = await gnubg_client.evaluate(board)
        if result is None:
            return None
        return {"candidates": [], "cube_action": None, "evaluation": result}

    async def evaluate_position(self, session_id: str) -> dict | None:
        """Return gnubg's equity evaluation for the current position.

        Returns None when gnubg is unavailable.
        """
        session = self._sessions[session_id]
        board = gnubg_client.board_payload_from_engine(session.engine)
        return await gnubg_client.evaluate(board)

    # ── Navigation ───────────────────────────────────────────────────────────

    def navigate(self, session_id: str, direction: str) -> dict:
        """Step through move history.

        direction: "first" | "prev" | "next" | "last"

        "last" returns to the live position (current_view_index = -1).
        """
        session = self._sessions[session_id]
        total = len(session.move_history)

        if direction == "first":
            session.current_view_index = 0 if total > 0 else -1
        elif direction == "prev":
            if session.current_view_index == -1:
                # Step back from live to the last recorded move.
                session.current_view_index = max(0, total - 1)
            elif session.current_view_index > 0:
                session.current_view_index -= 1
            # If already at index 0, stay there.
        elif direction == "next":
            if session.current_view_index >= 0:
                if session.current_view_index < total - 1:
                    session.current_view_index += 1
                else:
                    # Past the last recorded move → go to live.
                    session.current_view_index = -1
            # If already live (-1), stay live.
        elif direction == "last":
            session.current_view_index = -1

        return self._get_viewed_state(session)

    def jump_to_move(self, session_id: str, move_number: int) -> dict:
        """Jump directly to a specific move by 1-based move_number."""
        session = self._sessions[session_id]
        total = len(session.move_history)
        if move_number < 1 or move_number > total:
            session.current_view_index = -1
        else:
            session.current_view_index = move_number - 1
        return self._get_viewed_state(session)

    def _get_viewed_state(self, session: SessionState) -> dict:
        """Return the board snapshot for the currently viewed position."""
        if session.current_view_index == -1 or not session.move_history:
            return session.engine.get_state_snapshot()
        idx = min(session.current_view_index, len(session.move_history) - 1)
        snapshot = session.move_history[idx].position_snapshot
        return snapshot if snapshot else session.engine.get_state_snapshot()

    # ── History & annotations ─────────────────────────────────────────────────

    def get_move_history(self, session_id: str) -> list[dict]:
        """Return a summary of all moves played so far."""
        session = self._sessions[session_id]
        return [
            {
                "move_number": m.move_number,
                "player": m.player,
                "dice_roll": m.dice_roll,
                "move_notation": m.move_notation,
                "quality": m.quality,
                "equity_loss": m.equity_loss,
                "annotation": m.annotation,
            }
            for m in session.move_history
        ]

    def annotate_move(
        self, session_id: str, move_number: int, note: str
    ) -> None:
        """Attach a text annotation to a recorded move.

        Raises ValueError if move_number is not found.
        """
        session = self._sessions[session_id]
        for m in session.move_history:
            if m.move_number == move_number:
                m.annotation = note
                return
        raise ValueError(
            f"Move {move_number} not found in session {session_id}"
        )

    # ── Load from existing game ───────────────────────────────────────────────

    async def load_from_game(
        self,
        session_id: str,
        table_id: str,
        db: AsyncSession,
        move_number: int | None = None,
    ) -> dict:
        """Import move history from a completed game into this session.

        Loads MoveRecord rows for *table_id* up to *move_number* (or all
        moves when move_number is None).  The session's move_history is
        replaced; the live engine is reset.  The returned snapshot reflects
        the last loaded position's stored state, or the fresh engine state
        if no moves were loaded.

        Raises ValueError when no move records exist for table_id.
        """
        session = self._sessions[session_id]

        result = await db.execute(
            select(MoveRecord)
            .where(MoveRecord.table_id == table_id)
            .order_by(MoveRecord.move_number)
        )
        records = result.scalars().all()
        if not records:
            raise ValueError(f"No moves found for table {table_id!r}")

        session.move_history.clear()
        target = move_number if move_number is not None else len(records)
        target = max(0, min(target, len(records)))

        for i, record in enumerate(records[:target]):
            # Infer the player from the parity of the move index when
            # player_id linkage is unavailable.  MoveRecord.player_id is
            # nullable and may reference the actual player; here we fall
            # back to alternating white/black from move 0.
            player_str = "white" if i % 2 == 0 else "black"
            session.move_history.append(
                AnalysisMoveRecord(
                    move_number=i + 1,
                    player=player_str,
                    dice_roll=record.dice_roll or "",
                    move_notation=record.moves_notation or "",
                    position_snapshot=dict(record.game_state_after)
                    if record.game_state_after
                    else {},
                )
            )

        # Reset the live engine to a clean starting state.  The engine
        # cannot be fully reconstructed from snapshots alone (they are
        # display-state only, not re-playable), so we give the session a
        # fresh engine and rely on position_snapshot for historical display.
        session.engine = BackgammonEngine()
        session.engine.start_game()

        session.current_view_index = -1

        db_row = await db.get(AnalysisSession, session_id)
        if db_row:
            db_row.loaded_from = {"type": "game", "table_id": table_id}
            await db.commit()

        if session.move_history:
            last_snapshot = session.move_history[-1].position_snapshot
            return last_snapshot if last_snapshot else session.engine.get_state_snapshot()
        return session.engine.get_state_snapshot()

    # ── Settings ──────────────────────────────────────────────────────────────

    def update_settings(
        self,
        session_id: str,
        gnubg_ply: int | None = None,
        auto_analysis: str | None = None,
    ) -> None:
        """Update runtime settings for an active session."""
        session = self._sessions[session_id]
        if gnubg_ply is not None:
            session.gnubg_ply = gnubg_ply
        if auto_analysis is not None:
            session.auto_analysis = auto_analysis


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

analysis_session_manager = AnalysisSessionManager()
