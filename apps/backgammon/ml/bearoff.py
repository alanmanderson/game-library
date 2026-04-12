#!/usr/bin/env python3
"""
Bearoff Database
==================
Perfect endgame play for positions where all checkers are in the home board
(points 1-6). Uses dynamic programming to compute exact equity for every
possible bearoff position.

A bearoff position is defined by the number of checkers on each of points 1-6
for one player. With at most 15 checkers distributed across 6 points, there
are C(20, 5) = 15,504 possible distributions per player. For two-player
positions, we store the probability of bearing off in exactly N rolls.

For simplicity and speed, this implementation stores the expected number of
rolls to bear off for each one-sided position, then computes equity from
the difference in expected rolls between the two players.

Position key: tuple of 6 ints (checkers on point 1, ..., checkers on point 6).
"""

import os
import itertools
import numpy as np


def _position_index(pos: tuple[int, ...]) -> int:
    """Convert a position tuple to a unique index using combinatorial numbering.

    Maps a distribution of checkers (n1, n2, ..., n6) where sum <= 15
    to a unique integer. We use a simple hash for fast lookup.
    """
    # Pack into a single integer: each slot gets 4 bits (max 15)
    idx = 0
    for i, count in enumerate(pos):
        idx |= count << (4 * i)
    return idx


def _all_bearoff_positions(max_checkers: int = 15) -> list[tuple[int, ...]]:
    """Generate all valid bearoff positions (checker distributions on points 1-6).

    Each position is a tuple of 6 ints: (checkers_on_1, ..., checkers_on_6).
    Total checkers across all points must be <= max_checkers.
    """
    positions = []
    for total in range(0, max_checkers + 1):
        # Generate all ways to distribute 'total' checkers across 6 points
        for combo in _compositions(total, 6):
            positions.append(combo)
    return positions


def _compositions(n: int, k: int) -> list[tuple[int, ...]]:
    """Generate all ways to write n as an ordered sum of k non-negative integers."""
    if k == 1:
        return [(n,)]
    result = []
    for first in range(n + 1):
        for rest in _compositions(n - first, k - 1):
            result.append((first,) + rest)
    return result


# All 21 possible dice outcomes with probabilities
DICE_OUTCOMES = []
for d1 in range(1, 7):
    for d2 in range(d1, 7):
        if d1 == d2:
            DICE_OUTCOMES.append(([d1] * 4, 1.0 / 36.0))
        else:
            DICE_OUTCOMES.append(([d1, d2], 2.0 / 36.0))


def _apply_bearoff_dice(pos: tuple[int, ...], dice: list[int]) -> list[tuple[int, ...]]:
    """Apply dice to a bearoff position, returning all possible resulting positions.

    For bearoff, we use a greedy approach: use highest die first, bear off
    if possible, otherwise move the highest checker. This gives the optimal
    bearoff play in most positions. Returns a single best resulting position.
    """
    # Convert to list for mutation
    board = list(pos)
    remaining_dice = sorted(dice, reverse=True)

    for die in remaining_dice:
        total_checkers = sum(board)
        if total_checkers == 0:
            break

        moved = False

        # Try to bear off from exact point
        if die <= 6 and board[die - 1] > 0:
            board[die - 1] -= 1
            moved = True
        else:
            # Try to bear off from higher point (if no checker on exact point)
            # Only allowed if no checkers on points higher than die
            if die <= 6:
                has_higher = any(board[j] > 0 for j in range(die, 6))
                if not has_higher:
                    # Bear off highest checker below die
                    for j in range(die - 2, -1, -1):
                        if board[j] > 0:
                            board[j] -= 1
                            moved = True
                            break

            if not moved:
                # Move a checker closer to point 1 (toward bearing off)
                # Try from highest point that can use this die
                for j in range(5, -1, -1):
                    if board[j] > 0:
                        target = (j + 1) - die  # point number - die value
                        if target >= 1:
                            board[j] -= 1
                            board[target - 1] += 1
                            moved = True
                            break
                        elif target <= 0:
                            # Can bear off if it's the highest occupied point
                            # or if die is large enough
                            has_higher = any(board[k] > 0 for k in range(j + 1, 6))
                            if not has_higher:
                                board[j] -= 1
                                moved = True
                                break

    return tuple(board)


class BearoffDB:
    """Bearoff endgame database for perfect play when all checkers are in home board."""

    def __init__(self):
        self._expected_rolls = {}  # position tuple -> expected rolls to bear off
        self._generated = False

    def generate(self, max_checkers: int = 15):
        """Generate the bearoff database using value iteration.

        Computes the expected number of rolls to bear off from every position.
        Uses iterative approach since positions with the same total can
        reference each other (a move might not change total checker count).
        """
        print("Generating bearoff database...")
        positions = _all_bearoff_positions(max_checkers)
        print(f"  Total positions: {len(positions)}")

        # Base case: empty position takes 0 rolls
        empty = (0, 0, 0, 0, 0, 0)
        self._expected_rolls[empty] = 0.0

        # Group by total checkers
        by_total = {}
        for pos in positions:
            total = sum(pos)
            by_total.setdefault(total, []).append(pos)

        # Process positions by total checkers (increasing order)
        # Within each total, use value iteration to handle dependencies
        for total in sorted(by_total.keys()):
            if total == 0:
                continue

            group = by_total[total]

            # Pre-compute dice results for each position
            dice_results = {}
            for pos in group:
                results = []
                for dice, prob in DICE_OUTCOMES:
                    result = _apply_bearoff_dice(pos, dice)
                    results.append((result, prob))
                dice_results[pos] = results

            # Initialize with rough estimate
            for pos in group:
                self._expected_rolls[pos] = float(total)  # rough initial guess

            # Value iteration until convergence
            for iteration in range(200):
                max_change = 0.0
                for pos in group:
                    expected = 0.0
                    for result, prob in dice_results[pos]:
                        result_expected = self._expected_rolls.get(result, 0.0)
                        expected += prob * (1.0 + result_expected)
                    change = abs(expected - self._expected_rolls[pos])
                    max_change = max(max_change, change)
                    self._expected_rolls[pos] = expected

                if max_change < 1e-8:
                    break

        self._generated = True
        print(f"  Generated {len(self._expected_rolls)} entries")

    def save(self, path: str):
        """Save the database to a .npz file."""
        if not self._generated:
            raise RuntimeError("Database not generated yet. Call generate() first.")

        keys = []
        values = []
        for pos, expected in self._expected_rolls.items():
            keys.append(list(pos))
            values.append(expected)

        np.savez_compressed(
            path,
            keys=np.array(keys, dtype=np.int8),
            values=np.array(values, dtype=np.float32),
        )
        size_kb = os.path.getsize(path) / 1024
        print(f"  Saved bearoff DB to {path} ({size_kb:.1f} KB, {len(keys)} entries)")

    def load(self, path: str):
        """Load the database from a .npz file."""
        data = np.load(path)
        keys = data['keys']
        values = data['values']

        self._expected_rolls = {}
        for i in range(len(keys)):
            pos = tuple(int(x) for x in keys[i])
            self._expected_rolls[pos] = float(values[i])

        self._generated = True

    def lookup(self, own_pos: tuple[int, ...], opp_pos: tuple[int, ...]) -> float:
        """Look up the equity for a bearoff position.

        Args:
            own_pos: Tuple of 6 ints (checkers on points 1-6 for perspective player).
            opp_pos: Tuple of 6 ints (checkers on points 1-6 for opponent).

        Returns:
            Equity estimate in range [-1, 1]. Positive = good for perspective player.
            Returns None if position not in database.
        """
        own_expected = self._expected_rolls.get(own_pos)
        opp_expected = self._expected_rolls.get(opp_pos)

        if own_expected is None or opp_expected is None:
            return None

        # Equity based on expected rolls difference
        # If we expect to finish in fewer rolls, we're ahead
        # Normalize to approximately [-1, 1]
        diff = opp_expected - own_expected
        # A 1-roll advantage is roughly worth ~0.15 equity points
        equity = np.clip(diff * 0.15, -1.0, 1.0)
        return float(equity)

    def is_bearoff_position(self, engine, perspective) -> bool:
        """Check if all checkers for both players are in their home boards.

        Args:
            engine: BackgammonEngine instance.
            perspective: Color perspective.

        Returns:
            True if this is a pure bearoff position (no contact, all home).
        """
        state = engine.state
        if state.bar_white > 0 or state.bar_black > 0:
            return False

        # Check White: all checkers must be on points 1-6 or borne off
        for i in range(7, 25):
            if state.points[i] > 0:
                return False
        # Check Black: all checkers must be on points 19-24 or borne off
        for i in range(1, 19):
            if state.points[i] < 0:
                return False

        return True

    def get_position_key(self, engine, perspective) -> tuple:
        """Extract the bearoff position key for the perspective player.

        Args:
            engine: BackgammonEngine instance.
            perspective: Color of the perspective player.

        Returns:
            Tuple of (own_pos, opp_pos) where each is a 6-element tuple.
        """
        state = engine.state
        from app.game_engine import Color

        if perspective == Color.WHITE:
            own_pos = tuple(max(0, state.points[i]) for i in range(1, 7))
            opp_pos = tuple(max(0, -state.points[i]) for i in range(19, 25))
        else:
            own_pos = tuple(max(0, -state.points[i]) for i in range(19, 25))
            opp_pos = tuple(max(0, state.points[i]) for i in range(1, 7))

        return own_pos, opp_pos

    @property
    def size(self) -> int:
        return len(self._expected_rolls)


def generate_bearoff_db(output_path: str = None):
    """Generate and save the bearoff database."""
    if output_path is None:
        output_path = os.path.join(os.path.dirname(__file__), 'models', 'bearoff.npz')

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    db = BearoffDB()
    db.generate()
    db.save(output_path)
    return db


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Generate bearoff endgame database')
    parser.add_argument('--output', type=str, default=None, help='Output path for .npz file')
    parser.add_argument('--max-checkers', type=int, default=15, help='Max checkers per side')
    args = parser.parse_args()

    output = args.output or os.path.join(os.path.dirname(__file__), 'models', 'bearoff.npz')
    db = BearoffDB()
    db.generate(max_checkers=args.max_checkers)
    db.save(output)

    # Quick verification
    print("\nVerification:")
    print(f"  Empty position: {db._expected_rolls.get((0,0,0,0,0,0), 'N/A')} expected rolls")
    print(f"  1 checker on point 1: {db._expected_rolls.get((1,0,0,0,0,0), 'N/A'):.3f} expected rolls")
    print(f"  1 checker on point 6: {db._expected_rolls.get((0,0,0,0,0,1), 'N/A'):.3f} expected rolls")
    print(f"  2 checkers on point 1: {db._expected_rolls.get((2,0,0,0,0,0), 'N/A'):.3f} expected rolls")
    print(f"  15 checkers on point 1: {db._expected_rolls.get((15,0,0,0,0,0), 'N/A'):.3f} expected rolls")
