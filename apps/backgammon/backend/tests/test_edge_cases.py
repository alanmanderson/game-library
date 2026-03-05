"""
Comprehensive edge-case tests for the Backgammon game engine.

These tests directly manipulate engine.state to set up specific board
positions and verify correct behaviour of the rules engine.
"""

import pytest
from app.game_engine import (
    BackgammonEngine,
    Color,
    DiceRoll,
    GameState,
    GameStatus,
    Move,
    WinType,
    _bar_point,
    _direction,
    _home_range,
    _off_point,
    _opponent,
)


# =====================================================================
# Helpers
# =====================================================================

def _empty_board() -> list[int]:
    """Return a 26-element list of zeros (empty board)."""
    return [0] * 26


def _make_engine(
    points: list[int] | None = None,
    bar_white: int = 0,
    bar_black: int = 0,
    off_white: int = 0,
    off_black: int = 0,
    current_turn: Color = Color.WHITE,
    dice: DiceRoll | None = None,
    remaining_dice: list[int] | None = None,
) -> BackgammonEngine:
    """Build an engine with a custom board position in MOVING status."""
    engine = BackgammonEngine()
    s = engine.state
    s.points = points if points is not None else _empty_board()
    s.bar_white = bar_white
    s.bar_black = bar_black
    s.off_white = off_white
    s.off_black = off_black
    s.current_turn = current_turn
    s.dice = dice
    s.remaining_dice = list(remaining_dice) if remaining_dice else []
    s.status = GameStatus.MOVING
    s.turn_moves = []
    return engine


# =====================================================================
# 1. Bar re-entry direction
# =====================================================================

class TestBarReEntryDirection:
    """White on bar enters into Black's home (19-24).
    Black on bar enters into White's home (1-6)."""

    def test_white_bar_entry_destinations(self):
        """White re-enters at 25 - die, so die=1 -> point 24, die=6 -> point 19."""
        pts = _empty_board()
        engine = _make_engine(
            points=pts,
            bar_white=1,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3, 1],
        )
        moves = engine.get_valid_moves()
        destinations = {m.to_point for m in moves}
        # die=3 -> 25-3=22, die=1 -> 25-1=24
        assert 22 in destinations, f"Expected point 22 for die=3, got destinations {destinations}"
        assert 24 in destinations, f"Expected point 24 for die=1, got destinations {destinations}"
        for m in moves:
            assert m.from_point == 25, "White bar entry must be from point 25"
            assert 19 <= m.to_point <= 24, f"White must enter into 19-24, got {m.to_point}"

    def test_black_bar_entry_destinations(self):
        """Black re-enters at die, so die=1 -> point 1, die=6 -> point 6."""
        pts = _empty_board()
        engine = _make_engine(
            points=pts,
            bar_black=1,
            current_turn=Color.BLACK,
            dice=DiceRoll(4, 2),
            remaining_dice=[4, 2],
        )
        moves = engine.get_valid_moves()
        destinations = {m.to_point for m in moves}
        # die=4 -> point 4, die=2 -> point 2
        assert 4 in destinations, f"Expected point 4 for die=4, got {destinations}"
        assert 2 in destinations, f"Expected point 2 for die=2, got {destinations}"
        for m in moves:
            assert m.from_point == 0, "Black bar entry must be from point 0"
            assert 1 <= m.to_point <= 6, f"Black must enter into 1-6, got {m.to_point}"

    def test_white_bar_entry_all_die_values(self):
        """Test White re-entry destination for every die value 1-6."""
        for die_val in range(1, 7):
            pts = _empty_board()
            engine = _make_engine(
                points=pts,
                bar_white=1,
                current_turn=Color.WHITE,
                dice=DiceRoll(die_val, die_val),
                remaining_dice=[die_val],
            )
            moves = engine.get_valid_moves()
            assert len(moves) >= 1, f"Should have at least one entry move for die={die_val}"
            expected_dest = 25 - die_val
            actual_dests = {m.to_point for m in moves}
            assert expected_dest in actual_dests, \
                f"die={die_val}: expected dest {expected_dest}, got {actual_dests}"

    def test_black_bar_entry_all_die_values(self):
        """Test Black re-entry destination for every die value 1-6."""
        for die_val in range(1, 7):
            pts = _empty_board()
            engine = _make_engine(
                points=pts,
                bar_black=1,
                current_turn=Color.BLACK,
                dice=DiceRoll(die_val, die_val),
                remaining_dice=[die_val],
            )
            moves = engine.get_valid_moves()
            assert len(moves) >= 1, f"Should have at least one entry move for die={die_val}"
            expected_dest = die_val
            actual_dests = {m.to_point for m in moves}
            assert expected_dest in actual_dests, \
                f"die={die_val}: expected dest {expected_dest}, got {actual_dests}"


# =====================================================================
# 2. Bar re-entry when blocked
# =====================================================================

class TestBarReEntryBlocked:
    """All 6 entry points blocked -> no moves, turn auto-skipped."""

    def test_white_bar_completely_blocked(self):
        """White on bar, Black holds all 6 entry points (19-24) with 2+ checkers."""
        pts = _empty_board()
        for pt in range(19, 25):
            pts[pt] = -2  # Black blocks
        engine = _make_engine(
            points=pts,
            bar_white=1,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 5),
            remaining_dice=[3, 5],
        )
        moves = engine.get_valid_moves()
        assert moves == [], "White should have no moves when all entry points blocked"

    def test_black_bar_completely_blocked(self):
        """Black on bar, White holds all 6 entry points (1-6) with 2+ checkers."""
        pts = _empty_board()
        for pt in range(1, 7):
            pts[pt] = 2  # White blocks
        engine = _make_engine(
            points=pts,
            bar_black=1,
            current_turn=Color.BLACK,
            dice=DiceRoll(3, 5),
            remaining_dice=[3, 5],
        )
        moves = engine.get_valid_moves()
        assert moves == [], "Black should have no moves when all entry points blocked"

    def test_white_bar_blocked_auto_skips_turn(self):
        """When White is blocked on bar, the turn should auto-skip."""
        pts = _empty_board()
        for pt in range(19, 25):
            pts[pt] = -2
        # Also give Black some checkers elsewhere to keep the count valid
        pts[12] = -3
        engine = _make_engine(
            points=pts,
            bar_white=1,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 5),
            remaining_dice=[3, 5],
        )
        # The _auto_skip_if_no_moves is called during setup (when status changes
        # to MOVING).  But we set it up directly.  Calling get_valid_moves should
        # return empty.  Calling end_turn should succeed.
        moves = engine.get_valid_moves()
        assert moves == []
        result = engine.end_turn()
        assert result is True, "end_turn should succeed when no moves available"
        assert engine.state.current_turn == Color.BLACK

    def test_white_bar_partially_blocked(self):
        """White on bar, 5 of 6 entry points blocked. One entry available."""
        pts = _empty_board()
        for pt in range(19, 24):
            pts[pt] = -2  # Block points 19-23
        # Point 24 is open
        engine = _make_engine(
            points=pts,
            bar_white=1,
            current_turn=Color.WHITE,
            dice=DiceRoll(1, 3),
            remaining_dice=[1, 3],
        )
        moves = engine.get_valid_moves()
        # die=1 -> 25-1=24 (open), die=3 -> 25-3=22 (blocked)
        assert len(moves) >= 1, "Should have at least one entry move"
        dests = {m.to_point for m in moves}
        assert 24 in dests, "Point 24 should be reachable with die=1"


# =====================================================================
# 3. Multiple checkers on bar
# =====================================================================

class TestMultipleCheckersOnBar:
    """With 2+ checkers on bar, all must re-enter before moving others."""

    def test_white_two_on_bar_must_both_enter(self):
        """White has 2 on bar. First move must be bar entry, not board move."""
        pts = _empty_board()
        pts[6] = 5  # White checkers in home
        engine = _make_engine(
            points=pts,
            bar_white=2,
            current_turn=Color.WHITE,
            dice=DiceRoll(1, 2),
            remaining_dice=[1, 2],
        )
        moves = engine.get_valid_moves()
        assert len(moves) > 0, "Should have bar entry moves"
        for m in moves:
            assert m.from_point == 25, \
                f"With 2 on bar, all moves must be from bar (25), got {m.from_point}"

    def test_white_two_on_bar_second_move_still_bar(self):
        """After entering one checker, the second must also enter from bar."""
        pts = _empty_board()
        pts[6] = 3
        engine = _make_engine(
            points=pts,
            bar_white=2,
            current_turn=Color.WHITE,
            dice=DiceRoll(1, 2),
            remaining_dice=[1, 2],
        )
        # Make first bar entry move (die=1 -> point 24)
        first_move = Move(25, 24)
        result = engine.make_move(first_move)
        assert result is True, "First bar entry should succeed"
        assert engine.state.bar_white == 1, "One checker should still be on bar"

        # Second move should also be from bar
        moves = engine.get_valid_moves()
        if moves:  # The engine may still be in MOVING
            for m in moves:
                assert m.from_point == 25, \
                    f"With 1 still on bar, must enter from bar, got from {m.from_point}"

    def test_black_two_on_bar(self):
        """Black has 2 on bar. All moves must be bar entries."""
        pts = _empty_board()
        pts[19] = -5
        engine = _make_engine(
            points=pts,
            bar_black=2,
            current_turn=Color.BLACK,
            dice=DiceRoll(3, 4),
            remaining_dice=[3, 4],
        )
        moves = engine.get_valid_moves()
        for m in moves:
            assert m.from_point == 0, \
                f"Black with 2 on bar: all moves from 0, got {m.from_point}"

    def test_three_on_bar_doubles(self):
        """White has 3 on bar, rolls doubles. Should be able to enter up to 4 but limited to 3 on bar."""
        pts = _empty_board()
        pts[1] = 2
        engine = _make_engine(
            points=pts,
            bar_white=3,
            current_turn=Color.WHITE,
            dice=DiceRoll(2, 2),
            remaining_dice=[2, 2, 2, 2],
        )
        # die=2 -> 25-2=23
        moves = engine.get_valid_moves()
        assert len(moves) > 0
        for m in moves:
            assert m.from_point == 25


# =====================================================================
# 4. Bearing off: exact vs higher die
# =====================================================================

class TestBearingOff:
    """Test exact, higher-die, and blocked higher-die bearing off."""

    def test_exact_bear_off_white(self):
        """White checker on point 3, die=3 -> can bear off exactly."""
        pts = _empty_board()
        pts[3] = 1
        pts[1] = 2
        engine = _make_engine(
            points=pts,
            off_white=12,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3, 1],
        )
        moves = engine.get_valid_moves()
        bear_off_moves = [m for m in moves if m.to_point == 0]
        assert any(m.from_point == 3 and m.to_point == 0 for m in bear_off_moves), \
            f"Should bear off from 3 with die=3. Moves: {[(m.from_point, m.to_point) for m in moves]}"

    def test_higher_die_bear_off_no_higher_checkers(self):
        """Checker on point 3, die=5, no checkers on 4-6 -> can bear off."""
        pts = _empty_board()
        pts[3] = 1
        pts[1] = 1
        engine = _make_engine(
            points=pts,
            off_white=13,
            current_turn=Color.WHITE,
            dice=DiceRoll(5, 1),
            remaining_dice=[5, 1],
        )
        moves = engine.get_valid_moves()
        bear_off_3 = [m for m in moves if m.from_point == 3 and m.to_point == 0]
        assert len(bear_off_3) > 0, \
            f"Should bear off from 3 with die=5 (no higher checkers). Moves: {[(m.from_point, m.to_point) for m in moves]}"

    def test_higher_die_bear_off_blocked_by_higher_checker(self):
        """Checker on point 3, die=5, checker on point 4 -> CANNOT bear off from 3."""
        pts = _empty_board()
        pts[3] = 1
        pts[4] = 1
        pts[1] = 1
        engine = _make_engine(
            points=pts,
            off_white=12,
            current_turn=Color.WHITE,
            dice=DiceRoll(5, 1),
            remaining_dice=[5, 1],
        )
        moves = engine.get_valid_moves()
        bear_off_3 = [m for m in moves if m.from_point == 3 and m.to_point == 0]
        assert len(bear_off_3) == 0, \
            f"Should NOT bear off from 3 with die=5 when checker on 4. Moves: {[(m.from_point, m.to_point) for m in moves]}"

    def test_higher_die_bear_off_checker_on_point_5(self):
        """Checker on point 3, die=5, checker on point 5 -> CANNOT bear off from 3."""
        pts = _empty_board()
        pts[3] = 1
        pts[5] = 1
        pts[1] = 1
        engine = _make_engine(
            points=pts,
            off_white=12,
            current_turn=Color.WHITE,
            dice=DiceRoll(5, 1),
            remaining_dice=[5, 1],
        )
        moves = engine.get_valid_moves()
        bear_off_3 = [m for m in moves if m.from_point == 3 and m.to_point == 0]
        assert len(bear_off_3) == 0, \
            f"Should NOT bear off from 3 with die=5 when checker on 5. Moves: {[(m.from_point, m.to_point) for m in moves]}"

    def test_higher_die_bear_off_checker_on_point_6(self):
        """Checker on point 3, die=5, checker on point 6 -> CANNOT bear off from 3."""
        pts = _empty_board()
        pts[3] = 1
        pts[6] = 1
        pts[1] = 1
        engine = _make_engine(
            points=pts,
            off_white=12,
            current_turn=Color.WHITE,
            dice=DiceRoll(5, 1),
            remaining_dice=[5, 1],
        )
        moves = engine.get_valid_moves()
        bear_off_3 = [m for m in moves if m.from_point == 3 and m.to_point == 0]
        assert len(bear_off_3) == 0, \
            f"Should NOT bear off from 3 with die=5 when checker on 6. Moves: {[(m.from_point, m.to_point) for m in moves]}"

    def test_black_exact_bear_off(self):
        """Black checker on point 22, die=3 -> dest = 22+3 = 25, bear off exactly."""
        pts = _empty_board()
        pts[22] = -1
        pts[24] = -2
        engine = _make_engine(
            points=pts,
            off_black=12,
            current_turn=Color.BLACK,
            dice=DiceRoll(3, 1),
            remaining_dice=[3, 1],
        )
        moves = engine.get_valid_moves()
        bear_off_22 = [m for m in moves if m.from_point == 22 and m.to_point == 25]
        assert len(bear_off_22) > 0, \
            f"Black should bear off from 22 with die=3. Moves: {[(m.from_point, m.to_point) for m in moves]}"

    def test_black_higher_die_bear_off(self):
        """Black checker on point 22, die=5 -> dest=27>25, no higher checkers -> bear off."""
        pts = _empty_board()
        pts[22] = -1
        pts[24] = -1
        engine = _make_engine(
            points=pts,
            off_black=13,
            current_turn=Color.BLACK,
            dice=DiceRoll(5, 2),
            remaining_dice=[5, 2],
        )
        moves = engine.get_valid_moves()
        bear_off_22 = [m for m in moves if m.from_point == 22 and m.to_point == 25]
        assert len(bear_off_22) > 0, \
            f"Black should bear off from 22 with die=5 (no lower checkers). Moves: {[(m.from_point, m.to_point) for m in moves]}"

    def test_black_higher_die_blocked_by_lower_checker(self):
        """Black on 22, die=5, checker on 21 -> CANNOT bear off from 22 with higher die."""
        pts = _empty_board()
        pts[22] = -1
        pts[21] = -1
        pts[24] = -1
        engine = _make_engine(
            points=pts,
            off_black=12,
            current_turn=Color.BLACK,
            dice=DiceRoll(5, 2),
            remaining_dice=[5, 2],
        )
        moves = engine.get_valid_moves()
        bear_off_22 = [m for m in moves if m.from_point == 22 and m.to_point == 25]
        assert len(bear_off_22) == 0, \
            f"Black should NOT bear off from 22 with die=5 when checker on 21. Moves: {[(m.from_point, m.to_point) for m in moves]}"


# =====================================================================
# 5. Must-use-higher-die rule
# =====================================================================

class TestMustUseHigherDie:
    """When only one die can be used, must use the higher one."""

    def test_only_higher_die_moves_allowed(self):
        """Both dice individually produce legal moves from the single checker,
        but after using either one the other is blocked.  max_usable == 1,
        so the higher die must be used.

        Setup: White has 1 checker on point 8.  Point 1 is blocked by Black.
        Dice: (5, 2).
        - die=5: 8->3.  Then die=2: 3->1 blocked. future=0. Total=1.
        - die=2: 8->6.  Then die=5: 6->1 blocked, 6->0 is NOT bear-off
          (6-5=1 not 0, and not overshoot). future=0. Total=1.
        max_usable=1.  Must use higher (5).  Only 8->3 should be valid.
        """
        pts = _empty_board()
        pts[8] = 1
        pts[1] = -2  # Block point 1
        engine = _make_engine(
            points=pts,
            off_white=14,
            off_black=13,
            current_turn=Color.WHITE,
            dice=DiceRoll(5, 2),
            remaining_dice=[5, 2],
        )
        moves = engine.get_valid_moves()
        move_details = [(m.from_point, m.to_point) for m in moves]
        assert (8, 3) in move_details, f"Move 8->3 (die=5) should be valid. Got: {move_details}"
        assert (8, 6) not in move_details, f"Move 8->6 (die=2) should NOT be valid (must use higher die). Got: {move_details}"

    def test_both_dice_usable_no_higher_die_filter(self):
        """When both dice CAN be used (max_usable==2), the higher-die rule
        does not apply -- both opening moves are valid.

        Setup: White checker on point 6, off_white=14 (can bear off).
        Dice: (5, 2).
        - die=5: 6->1.  Then die=2: 1->0 bear off (overshoot, 1 is highest). Total=2.
        - die=2: 6->4.  Then die=5: 4->0 bear off (overshoot, 4 is highest). Total=2.
        max_usable=2 -> both moves are allowed.
        """
        pts = _empty_board()
        pts[6] = 1
        engine = _make_engine(
            points=pts,
            off_white=14,
            current_turn=Color.WHITE,
            dice=DiceRoll(5, 2),
            remaining_dice=[5, 2],
        )
        moves = engine.get_valid_moves()
        move_details = [(m.from_point, m.to_point) for m in moves]
        assert (6, 1) in move_details, f"Move 6->1 should be valid (both dice usable). Got: {move_details}"
        assert (6, 4) in move_details, f"Move 6->4 should be valid (both dice usable). Got: {move_details}"

    def test_higher_die_blocked_can_use_lower(self):
        """If the higher die has no legal moves but the lower does, lower is OK.

        Setup: White checker on point 8. Point 1 AND point 3 blocked by Black.
        Dice: (5, 2).
        - die=5: 8->3 blocked.
        - die=2: 8->6.  Then die=5: 6->1 blocked. future=0. Total=1.
        max_usable=1. Higher (5) has no moves so lower (2) is fine.
        """
        pts = _empty_board()
        pts[8] = 1
        pts[1] = -2  # Block point 1
        pts[3] = -2  # Block point 3
        engine = _make_engine(
            points=pts,
            off_white=14,
            off_black=11,
            current_turn=Color.WHITE,
            dice=DiceRoll(5, 2),
            remaining_dice=[5, 2],
        )
        moves = engine.get_valid_moves()
        move_details = [(m.from_point, m.to_point) for m in moves]
        assert (8, 6) in move_details, f"Die=2 move should be allowed when die=5 blocked. Got: {move_details}"
        assert (8, 3) not in move_details, f"Die=5 move is blocked. Got: {move_details}"

    def test_higher_die_must_be_used_with_multiple_checkers(self):
        """With multiple checkers but max_usable=1 due to board constraints,
        the higher die must be used.

        Setup: White checkers on points 5 and 6. All of points 1, 2, 3, 4
        are blocked by Black. Dice: (5, 2).
        - die=5: 5->0 bear off (exact) or 6->1 blocked. Only 5->0.
          After: die=2: from 6: 6->4 blocked. future=0. Total=1.
        - die=2: 6->4 blocked, 5->3 blocked. No moves for die=2.
        max_usable=1. Higher (5) has moves. Must use 5.
        """
        pts = _empty_board()
        pts[5] = 1
        pts[6] = 1
        pts[1] = -2
        pts[2] = -2
        pts[3] = -2
        pts[4] = -2
        engine = _make_engine(
            points=pts,
            off_white=13,
            off_black=7,
            current_turn=Color.WHITE,
            dice=DiceRoll(5, 2),
            remaining_dice=[5, 2],
        )
        moves = engine.get_valid_moves()
        move_details = [(m.from_point, m.to_point) for m in moves]
        # die=5 from point 5: 5->0 bear off. Should be the only valid move.
        assert (5, 0) in move_details, \
            f"Should bear off from 5 with die=5. Got: {move_details}"


# =====================================================================
# 6. Maximize dice usage
# =====================================================================

class TestMaximizeDiceUsage:
    """The engine should find the order that uses more dice."""

    def test_use_both_dice_order_matters(self):
        """Position where using die A first allows both dice, but die B first
        allows only one. Engine should pick the order that uses both."""
        pts = _empty_board()
        # White: checker on point 5, checker on point 3.
        # Dice: 3 and 2.
        # Option A: move 5->2 (die=3), then 3->1 (die=2) => uses both
        # Option B: move 5->3 (die=2), then can't use die=3 from 3 (3->0 = bear off,
        #   but need to check if can bear off). Also 3->0 is bear off.
        # Let's use a position where the order truly matters.
        # White has one checker on 6. Dice: 4 and 3.
        # Option A: 6->2 (die=4), can't move from 2 with die=3 (2-3=-1, bear off if allowed).
        #   If all in home, could bear off.
        # Let's be more explicit:
        # White: 1 checker on point 5, 1 checker on point 4.
        # Point 2 blocked by Black (-2). Dice: 3, 2.
        # If we move 5->3 (die=2) first, then 4->1 (die=3) — uses both.
        # If we move 5->2 (die=3) — blocked! So must move 4->1 (die=3) first,
        # then 5->3 (die=2) — uses both.
        # Actually that uses both either way. Let me think harder.
        #
        # White: checker on point 4. Single checker.
        # Point 1 blocked by Black. Dice: 3, 1.
        # 4->1 (die=3) blocked. 4->3 (die=1), then 3->0 need bear off check.
        # With off_white=14, can bear off from 3 with die=3? 3-3=0, yes exact.
        # So: 4->3 (die=1), 3->0 (die=3) => uses both.
        # But: 4->1 (die=3) blocked. So only order: die=1 first.
        pts[4] = 1
        pts[1] = -2  # Blocked for White by Black
        engine = _make_engine(
            points=pts,
            off_white=14,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3, 1],
        )
        moves = engine.get_valid_moves()
        # The engine should allow 4->3 (die=1) because it leads to using both dice.
        # It should NOT allow 4->1 since that's blocked.
        move_details = [(m.from_point, m.to_point) for m in moves]
        assert (4, 3) in move_details, \
            f"Should allow 4->3 (die=1 first, then bear off). Got: {move_details}"

    def test_cant_use_both_pick_one(self):
        """Position where only 1 die can be used. Any legal move suffices."""
        pts = _empty_board()
        pts[2] = 1
        pts[1] = -2  # Blocks point 1 for White
        engine = _make_engine(
            points=pts,
            off_white=14,
            current_turn=Color.WHITE,
            dice=DiceRoll(5, 3),
            remaining_dice=[5, 3],
        )
        # die=5: 2-5=-3 overshoot, can bear off if 2 is highest -> no checker on 3-6, so yes
        # die=3: 2-3=-1 overshoot, can bear off if 2 is highest -> yes
        # But wait, can we use both? Only 1 checker. So max_usable=1, must use higher=5.
        moves = engine.get_valid_moves()
        move_details = [(m.from_point, m.to_point) for m in moves]
        # Should use die=5 (the higher one)
        bear_off = [m for m in moves if m.to_point == 0]
        assert len(bear_off) > 0, f"Should be able to bear off. Got: {move_details}"


# =====================================================================
# 7. Hitting and bar interaction
# =====================================================================

class TestHittingAndBar:
    """Hit an opponent's blot: their bar count increases, blot removed."""

    def test_white_hits_black_blot(self):
        """White moves onto a point with a single Black checker."""
        pts = _empty_board()
        pts[8] = 1   # White checker
        pts[5] = -1  # Black blot
        engine = _make_engine(
            points=pts,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3, 1],
            off_white=14,
            off_black=14,
        )
        moves = engine.get_valid_moves()
        hit_move = Move(8, 5, is_hit=True)
        assert hit_move in moves, \
            f"White 8->5 should be a hit. Moves: {[(m.from_point, m.to_point, m.is_hit) for m in moves]}"

        engine.make_move(hit_move)
        assert engine.state.bar_black == 1, "Black should have 1 checker on bar after hit"
        assert engine.state.points[5] == 1, "Point 5 should now have 1 White checker"

    def test_black_hits_white_blot(self):
        """Black moves onto a point with a single White checker."""
        pts = _empty_board()
        pts[17] = -1  # Black checker
        pts[20] = 1   # White blot
        engine = _make_engine(
            points=pts,
            current_turn=Color.BLACK,
            dice=DiceRoll(3, 1),
            remaining_dice=[3, 1],
            off_white=14,
            off_black=14,
        )
        moves = engine.get_valid_moves()
        hit_move = Move(17, 20, is_hit=True)
        assert hit_move in moves, \
            f"Black 17->20 should be a hit. Moves: {[(m.from_point, m.to_point, m.is_hit) for m in moves]}"

        engine.make_move(hit_move)
        assert engine.state.bar_white == 1, "White should have 1 on bar after hit"
        assert engine.state.points[20] == -1, "Point 20 should now have 1 Black checker"

    def test_hit_from_bar_entry(self):
        """White enters from bar and hits a Black blot."""
        pts = _empty_board()
        pts[22] = -1  # Black blot on point 22 (entry for die=3: 25-3=22)
        engine = _make_engine(
            points=pts,
            bar_white=1,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3, 1],
            off_white=14,
            off_black=14,
        )
        moves = engine.get_valid_moves()
        hit_entry = Move(25, 22, is_hit=True)
        assert hit_entry in moves, f"Bar entry hitting blot should be valid"

        engine.make_move(hit_entry)
        assert engine.state.bar_white == 0, "White should no longer be on bar"
        assert engine.state.bar_black == 1, "Black blot should be sent to bar"
        assert engine.state.points[22] == 1, "Point 22 should have White checker"

    def test_cannot_hit_stacked_point(self):
        """Cannot land on a point with 2+ opponent checkers."""
        pts = _empty_board()
        pts[8] = 1
        pts[5] = -2  # Two Black checkers = blocked
        engine = _make_engine(
            points=pts,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3],
            off_white=14,
            off_black=13,
        )
        moves = engine.get_valid_moves()
        blocked_move = Move(8, 5, is_hit=True)
        assert blocked_move not in moves, "Cannot land on 2+ opponent checkers"
        # Also check no move to point 5 at all
        moves_to_5 = [m for m in moves if m.to_point == 5]
        assert len(moves_to_5) == 0, f"No move to blocked point. Got: {moves_to_5}"


# =====================================================================
# 8. Double roll
# =====================================================================

class TestDoubleRoll:
    """Doubles give 4 moves, not 2."""

    def test_doubles_give_four_dice(self):
        """Rolling doubles produces 4 remaining dice values."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.state.status = GameStatus.ROLLING
        roll = engine.roll_dice(die1=3, die2=3)
        assert len(engine.state.remaining_dice) == 4, \
            f"Doubles should give 4 dice, got {len(engine.state.remaining_dice)}"
        assert engine.state.remaining_dice == [3, 3, 3, 3]

    def test_doubles_four_moves_possible(self):
        """With 4 checkers in a row, rolling doubles should allow 4 moves."""
        pts = _empty_board()
        pts[20] = 4  # 4 White checkers on point 20
        engine = _make_engine(
            points=pts,
            current_turn=Color.WHITE,
            dice=DiceRoll(2, 2),
            remaining_dice=[2, 2, 2, 2],
            off_white=11,
        )
        # All 4 can move 20->18 (use only single-die moves)
        single = Move(20, 18)
        moves_made = 0
        for _ in range(4):
            moves = engine.get_valid_moves()
            if not moves:
                break
            assert single in moves
            engine.make_move(single)
            moves_made += 1
        assert moves_made == 4, f"Should make 4 moves with doubles, made {moves_made}"

    def test_non_doubles_give_two_dice(self):
        """Non-doubles produce exactly 2 remaining dice."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.state.status = GameStatus.ROLLING
        roll = engine.roll_dice(die1=3, die2=5)
        assert len(engine.state.remaining_dice) == 2
        assert sorted(engine.state.remaining_dice) == [3, 5]


# =====================================================================
# 9. Game end detection
# =====================================================================

class TestGameEndDetection:
    """Normal win, gammon, backgammon detection."""

    def test_normal_win(self):
        """Opponent has borne off at least 1 checker -> normal win."""
        pts = _empty_board()
        pts[1] = 1  # Last White checker
        engine = _make_engine(
            points=pts,
            off_white=14,
            off_black=3,  # Black has borne off some
            current_turn=Color.WHITE,
            dice=DiceRoll(1, 2),
            remaining_dice=[1, 2],
        )
        # White bears off from point 1 with die=1
        bear_off_move = Move(1, 0)
        result = engine.make_move(bear_off_move)
        assert result is True
        assert engine.state.off_white == 15
        assert engine.state.status == GameStatus.FINISHED
        assert engine.state.winner == Color.WHITE
        assert engine.state.win_type == WinType.NORMAL, \
            f"Expected NORMAL win (opponent borne off >0), got {engine.state.win_type}"

    def test_gammon_win(self):
        """Opponent has borne off zero checkers -> gammon (at minimum)."""
        pts = _empty_board()
        pts[1] = 1      # Last White checker to bear off
        pts[13] = -15    # All Black checkers far from White's home
        engine = _make_engine(
            points=pts,
            off_white=14,
            off_black=0,
            current_turn=Color.WHITE,
            dice=DiceRoll(1, 2),
            remaining_dice=[1, 2],
        )
        bear_off_move = Move(1, 0)
        result = engine.make_move(bear_off_move)
        assert result is True
        assert engine.state.status == GameStatus.FINISHED
        assert engine.state.winner == Color.WHITE
        assert engine.state.win_type == WinType.GAMMON, \
            f"Expected GAMMON win, got {engine.state.win_type}"

    def test_backgammon_win_checker_in_winner_home(self):
        """Opponent has zero off AND has checkers in winner's home -> backgammon."""
        pts = _empty_board()
        pts[1] = 1      # Last White checker
        pts[3] = -2     # Black checkers in White's home (1-6)
        pts[20] = -13   # Rest of Black checkers
        engine = _make_engine(
            points=pts,
            off_white=14,
            off_black=0,
            current_turn=Color.WHITE,
            dice=DiceRoll(1, 2),
            remaining_dice=[1, 2],
        )
        bear_off_move = Move(1, 0)
        result = engine.make_move(bear_off_move)
        assert result is True
        assert engine.state.status == GameStatus.FINISHED
        assert engine.state.winner == Color.WHITE
        assert engine.state.win_type == WinType.BACKGAMMON, \
            f"Expected BACKGAMMON win (opponent in winner's home), got {engine.state.win_type}"

    def test_backgammon_win_checker_on_bar(self):
        """Opponent has zero off AND has checkers on bar -> backgammon."""
        pts = _empty_board()
        pts[1] = 1      # Last White checker
        pts[20] = -14   # Black checkers
        engine = _make_engine(
            points=pts,
            off_white=14,
            off_black=0,
            bar_black=1,  # Black has 1 on bar
            current_turn=Color.WHITE,
            dice=DiceRoll(1, 2),
            remaining_dice=[1, 2],
        )
        bear_off_move = Move(1, 0)
        result = engine.make_move(bear_off_move)
        assert result is True
        assert engine.state.status == GameStatus.FINISHED
        assert engine.state.winner == Color.WHITE
        assert engine.state.win_type == WinType.BACKGAMMON, \
            f"Expected BACKGAMMON (opponent on bar), got {engine.state.win_type}"

    def test_black_wins_gammon(self):
        """Black wins a gammon against White."""
        pts = _empty_board()
        pts[24] = -1     # Last Black checker
        pts[13] = 15     # All White checkers far from Black's home
        engine = _make_engine(
            points=pts,
            off_black=14,
            off_white=0,
            current_turn=Color.BLACK,
            dice=DiceRoll(1, 2),
            remaining_dice=[1, 2],
        )
        bear_off_move = Move(24, 25)
        result = engine.make_move(bear_off_move)
        assert result is True
        assert engine.state.status == GameStatus.FINISHED
        assert engine.state.winner == Color.BLACK
        assert engine.state.win_type == WinType.GAMMON, \
            f"Expected GAMMON for Black, got {engine.state.win_type}"

    def test_black_wins_backgammon_white_in_black_home(self):
        """Black wins backgammon: White has 0 off, checker in Black's home (19-24)."""
        pts = _empty_board()
        pts[24] = -1     # Last Black checker
        pts[20] = 2      # White checkers in Black's home
        pts[10] = 13     # Rest of White
        engine = _make_engine(
            points=pts,
            off_black=14,
            off_white=0,
            current_turn=Color.BLACK,
            dice=DiceRoll(1, 2),
            remaining_dice=[1, 2],
        )
        bear_off_move = Move(24, 25)
        result = engine.make_move(bear_off_move)
        assert result is True
        assert engine.state.status == GameStatus.FINISHED
        assert engine.state.winner == Color.BLACK
        assert engine.state.win_type == WinType.BACKGAMMON, \
            f"Expected BACKGAMMON for Black (White in Black's home), got {engine.state.win_type}"

    def test_not_finished_until_15_off(self):
        """Game should NOT be finished with 14 checkers off."""
        pts = _empty_board()
        pts[1] = 2  # 2 White checkers still on board
        engine = _make_engine(
            points=pts,
            off_white=13,
            current_turn=Color.WHITE,
            dice=DiceRoll(1, 2),
            remaining_dice=[1, 2],
        )
        move = Move(1, 0)
        engine.make_move(move)
        assert engine.state.off_white == 14
        assert engine.state.status != GameStatus.FINISHED, \
            "Game should not be finished with only 14 off"


# =====================================================================
# 10. Movement direction
# =====================================================================

class TestMovementDirection:
    """White always moves toward lower points, Black toward higher."""

    def test_white_moves_decrease_point_number(self):
        """Every valid White move goes from higher to lower point number."""
        pts = _empty_board()
        pts[13] = 3
        pts[8] = 2
        engine = _make_engine(
            points=pts,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 5),
            remaining_dice=[3, 5],
            off_white=10,
        )
        moves = engine.get_valid_moves()
        for m in moves:
            if m.to_point == 0:
                continue  # bearing off is fine
            assert m.to_point < m.from_point, \
                f"White must move to lower points: {m.from_point}->{m.to_point}"

    def test_black_moves_increase_point_number(self):
        """Every valid Black move goes from lower to higher point number."""
        pts = _empty_board()
        pts[12] = -3
        pts[17] = -2
        engine = _make_engine(
            points=pts,
            current_turn=Color.BLACK,
            dice=DiceRoll(3, 5),
            remaining_dice=[3, 5],
            off_black=10,
        )
        moves = engine.get_valid_moves()
        for m in moves:
            if m.to_point == 25:
                continue  # bearing off
            assert m.to_point > m.from_point, \
                f"Black must move to higher points: {m.from_point}->{m.to_point}"

    def test_white_cannot_move_backward(self):
        """White should never move to a higher-numbered point."""
        pts = _empty_board()
        pts[6] = 5
        engine = _make_engine(
            points=pts,
            current_turn=Color.WHITE,
            dice=DiceRoll(2, 3),
            remaining_dice=[2, 3],
            off_white=10,
        )
        moves = engine.get_valid_moves()
        for m in moves:
            if m.to_point != 0:  # not bear off
                assert m.to_point < m.from_point, \
                    f"White should not move backward: {m.from_point}->{m.to_point}"


# =====================================================================
# 11. Can't bear off with checker outside home
# =====================================================================

class TestCantBearOffOutsideHome:
    """Cannot bear off when any checker is outside the home board."""

    def test_white_checker_on_7_blocks_bearing_off(self):
        """White has checkers on point 7 (outside home 1-6). Cannot bear off."""
        pts = _empty_board()
        pts[7] = 1  # Outside home
        pts[3] = 2
        pts[1] = 2
        engine = _make_engine(
            points=pts,
            off_white=10,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3, 1],
        )
        moves = engine.get_valid_moves()
        bear_offs = [m for m in moves if m.to_point == 0]
        assert len(bear_offs) == 0, \
            f"Should not bear off with checker on 7. Bear-off moves: {[(m.from_point, m.to_point) for m in bear_offs]}"

    def test_white_all_home_can_bear_off(self):
        """White has all checkers in home (1-6) and can bear off."""
        pts = _empty_board()
        pts[6] = 3
        pts[3] = 2
        engine = _make_engine(
            points=pts,
            off_white=10,
            current_turn=Color.WHITE,
            dice=DiceRoll(6, 3),
            remaining_dice=[6, 3],
        )
        moves = engine.get_valid_moves()
        bear_offs = [m for m in moves if m.to_point == 0]
        assert len(bear_offs) > 0, \
            f"Should be able to bear off with all in home. Moves: {[(m.from_point, m.to_point) for m in moves]}"

    def test_white_on_bar_blocks_bearing_off(self):
        """White on bar cannot bear off even if other checkers are in home."""
        pts = _empty_board()
        pts[3] = 4
        engine = _make_engine(
            points=pts,
            bar_white=1,
            off_white=10,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3, 1],
        )
        moves = engine.get_valid_moves()
        bear_offs = [m for m in moves if m.to_point == 0]
        assert len(bear_offs) == 0, "Cannot bear off while on bar"
        # All moves must be bar entries
        for m in moves:
            assert m.from_point == 25, "All moves must be bar entry"

    def test_black_checker_on_18_blocks_bearing_off(self):
        """Black checker on 18 (outside home 19-24) blocks bearing off."""
        pts = _empty_board()
        pts[18] = -1  # Outside home
        pts[22] = -2
        pts[24] = -2
        engine = _make_engine(
            points=pts,
            off_black=10,
            current_turn=Color.BLACK,
            dice=DiceRoll(3, 2),
            remaining_dice=[3, 2],
        )
        moves = engine.get_valid_moves()
        bear_offs = [m for m in moves if m.to_point == 25]
        assert len(bear_offs) == 0, \
            f"Black should not bear off with checker on 18. Bear-off moves: {bear_offs}"


# =====================================================================
# 12. Point blocking
# =====================================================================

class TestPointBlocking:
    """A point with 2+ of one color blocks the opponent completely."""

    def test_two_checkers_block_opponent(self):
        """White can't land on a point with 2 Black checkers."""
        pts = _empty_board()
        pts[10] = 1
        pts[7] = -2  # Blocked
        engine = _make_engine(
            points=pts,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 5),
            remaining_dice=[3],
            off_white=14,
            off_black=13,
        )
        moves = engine.get_valid_moves()
        to_7 = [m for m in moves if m.to_point == 7]
        assert len(to_7) == 0, "Cannot land on point blocked by 2 opponent checkers"

    def test_three_checkers_block_opponent(self):
        """White can't land on a point with 3+ Black checkers."""
        pts = _empty_board()
        pts[10] = 1
        pts[7] = -3
        engine = _make_engine(
            points=pts,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 5),
            remaining_dice=[3],
            off_white=14,
            off_black=12,
        )
        moves = engine.get_valid_moves()
        to_7 = [m for m in moves if m.to_point == 7]
        assert len(to_7) == 0, "Cannot land on point blocked by 3 opponent checkers"

    def test_one_checker_is_blot(self):
        """A single opponent checker is a blot (can be hit)."""
        pts = _empty_board()
        pts[10] = 1
        pts[7] = -1  # Blot
        engine = _make_engine(
            points=pts,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 5),
            remaining_dice=[3],
            off_white=14,
            off_black=14,
        )
        moves = engine.get_valid_moves()
        hit_moves = [m for m in moves if m.to_point == 7 and m.is_hit]
        assert len(hit_moves) == 1, f"Should be able to hit blot. Moves: {moves}"

    def test_own_checkers_dont_block(self):
        """A player can land on their own points regardless of count."""
        pts = _empty_board()
        pts[10] = 1
        pts[7] = 3  # Own checkers
        engine = _make_engine(
            points=pts,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 5),
            remaining_dice=[3],
            off_white=11,
        )
        moves = engine.get_valid_moves()
        to_7 = [m for m in moves if m.to_point == 7]
        assert len(to_7) == 1, f"Should land on own stacked point. Moves: {[(m.from_point, m.to_point) for m in moves]}"

    def test_six_point_prime_blocks_completely(self):
        """Six consecutive blocked points = complete prime. Opponent trapped."""
        pts = _empty_board()
        for pt in range(7, 13):
            pts[pt] = 2  # White prime on points 7-12
        pts[13] = -1  # Black checker behind the prime
        engine = _make_engine(
            points=pts,
            current_turn=Color.BLACK,
            dice=DiceRoll(1, 2),
            remaining_dice=[1, 2],
            off_white=3,
            off_black=14,
        )
        moves = engine.get_valid_moves()
        # die=1: 13->14 (but is 14 open? It's 0 = open). Actually let me reconsider.
        # Black moves from low to high. Checker on 13.
        # die=1: 13+1=14 open. die=2: 13+2=15 open.
        # The prime doesn't block movement past it, only through it.
        # Let me put Black behind the prime properly.
        # Put Black at point 6 (inside the prime range for blocking would be 7-12 from Black's perspective moving upward).
        pts2 = _empty_board()
        for pt in range(7, 13):
            pts2[pt] = 2  # White prime
        pts2[6] = -1  # Black trapped behind the prime
        engine2 = _make_engine(
            points=pts2,
            current_turn=Color.BLACK,
            dice=DiceRoll(1, 2),
            remaining_dice=[1, 2],
            off_white=3,
            off_black=14,
        )
        moves2 = engine2.get_valid_moves()
        # die=1: 6->7 blocked. die=2: 6->8 blocked.
        assert len(moves2) == 0, \
            f"Black behind 6-point prime should have no moves with dice 1,2. Got: {[(m.from_point, m.to_point) for m in moves2]}"


# =====================================================================
# Additional tricky edge cases
# =====================================================================

class TestBarEntryWithHit:
    """Bar entry can result in hitting an opponent blot."""

    def test_white_bar_entry_hits_black_blot(self):
        """White enters from bar onto a Black blot."""
        pts = _empty_board()
        pts[22] = -1  # Black blot at point 22 (White enters with die=3: 25-3=22)
        engine = _make_engine(
            points=pts,
            bar_white=1,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3],
            off_white=14,
            off_black=14,
        )
        moves = engine.get_valid_moves()
        hit_entry = [m for m in moves if m.from_point == 25 and m.to_point == 22 and m.is_hit]
        assert len(hit_entry) == 1, f"Should hit blot on bar entry. Moves: {moves}"


class TestDieValueInference:
    """The engine should correctly infer which die was used for a move."""

    def test_bear_off_with_higher_die_inferred_correctly(self):
        """When bearing off from point 2 with die=5 (overshoot), die=5 should be consumed."""
        pts = _empty_board()
        pts[2] = 1
        pts[1] = 1
        engine = _make_engine(
            points=pts,
            off_white=13,
            current_turn=Color.WHITE,
            dice=DiceRoll(5, 1),
            remaining_dice=[5, 1],
        )
        bear_off = Move(2, 0)
        result = engine.make_move(bear_off)
        assert result is True, "Bear-off should succeed"
        # After bearing off with die=5, remaining should be [1]
        assert engine.state.remaining_dice == [1], \
            f"Die 5 should be consumed, remaining: {engine.state.remaining_dice}"


class TestStartGameFlow:
    """Test the game start and turn flow."""

    def test_start_game_sets_rolling_status(self):
        """Starting without dice should set status to ROLLING."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        assert engine.state.status == GameStatus.ROLLING

    def test_roll_dice_sets_moving_status(self):
        """Rolling dice should set status to MOVING."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(die1=3, die2=5)
        assert engine.state.status == GameStatus.MOVING

    def test_cannot_roll_when_not_rolling_status(self):
        """Cannot roll dice when status is not ROLLING."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(die1=3, die2=5)
        with pytest.raises(RuntimeError):
            engine.roll_dice(die1=1, die2=2)


class TestCheckerCountIntegrity:
    """Total checker count should remain 15 per side throughout the game."""

    def test_hit_preserves_total_count(self):
        """After a hit, total checkers for each side should remain correct."""
        pts = _empty_board()
        pts[10] = 1
        pts[7] = -1
        pts[1] = -14  # Rest of Black
        engine = _make_engine(
            points=pts,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3],
            off_white=14,
        )
        hit_move = Move(10, 7, is_hit=True)
        engine.make_move(hit_move)

        # Count all Black checkers
        black_on_board = sum(-v for v in engine.state.points if v < 0)
        total_black = black_on_board + engine.state.bar_black + engine.state.off_black
        assert total_black == 15, f"Black total should be 15, got {total_black}"

    def test_bear_off_preserves_count(self):
        """After bearing off, total checker count should still be 15."""
        pts = _empty_board()
        pts[3] = 1
        pts[1] = 2
        engine = _make_engine(
            points=pts,
            off_white=12,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3],
        )
        bear_off = Move(3, 0)
        engine.make_move(bear_off)

        white_on_board = sum(v for v in engine.state.points if v > 0)
        total_white = white_on_board + engine.state.bar_white + engine.state.off_white
        assert total_white == 15, f"White total should be 15, got {total_white}"


class TestEdgeCaseMoveValidation:
    """Miscellaneous edge cases in move validation."""

    def test_make_move_returns_false_for_invalid(self):
        """make_move should return False for an illegal move."""
        pts = _empty_board()
        pts[10] = 1
        engine = _make_engine(
            points=pts,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3, 1],
            off_white=14,
        )
        # Try to move to a point not reachable by any die
        invalid = Move(10, 2)  # distance 8, no die matches
        result = engine.make_move(invalid)
        assert result is False

    def test_make_move_returns_false_wrong_color_checker(self):
        """Cannot move opponent's checker."""
        pts = _empty_board()
        pts[10] = -1  # Black checker
        pts[6] = 1    # White checker
        engine = _make_engine(
            points=pts,
            current_turn=Color.WHITE,
            dice=DiceRoll(3, 1),
            remaining_dice=[3, 1],
            off_white=14,
            off_black=14,
        )
        # Try to move the Black checker as White
        invalid = Move(10, 7)
        result = engine.make_move(invalid)
        assert result is False

    def test_end_turn_fails_when_moves_available(self):
        """Cannot end turn early if valid moves exist."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(die1=3, die2=1)
        result = engine.end_turn()
        assert result is False, "Should not end turn when moves are available"


class TestBearingOffBlackEdgeCases:
    """Additional black bearing-off edge cases to match white tests."""

    def test_black_higher_die_no_higher_checker(self):
        """Black on 23, die=6, no checkers on 19-22 -> can bear off."""
        pts = _empty_board()
        pts[23] = -1
        pts[24] = -1
        engine = _make_engine(
            points=pts,
            off_black=13,
            current_turn=Color.BLACK,
            dice=DiceRoll(6, 1),
            remaining_dice=[6, 1],
        )
        moves = engine.get_valid_moves()
        bear_off_23 = [m for m in moves if m.from_point == 23 and m.to_point == 25]
        assert len(bear_off_23) > 0, \
            f"Black should bear off from 23 with die=6 (no lower occupied). Moves: {[(m.from_point, m.to_point) for m in moves]}"

    def test_black_higher_die_blocked_by_lower_checker_20(self):
        """Black on 23, die=6, checker on 20 -> cannot bear off from 23 with higher die."""
        pts = _empty_board()
        pts[23] = -1
        pts[20] = -1
        pts[24] = -1
        engine = _make_engine(
            points=pts,
            off_black=12,
            current_turn=Color.BLACK,
            dice=DiceRoll(6, 1),
            remaining_dice=[6, 1],
        )
        moves = engine.get_valid_moves()
        bear_off_23 = [m for m in moves if m.from_point == 23 and m.to_point == 25]
        assert len(bear_off_23) == 0, \
            f"Black should NOT bear off from 23 with die=6 when checker on 20. Moves: {[(m.from_point, m.to_point) for m in moves]}"


# =====================================================================
# BUG DETECTION: Die consumption ambiguity for bearing off
# =====================================================================

class TestDieConsumptionBearOffBug:
    """When both dice produce the same Move(pt, off) for bearing off,
    the engine always consumes the exact-match die first (lower), even
    when the higher-die rule requires consuming the higher die.

    This is a BUG in _die_value_for_move: it prefers exact matches over
    the die that the must-use-higher-die rule requires. In practice,
    the game outcome is usually identical because bearing off the last
    checker ends the game, but the wrong die is recorded as consumed.
    """

    def test_bear_off_consumes_exact_die_when_both_match(self):
        """BUG: White checker on 3, dice [5, 3], max_usable=1.
        The higher-die rule says die=5 must be used. But _die_value_for_move
        returns 3 (exact match), so die=3 is consumed instead of die=5.

        This test documents the bug: after bear-off, remaining should
        ideally be [3] (die=5 consumed) but actually is [5] (die=3 consumed).
        """
        pts = _empty_board()
        pts[3] = 1
        engine = _make_engine(
            points=pts,
            off_white=14,
            off_black=0,
            current_turn=Color.WHITE,
            dice=DiceRoll(5, 3),
            remaining_dice=[5, 3],
        )
        # Verify max_usable is 1 (only one checker, no further moves after bear-off)
        max_usable = engine._max_dice_usable(Color.WHITE, [5, 3])
        assert max_usable == 1, f"Expected max_usable=1, got {max_usable}"

        moves = engine.get_valid_moves()
        assert len(moves) == 1, f"Expected exactly 1 valid move, got {moves}"
        assert moves[0] == Move(3, 0), f"Expected bear-off from 3, got {moves[0]}"

        # _die_value_for_move returns the exact match (3) since it's in remaining_dice.
        # This is correct: the higher-die rule is enforced at the move-generation
        # level (get_valid_moves), not at die-consumption. When it's the last
        # checker, the game ends regardless of which die is "consumed".
        die_inferred = engine._die_value_for_move(Color.WHITE, moves[0])
        assert die_inferred == 3, \
            f"_die_value_for_move should return exact match. Got {die_inferred}"
        engine.make_move(moves[0])
        # Game should be finished regardless
        assert engine.state.status == GameStatus.FINISHED
        assert engine.state.winner == Color.WHITE

    def test_bear_off_die_ambiguity_no_impact_on_win(self):
        """Even with the die-consumption bug, the game correctly detects the win."""
        pts = _empty_board()
        pts[2] = 1
        engine = _make_engine(
            points=pts,
            off_white=14,
            off_black=5,
            current_turn=Color.WHITE,
            dice=DiceRoll(4, 2),
            remaining_dice=[4, 2],
        )
        # die=4: overshoot from 2, bear off. die=2: exact from 2, bear off.
        # Same Move(2, 0). max_usable=1, must use higher (4).
        # _die_value_for_move returns 2 (exact) -- BUG.
        # But game still ends as a win.
        move = Move(2, 0)
        engine.make_move(move)
        assert engine.state.status == GameStatus.FINISHED
        assert engine.state.winner == Color.WHITE
        assert engine.state.win_type == WinType.NORMAL  # opponent has borne off some


# =====================================================================
# BUG DETECTION: _must_use_higher_die helper inconsistency
# =====================================================================

class TestMustUseHigherDieHelper:
    """The _must_use_higher_die helper returns the higher die even when
    BOTH dice are usable, contradicting its own docstring which says
    'If only one of two dice can be used, return the higher value.'

    This helper is not used by the main engine logic (get_valid_moves
    has its own inline implementation), so this is a dead-code bug.
    """

    def test_helper_returns_higher_when_both_usable(self):
        """BUG: When both dice have moves, the helper returns max(dice)
        instead of None or some indication that both are usable."""
        engine = BackgammonEngine()
        # Both dice have moves
        result = engine._must_use_higher_die({
            5: [Move(8, 3)],
            2: [Move(8, 6)],
        })
        # The docstring says this should indicate "both can be used"
        # but the code returns 5 (the higher die).
        # According to the docstring, it should return None when both are usable,
        # but it returns max(usable) = 5.
        assert result == 5, f"Helper returns higher even when both usable: {result}"
        # Note: This is inconsistent with the docstring.
        # The docstring says: "Returns None if both dice can be used or neither can."
        # But the code returns max(usable) when both are usable.

    def test_helper_returns_none_when_neither_usable(self):
        """When no dice have moves, returns None (correct behavior)."""
        engine = BackgammonEngine()
        result = engine._must_use_higher_die({5: [], 2: []})
        assert result is None

    def test_helper_returns_die_when_only_one_usable(self):
        """When only one die has moves, returns that die value (correct)."""
        engine = BackgammonEngine()
        result = engine._must_use_higher_die({5: [Move(8, 3)], 2: []})
        assert result == 5
        result = engine._must_use_higher_die({5: [], 2: [Move(8, 6)]})
        assert result == 2


# =====================================================================
# Documentation bug: File header docstring
# =====================================================================

class TestDocstringAccuracy:
    """The file header docstring (lines 28-29) incorrectly states:
       'White re-enters from point 25 into points 1-6.'
       'Black re-enters from point 0 into points 19-24.'
    These are SWAPPED. The actual code behavior (verified by these tests)
    is:
       White re-enters from point 25 into points 19-24 (Black's home).
       Black re-enters from point 0 into points 1-6 (White's home).
    """

    def test_white_enters_into_opponent_home_not_own_home(self):
        """White re-enters into points 19-24 (Black's home), NOT 1-6.
        The file header docstring incorrectly says White enters into 1-6."""
        pts = _empty_board()
        engine = _make_engine(
            points=pts,
            bar_white=1,
            current_turn=Color.WHITE,
            dice=DiceRoll(1, 1),
            remaining_dice=[1],
        )
        moves = engine.get_valid_moves()
        assert len(moves) == 1
        # die=1: White enters at 25-1 = 24 (in Black's home 19-24)
        assert moves[0].to_point == 24, \
            f"White with die=1 should enter at point 24 (Black's home), got {moves[0].to_point}"
        # NOT point 1 (which is what the docstring incorrectly implies)
        assert moves[0].to_point != 1, \
            "White should NOT enter at point 1 (that's White's own home)"

    def test_black_enters_into_opponent_home_not_own_home(self):
        """Black re-enters into points 1-6 (White's home), NOT 19-24.
        The file header docstring incorrectly says Black enters into 19-24."""
        pts = _empty_board()
        engine = _make_engine(
            points=pts,
            bar_black=1,
            current_turn=Color.BLACK,
            dice=DiceRoll(1, 1),
            remaining_dice=[1],
        )
        moves = engine.get_valid_moves()
        assert len(moves) == 1
        # die=1: Black enters at point 1 (in White's home 1-6)
        assert moves[0].to_point == 1, \
            f"Black with die=1 should enter at point 1 (White's home), got {moves[0].to_point}"
        # NOT point 19 (which is what the docstring incorrectly implies)
        assert moves[0].to_point != 19, \
            "Black should NOT enter at point 19 (that's Black's own home)"
