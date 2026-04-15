"""Game analysis service.

Produces per-move quality analysis for completed games by comparing the
move the player actually made against the ML model's best move.  Results
are cached in the ``game_analyses`` table so subsequent requests are fast.

The heavy lifting happens in :func:`compute_analysis`, which is CPU-bound
(many neural-network forward passes).  Callers typically offload it with
``asyncio.to_thread`` — the endpoint in ``routes.py`` does this.

If the ML model is unavailable, analysis falls back to a simple pip-count
evaluator so the UI still has something to show; the response flags
``ml_available = False`` in that case.

This module intentionally imports ``bot_service`` helpers rather than
duplicating model-loading logic.
"""

from __future__ import annotations

import logging
import os
import re
import sys
from typing import Any, Optional

from app.game_engine import (
    BackgammonEngine,
    Color,
    DiceRoll,
    GameStatus,
    Move,
)

logger = logging.getLogger(__name__)


# Equity-loss thresholds for move quality classification.  Losses are
# always non-negative (the player either matched the best equity or lost
# something by choosing a worse turn).
QUALITY_THRESHOLDS: list[tuple[float, str]] = [
    (0.0000001, "best"),
    (0.02, "good"),
    (0.06, "inaccuracy"),
    (0.12, "mistake"),
    # anything above the last threshold is a blunder
]

# Maximum number of moves to analyse per game.  Analysis is O(N) in moves
# and each move does O(turns) ML evaluations (~30–200 per move), so a
# 100-move game can produce thousands of forward passes.  Cap at 100 by
# default; the endpoint exposes an override via query param.
DEFAULT_MOVE_LIMIT = 100


def classify_quality(equity_loss: float) -> str:
    """Classify the move quality given the equity loss in equity units.

    equity_loss is best_equity - equity_after, clamped to >= 0.
    """
    if equity_loss < 0:
        equity_loss = 0.0
    for threshold, label in QUALITY_THRESHOLDS:
        if equity_loss <= threshold:
            return label
    return "blunder"


def _restore_engine_to(
    engine: BackgammonEngine,
    state_dict: dict,
    current_turn: Color,
    dice: DiceRoll,
) -> None:
    """Reset *engine* to the given board state with dice set for MOVING."""
    s = engine.state
    s.points = list(state_dict.get("points") or [0] * 26)
    s.bar_white = int(state_dict.get("bar_white") or 0)
    s.bar_black = int(state_dict.get("bar_black") or 0)
    s.off_white = int(state_dict.get("off_white") or 0)
    s.off_black = int(state_dict.get("off_black") or 0)
    s.current_turn = current_turn
    s.dice = dice
    s.remaining_dice = list(dice.values)
    s.status = GameStatus.MOVING
    s.turn_moves = []
    engine._cached_valid_moves = None


# Notation parser: "13/7*", "bar/22", "6/off", "13/7(2)" → (from, to) pairs.
_NOTATION_STEP = re.compile(
    r"(bar|off|\d+)\s*/\s*(bar|off|\d+)(?:\*+)?(?:\((\d+)\))?",
    re.IGNORECASE,
)


def _parse_notation_to_steps(notation: str, color: Color) -> list[dict]:
    """Convert a moves_notation string into a list of {from_point, to_point} dicts.

    Uses the backend's indexing convention (bar_white=25, bar_black=0,
    off_white=0, off_black=25).
    """
    bar = 25 if color == Color.WHITE else 0
    off = 0 if color == Color.WHITE else 25
    steps: list[dict] = []
    for m in _NOTATION_STEP.finditer(notation or ""):

        def _resolve(tok: str, is_from: bool) -> int:
            t = tok.lower()
            if t == "bar":
                return bar
            if t == "off":
                return off
            return int(t)

        src = _resolve(m.group(1), True)
        dst = _resolve(m.group(2), False)
        repeat = int(m.group(3)) if m.group(3) else 1
        for _ in range(repeat):
            steps.append({"from_point": src, "to_point": dst})
    return steps


def _make_evaluator() -> tuple[Optional[Any], bool]:
    """Return (evaluator, ml_available).

    The evaluator is a callable ``fn(engine, color) -> float`` giving the
    equity for *color* at the engine's current position.  Falls back to a
    simple pip-count heuristic if the ML model cannot be loaded.
    """
    # Try ML model — same loader as bot_service.
    try:
        from app.services.bot_service import _load_ml_bot, _find_ml_dir

        bot = _load_ml_bot()
        if bot is not None:
            ml_dir = _find_ml_dir()
            if ml_dir and ml_dir not in sys.path:
                sys.path.insert(0, ml_dir)
            import torch
            from encoder import encode_state  # type: ignore
            from model import compute_equity  # type: ignore

            def _ml_eval(eng: BackgammonEngine, color: Color) -> float:
                with torch.no_grad():
                    features = encode_state(eng, color)
                    ft = torch.from_numpy(features).to(bot.device)
                    outputs = bot.model(ft)
                    return float(compute_equity(outputs).item())

            return _ml_eval, True
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Analysis: ML evaluator unavailable (%s)", exc)

    # Heuristic fallback — pip count differential normalised to roughly [-1, 1].
    def _pip_eval(eng: BackgammonEngine, color: Color) -> float:
        is_white = color == Color.WHITE
        s = eng.state
        own = opp = 0
        for i in range(1, 25):
            v = s.points[i]
            if is_white:
                if v > 0:
                    own += v * i
                elif v < 0:
                    opp += (-v) * (25 - i)
            else:
                if v < 0:
                    own += (-v) * (25 - i)
                elif v > 0:
                    opp += v * i
        own += (s.bar_white if is_white else s.bar_black) * 25
        opp += (s.bar_black if is_white else s.bar_white) * 25
        own_off = s.off_white if is_white else s.off_black
        opp_off = s.off_black if is_white else s.off_white
        # Bigger lead = higher equity; divide by ~167 (typical starting pip) and clamp.
        diff = (opp - own) + (own_off - opp_off) * 3
        return max(-1.0, min(1.0, diff / 167.0))

    return _pip_eval, False


def _color_from_record(
    record_player_id: Optional[str],
    white_player_id: Optional[str],
    black_player_id: Optional[str],
) -> Optional[Color]:
    """Derive the moving player's Color from a MoveRecord.player_id."""
    if record_player_id is None:
        return None
    if record_player_id == white_player_id:
        return Color.WHITE
    if record_player_id == black_player_id:
        return Color.BLACK
    return None


def _parse_dice(dice_roll: str) -> Optional[DiceRoll]:
    """Parse a dice_roll string like ``"3-5"`` into a DiceRoll."""
    try:
        parts = dice_roll.split("-")
        if len(parts) != 2:
            return None
        d1, d2 = int(parts[0]), int(parts[1])
        if not (1 <= d1 <= 6 and 1 <= d2 <= 6):
            return None
        return DiceRoll(d1, d2)
    except (ValueError, AttributeError):
        return None


def _turn_notation(color: Color, turn: list[Move]) -> str:
    """Format a complete turn (list of Moves) as standard notation."""
    if not turn:
        return "(no moves)"
    return " ".join(m.to_notation(color) for m in turn)


def compute_analysis(
    initial_state: dict,
    move_records: list[dict],
    white_player_id: Optional[str],
    black_player_id: Optional[str],
    player_nicknames: Optional[dict[str, str]] = None,
    move_limit: int = DEFAULT_MOVE_LIMIT,
) -> tuple[list[dict], bool, int]:
    """Compute per-move analysis for a completed game.

    Args:
        initial_state: GameEngine.get_state_snapshot() at game start.
        move_records: List of dicts each with keys ``player_id``,
            ``dice_roll``, ``moves_notation``, ``move_number``,
            ``game_state_after``.  Ordered by move_number ascending.
        white_player_id: id of the white player (to resolve color).
        black_player_id: id of the black player.
        player_nicknames: optional {player_id: nickname} map.
        move_limit: truncate analysis after this many moves.

    Returns:
        ``(analyses, ml_available, moves_analysed)``.
    """
    player_nicknames = player_nicknames or {}

    # Prefer gnubg when configured and reachable.  Falls through to the
    # existing ML/pip-count path on any failure so analysis stays best-
    # effort rather than all-or-nothing.
    try:
        from app.services import gnubg_client

        if gnubg_client.is_available_sync():
            return _compute_analysis_gnubg(
                initial_state,
                move_records,
                white_player_id,
                black_player_id,
                player_nicknames,
                move_limit,
            )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("gnubg analysis path failed, falling back: %s", exc)

    evaluator, ml_available = _make_evaluator()

    engine = BackgammonEngine()
    analyses: list[dict] = []

    # Track the board state as the game progressed.  At the start of move
    # N we use move N-1's game_state_after (or initial_state for N=1).
    prev_state = initial_state

    limit = min(len(move_records), max(0, move_limit))

    for record in move_records[:limit]:
        color = _color_from_record(
            record.get("player_id"), white_player_id, black_player_id
        )
        dice = _parse_dice(record.get("dice_roll") or "")

        game_state_after = record.get("game_state_after") or prev_state

        if color is None or dice is None:
            # Missing metadata — skip this record but advance the state.
            prev_state = game_state_after
            continue

        # --- equity BEFORE the move ---
        _restore_engine_to(engine, prev_state, color, dice)
        try:
            equity_before = evaluator(engine, color)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("equity_before eval failed: %s", exc)
            equity_before = 0.0

        # --- enumerate turns and find the best ---
        best_equity = float("-inf")
        best_turn: list[Move] = []
        try:
            _restore_engine_to(engine, prev_state, color, dice)
            turns = engine.enumerate_complete_turns()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("enumerate_complete_turns failed: %s", exc)
            turns = []

        if turns:
            for turn in turns:
                saved = engine._snapshot_internals()
                try:
                    for m in turn:
                        engine._apply_move_internal(color, m)
                    eq = evaluator(engine, color)
                except Exception:
                    engine._restore_internals(saved)
                    continue
                engine._restore_internals(saved)
                if eq > best_equity:
                    best_equity = eq
                    best_turn = turn
        else:
            best_equity = equity_before
            best_turn = []

        # --- equity AFTER the actual move (from the post-move snapshot) ---
        try:
            # The game_state_after was recorded at end of turn; use a neutral
            # ROLLING status with no dice so the encoder isn't confused.
            engine.state.points = list(
                game_state_after.get("points") or [0] * 26
            )
            engine.state.bar_white = int(game_state_after.get("bar_white") or 0)
            engine.state.bar_black = int(game_state_after.get("bar_black") or 0)
            engine.state.off_white = int(game_state_after.get("off_white") or 0)
            engine.state.off_black = int(game_state_after.get("off_black") or 0)
            engine.state.remaining_dice = []
            engine.state.dice = None
            engine.state.status = GameStatus.ROLLING
            equity_after = evaluator(engine, color)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("equity_after eval failed: %s", exc)
            equity_after = equity_before

        equity_loss = max(0.0, best_equity - equity_after)

        best_notation = _turn_notation(color, best_turn) if best_turn else None

        analyses.append(
            {
                "move_number": int(record.get("move_number") or 0),
                "player_color": color.value,
                "player_nickname": player_nicknames.get(record.get("player_id") or ""),
                "dice_roll": record.get("dice_roll") or "",
                "moves_notation": record.get("moves_notation") or "",
                "equity_before": round(equity_before, 4),
                "equity_after": round(equity_after, 4),
                "best_equity": round(best_equity, 4),
                "equity_loss": round(equity_loss, 4),
                "quality": classify_quality(equity_loss),
                "best_move_notation": best_notation,
                "source": "ml" if ml_available else "heuristic",
            }
        )

        prev_state = game_state_after

    return analyses, ml_available, len(analyses)


# gnubg equity_loss → main-backend quality label. The gnubg service has
# finer-grained buckets (very_good / good / doubtful / bad / very_bad /
# blunder); we project them onto the existing labels that the frontend
# already renders. Extra detail is preserved verbatim in the probs fields.
_GNUBG_QUALITY_MAP = {
    "very_good": "best",
    "good": "good",
    "doubtful": "inaccuracy",
    "bad": "mistake",
    "very_bad": "mistake",
    "blunder": "blunder",
}


def _compute_analysis_gnubg(
    initial_state: dict,
    move_records: list[dict],
    white_player_id: Optional[str],
    black_player_id: Optional[str],
    player_nicknames: dict[str, str],
    move_limit: int,
) -> tuple[list[dict], bool, int]:
    """gnubg-backed analysis — one POST per move.

    gnubg does the best-move enumeration and the chosen-move evaluation
    internally; we just feed it the pre-move board + dice + chosen
    notation and record the response. Falls back per-move to the ML
    path by raising; the outer ``compute_analysis`` handles that.
    """
    from app.services import gnubg_client

    analyses: list[dict] = []
    prev_state = initial_state
    limit = min(len(move_records), max(0, move_limit))

    failures = 0
    for record in move_records[:limit]:
        color = _color_from_record(
            record.get("player_id"), white_player_id, black_player_id
        )
        dice = _parse_dice(record.get("dice_roll") or "")
        game_state_after = record.get("game_state_after") or prev_state

        if color is None or dice is None:
            prev_state = game_state_after
            continue

        chosen_moves = _parse_notation_to_steps(
            record.get("moves_notation") or "", color
        )

        # Build the gnubg request body.
        board_payload = {
            "points": list(prev_state.get("points") or [0] * 26),
            "bar_white": int(prev_state.get("bar_white") or 0),
            "bar_black": int(prev_state.get("bar_black") or 0),
            "off_white": int(prev_state.get("off_white") or 0),
            "off_black": int(prev_state.get("off_black") or 0),
            "turn": color.value,
            "cube_value": int(prev_state.get("cube_value") or 1),
            "cube_owner": prev_state.get("cube_owner"),
            "match_score": None,
        }

        try:
            resp = gnubg_client.analyze_move_sync(
                board_payload,
                [dice.die1, dice.die2],
                chosen_moves,
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("gnubg analyze_move failed: %s", exc)
            resp = None

        if resp is None:
            failures += 1
            prev_state = game_state_after
            # If gnubg fails for more than a handful of moves in a row, give
            # up and let the caller run the ML path for the whole game.
            if failures >= 3:
                raise RuntimeError("gnubg analysis unavailable")
            continue

        best = resp.get("best") or {}
        chosen = resp.get("chosen") or {}
        best_probs = best.get("probs") or None
        chosen_probs = chosen.get("probs") or None
        best_equity = float(best.get("equity") or 0.0)
        chosen_equity = float(chosen.get("equity") or 0.0)
        equity_loss = max(0.0, float(resp.get("equity_loss") or 0.0))
        gnubg_quality = str(resp.get("quality") or "good")
        quality = _GNUBG_QUALITY_MAP.get(gnubg_quality, "good")

        analyses.append(
            {
                "move_number": int(record.get("move_number") or 0),
                "player_color": color.value,
                "player_nickname": player_nicknames.get(record.get("player_id") or ""),
                "dice_roll": record.get("dice_roll") or "",
                "moves_notation": record.get("moves_notation") or "",
                # equity_before is what the player had before moving — we
                # don't have a direct gnubg number for this, but the
                # best-move equity is the upper bound, so use it. The
                # frontend uses the delta (best - after) for severity.
                "equity_before": round(best_equity, 4),
                "equity_after": round(chosen_equity, 4),
                "best_equity": round(best_equity, 4),
                "equity_loss": round(equity_loss, 4),
                "quality": quality,
                "best_move_notation": best.get("notation"),
                "best_probs": best_probs,
                "chosen_probs": chosen_probs,
                "best_win_prob": (
                    float(best_probs["win"]) if best_probs and "win" in best_probs else None
                ),
                "chosen_win_prob": (
                    float(chosen_probs["win"])
                    if chosen_probs and "win" in chosen_probs
                    else None
                ),
                "source": "gnubg",
            }
        )
        prev_state = game_state_after

    # gnubg-backed analysis counts as "ml_available" from the UI's
    # perspective — it's not the heuristic fallback.
    return analyses, True, len(analyses)
