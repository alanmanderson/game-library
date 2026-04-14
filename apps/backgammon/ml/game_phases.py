"""
Game Phase Classifier and Race Position Evaluator
===================================================
Heuristic classification of backgammon positions into game phases
(opening, contact, race, bearoff) and a pip-count/wastage-based
evaluator for race positions where neural-net evaluation is less
accurate than simple arithmetic.

Usage:
    from game_phases import classify_game_phase, evaluate_race_position, GamePhase
    phase = classify_game_phase(engine)
    if phase in (GamePhase.RACE, GamePhase.BEAROFF):
        equity = evaluate_race_position(engine, Color.WHITE)
"""

from __future__ import annotations

import os
import sys
from enum import Enum

# Add backend to path so we can import the game engine
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from app.game_engine import BackgammonEngine, Color


class GamePhase(Enum):
    """Phases of a backgammon game, from opening to bearoff."""
    OPENING = "opening"    # First few moves of the game
    CONTACT = "contact"    # Checkers still interleaved, tactical play
    RACE = "race"          # No contact, pure race to bear off
    BEAROFF = "bearoff"    # All checkers in home board, bearing off


def _is_white(color) -> bool:
    """Return True if *color* represents the White player.

    Compares by value rather than identity so that Color enums imported
    via different module paths (``app.game_engine`` vs
    ``backend.app.game_engine``) still match correctly.
    """
    return color.value == Color.WHITE.value


def _has_contact(engine: BackgammonEngine) -> bool:
    """Return True if the position still has contact between the two sides.

    Contact exists when either side has checkers on the bar, or when
    White's rearmost checker (highest occupied point) has not yet passed
    Black's rearmost checker (lowest occupied point).

    No contact means white_rearmost < black_rearmost -- the two armies
    have completely passed each other on the board.
    """
    state = engine.state

    # Checkers on the bar always mean contact
    if state.bar_white > 0 or state.bar_black > 0:
        return True

    # Find White's rearmost checker (highest point number with white checkers)
    white_rearmost = 0
    for i in range(24, 0, -1):
        if state.points[i] > 0:
            white_rearmost = i
            break

    # Find Black's rearmost checker (lowest point number with black checkers)
    black_rearmost = 25
    for i in range(1, 25):
        if state.points[i] < 0:
            black_rearmost = i
            break

    # No white checkers on board or no black checkers on board -> no contact
    if white_rearmost == 0 or black_rearmost == 25:
        return False

    # Contact exists when White's rearmost has NOT passed Black's rearmost
    return white_rearmost >= black_rearmost


def _can_bear_off(engine: BackgammonEngine, color) -> bool:
    """Return True if all of *color*'s checkers are in their home board or already off.

    White's home board = points 1-6.  Black's home board = points 19-24.
    """
    state = engine.state

    if _is_white(color):
        if state.bar_white > 0:
            return False
        # Any white checker outside points 1-6?
        for i in range(7, 25):
            if state.points[i] > 0:
                return False
        return True
    else:
        if state.bar_black > 0:
            return False
        # Any black checker outside points 19-24?
        for i in range(1, 19):
            if state.points[i] < 0:
                return False
        return True


def classify_game_phase(engine: BackgammonEngine) -> GamePhase:
    """Classify the current position into a game phase.

    The classification is hierarchical:
      1. BEAROFF -- current player can bear off AND no contact
      2. RACE   -- no contact at all (checkers have passed each other)
      3. OPENING -- very early game (<=4 moves, no bar, no borne off)
      4. CONTACT -- everything else (the default)

    Args:
        engine: A BackgammonEngine instance with the current game state.

    Returns:
        A GamePhase enum value.
    """
    state = engine.state
    contact = _has_contact(engine)

    # BEAROFF: current player can bear off and no contact
    if not contact and _can_bear_off(engine, state.current_turn):
        return GamePhase.BEAROFF

    # RACE: no contact at all
    if not contact:
        return GamePhase.RACE

    # OPENING: first few moves, no bar activity, nothing borne off
    if (len(state.moves_history) <= 4
            and state.bar_white == 0 and state.bar_black == 0
            and state.off_white == 0 and state.off_black == 0):
        return GamePhase.OPENING

    # Default: CONTACT
    return GamePhase.CONTACT


def compute_pip_count(engine: BackgammonEngine, color) -> int:
    """Return the raw pip count for *color*.

    The pip count is the total number of pips (point-values) a player
    must roll to bear off all their checkers. Lower is better.

    White pips: each checker on point *p* contributes *p* pips.
    Checkers on the bar contribute 25 pips each.

    Black pips: each checker on point *p* contributes (25 - p) pips.
    Checkers on the bar contribute 25 pips each.

    Borne-off checkers contribute 0 pips.

    Args:
        engine: A BackgammonEngine instance.
        color:  Which player to compute for.

    Returns:
        The pip count as a non-negative integer.
    """
    state = engine.state
    pips = 0

    if _is_white(color):
        for i in range(1, 25):
            if state.points[i] > 0:
                pips += i * state.points[i]
        pips += state.bar_white * 25
    else:
        for i in range(1, 25):
            if state.points[i] < 0:
                pips += (25 - i) * (-state.points[i])
        pips += state.bar_black * 25

    return pips


def _compute_wastage(engine: BackgammonEngine, color) -> float:
    """Compute the wastage adjustment for *color*'s pip count.

    Wastage accounts for the inefficiency of a position beyond the raw
    pip count.  It includes penalties for gaps in the home board, checkers
    outside the home board (crossovers), stacking, and a bonus for
    checkers on low points that bear off efficiently.

    Args:
        engine: A BackgammonEngine instance.
        color:  Which player to compute wastage for.

    Returns:
        The wastage value (can be negative due to low-point bonus).
    """
    state = engine.state
    wastage = 0.0

    if _is_white(color):
        # White's home board: points 1-6
        home_start, home_end = 1, 6

        # 1. Gaps penalty: empty home board points
        for i in range(home_start, home_end + 1):
            if state.points[i] <= 0:  # no white checkers
                wastage += 1.0

        # 2. Crossover penalty: checkers outside home board
        for i in range(home_end + 1, 25):
            if state.points[i] > 0:
                wastage += state.points[i] * 1.0
        wastage += state.bar_white * 1.0

        # 3. Stacking penalty: >3 checkers on a single point
        for i in range(1, 25):
            if state.points[i] > 3:
                wastage += (state.points[i] - 3) * 0.5

        # 4. Low point bonus: checkers on points 1-2
        for i in range(1, 3):
            if state.points[i] > 0:
                wastage -= state.points[i] * 0.5

    else:
        # Black's home board: points 19-24
        home_start, home_end = 19, 24

        # 1. Gaps penalty: empty home board points
        for i in range(home_start, home_end + 1):
            if state.points[i] >= 0:  # no black checkers
                wastage += 1.0

        # 2. Crossover penalty: checkers outside home board
        for i in range(1, home_start):
            if state.points[i] < 0:
                wastage += (-state.points[i]) * 1.0
        wastage += state.bar_black * 1.0

        # 3. Stacking penalty: >3 checkers on a single point
        for i in range(1, 25):
            if state.points[i] < -3:
                wastage += (-state.points[i] - 3) * 0.5

        # 4. Low point bonus: checkers on points 23-24 (Black's 1-2)
        for i in range(23, 25):
            if state.points[i] < 0:
                wastage -= (-state.points[i]) * 0.5

    return wastage


def evaluate_race_position(engine: BackgammonEngine, perspective) -> float:
    """Evaluate a race/bearoff position from *perspective*'s point of view.

    Uses Effective Pip Count (EPC = raw pips + wastage) to produce an
    equity estimate in roughly [-1, 1].  Positive means *perspective*
    is ahead; negative means behind.

    This is much more accurate than a neural net for pure race positions
    because the evaluation is almost entirely determined by pip count
    and distribution efficiency.

    Args:
        engine:      A BackgammonEngine instance (should be a race or
                     bearoff position for meaningful results).
        perspective: The player whose point of view to evaluate from.

    Returns:
        An equity estimate clamped to [-0.95, 0.95].
    """
    opponent = Color.BLACK if _is_white(perspective) else Color.WHITE

    own_pips = compute_pip_count(engine, perspective)
    opp_pips = compute_pip_count(engine, opponent)

    own_wastage = _compute_wastage(engine, perspective)
    opp_wastage = _compute_wastage(engine, opponent)

    own_epc = own_pips + own_wastage
    opp_epc = opp_pips + opp_wastage

    pip_diff = opp_epc - own_epc  # positive = we're ahead
    equity = pip_diff / (own_epc + opp_epc + 1)  # normalize roughly to [-1, 1]

    # Clamp to [-0.95, 0.95]
    return max(-0.95, min(0.95, equity))


def is_pure_race(engine: BackgammonEngine) -> bool:
    """Return True if the position has no contact.

    This is a convenience shorthand -- returns True when the game phase
    is either RACE or BEAROFF.

    Args:
        engine: A BackgammonEngine instance.

    Returns:
        True if the position is a pure race (no contact), False otherwise.
    """
    return classify_game_phase(engine) in (GamePhase.RACE, GamePhase.BEAROFF)
