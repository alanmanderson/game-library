"""
Backgammon Game Engine
======================

A pure Python implementation of the complete backgammon rules engine.
No external dependencies -- this module is entirely self-contained.

Board Layout
------------
Points are numbered 1-24.  Point 1 is the rightmost triangle in White's
home board; point 24 is the rightmost triangle in Black's home board.

    White moves from high points toward low points  (24 -> 1).
    Black moves from low points toward high points  (1 -> 24).

Internal representation
-----------------------
``GameState.points`` is a 26-element list (indices 0-25).
Indices 1-24 correspond to points on the board.
    Positive value  = number of White checkers on that point.
    Negative value  = number of Black checkers on that point.
Indices 0 and 25 are unused padding so that bar / off logic stays clean.

Bar and off counts are stored separately in dedicated fields.
    bar_white / bar_black  -- checkers on the bar
    off_white / off_black  -- checkers borne off

White re-enters from "point 25" (conceptual) into points 19-24 (Black's home).
Black re-enters from "point 0"  (conceptual) into points 1-6  (White's home).

White bears off to "point 0"  (conceptual).
Black bears off to "point 25" (conceptual).
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Color(Enum):
    WHITE = "white"
    BLACK = "black"


class GameStatus(Enum):
    WAITING = "waiting"        # waiting for a second player / game start
    ROLLING = "rolling"        # current player must roll
    MOVING = "moving"          # current player must move (or confirm no moves)
    FINISHED = "finished"


class WinType(Enum):
    NORMAL = 1
    GAMMON = 2
    BACKGAMMON = 3


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Move:
    """Represents a single checker movement.

    Attributes:
        from_point: The starting location of the checker.
            1-24 for a board point, 25 for white's bar, 0 for black's bar.
        to_point: The destination of the checker.
            1-24 for a board point, 0 for white bearing off, 25 for black bearing off.
        is_hit: True if an opponent checker was hit by this move.
    """
    from_point: int   # 0=bar(black), 25=bar(white), 1-24=board
    to_point: int     # 0=off(white), 25=off(black), 1-24=board
    is_hit: bool = False

    def to_notation(self, color: Color) -> str:
        """Convert to standard backgammon notation using internal point numbers.

        Point numbers use the engine's internal coordinate system (1-24) which
        matches White's perspective.  For export formats (e.g. MAT) that need
        each player's moves from their own perspective, the caller must mirror
        Black's point numbers (25 - point) separately.

        Examples:
            ``13/7``   -- regular move
            ``13/7*``  -- move with a hit
            ``bar/22`` -- bar entry
            ``6/off``  -- bearing off
        """
        # --- source label ---
        if (color == Color.WHITE and self.from_point == 25) or \
           (color == Color.BLACK and self.from_point == 0):
            src = "bar"
        else:
            src = str(self.from_point)

        # --- destination label ---
        if (color == Color.WHITE and self.to_point == 0) or \
           (color == Color.BLACK and self.to_point == 25):
            dst = "off"
        else:
            dst = str(self.to_point)

        notation = f"{src}/{dst}"
        if self.is_hit:
            notation += "*"
        return notation

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Move):
            return NotImplemented
        return (self.from_point == other.from_point and
                self.to_point == other.to_point and
                self.is_hit == other.is_hit)

    def __hash__(self) -> int:
        return hash((self.from_point, self.to_point, self.is_hit))


@dataclass
class DiceRoll:
    """A pair of dice values.

    Attributes:
        die1: Value of the first die (1-6).
        die2: Value of the second die (1-6).
    """
    die1: int
    die2: int

    @property
    def values(self) -> list[int]:
        """Return the list of usable die values.

        For doubles the player receives four moves of that value;
        otherwise two moves (one per die).
        """
        if self.die1 == self.die2:
            return [self.die1] * 4
        return [self.die1, self.die2]

    def __str__(self) -> str:
        return f"({self.die1}, {self.die2})"


@dataclass
class GameState:
    """Complete snapshot of a backgammon game.

    ``points`` uses 1-based indexing (indices 1-24).  Positive values
    represent White checkers; negative values represent Black checkers.
    Indices 0 and 25 are unused padding.
    """
    points: list[int] = field(default_factory=lambda: [0] * 26)
    bar_white: int = 0
    bar_black: int = 0
    off_white: int = 0
    off_black: int = 0
    current_turn: Color = Color.WHITE
    dice: Optional[DiceRoll] = None
    remaining_dice: list[int] = field(default_factory=list)
    status: GameStatus = GameStatus.WAITING
    winner: Optional[Color] = None
    win_type: Optional[WinType] = None
    moves_history: list[tuple[Color, DiceRoll, list[Move]]] = field(default_factory=list)
    turn_moves: list[Move] = field(default_factory=list)
    # Opening roll: each player's individual die (for display)
    opening_roll: Optional[dict] = None  # {"white": int, "black": int}
    # Doubling cube
    cube_value: int = 1
    cube_owner: Optional[Color] = None  # None = centered (either can double)
    double_offered: bool = False  # True when a double is pending acceptance
    double_offered_by: Optional[Color] = None
    # Crawford rule: no doubling allowed during the Crawford game
    is_crawford_game: bool = False


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _direction(color: Color) -> int:
    """Return the movement direction for *color*.

    White moves toward lower-numbered points (returns -1).
    Black moves toward higher-numbered points (returns +1).
    """
    return -1 if color == Color.WHITE else 1


def _bar_point(color: Color) -> int:
    """Return the conceptual bar point for *color*."""
    return 25 if color == Color.WHITE else 0


def _off_point(color: Color) -> int:
    """Return the conceptual bear-off point for *color*."""
    return 0 if color == Color.WHITE else 25


def _home_range(color: Color) -> range:
    """Return the inclusive range of home-board points for *color*."""
    if color == Color.WHITE:
        return range(1, 7)     # points 1-6
    return range(19, 25)       # points 19-24


def _opponent(color: Color) -> Color:
    return Color.BLACK if color == Color.WHITE else Color.WHITE


def _point_owner(value: int) -> Optional[Color]:
    """Determine which colour occupies a point (or ``None``)."""
    if value > 0:
        return Color.WHITE
    if value < 0:
        return Color.BLACK
    return None


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class BackgammonEngine:
    """Full backgammon rules engine.

    Typical usage::

        engine = BackgammonEngine()
        engine.start_game()
        roll = engine.roll_dice()
        moves = engine.get_valid_moves()
        engine.make_move(moves[0])
        ...
    """

    def __init__(self) -> None:
        self.state = GameState()
        self._cached_valid_moves: Optional[list[Move]] = None
        self._setup_initial_position()

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def _setup_initial_position(self) -> None:
        """Place checkers in the standard backgammon starting position."""
        self.state.points = [0] * 26

        # White checkers (positive)
        self.state.points[24] = 2
        self.state.points[13] = 5
        self.state.points[8] = 3
        self.state.points[6] = 5

        # Black checkers (negative)
        self.state.points[1] = -2
        self.state.points[12] = -5
        self.state.points[17] = -3
        self.state.points[19] = -5

        self.state.bar_white = 0
        self.state.bar_black = 0
        self.state.off_white = 0
        self.state.off_black = 0
        self.state.winner = None
        self.state.win_type = None
        self.state.status = GameStatus.WAITING
        self.state.moves_history = []
        self.state.turn_moves = []

    def start_game(self, first_player: Optional[Color] = None,
                   dice: Optional[DiceRoll] = None,
                   opening_roll: Optional[dict] = None) -> None:
        """Start the game, optionally specifying who goes first.

        If *first_player* is ``None``, :meth:`determine_first_player` is
        used.  If *dice* is provided it is used as the opening roll (the
        opening roll cannot be doubles).
        """
        if first_player is None:
            first_player, dice, opening_roll = self.determine_first_player()
        self.state.current_turn = first_player
        self.state.opening_roll = opening_roll
        self._cached_valid_moves = None
        if dice is not None:
            self.state.dice = dice
            self.state.remaining_dice = list(dice.values)
            self.state.status = GameStatus.MOVING

            # Save snapshot for undo (same as roll_dice does)
            self._turn_snapshot = self._snapshot_internals()
            self._turn_snapshot["remaining_dice"] = list(self.state.remaining_dice)
            self._turn_snapshot["turn_moves"] = []

            self._auto_skip_if_no_moves()
        else:
            self.state.status = GameStatus.ROLLING

    # ------------------------------------------------------------------
    # Dice
    # ------------------------------------------------------------------

    _turn_snapshot: Optional[dict] = None  # saved at roll for undo

    def roll_dice(self, die1: Optional[int] = None,
                  die2: Optional[int] = None) -> DiceRoll:
        """Roll dice for the current player.

        Optionally accepts predetermined die values (useful for testing).

        Raises:
            RuntimeError: If the game is not in ``ROLLING`` status.
        """
        if self.state.status != GameStatus.ROLLING:
            raise RuntimeError(
                f"Cannot roll dice in status {self.state.status.value}")

        d1 = die1 if die1 is not None else random.randint(1, 6)
        d2 = die2 if die2 is not None else random.randint(1, 6)
        roll = DiceRoll(d1, d2)

        self.state.dice = roll
        self.state.remaining_dice = list(roll.values)
        self.state.turn_moves = []
        self.state.status = GameStatus.MOVING
        self._cached_valid_moves = None

        # Save snapshot for undo (before auto-skip check)
        self._turn_snapshot = self._snapshot_internals()
        self._turn_snapshot["remaining_dice"] = list(self.state.remaining_dice)
        self._turn_snapshot["turn_moves"] = []

        self._auto_skip_if_no_moves()
        return roll

    # ------------------------------------------------------------------
    # Doubling cube
    # ------------------------------------------------------------------

    def can_double(self, color: Color) -> bool:
        """Return True if *color* can offer a double right now.

        A player can double at the start of their turn (before rolling)
        when the cube is centered or they own it.  Doubling is never
        allowed during a Crawford game.
        """
        if self.state.is_crawford_game:
            return False
        if self.state.status != GameStatus.ROLLING:
            return False
        if self.state.current_turn != color:
            return False
        if self.state.double_offered:
            return False
        # Can double if cube is centered or owned by this player
        if self.state.cube_owner is not None and self.state.cube_owner != color:
            return False
        return True

    def offer_double(self, color: Color) -> bool:
        """Offer to double the stakes.

        Returns True if the offer was valid and made.
        """
        if not self.can_double(color):
            return False
        self.state.double_offered = True
        self.state.double_offered_by = color
        return True

    def accept_double(self, color: Color) -> bool:
        """Accept a pending double offer.

        Returns True if successful.  The cube value is doubled and
        ownership transfers to the accepting player.
        """
        if not self.state.double_offered:
            return False
        if self.state.double_offered_by == color:
            return False  # can't accept your own offer
        self.state.cube_value *= 2
        self.state.cube_owner = color
        self.state.double_offered = False
        self.state.double_offered_by = None
        return True

    def decline_double(self, color: Color) -> tuple[bool, Optional[Color]]:
        """Decline a pending double offer, losing the game.

        Returns (success, winner) where winner is the player who offered
        the double.
        """
        if not self.state.double_offered:
            return False, None
        if self.state.double_offered_by == color:
            return False, None  # can't decline your own offer
        winner = self.state.double_offered_by
        self.state.winner = winner
        self.state.win_type = WinType.NORMAL
        self.state.status = GameStatus.FINISHED
        self.state.double_offered = False
        self.state.double_offered_by = None
        self._record_turn()
        return True, winner

    # ------------------------------------------------------------------
    # Move generation
    # ------------------------------------------------------------------

    def get_valid_moves(self) -> list[Move]:
        """Return every legal move the current player can make right now.

        The returned moves consider the *first* remaining die only, but
        they are filtered so that the player maximises dice usage over the
        full turn (i.e. the "must use both / higher die" rule is applied).

        If the game status is not ``MOVING`` or there are no remaining
        dice, an empty list is returned.
        """
        if self.state.status != GameStatus.MOVING:
            return []
        if not self.state.remaining_dice:
            return []

        if self._cached_valid_moves is not None:
            return list(self._cached_valid_moves)

        color = self.state.current_turn
        remaining = list(self.state.remaining_dice)

        # Determine which die values are unique choices for the next move.
        unique_dice = sorted(set(remaining))

        # For each unique die value, find the immediate legal moves.
        moves_by_die: dict[int, list[Move]] = {}
        for die in unique_dice:
            moves_by_die[die] = self._legal_moves_for_die(color, die)

        # If no moves at all, return empty.
        if all(len(m) == 0 for m in moves_by_die.values()):
            return []

        # --- "must use higher die" / "must maximise dice usage" filter ---
        # We need to determine the maximum number of dice that can be used
        # from this position, and only allow opening moves that lead to that
        # maximum.  Additionally, if exactly one die can be used (not both),
        # the player must use the higher die.

        max_usable = self._max_dice_usable(color, remaining)

        # Collect moves that are consistent with using *max_usable* dice.
        valid_moves: set[Move] = set()
        for die in unique_dice:
            for move in moves_by_die[die]:
                # Simulate making this move and check how many further dice
                # can be consumed.
                rem_after = list(remaining)
                rem_after.remove(die)
                future_max = self._max_dice_usable_after_move(
                    color, move, rem_after)
                if 1 + future_max >= max_usable:
                    valid_moves.add(move)

        # --- combined (multi-die) moves ---
        combined = self._get_combined_moves(color, remaining)
        for cmove in combined:
            # A combined move uses K dice.  Count how many dice it uses
            # by finding the path length.
            saved = self._snapshot_internals()
            path = self._find_combined_path(color, cmove)
            self._restore_internals(saved)
            if path is not None:
                k = len(path)
                actual_cmove = cmove
                # After this combined move, compute how many more dice
                # can be used with the remaining dice.
                rem_after = list(remaining)
                for _, d in path:
                    rem_after.remove(d)
                saved2 = self._snapshot_internals()
                # Apply all intermediate steps to compute future.
                for step_move, _ in path:
                    self._apply_move_internal(color, step_move)
                future_max = self._max_dice_usable(color, rem_after)
                self._restore_internals(saved2)
                if k + future_max >= max_usable:
                    valid_moves.add(actual_cmove)

        # --- higher-die rule ---
        # When the player can only use one die (max_usable == 1) and the
        # roll is not doubles, the player must use the higher die.
        if max_usable == 1 and len(unique_dice) == 2:
            higher = max(unique_dice)
            lower = min(unique_dice)
            higher_moves = moves_by_die.get(higher, [])
            if higher_moves:
                # Must use the higher die -- remove any lower-die moves.
                valid_moves = {m for m in valid_moves
                               if m in set(higher_moves)}

        result = sorted(valid_moves, key=lambda m: (m.from_point, m.to_point))
        self._cached_valid_moves = result
        return list(result)

    def _legal_moves_for_die(self, color: Color, die: int) -> list[Move]:
        """Generate raw legal moves for *color* using a single *die* value.

        This does NOT apply the maximise-dice or higher-die rules.
        """
        moves: list[Move] = []
        bar_count = (self.state.bar_white if color == Color.WHITE
                     else self.state.bar_black)

        if bar_count > 0:
            # Must re-enter from bar first.
            move = self._bar_entry_move(color, die)
            if move is not None:
                moves.append(move)
            return moves  # no other moves allowed while on bar

        direction = _direction(color)
        can_bear_off = self._check_can_bear_off(color)

        for pt in range(1, 25):
            val = self.state.points[pt]
            if color == Color.WHITE and val <= 0:
                continue
            if color == Color.BLACK and val >= 0:
                continue

            dest = pt + direction * die

            # --- bearing off ---
            if color == Color.WHITE and dest <= 0:
                if can_bear_off:
                    bear_move = self._bearing_off_move(color, pt, die)
                    if bear_move is not None:
                        moves.append(bear_move)
                continue
            if color == Color.BLACK and dest >= 25:
                if can_bear_off:
                    bear_move = self._bearing_off_move(color, pt, die)
                    if bear_move is not None:
                        moves.append(bear_move)
                continue

            if dest < 1 or dest > 24:
                continue

            # Check destination occupancy.
            dest_val = self.state.points[dest]
            if color == Color.WHITE:
                if dest_val < -1:
                    continue  # blocked
                is_hit = dest_val == -1
            else:
                if dest_val > 1:
                    continue  # blocked
                is_hit = dest_val == 1

            moves.append(Move(pt, dest, is_hit))

        return moves

    def _bar_entry_move(self, color: Color, die: int) -> Optional[Move]:
        """Return the bar-entry move for *color* with *die*, or ``None``.

        Checkers re-enter through the **opponent's** home board:
          White re-enters into points 19-24 (Black's home).
          Black re-enters into points 1-6  (White's home).
        """
        if color == Color.WHITE:
            dest = 25 - die  # re-enter into points 19-24 (Black's home)
            from_pt = 25
        else:
            dest = die  # re-enter into points 1-6 (White's home)
            from_pt = 0

        if dest < 1 or dest > 24:
            return None

        dest_val = self.state.points[dest]
        if color == Color.WHITE:
            if dest_val < -1:
                return None
            is_hit = dest_val == -1
        else:
            if dest_val > 1:
                return None
            is_hit = dest_val == 1

        return Move(from_pt, dest, is_hit)

    def _bearing_off_move(self, color: Color, pt: int,
                          die: int) -> Optional[Move]:
        """Return a bearing-off move from *pt* with *die*, or ``None``.

        Handles the rule that you can bear off from a lower point only if
        no higher point in the home board is occupied.
        """
        direction = _direction(color)
        exact_dest = pt + direction * die

        if color == Color.WHITE:
            off = 0
            if exact_dest == 0:
                # Exact bear-off.
                return Move(pt, off)
            if exact_dest < 0:
                # Die is higher than needed -- only allowed if pt is the
                # highest occupied point in the home board.
                for higher in range(pt + 1, 7):
                    if self.state.points[higher] > 0:
                        return None
                return Move(pt, off)
        else:
            off = 25
            if exact_dest == 25:
                return Move(pt, off)
            if exact_dest > 25:
                for higher in range(pt - 1, 18, -1):
                    if self.state.points[higher] < 0:
                        return None
                return Move(pt, off)

        return None

    # ------------------------------------------------------------------
    # Max-dice search (recursive)
    # ------------------------------------------------------------------

    def _max_dice_usable(self, color: Color,
                         remaining: list[int]) -> int:
        """Return the maximum number of dice that can be consumed."""
        if not remaining:
            return 0

        unique = set(remaining)
        best = 0
        for die in unique:
            for move in self._legal_moves_for_die(color, die):
                rem_after = list(remaining)
                rem_after.remove(die)
                future = self._max_dice_usable_after_move(
                    color, move, rem_after)
                best = max(best, 1 + future)
            if best == len(remaining):
                break  # can't do better
        return best

    def _max_dice_usable_after_move(self, color: Color, move: Move,
                                    remaining: list[int]) -> int:
        """Simulate *move*, then compute max dice usable from the new state."""
        # Save state.
        saved = self._snapshot_internals()
        self._apply_move_internal(color, move)
        result = self._max_dice_usable(color, remaining)
        self._restore_internals(saved)
        return result

    def _snapshot_internals(self) -> dict:
        """Cheaply snapshot the mutable board state."""
        s = self.state
        return {
            "points": list(s.points),
            "bar_white": s.bar_white,
            "bar_black": s.bar_black,
            "off_white": s.off_white,
            "off_black": s.off_black,
        }

    def _restore_internals(self, snap: dict) -> None:
        s = self.state
        s.points = list(snap["points"])
        s.bar_white = snap["bar_white"]
        s.bar_black = snap["bar_black"]
        s.off_white = snap["off_white"]
        s.off_black = snap["off_black"]

    # ------------------------------------------------------------------
    # Combined (multi-die) move generation
    # ------------------------------------------------------------------

    def _get_combined_moves(self, color: Color,
                            remaining: list[int]) -> list[Move]:
        """Generate moves that combine two or more dice into one checker move.

        For each checker, perform a DFS through permutations of the
        remaining dice.  At each intermediate step the landing point must
        be valid (not blocked by 2+ opponent checkers).  Collect all
        reachable (original_from, final_dest) pairs that use 2+ dice.

        Returns a list of :class:`Move` objects representing the overall
        combined movement (from the original source to the final
        destination).
        """
        if len(remaining) < 2:
            return []

        direction = _direction(color)
        bar = _bar_point(color)
        off = _off_point(color)
        opp = _opponent(color)
        bar_count = (self.state.bar_white if color == Color.WHITE
                     else self.state.bar_black)

        combined: set[Move] = set()

        # Determine source points.
        if bar_count > 0:
            sources = [bar]
        else:
            sources = []
            for pt in range(1, 25):
                val = self.state.points[pt]
                if color == Color.WHITE and val > 0:
                    sources.append(pt)
                elif color == Color.BLACK and val < 0:
                    sources.append(pt)

        for src in sources:
            # DFS: (current_point, remaining_dice, dice_used_count, snapshot)
            # We save/restore the board to handle intermediate hits properly.
            self._dfs_combined(color, src, src, list(remaining), 0, combined)

        return list(combined)

    def _dfs_combined(self, color: Color, original_from: int,
                      current: int, remaining: list[int],
                      depth: int, results: set[Move]) -> None:
        """Recursive DFS to find all combined-move destinations."""
        direction = _direction(color)
        bar = _bar_point(color)
        off = _off_point(color)

        unique_dice = sorted(set(remaining))
        for die in unique_dice:
            # Compute intermediate destination.
            if current == bar:
                if color == Color.WHITE:
                    dest = 25 - die
                else:
                    dest = die
                if dest < 1 or dest > 24:
                    continue
            else:
                dest = current + direction * die

            # Check for bear-off.
            is_bear_off = False
            if color == Color.WHITE and dest <= 0:
                if not self._check_can_bear_off(color):
                    continue
                # Verify bear-off legality (overshoot rules).
                bear_move = self._bearing_off_move(color, current, die)
                if bear_move is None:
                    continue
                dest = off
                is_bear_off = True
            elif color == Color.BLACK and dest >= 25:
                if not self._check_can_bear_off(color):
                    continue
                bear_move = self._bearing_off_move(color, current, die)
                if bear_move is None:
                    continue
                dest = off
                is_bear_off = True

            if not is_bear_off:
                if dest < 1 or dest > 24:
                    continue
                # Check if destination is blocked.
                dest_val = self.state.points[dest]
                if color == Color.WHITE and dest_val < -1:
                    continue
                if color == Color.BLACK and dest_val > 1:
                    continue

            # This intermediate step is valid.
            new_depth = depth + 1

            if new_depth >= 2:
                # We've used 2+ dice — this is a valid combined move.
                if dest == off:
                    is_hit = False
                else:
                    dest_val = self.state.points[dest]
                    if color == Color.WHITE:
                        is_hit = dest_val == -1
                    else:
                        is_hit = dest_val == 1
                results.add(Move(original_from, dest, is_hit))

            # Continue DFS if there are more dice and we haven't borne off.
            if not is_bear_off:
                new_remaining = list(remaining)
                new_remaining.remove(die)
                if new_remaining:
                    # Determine hit at intermediate point.
                    dest_val = self.state.points[dest]
                    if color == Color.WHITE:
                        is_hit_intermediate = dest_val == -1
                    else:
                        is_hit_intermediate = dest_val == 1

                    intermediate_move = Move(current, dest, is_hit_intermediate)
                    saved = self._snapshot_internals()
                    self._apply_move_internal(color, intermediate_move)

                    # If we just entered from the bar but there are still
                    # checkers on the bar, don't continue moving this
                    # checker — remaining dice must enter other bar
                    # checkers first.
                    bar_after = (self.state.bar_white if color == Color.WHITE
                                 else self.state.bar_black)
                    if current != bar or bar_after == 0:
                        self._dfs_combined(color, original_from, dest,
                                           new_remaining, new_depth, results)

                    self._restore_internals(saved)

    def _find_combined_path(self, color: Color,
                            move: Move) -> Optional[list[tuple[Move, int]]]:
        """Find a sequence of single-die moves that realises a combined *move*.

        Returns a list of ``(intermediate_move, die_value)`` tuples, or
        ``None`` if no valid path exists.
        """
        remaining = list(self.state.remaining_dice)
        result: list[tuple[Move, int]] = []
        found = self._dfs_find_path(color, move.from_point, move.to_point,
                                     remaining, result)
        if found:
            return result
        return None

    def _dfs_find_path(self, color: Color, current: int,
                       target: int, remaining: list[int],
                       path: list[tuple[Move, int]]) -> bool:
        """DFS to find a concrete sequence of single-die steps."""
        direction = _direction(color)
        bar = _bar_point(color)
        off = _off_point(color)

        unique_dice = sorted(set(remaining))
        for die in unique_dice:
            if current == bar:
                if color == Color.WHITE:
                    dest = 25 - die
                else:
                    dest = die
                if dest < 1 or dest > 24:
                    continue
            else:
                dest = current + direction * die

            # Bear-off check.
            is_bear_off = False
            if current != bar:
                if color == Color.WHITE and dest <= 0:
                    bear_move = self._bearing_off_move(color, current, die)
                    if bear_move is None:
                        continue
                    dest = off
                    is_bear_off = True
                elif color == Color.BLACK and dest >= 25:
                    bear_move = self._bearing_off_move(color, current, die)
                    if bear_move is None:
                        continue
                    dest = off
                    is_bear_off = True

            if not is_bear_off:
                if dest < 1 or dest > 24:
                    continue
                dest_val = self.state.points[dest]
                if color == Color.WHITE and dest_val < -1:
                    continue
                if color == Color.BLACK and dest_val > 1:
                    continue

            # Build intermediate move.
            if dest == off:
                is_hit = False
            else:
                dest_val = self.state.points[dest]
                if color == Color.WHITE:
                    is_hit = dest_val == -1
                else:
                    is_hit = dest_val == 1

            step_move = Move(current, dest, is_hit)

            if dest == target:
                path.append((step_move, die))
                return True

            # Not at target yet — keep going if not bear-off.
            if is_bear_off:
                continue

            new_remaining = list(remaining)
            new_remaining.remove(die)
            if not new_remaining:
                continue

            saved = self._snapshot_internals()
            self._apply_move_internal(color, step_move)
            path.append((step_move, die))

            # If we just entered from the bar but there are still
            # checkers on the bar, remaining dice must enter them —
            # don't continue moving this checker.
            bar_after = (self.state.bar_white if color == Color.WHITE
                         else self.state.bar_black)
            can_continue = (current != bar or bar_after == 0)

            if can_continue and self._dfs_find_path(
                    color, dest, target, new_remaining, path):
                self._restore_internals(saved)
                return True
            path.pop()
            self._restore_internals(saved)

        return False

    # ------------------------------------------------------------------
    # Full-turn enumeration
    # ------------------------------------------------------------------

    def enumerate_complete_turns(self) -> list[list[Move]]:
        """Enumerate all distinct complete turns for the current dice roll.

        A "complete turn" is a sequence of single-die moves that uses the
        maximum possible number of dice (per backgammon rules).  Sequences
        are deduplicated by resulting board position so that only one
        representative move order is kept for each unique outcome.

        The "must use higher die" rule is applied when only one die can
        be used from a non-double roll.

        Returns an empty list if no moves are possible.
        """
        if self.state.status != GameStatus.MOVING:
            return []
        if not self.state.remaining_dice:
            return []

        color = self.state.current_turn
        remaining = list(self.state.remaining_dice)

        all_sequences: list[list[Move]] = []
        self._enum_turns_dfs(color, remaining, [], all_sequences, set())

        if not all_sequences:
            return []

        # Must use maximum number of dice.
        max_dice = max(len(seq) for seq in all_sequences)
        all_sequences = [seq for seq in all_sequences
                         if len(seq) == max_dice]

        # "Must use higher die" rule: when exactly one die can be used
        # from a non-double roll, the player must use the larger die.
        unique_dice = sorted(set(remaining))
        if max_dice == 1 and len(unique_dice) == 2:
            higher = max(unique_dice)
            higher_seqs = [
                seq for seq in all_sequences
                if self._die_value_for_move(color, seq[0]) == higher
            ]
            if higher_seqs:
                all_sequences = higher_seqs

        # Deduplicate by resulting board state.
        unique: dict[tuple, list[Move]] = {}
        for seq in all_sequences:
            saved = self._snapshot_internals()
            for move in seq:
                self._apply_move_internal(color, move)
            key = (tuple(self.state.points), self.state.bar_white,
                   self.state.bar_black, self.state.off_white,
                   self.state.off_black)
            if key not in unique:
                unique[key] = seq
            self._restore_internals(saved)

        return list(unique.values())

    def _enum_turns_dfs(self, color: Color, remaining_dice: list[int],
                        current_seq: list[Move],
                        results: list[list[Move]],
                        seen: set) -> None:
        """DFS to find all possible complete turn sequences.

        *seen* tracks ``(board_state, remaining_dice)`` tuples to prune
        duplicate sub-trees (important for doubles where move order
        doesn't matter).
        """
        unique_dice = sorted(set(remaining_dice))
        any_move = False

        for die in unique_dice:
            for move in self._legal_moves_for_die(color, die):
                any_move = True
                saved = self._snapshot_internals()
                self._apply_move_internal(color, move)
                new_remaining = list(remaining_dice)
                new_remaining.remove(die)

                current_seq.append(move)
                if new_remaining:
                    state_key = (
                        tuple(self.state.points),
                        self.state.bar_white, self.state.bar_black,
                        self.state.off_white, self.state.off_black,
                        tuple(sorted(new_remaining)),
                    )
                    if state_key not in seen:
                        seen.add(state_key)
                        self._enum_turns_dfs(
                            color, new_remaining, current_seq,
                            results, seen)
                else:
                    results.append(list(current_seq))
                current_seq.pop()
                self._restore_internals(saved)

        if not any_move:
            results.append(list(current_seq))

    # ------------------------------------------------------------------
    # Move execution
    # ------------------------------------------------------------------

    def make_move(self, move: Move) -> bool:
        """Execute *move* for the current player.

        Returns ``True`` if the move was legal and applied, ``False``
        otherwise.

        After the move is applied, remaining dice are updated.  If no
        further moves are possible the turn ends automatically.
        """
        if self.state.status != GameStatus.MOVING:
            return False

        valid = self.get_valid_moves()
        if move not in valid:
            return False

        color = self.state.current_turn

        # Try single-die move first.
        die_used = self._die_value_for_move(color, move)
        if die_used is not None and die_used in self.state.remaining_dice:
            self._apply_move_internal(color, move)
            self.state.remaining_dice.remove(die_used)
            self.state.turn_moves.append(move)
        else:
            # Try combined (multi-die) move.
            path = self._find_combined_path(color, move)
            if path is None:
                return False
            for step_move, die_val in path:
                self._apply_move_internal(color, step_move)
                self.state.remaining_dice.remove(die_val)
            self.state.turn_moves.append(move)

        self._cached_valid_moves = None

        # Check for winner.
        winner = self._check_winner()
        if winner is not None:
            self.state.winner = winner[0]
            self.state.win_type = winner[1]
            self.state.status = GameStatus.FINISHED
            self._record_turn()
            return True

        # Auto end turn if no more moves.
        self._auto_skip_if_no_moves()
        return True

    def _die_value_for_move(self, color: Color,
                            move: Move) -> Optional[int]:
        """Infer which die value was consumed by *move*."""
        direction = _direction(color)
        bar = _bar_point(color)
        off = _off_point(color)

        if move.from_point == bar:
            # Bar entry: White enters at 25-die, Black enters at die.
            if color == Color.WHITE:
                return 25 - move.to_point  # dest = 25-die → die = 25-dest
            else:
                return move.to_point  # dest = die
        if move.to_point == off:
            # Bearing off -- die could be exact or higher.
            exact = abs(move.from_point - off)
            # Exact match?
            if exact in self.state.remaining_dice:
                return exact
            # Otherwise, the smallest remaining die that is >= exact.
            candidates = [d for d in self.state.remaining_dice if d >= exact]
            if candidates:
                return min(candidates)
            return None
        # Normal move.
        return abs(move.to_point - move.from_point)

    def _apply_move_internal(self, color: Color, move: Move) -> None:
        """Apply *move* to the board without any validation."""
        opp = _opponent(color)
        bar = _bar_point(color)
        off = _off_point(color)
        inc = 1 if color == Color.WHITE else -1  # checker increment

        # Remove checker from source.
        if move.from_point == bar:
            if color == Color.WHITE:
                self.state.bar_white -= 1
            else:
                self.state.bar_black -= 1
        else:
            self.state.points[move.from_point] -= inc

        # Place checker at destination.
        if move.to_point == off:
            if color == Color.WHITE:
                self.state.off_white += 1
            else:
                self.state.off_black += 1
        else:
            # Hit?
            if move.is_hit:
                self.state.points[move.to_point] = 0
                if opp == Color.WHITE:
                    self.state.bar_white += 1
                else:
                    self.state.bar_black += 1
            self.state.points[move.to_point] += inc

    # ------------------------------------------------------------------
    # Turn management
    # ------------------------------------------------------------------

    def end_turn(self) -> bool:
        """Manually end (confirm) the current player's turn.

        Returns ``True`` if the turn was ended.  The turn can be ended
        when there are no remaining valid moves OR when all dice have
        been used (the player is confirming their moves).
        """
        if self.state.status != GameStatus.MOVING:
            return False

        # Allow ending if: (a) no valid moves, or (b) no remaining dice
        has_valid = bool(self.get_valid_moves())
        has_dice = bool(self.state.remaining_dice)

        if has_valid and has_dice:
            return False  # player still has moves to make

        self._record_turn()
        self._switch_turn()
        return True

    def undo_turn(self) -> bool:
        """Undo all moves made this turn, restoring the board to post-roll state.

        Returns ``True`` if the undo succeeded, ``False`` if there is
        nothing to undo (no moves made this turn, or no snapshot saved).
        """
        if self._turn_snapshot is None:
            return False
        if not self.state.turn_moves:
            return False
        if self.state.status != GameStatus.MOVING:
            return False

        self._restore_internals(self._turn_snapshot)
        self.state.remaining_dice = list(self._turn_snapshot["remaining_dice"])
        self.state.turn_moves = []
        self._cached_valid_moves = None
        return True

    def _auto_skip_if_no_moves(self) -> None:
        """End the turn automatically when the player has no valid moves.

        If the player has already made moves this turn, the turn is NOT
        auto-ended so the player can review and optionally undo.  The
        player must explicitly confirm via :meth:`end_turn`.

        If no moves were made at all (e.g. completely blocked / stuck on
        bar), the turn is auto-skipped immediately.
        """
        if self.state.status != GameStatus.MOVING:
            return
        if not self.state.remaining_dice:
            if not self.state.turn_moves:
                # No moves were made and no dice left — shouldn't happen
                # in normal play, but handle gracefully.
                self._record_turn()
                self._switch_turn()
            # Otherwise, player made moves — wait for explicit confirm.
            return
        if not self.get_valid_moves():
            if not self.state.turn_moves:
                # No moves possible at all (e.g. stuck on bar) — auto-skip.
                self._record_turn()
                self._switch_turn()
            # Otherwise, player made some moves but can't use remaining
            # dice — wait for explicit confirm.

    def _switch_turn(self) -> None:
        """Switch to the next player and set status to ROLLING.

        Note: ``self.state.dice`` is intentionally preserved so that the
        opponent can see what was rolled.  The dice will be replaced
        when the new current player calls :meth:`roll_dice`.
        """
        self.state.current_turn = _opponent(self.state.current_turn)
        self.state.remaining_dice = []
        self.state.turn_moves = []
        self.state.opening_roll = None
        self.state.status = GameStatus.ROLLING
        self._cached_valid_moves = None

    def _record_turn(self) -> None:
        """Append the current turn's moves to history."""
        if self.state.dice is not None:
            self.state.moves_history.append((
                self.state.current_turn,
                self.state.dice,
                list(self.state.turn_moves),
            ))

    # ------------------------------------------------------------------
    # Bearing-off eligibility
    # ------------------------------------------------------------------

    def _check_can_bear_off(self, color: Color) -> bool:
        """Return ``True`` if *color* may bear off.

        All 15 checkers must be in the player's home board (including
        those already borne off).  No checkers on the bar.
        """
        if color == Color.WHITE:
            if self.state.bar_white > 0:
                return False
            for pt in range(7, 25):
                if self.state.points[pt] > 0:
                    return False
            return True
        else:
            if self.state.bar_black > 0:
                return False
            for pt in range(1, 19):
                if self.state.points[pt] < 0:
                    return False
            return True

    # ------------------------------------------------------------------
    # Win detection
    # ------------------------------------------------------------------

    def _check_winner(self) -> Optional[tuple[Color, WinType]]:
        """Check whether someone has won and determine the win type.

        Returns ``None`` if no one has won yet.
        """
        for color in (Color.WHITE, Color.BLACK):
            off = (self.state.off_white if color == Color.WHITE
                   else self.state.off_black)
            if off == 15:
                wt = self._classify_win(color)
                return (color, wt)
        return None

    def _classify_win(self, winner: Color) -> WinType:
        """Classify the win as normal, gammon, or backgammon."""
        loser = _opponent(winner)
        loser_off = (self.state.off_white if loser == Color.WHITE
                     else self.state.off_black)
        if loser_off > 0:
            return WinType.NORMAL

        # Gammon -- loser has borne off no checkers.  Check for backgammon.
        loser_bar = (self.state.bar_white if loser == Color.WHITE
                     else self.state.bar_black)
        if loser_bar > 0:
            return WinType.BACKGAMMON

        # Check if loser has checkers in the winner's home board.
        winner_home = _home_range(winner)
        for pt in winner_home:
            val = self.state.points[pt]
            if loser == Color.WHITE and val > 0:
                return WinType.BACKGAMMON
            if loser == Color.BLACK and val < 0:
                return WinType.BACKGAMMON

        return WinType.GAMMON

    # ------------------------------------------------------------------
    # Serialisation / notation
    # ------------------------------------------------------------------

    def get_state_snapshot(self) -> dict:
        """Return a JSON-serialisable snapshot of the game state."""
        s = self.state
        return {
            "points": list(s.points),  # 26-element list, indices 1-24 are board points
            "bar_white": s.bar_white,
            "bar_black": s.bar_black,
            "off_white": s.off_white,
            "off_black": s.off_black,
            "current_turn": s.current_turn.value,
            "dice": ({"die1": s.dice.die1, "die2": s.dice.die2}
                     if s.dice else None),
            "remaining_dice": list(s.remaining_dice),
            "status": s.status.value,
            "winner": s.winner.value if s.winner else None,
            "win_type": s.win_type.name.lower() if s.win_type else None,
            "opening_roll": s.opening_roll,
            "turn_moves_count": len(s.turn_moves),
            "can_undo": len(s.turn_moves) > 0 and s.status == GameStatus.MOVING,
            "cube_value": s.cube_value,
            "cube_owner": s.cube_owner.value if s.cube_owner else None,
            "double_offered": s.double_offered,
            "double_offered_by": s.double_offered_by.value if s.double_offered_by else None,
            "is_crawford_game": s.is_crawford_game,
            # Last completed turn — used by the client to highlight the
            # opponent's most recent move while you're about to roll.
            "last_turn_color": (
                s.moves_history[-1][0].value if s.moves_history else None
            ),
            "last_turn_notation": (
                " ".join(
                    m.to_notation(s.moves_history[-1][0])
                    for m in s.moves_history[-1][2]
                )
                if s.moves_history and s.moves_history[-1][2]
                else None
            ),
        }

    def get_notation_log(self) -> list[str]:
        """Return the game history in standard backgammon notation.

        Each entry is one turn: ``"White 31: 8/5 6/5"`` etc.
        """
        log: list[str] = []
        for color, dice, moves in self.state.moves_history:
            die_str = f"{dice.die1}{dice.die2}"
            if moves:
                move_strs = " ".join(m.to_notation(color) for m in moves)
            else:
                move_strs = "(no moves)"
            log.append(f"{color.value.capitalize()} {die_str}: {move_strs}")
        return log

    # ------------------------------------------------------------------
    # First player determination
    # ------------------------------------------------------------------

    @staticmethod
    def determine_first_player() -> tuple[Color, DiceRoll, dict]:
        """Each player rolls one die; higher roll goes first.

        On a tie the dice are re-rolled.  Returns ``(first_player,
        dice_roll, opening_roll)`` where *opening_roll* is a dict
        ``{"white": int, "black": int}`` recording each player's die.
        """
        while True:
            white_die = random.randint(1, 6)
            black_die = random.randint(1, 6)
            if white_die != black_die:
                opening = {"white": white_die, "black": black_die}
                if white_die > black_die:
                    return Color.WHITE, DiceRoll(white_die, black_die), opening
                else:
                    return Color.BLACK, DiceRoll(black_die, white_die), opening
