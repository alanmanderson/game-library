"""
Backgammon Opening Book
========================

Provides pre-computed optimal opening moves for the first move of a
backgammon game (and doubles responses for the second move).  These are
consensus best plays drawn from XG Backgammon and GNU Backgammon rollout
analysis.

The data is stored from White's perspective and automatically mirrored
for Black.  A lookup is a simple dict access -- no computation required.

Usage::

    from ml.opening_book import get_opening_moves, is_opening_position

    if is_opening_position(engine):
        moves = get_opening_moves(dice_values, engine.state.current_turn)
        if moves is not None:
            for move in moves:
                engine.make_move(move)
"""

import sys
import os

# Add backend to path so we can import the game engine classes.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.game_engine import BackgammonEngine, Color, Move


# ---------------------------------------------------------------------------
# Opening book data -- White's perspective
# ---------------------------------------------------------------------------
# White moves from high to low (24 -> 1).  Bar = 25, off = 0.
#
# Keys are canonical dice tuples with the higher die first: (high, low).
# Values are lists of Move objects representing the optimal play.
# ---------------------------------------------------------------------------

_WHITE_OPENING_MOVES: dict[tuple[int, int], list[Move]] = {
    # --- Non-double opening rolls (15 combinations) ---

    # 6-5: 24/13  (run a back checker)
    (6, 5): [
        Move(from_point=24, to_point=18),
        Move(from_point=18, to_point=13),
    ],

    # 6-4: 24/14  (run a back checker)
    (6, 4): [
        Move(from_point=24, to_point=18),
        Move(from_point=18, to_point=14),
    ],

    # 6-3: 24/15  (run a back checker)
    (6, 3): [
        Move(from_point=24, to_point=18),
        Move(from_point=18, to_point=15),
    ],

    # 6-2: 24/18, 13/11  (split and slot)
    (6, 2): [
        Move(from_point=24, to_point=18),
        Move(from_point=13, to_point=11),
    ],

    # 6-1: 13/7, 8/7  (make the bar point)
    (6, 1): [
        Move(from_point=13, to_point=7),
        Move(from_point=8, to_point=7),
    ],

    # 5-4: 13/8, 24/20  (builder and split)
    (5, 4): [
        Move(from_point=13, to_point=8),
        Move(from_point=24, to_point=20),
    ],

    # 5-3: 8/3, 6/3  (make the 3-point)
    (5, 3): [
        Move(from_point=8, to_point=3),
        Move(from_point=6, to_point=3),
    ],

    # 5-2: 13/8, 24/22  (builder and split)
    (5, 2): [
        Move(from_point=13, to_point=8),
        Move(from_point=24, to_point=22),
    ],

    # 5-1: 13/8, 24/23  (builder and split)
    (5, 1): [
        Move(from_point=13, to_point=8),
        Move(from_point=24, to_point=23),
    ],

    # 4-3: 13/9, 24/21  (builder and split)
    (4, 3): [
        Move(from_point=13, to_point=9),
        Move(from_point=24, to_point=21),
    ],

    # 4-2: 8/4, 6/4  (make the 4-point)
    (4, 2): [
        Move(from_point=8, to_point=4),
        Move(from_point=6, to_point=4),
    ],

    # 4-1: 13/9, 24/23  (builder and split)
    (4, 1): [
        Move(from_point=13, to_point=9),
        Move(from_point=24, to_point=23),
    ],

    # 3-2: 13/10, 24/22  (builder and split)
    (3, 2): [
        Move(from_point=13, to_point=10),
        Move(from_point=24, to_point=22),
    ],

    # 3-1: 8/5, 6/5  (make the 5-point -- best opening roll!)
    (3, 1): [
        Move(from_point=8, to_point=5),
        Move(from_point=6, to_point=5),
    ],

    # 2-1: 13/11, 6/5  (slot the 5-point)
    (2, 1): [
        Move(from_point=13, to_point=11),
        Move(from_point=6, to_point=5),
    ],
}

# --- Doubles for the second move (6 combinations) ---
# These are strong plays when doubles come up early in the game.

_WHITE_DOUBLES_MOVES: dict[tuple[int, int], list[Move]] = {
    # 6-6: 24/18(2), 13/7(2)  (make bar-point and 18-point)
    (6, 6): [
        Move(from_point=24, to_point=18),
        Move(from_point=24, to_point=18),
        Move(from_point=13, to_point=7),
        Move(from_point=13, to_point=7),
    ],

    # 5-5: 13/3(2)  (two checkers from mid to 3-point)
    (5, 5): [
        Move(from_point=13, to_point=8),
        Move(from_point=8, to_point=3),
        Move(from_point=13, to_point=8),
        Move(from_point=8, to_point=3),
    ],

    # 4-4: 24/20(2), 13/9(2)  (advance back checkers and builders)
    (4, 4): [
        Move(from_point=24, to_point=20),
        Move(from_point=24, to_point=20),
        Move(from_point=13, to_point=9),
        Move(from_point=13, to_point=9),
    ],

    # 3-3: 8/5(2), 6/3(2)  (make 5-point and 3-point)
    (3, 3): [
        Move(from_point=8, to_point=5),
        Move(from_point=8, to_point=5),
        Move(from_point=6, to_point=3),
        Move(from_point=6, to_point=3),
    ],

    # 2-2: 13/11(2), 6/4(2)  (make 11-point and 4-point)
    (2, 2): [
        Move(from_point=13, to_point=11),
        Move(from_point=13, to_point=11),
        Move(from_point=6, to_point=4),
        Move(from_point=6, to_point=4),
    ],

    # 1-1: 8/7(2), 6/5(2)  (make 7-point and 5-point)
    (1, 1): [
        Move(from_point=8, to_point=7),
        Move(from_point=8, to_point=7),
        Move(from_point=6, to_point=5),
        Move(from_point=6, to_point=5),
    ],
}

# The starting board position (points 1-24 only, as a tuple for fast comparison).
_STARTING_POINTS = tuple(
    [0]  # index 0 (unused padding)
    + [-2] + [0] * 4 + [5] + [0] + [3] + [0] * 3  # points 1-11
    + [-5] + [5] + [0] * 3 + [-3] + [0] + [-5]     # points 12-19
    + [0] * 4 + [2]                                   # points 20-24
    + [0]  # index 25 (unused padding)
)


def _mirror_move(move: Move) -> Move:
    """Mirror a move from White's perspective to Black's perspective.

    White's point X becomes Black's point (25 - X).
    Special cases:
        White bar  (25) -> Black bar  (0)
        White off  (0)  -> Black off  (25)
    """
    from_pt = 25 - move.from_point
    to_pt = 25 - move.to_point
    return Move(from_point=from_pt, to_point=to_pt, is_hit=move.is_hit)


def _canonical_dice(dice_values: tuple[int, int]) -> tuple[int, int]:
    """Return dice as (high, low) for consistent dictionary lookup."""
    a, b = dice_values
    if a >= b:
        return (a, b)
    return (b, a)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_opening_moves(
    dice_values: tuple[int, int],
    color: Color,
) -> list[Move] | None:
    """Look up the optimal opening moves for the given dice roll and color.

    Parameters
    ----------
    dice_values:
        A tuple of two die values, e.g. ``(6, 1)`` or ``(3, 3)``.
    color:
        The color of the player to move (``Color.WHITE`` or ``Color.BLACK``).

    Returns
    -------
    list[Move] | None
        The list of moves to execute in order, or ``None`` if the roll is
        not in the opening book.
    """
    key = _canonical_dice(dice_values)

    # Look up in non-doubles first, then doubles
    white_moves = _WHITE_OPENING_MOVES.get(key) or _WHITE_DOUBLES_MOVES.get(key)

    if white_moves is None:
        return None

    if color == Color.WHITE:
        # Return copies so callers cannot mutate the book data.
        return [Move(from_point=m.from_point, to_point=m.to_point, is_hit=m.is_hit)
                for m in white_moves]
    else:
        return [_mirror_move(m) for m in white_moves]


def is_opening_position(engine: BackgammonEngine) -> bool:
    """Return True if the board is in (or very close to) the opening position.

    This checks two conditions:
    1. At most 2 turns have been completed (first move or response).
    2. The board points, bar, and borne-off counts match the starting
       position exactly.  This ensures no checkers have been hit or moved
       in a way that deviates from what the book expects.

    Parameters
    ----------
    engine:
        A ``BackgammonEngine`` instance to inspect.

    Returns
    -------
    bool
        ``True`` if the position qualifies for an opening-book lookup.
    """
    state = engine.state

    # Only use the book for the first two turns of the game.
    if len(state.moves_history) > 1:
        return False

    # Verify no checkers are on the bar or borne off.
    if state.bar_white != 0 or state.bar_black != 0:
        return False
    if state.off_white != 0 or state.off_black != 0:
        return False

    # Verify all 24 points match the starting position exactly.
    current_points = tuple(state.points)
    if current_points != _STARTING_POINTS:
        return False

    return True
