"""
Comprehensive tests for the Backgammon Game Engine.
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
    moves_to_notation,
)


# -----------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------

def make_engine(**overrides) -> BackgammonEngine:
    """Create an engine and optionally override state fields."""
    engine = BackgammonEngine()
    for key, value in overrides.items():
        setattr(engine.state, key, value)
    return engine


def empty_board() -> list[int]:
    """Return a 26-element list of zeroes (empty board)."""
    return [0] * 26


def setup_engine_for_move(points: list[int],
                          turn: Color = Color.WHITE,
                          die1: int = 3, die2: int = 1,
                          bar_white: int = 0,
                          bar_black: int = 0,
                          off_white: int = 0,
                          off_black: int = 0) -> BackgammonEngine:
    """Create an engine with a custom board ready for moving."""
    engine = BackgammonEngine()
    engine.state.points = list(points)
    engine.state.current_turn = turn
    engine.state.bar_white = bar_white
    engine.state.bar_black = bar_black
    engine.state.off_white = off_white
    engine.state.off_black = off_black
    engine.state.dice = DiceRoll(die1, die2)
    engine.state.remaining_dice = list(DiceRoll(die1, die2).values)
    engine.state.status = GameStatus.MOVING
    return engine


# -----------------------------------------------------------------------
# 1. Initial board setup
# -----------------------------------------------------------------------

class TestInitialSetup:
    def test_white_checkers_placement(self):
        engine = BackgammonEngine()
        assert engine.state.points[24] == 2
        assert engine.state.points[13] == 5
        assert engine.state.points[8] == 3
        assert engine.state.points[6] == 5

    def test_black_checkers_placement(self):
        engine = BackgammonEngine()
        assert engine.state.points[1] == -2
        assert engine.state.points[12] == -5
        assert engine.state.points[17] == -3
        assert engine.state.points[19] == -5

    def test_total_checkers(self):
        engine = BackgammonEngine()
        white_total = sum(v for v in engine.state.points if v > 0)
        black_total = sum(-v for v in engine.state.points if v < 0)
        assert white_total == 15
        assert black_total == 15

    def test_bar_and_off_empty(self):
        engine = BackgammonEngine()
        assert engine.state.bar_white == 0
        assert engine.state.bar_black == 0
        assert engine.state.off_white == 0
        assert engine.state.off_black == 0

    def test_initial_status(self):
        engine = BackgammonEngine()
        assert engine.state.status == GameStatus.WAITING


# -----------------------------------------------------------------------
# 2. Dice rolling
# -----------------------------------------------------------------------

class TestDiceRoll:
    def test_roll_values_non_doubles(self):
        roll = DiceRoll(3, 5)
        assert roll.values == [3, 5]

    def test_roll_values_doubles(self):
        roll = DiceRoll(4, 4)
        assert roll.values == [4, 4, 4, 4]

    def test_roll_dice_sets_state(self):
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.state.status = GameStatus.ROLLING
        roll = engine.roll_dice(die1=3, die2=5)
        assert roll.die1 == 3
        assert roll.die2 == 5
        assert engine.state.remaining_dice == [3, 5]

    def test_cannot_roll_when_moving(self):
        engine = BackgammonEngine()
        engine.state.status = GameStatus.MOVING
        with pytest.raises(RuntimeError):
            engine.roll_dice()

    def test_determine_first_player_no_doubles(self):
        # Repeat a few times to ensure no doubles are returned.
        for _ in range(50):
            color, roll, opening = BackgammonEngine.determine_first_player()
            assert roll.die1 != roll.die2
            # Higher individual die determines who goes first
            if opening["white"] > opening["black"]:
                assert color == Color.WHITE
            else:
                assert color == Color.BLACK


# -----------------------------------------------------------------------
# 3. Basic moves
# -----------------------------------------------------------------------

class TestBasicMoves:
    def test_simple_white_move(self):
        """White moves a checker from point 13 to point 10 with a 3."""
        board = empty_board()
        board[13] = 2  # two white checkers
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=13)
        moves = engine.get_valid_moves()
        assert Move(13, 10) in moves

    def test_simple_black_move(self):
        """Black moves from point 12 to point 15 with a 3."""
        board = empty_board()
        board[12] = -2
        engine = setup_engine_for_move(board, Color.BLACK, die1=3, die2=1,
                                       off_black=13)
        moves = engine.get_valid_moves()
        assert Move(12, 15) in moves

    def test_make_move_updates_board(self):
        board = empty_board()
        board[13] = 1
        board[6] = 5
        board[5] = 5
        board[4] = 4  # 15 total white in home or elsewhere
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1)
        engine.make_move(Move(13, 10))
        assert engine.state.points[13] == 0
        assert engine.state.points[10] == 1

    def test_move_returns_false_for_invalid(self):
        board = empty_board()
        board[13] = 1
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        result = engine.make_move(Move(20, 17))  # no checker there
        assert result is False


# -----------------------------------------------------------------------
# 4. Hitting and bar re-entry
# -----------------------------------------------------------------------

class TestHitting:
    def test_hit_move_detected(self):
        board = empty_board()
        board[13] = 1   # white
        board[10] = -1   # lone black (blot)
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        moves = engine.get_valid_moves()
        hit_move = Move(13, 10, is_hit=True)
        assert hit_move in moves

    def test_hit_sends_to_bar(self):
        board = empty_board()
        board[13] = 1
        board[10] = -1
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        engine.make_move(Move(13, 10, is_hit=True))
        assert engine.state.points[10] == 1  # white now
        assert engine.state.bar_black == 1

    def test_white_bar_reentry(self):
        board = empty_board()
        board[6] = 5
        board[5] = 5
        board[4] = 4
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       bar_white=1)
        moves = engine.get_valid_moves()
        # White enters from bar(25) into Black's home: 25-die
        # die=3 → point 22, die=1 → point 24
        assert Move(25, 22) in moves or Move(25, 24) in moves

    def test_black_bar_reentry(self):
        board = empty_board()
        board[19] = -5
        board[20] = -5
        board[21] = -4
        engine = setup_engine_for_move(board, Color.BLACK, die1=3, die2=1,
                                       bar_black=1)
        moves = engine.get_valid_moves()
        # Black enters from bar(0) into White's home: die
        # die=3 → point 3, die=1 → point 1
        assert Move(0, 3) in moves or Move(0, 1) in moves

    def test_bar_entry_blocked(self):
        """If all entry points are blocked, no moves available."""
        board = empty_board()
        # Block all points 19-24 with 2+ black checkers (Black's home, where White enters)
        for pt in range(19, 25):
            board[pt] = -2
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=5,
                                       bar_white=1, off_black=3)
        moves = engine.get_valid_moves()
        assert moves == []

    def test_must_enter_from_bar_before_moving(self):
        """Player with checkers on bar can only make bar-entry moves."""
        board = empty_board()
        board[13] = 3
        board[6] = 5
        board[5] = 5
        board[4] = 1
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       bar_white=1)
        moves = engine.get_valid_moves()
        for m in moves:
            assert m.from_point == 25  # all moves must be from bar


# -----------------------------------------------------------------------
# 5. Blocking
# -----------------------------------------------------------------------

class TestBlocking:
    def test_cannot_land_on_blocked_point(self):
        board = empty_board()
        board[13] = 1  # white
        board[10] = -2  # two black checkers -- blocked for white
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        moves = engine.get_valid_moves()
        assert Move(13, 10) not in moves
        assert Move(13, 10, is_hit=True) not in moves

    def test_can_land_on_own_checkers(self):
        board = empty_board()
        board[13] = 1
        board[10] = 3  # own checkers
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=11)
        moves = engine.get_valid_moves()
        assert Move(13, 10) in moves

    def test_six_prime_blocks_all(self):
        """A six-point prime blocks all passage."""
        board = empty_board()
        board[12] = -1  # black trying to move
        for pt in range(13, 19):
            board[pt] = 2  # white prime on 13-18
        engine = setup_engine_for_move(board, Color.BLACK, die1=3, die2=5,
                                       off_black=14)
        moves = engine.get_valid_moves()
        assert moves == []


# -----------------------------------------------------------------------
# 6. Bearing off
# -----------------------------------------------------------------------

class TestBearingOff:
    def test_can_bear_off_exact(self):
        """Bear off from point 3 with a die of 3."""
        board = empty_board()
        board[3] = 2
        board[1] = 5
        board[2] = 5
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=3)
        assert engine._check_can_bear_off(Color.WHITE)
        moves = engine.get_valid_moves()
        assert Move(3, 0) in moves

    def test_bear_off_from_lower_point_with_high_die(self):
        """Die is 6, highest occupied point is 3 -- allowed."""
        board = empty_board()
        board[3] = 2
        board[1] = 3
        engine = setup_engine_for_move(board, Color.WHITE, die1=6, die2=1,
                                       off_white=10)
        moves = engine.get_valid_moves()
        assert Move(3, 0) in moves

    def test_cannot_bear_off_from_lower_if_higher_occupied(self):
        """Die is 6, point 3 has checkers, but point 5 also has checkers."""
        board = empty_board()
        board[5] = 2
        board[3] = 2
        board[1] = 3
        engine = setup_engine_for_move(board, Color.WHITE, die1=6, die2=1,
                                       off_white=8)
        moves = engine.get_valid_moves()
        bear_off_3 = Move(3, 0)
        assert bear_off_3 not in moves
        # But bearing off from 5 should also not work (die=6, exact=5 -> dest=-1<0)
        # Actually die=6 from pt5 gives dest = 5-6 = -1 < 0 => qualifies for
        # overshoot rule, and pt5 IS the highest => should be allowed.
        assert Move(5, 0) in moves

    def test_cannot_bear_off_with_checker_outside_home(self):
        board = empty_board()
        board[3] = 2
        board[10] = 1  # outside home
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=12)
        assert not engine._check_can_bear_off(Color.WHITE)

    def test_bear_off_black(self):
        """Black bears off from point 22 with die=3 (22+3=25=off)."""
        board = empty_board()
        board[22] = -2
        board[24] = -5
        board[23] = -5
        engine = setup_engine_for_move(board, Color.BLACK, die1=3, die2=1,
                                       off_black=3)
        moves = engine.get_valid_moves()
        assert Move(22, 25) in moves

    def test_bear_off_completes_game(self):
        """Bearing off the last checker wins."""
        board = empty_board()
        board[1] = 1  # last white checker
        engine = setup_engine_for_move(board, Color.WHITE, die1=1, die2=2,
                                       off_white=14)
        engine.make_move(Move(1, 0))
        assert engine.state.status == GameStatus.FINISHED
        assert engine.state.winner == Color.WHITE


# -----------------------------------------------------------------------
# 7. Doubles
# -----------------------------------------------------------------------

class TestDoubles:
    def test_doubles_give_four_moves(self):
        roll = DiceRoll(3, 3)
        assert roll.values == [3, 3, 3, 3]

    def test_can_use_all_four_doubles(self):
        board = empty_board()
        board[13] = 5
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=3,
                                       off_white=10)
        assert len(engine.state.remaining_dice) == 4
        # Make 4 moves
        engine.make_move(Move(13, 10))
        assert len(engine.state.remaining_dice) == 3
        engine.make_move(Move(13, 10))
        assert len(engine.state.remaining_dice) == 2
        engine.make_move(Move(13, 10))
        assert len(engine.state.remaining_dice) == 1
        engine.make_move(Move(13, 10))
        assert len(engine.state.remaining_dice) == 0


# -----------------------------------------------------------------------
# 8. Force higher die rule
# -----------------------------------------------------------------------

class TestForceHigherDie:
    def test_must_use_higher_die_when_only_one_possible(self):
        """If only die=5 or die=3 can be used (not both), must use 5."""
        board = empty_board()
        board[6] = 1  # white checker
        board[10] = 1  # checker outside home prevents bearing off
        board[3] = -2  # blocks 6->3 (die=3)
        board[1] = 0   # open
        engine = setup_engine_for_move(board, Color.WHITE, die1=5, die2=3,
                                       off_white=13)
        moves = engine.get_valid_moves()
        # die=3 is blocked (6->3 has -2), cannot bear off (checker on 10)
        # Only die=5 (6->1) is valid as single move.
        # Combined 6->1->? not useful (can't bear off, pt1-3=-2 blocked).
        # So max_usable=1, higher die rule forces die=5.
        assert Move(6, 1) in moves
        # Also 10->5 and 10->7 are valid, but let's just check die=5 is used
        # from pt6.
        assert Move(6, 3) not in moves

    def test_higher_die_rule_complex(self):
        """Set up so that each die individually works, but not both.
        Then both should be available since max_usable=1 and the engine
        picks the higher one."""
        board = empty_board()
        board[2] = 1  # white checker on point 2
        # die=5: 2->-3 which is bearing off if can_bear_off
        # die=3: 2->-1 bearing off
        # Let's make it so bearing off is not possible and only within-board
        # moves count.  Put a checker outside home to prevent bearing off.
        board[10] = 1
        engine = setup_engine_for_move(board, Color.WHITE, die1=5, die2=3,
                                       off_white=13)
        # Neither checker on pt2 can move within board (would go off edge
        # or need bearing off which isn't allowed).  Pt10 can move to 7 or 5.
        moves = engine.get_valid_moves()
        # die=5: 10->5, die=3: 10->7.  Both can be used individually.
        # After 10->5, remaining die=3: 5->2 is valid.  So max_usable=2.
        # After 10->7, remaining die=5: 7->2 is valid.  So max_usable=2.
        # Both should appear.
        assert Move(10, 5) in moves
        assert Move(10, 7) in moves


# -----------------------------------------------------------------------
# 9. Gammon and backgammon detection
# -----------------------------------------------------------------------

class TestWinTypes:
    def test_normal_win(self):
        board = empty_board()
        board[1] = 1  # last white checker
        # Black has borne off at least one.
        engine = setup_engine_for_move(board, Color.WHITE, die1=1, die2=2,
                                       off_white=14, off_black=1)
        engine.state.points[19] = -5
        engine.state.points[20] = -5
        engine.state.points[21] = -4
        engine.make_move(Move(1, 0))
        assert engine.state.win_type == WinType.NORMAL

    def test_gammon_win(self):
        board = empty_board()
        board[1] = 1
        engine = setup_engine_for_move(board, Color.WHITE, die1=1, die2=2,
                                       off_white=14, off_black=0)
        # Black has no checkers borne off, none on bar, none in white home
        engine.state.points[19] = -5
        engine.state.points[20] = -5
        engine.state.points[21] = -5
        engine.make_move(Move(1, 0))
        assert engine.state.win_type == WinType.GAMMON

    def test_backgammon_win_bar(self):
        """Backgammon: loser has checker on bar."""
        board = empty_board()
        board[1] = 1
        engine = setup_engine_for_move(board, Color.WHITE, die1=1, die2=2,
                                       off_white=14, off_black=0,
                                       bar_black=1)
        engine.state.points[19] = -5
        engine.state.points[20] = -5
        engine.state.points[21] = -4
        engine.make_move(Move(1, 0))
        assert engine.state.win_type == WinType.BACKGAMMON

    def test_backgammon_win_in_winner_home(self):
        """Backgammon: loser has checker in winner's home board."""
        board = empty_board()
        board[1] = 1
        board[5] = -1   # black checker in white's home board
        engine = setup_engine_for_move(board, Color.WHITE, die1=1, die2=2,
                                       off_white=14, off_black=0)
        engine.state.points[19] = -5
        engine.state.points[20] = -5
        engine.state.points[21] = -4
        engine.make_move(Move(1, 0))
        assert engine.state.win_type == WinType.BACKGAMMON


# -----------------------------------------------------------------------
# 10. Move notation
# -----------------------------------------------------------------------

class TestNotation:
    def test_regular_move_notation(self):
        move = Move(13, 7)
        assert move.to_notation(Color.WHITE) == "13/7"

    def test_hit_notation(self):
        move = Move(13, 7, is_hit=True)
        assert move.to_notation(Color.WHITE) == "13/7*"

    def test_bar_entry_notation_white(self):
        # White enters at 25-die, e.g. die=3 → point 22
        move = Move(25, 22)
        assert move.to_notation(Color.WHITE) == "bar/22"

    def test_bar_entry_notation_black(self):
        # Black enters at die, e.g. die=3 → point 3
        move = Move(0, 3)
        assert move.to_notation(Color.BLACK) == "bar/3"

    def test_bear_off_notation_white(self):
        move = Move(3, 0)
        assert move.to_notation(Color.WHITE) == "3/off"

    def test_bear_off_notation_black(self):
        move = Move(22, 25)
        assert move.to_notation(Color.BLACK) == "22/off"

    def test_notation_log(self):
        engine = BackgammonEngine()
        engine.state.moves_history = [
            (Color.WHITE, DiceRoll(3, 1), [Move(8, 5), Move(6, 5)]),
            (Color.BLACK, DiceRoll(5, 3), [Move(12, 15), Move(1, 4, is_hit=True)]),
        ]
        log = engine.get_notation_log()
        assert log[0] == "White 31: 8/5 6/5"
        assert log[1] == "Black 53: 12/15 1/4*"


class TestMovesToNotation:
    def test_independent_moves(self):
        moves = [Move(8, 5), Move(6, 5)]
        assert moves_to_notation(moves, Color.WHITE) == "8/5 6/5"

    def test_chain_notation(self):
        # Same checker uses both dice: 13→7→4
        moves = [Move(13, 7), Move(7, 4)]
        assert moves_to_notation(moves, Color.WHITE) == "13/7/4"

    def test_chain_with_hit(self):
        moves = [Move(13, 7, is_hit=True), Move(7, 4)]
        assert moves_to_notation(moves, Color.WHITE) == "13/7*/4"

    def test_chain_hit_on_last(self):
        moves = [Move(13, 7), Move(7, 4, is_hit=True)]
        assert moves_to_notation(moves, Color.WHITE) == "13/7/4*"

    def test_chain_plus_independent(self):
        moves = [Move(13, 7), Move(7, 4), Move(8, 5)]
        assert moves_to_notation(moves, Color.WHITE) == "13/7/4 8/5"

    def test_bar_chain(self):
        moves = [Move(25, 22), Move(22, 18)]
        assert moves_to_notation(moves, Color.WHITE) == "bar/22/18"

    def test_chain_bearoff(self):
        moves = [Move(6, 3), Move(3, 0)]
        assert moves_to_notation(moves, Color.WHITE) == "6/3/off"

    def test_no_moves(self):
        assert moves_to_notation([], Color.WHITE) == "(no moves)"

    def test_doubles_four_moves(self):
        # Doubles: 6-6, moving 4 checkers from 13 to 7
        moves = [Move(13, 7), Move(13, 7), Move(13, 7), Move(13, 7)]
        assert moves_to_notation(moves, Color.WHITE) == "13/7 13/7 13/7 13/7"

    def test_doubles_two_chains(self):
        # Doubles: same checker moves 13→7→1, another 13→7→1
        moves = [Move(13, 7), Move(7, 1), Move(13, 7), Move(7, 1)]
        assert moves_to_notation(moves, Color.WHITE) == "13/7/1 13/7/1"

    def test_black_bar_and_off(self):
        moves = [Move(0, 3), Move(22, 25)]
        assert moves_to_notation(moves, Color.BLACK) == "bar/3 22/off"


# -----------------------------------------------------------------------
# 11. Full game simulation (short)
# -----------------------------------------------------------------------

class TestGameSimulation:
    def test_opening_roll_and_move(self):
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(3, 1))
        assert engine.state.status == GameStatus.MOVING
        assert engine.state.current_turn == Color.WHITE
        moves = engine.get_valid_moves()
        assert len(moves) > 0
        # Make a standard opening: 8/5, 6/5
        result = engine.make_move(Move(8, 5))
        assert result is True
        result = engine.make_move(Move(6, 5))
        assert result is True
        # All dice used; confirm the turn
        assert engine.end_turn() is True
        assert engine.state.current_turn == Color.BLACK
        assert engine.state.status == GameStatus.ROLLING

    def test_multi_turn_sequence(self):
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(3, 1))

        # White: 8/5 6/5
        engine.make_move(Move(8, 5))
        engine.make_move(Move(6, 5))
        engine.end_turn()
        assert engine.state.current_turn == Color.BLACK

        # Black rolls
        engine.roll_dice(die1=5, die2=3)
        assert engine.state.status == GameStatus.MOVING

        # Black: 12/15 12/17 (just standard moves)
        engine.make_move(Move(12, 17))
        engine.make_move(Move(12, 15))
        engine.end_turn()
        assert engine.state.current_turn == Color.WHITE


# -----------------------------------------------------------------------
# 12. Edge cases
# -----------------------------------------------------------------------

class TestEdgeCases:
    def test_no_valid_moves_forfeits_turn(self):
        """When all moves are blocked, turn is forfeited automatically."""
        board = empty_board()
        # White checker trapped behind a full prime
        board[24] = 1
        for pt in range(18, 24):
            board[pt] = -2
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=5,
                                       off_white=14)
        # The engine should auto-skip since no moves are possible.
        # After setup_engine_for_move the status might already have changed.
        # Let's check: get_valid_moves should be empty.
        # Actually, _auto_skip_if_no_moves is NOT called in setup helper,
        # we need to check manually.
        moves = engine.get_valid_moves()
        assert moves == []
        assert engine.end_turn() is True

    def test_end_turn_rejected_when_moves_exist(self):
        board = empty_board()
        board[13] = 2
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=13)
        assert engine.end_turn() is False  # can't skip, moves available

    def test_state_snapshot_serialisable(self):
        engine = BackgammonEngine()
        snap = engine.get_state_snapshot()
        assert isinstance(snap, dict)
        assert len(snap["points"]) == 26
        assert snap["status"] == "waiting"

    def test_dice_roll_string(self):
        roll = DiceRoll(3, 5)
        assert str(roll) == "(3, 5)"

    def test_move_equality(self):
        m1 = Move(13, 10, is_hit=False)
        m2 = Move(13, 10, is_hit=False)
        m3 = Move(13, 10, is_hit=True)
        assert m1 == m2
        assert m1 != m3

    def test_move_hash(self):
        m1 = Move(13, 10)
        m2 = Move(13, 10)
        assert hash(m1) == hash(m2)
        s = {m1, m2}
        assert len(s) == 1


# -----------------------------------------------------------------------
# 13. Bar-related edge cases
# -----------------------------------------------------------------------

class TestBarEdgeCases:
    def test_multiple_checkers_on_bar(self):
        """Must re-enter all bar checkers before moving others."""
        board = empty_board()
        board[6] = 5
        board[5] = 5
        board[4] = 3
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       bar_white=2)
        moves = engine.get_valid_moves()
        # All moves must be bar entry
        for m in moves:
            assert m.from_point == 25

    def test_multiple_checkers_on_bar_no_combined_moves(self):
        """With 2+ checkers on bar, no combined bar+move allowed (both dice must enter)."""
        # Black has 2 on bar, rolls [2,5]. Must enter bar/2 and bar/5,
        # NOT bar/7 (combined bar->2->7).
        board = empty_board()
        board[7] = 1   # lone white blot on point 7 (would be hit target)
        board[20] = -5
        board[19] = -5
        board[18] = -3
        engine = setup_engine_for_move(board, Color.BLACK, die1=2, die2=5,
                                       bar_black=2)
        moves = engine.get_valid_moves()
        # All moves must be bar entry (from_point == 0 for black)
        for m in moves:
            assert m.from_point == 0, (
                f"Expected bar entry only, got {m.to_notation(Color.BLACK)}"
            )
        # Specifically: bar/7 must NOT be in moves
        assert Move(0, 7) not in moves
        assert Move(0, 7, is_hit=True) not in moves
        # But bar/2 and bar/5 should be valid
        assert Move(0, 2) in moves
        assert Move(0, 5) in moves

    def test_bar_entry_with_hit(self):
        """Re-enter from bar and hit an opponent blot."""
        board = empty_board()
        board[22] = -1  # lone black on point 22 (in Black's home, where White enters)
        board[6] = 5
        board[5] = 5
        board[4] = 4
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       bar_white=1)
        moves = engine.get_valid_moves()
        # White enters at 25-3 = 22, hitting the lone black checker
        assert Move(25, 22, is_hit=True) in moves


# -----------------------------------------------------------------------
# 14. Bearing off edge cases
# -----------------------------------------------------------------------

class TestBearingOffEdgeCases:
    def test_bear_off_highest_occupied_with_overshoot(self):
        """Die=5, only checkers on points 1 and 2. Should bear off from 2."""
        board = empty_board()
        board[1] = 3
        board[2] = 2
        engine = setup_engine_for_move(board, Color.WHITE, die1=5, die2=1,
                                       off_white=10)
        moves = engine.get_valid_moves()
        # Die=5: can bear off from pt2 (highest occupied, die overshoots)
        assert Move(2, 0) in moves
        # Die=1: can bear off from pt1 exactly
        assert Move(1, 0) in moves

    def test_black_bearing_off_overshoot(self):
        """Black die=5, only checkers on 23 and 24. Bear off from 23."""
        board = empty_board()
        board[24] = -3
        board[23] = -2
        engine = setup_engine_for_move(board, Color.BLACK, die1=5, die2=1,
                                       off_black=10)
        moves = engine.get_valid_moves()
        # die=5: 23+5=28>25, pt23 is not highest (24 is higher toward 25)
        # Wait -- for black, "higher" in home means closer to 25.
        # Home range 19-24. "Highest occupied" for overshoot means the
        # point furthest from bearing off (i.e., lowest numbered).
        # pt24+5=29>25, ok but die=5 exact would be from pt20.
        # Overshoot from 23: need no black checkers on 19-22.  ✓
        # Actually pt24 is closer to 25 so bearing off from 24 with die=1 exact.
        # die=5 from pt24: 24+5=29>25, overshoot. Need no black on 19-23.
        # But 23 has -2, so can't overshoot from 24!
        # die=5 from pt23: 23+5=28>25, overshoot. Need no black on 19-22. ✓
        assert Move(23, 25) in moves
        # die=1 from pt24: exact
        assert Move(24, 25) in moves

    def test_bear_off_all_fifteen(self):
        """Bear off the last two checkers to win."""
        board = empty_board()
        board[1] = 1
        board[2] = 1
        engine = setup_engine_for_move(board, Color.WHITE, die1=2, die2=1,
                                       off_white=13)
        # Black still has checkers somewhere to avoid index errors
        board[19] = -5
        board[20] = -5
        board[21] = -5
        engine.state.points = board
        engine.make_move(Move(2, 0))
        engine.make_move(Move(1, 0))
        assert engine.state.winner == Color.WHITE
        assert engine.state.off_white == 15


# -----------------------------------------------------------------------
# 15. Maximise dice usage
# -----------------------------------------------------------------------

class TestMaximiseDiceUsage:
    def test_must_use_both_dice(self):
        """Player must use both dice if possible, not just one."""
        board = empty_board()
        board[6] = 1
        board[5] = 1
        # die1=4, die2=2
        # From 6: 6->2 (die=4), 6->4 (die=2)
        # From 5: 5->1 (die=4), 5->3 (die=2)
        engine = setup_engine_for_move(board, Color.WHITE, die1=4, die2=2,
                                       off_white=13)
        moves = engine.get_valid_moves()
        # All four opening moves should be available since each allows
        # using the second die afterwards.
        assert len(moves) >= 2

    def test_forced_sequence_order(self):
        """Sometimes dice must be used in a specific order to use both."""
        board = empty_board()
        board[5] = 1   # only white checker on board
        board[3] = -2  # blocks point 3
        # die1=4, die2=2
        # Using die=2 first: 5->3 BLOCKED
        # Using die=4 first: 5->1, then die=2: 1->off? No, need bear-off
        #   eligibility. Since it's the only checker and it IS in home...
        #   Wait, off_white=14, so only 1 on board, all in home. Can bear off.
        # 5->1 (die=4), then 1->off with die=2? die=2 from pt1 => 1-2=-1 => bear off.
        #   Die=1 exact from pt1, but die is 2 -- overshoot from pt1 (highest).
        #   Yes, that's valid since pt1 IS the highest occupied (only) point.
        # Using die=2 first: 5->3 BLOCKED.
        # So only die=4 first works.
        engine = setup_engine_for_move(board, Color.WHITE, die1=4, die2=2,
                                       off_white=14)
        moves = engine.get_valid_moves()
        assert Move(5, 1) in moves
        # 5->3 should NOT appear (blocked)
        assert Move(5, 3) not in moves


# -----------------------------------------------------------------------
# 16. Color/direction helpers
# -----------------------------------------------------------------------

class TestHelpers:
    def test_direction(self):
        assert _direction(Color.WHITE) == -1
        assert _direction(Color.BLACK) == 1

    def test_bar_point(self):
        assert _bar_point(Color.WHITE) == 25
        assert _bar_point(Color.BLACK) == 0

    def test_off_point(self):
        assert _off_point(Color.WHITE) == 0
        assert _off_point(Color.BLACK) == 25

    def test_home_range(self):
        assert list(_home_range(Color.WHITE)) == [1, 2, 3, 4, 5, 6]
        assert list(_home_range(Color.BLACK)) == [19, 20, 21, 22, 23, 24]

    def test_opponent(self):
        assert _opponent(Color.WHITE) == Color.BLACK
        assert _opponent(Color.BLACK) == Color.WHITE


# -----------------------------------------------------------------------
# 17. Game status transitions
# -----------------------------------------------------------------------

class TestStatusTransitions:
    def test_waiting_to_rolling(self):
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        assert engine.state.status == GameStatus.ROLLING

    def test_rolling_to_moving(self):
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(die1=3, die2=1)
        assert engine.state.status == GameStatus.MOVING

    def test_moving_to_rolling_after_turn(self):
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(3, 1))
        engine.make_move(Move(8, 5))
        engine.make_move(Move(6, 5))
        engine.end_turn()
        assert engine.state.status == GameStatus.ROLLING

    def test_moving_to_finished(self):
        board = empty_board()
        board[1] = 1
        board[19] = -15
        engine = setup_engine_for_move(board, Color.WHITE, die1=1, die2=2,
                                       off_white=14)
        engine.make_move(Move(1, 0))
        assert engine.state.status == GameStatus.FINISHED


# -----------------------------------------------------------------------
# 18. _check_can_bear_off
# -----------------------------------------------------------------------

class TestCanBearOff:
    def test_all_in_home_white(self):
        board = empty_board()
        board[1] = 5
        board[2] = 5
        board[3] = 5
        engine = make_engine(points=board)
        assert engine._check_can_bear_off(Color.WHITE)

    def test_checker_outside_home_white(self):
        board = empty_board()
        board[1] = 5
        board[2] = 5
        board[7] = 5
        engine = make_engine(points=board)
        assert not engine._check_can_bear_off(Color.WHITE)

    def test_checker_on_bar_white(self):
        board = empty_board()
        board[1] = 5
        board[2] = 5
        board[3] = 4
        engine = make_engine(points=board, bar_white=1)
        assert not engine._check_can_bear_off(Color.WHITE)

    def test_all_in_home_black(self):
        board = empty_board()
        board[19] = 0
        board[20] = -5
        board[21] = -5
        board[22] = -5
        engine = make_engine(points=board)
        assert engine._check_can_bear_off(Color.BLACK)

    def test_checker_outside_home_black(self):
        board = empty_board()
        board[20] = -5
        board[21] = -5
        board[10] = -5
        engine = make_engine(points=board)
        assert not engine._check_can_bear_off(Color.BLACK)


# -----------------------------------------------------------------------
# 19. Snapshot contents
# -----------------------------------------------------------------------

class TestSnapshot:
    def test_snapshot_fields(self):
        engine = BackgammonEngine()
        snap = engine.get_state_snapshot()
        assert "points" in snap
        assert "bar_white" in snap
        assert "bar_black" in snap
        assert "off_white" in snap
        assert "off_black" in snap
        assert "current_turn" in snap
        assert "dice" in snap
        assert "remaining_dice" in snap
        assert "status" in snap
        assert "winner" in snap
        assert "win_type" in snap

    def test_snapshot_dice_values(self):
        engine = BackgammonEngine()
        engine.state.dice = DiceRoll(4, 2)
        snap = engine.get_state_snapshot()
        assert snap["dice"]["die1"] == 4
        assert snap["dice"]["die2"] == 2


# -----------------------------------------------------------------------
# 20. Regression / misc
# -----------------------------------------------------------------------

class TestRegression:
    def test_no_crash_on_empty_remaining_dice(self):
        engine = BackgammonEngine()
        engine.state.status = GameStatus.MOVING
        engine.state.remaining_dice = []
        assert engine.get_valid_moves() == []

    def test_history_recorded_after_turn(self):
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(3, 1))
        engine.make_move(Move(8, 5))
        engine.make_move(Move(6, 5))
        engine.end_turn()
        assert len(engine.state.moves_history) == 1
        color, dice, moves = engine.state.moves_history[0]
        assert color == Color.WHITE
        assert dice.die1 == 3
        assert len(moves) == 2

    def test_turn_moves_reset_after_switch(self):
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(3, 1))
        engine.make_move(Move(8, 5))
        engine.make_move(Move(6, 5))
        engine.end_turn()
        assert engine.state.turn_moves == []

    def test_white_bear_off_with_die2(self):
        """Ensure bearing off works when the second die is used."""
        board = empty_board()
        board[3] = 2
        board[2] = 5
        board[1] = 5
        engine = setup_engine_for_move(board, Color.WHITE, die1=5, die2=3,
                                       off_white=3)
        # die=3 exact from pt3
        moves = engine.get_valid_moves()
        assert Move(3, 0) in moves
        engine.make_move(Move(3, 0))
        assert engine.state.off_white == 4


# -----------------------------------------------------------------------
# 21. Integration: auto-skip on no-moves
# -----------------------------------------------------------------------

class TestAutoSkip:
    def test_auto_skip_when_blocked(self):
        """If a player has no legal moves after rolling, turn is skipped."""
        board = empty_board()
        board[24] = 1  # single white checker
        for pt in range(18, 24):
            board[pt] = -2  # full prime blocks 18-23
        board[1] = -3  # some black checkers
        engine = BackgammonEngine()
        engine.state.points = board
        engine.state.bar_white = 0
        engine.state.bar_black = 0
        engine.state.off_white = 14
        engine.state.off_black = 12
        engine.state.current_turn = Color.WHITE
        engine.state.status = GameStatus.ROLLING

        engine.roll_dice(die1=1, die2=2)
        # Should auto-skip to Black's turn
        assert engine.state.current_turn == Color.BLACK
        assert engine.state.status == GameStatus.ROLLING


# -----------------------------------------------------------------------
# 22. Dice persistence between turns
# -----------------------------------------------------------------------

class TestDicePersistence:
    def test_dice_visible_after_turn_switch(self):
        """After a turn ends, dice should remain non-null with empty remaining."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(3, 1))
        engine.make_move(Move(8, 5))
        engine.make_move(Move(6, 5))
        engine.end_turn()
        # Turn switched to Black, status=ROLLING
        assert engine.state.current_turn == Color.BLACK
        assert engine.state.status == GameStatus.ROLLING
        # Dice should still be visible (White's roll)
        assert engine.state.dice is not None
        assert engine.state.dice.die1 == 3
        assert engine.state.dice.die2 == 1
        # But remaining_dice should be empty (all used)
        assert engine.state.remaining_dice == []

    def test_dice_replaced_on_new_roll(self):
        """When the new player rolls, their dice replace the old ones."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(3, 1))
        engine.make_move(Move(8, 5))
        engine.make_move(Move(6, 5))
        engine.end_turn()
        # Black rolls
        engine.roll_dice(die1=5, die2=2)
        assert engine.state.dice.die1 == 5
        assert engine.state.dice.die2 == 2
        assert engine.state.remaining_dice == [5, 2]

    def test_dice_persist_after_auto_skip(self):
        """When turn is auto-skipped (no moves), dice still persist."""
        board = empty_board()
        board[24] = 1
        for pt in range(18, 24):
            board[pt] = -2
        board[1] = -3
        engine = BackgammonEngine()
        engine.state.points = board
        engine.state.off_white = 14
        engine.state.off_black = 12
        engine.state.current_turn = Color.WHITE
        engine.state.status = GameStatus.ROLLING
        engine.roll_dice(die1=1, die2=2)
        # Auto-skipped to Black
        assert engine.state.current_turn == Color.BLACK
        # Dice should still be visible
        assert engine.state.dice is not None
        assert engine.state.dice.die1 == 1


# -----------------------------------------------------------------------
# 23. Combined (multi-die) moves
# -----------------------------------------------------------------------

class TestCombinedMoves:
    def test_basic_two_die_combination(self):
        """Roll 1+3, should see a combined move of 4 spaces."""
        board = empty_board()
        board[13] = 2  # white checkers
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=13)
        moves = engine.get_valid_moves()
        # Single-die: 13->10 (die=3), 13->12 (die=1)
        assert Move(13, 10) in moves
        assert Move(13, 12) in moves
        # Combined: 13->9 (die=3+1 or 1+3)
        assert Move(13, 9) in moves

    def test_blocked_intermediate_prevents_combination(self):
        """If the intermediate point is blocked, combined move is invalid."""
        board = empty_board()
        board[13] = 1
        board[10] = -2  # blocks point 10 (intermediate for 13->10->9)
        board[12] = -2  # blocks point 12 (intermediate for 13->12->9)
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        moves = engine.get_valid_moves()
        # 13->10 blocked, 13->12 blocked, so 13->9 combined also blocked
        assert Move(13, 9) not in moves

    def test_one_path_blocked_other_works(self):
        """Block one intermediate but the other permutation works."""
        board = empty_board()
        board[13] = 1
        board[10] = -2  # blocks intermediate via die=3 first
        # But 13->12 (die=1) then 12->9 (die=3) should work if 12 is open
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        moves = engine.get_valid_moves()
        # 13->12 (die=1) is valid, then 12->9 (die=3) is valid
        assert Move(13, 9) in moves

    def test_doubles_combining_two_dice(self):
        """Doubles: combine 2 of 4 dice."""
        board = empty_board()
        board[13] = 3
        engine = setup_engine_for_move(board, Color.WHITE, die1=2, die2=2,
                                       off_white=12)
        moves = engine.get_valid_moves()
        # Single: 13->11 (die=2)
        assert Move(13, 11) in moves
        # Combined 2 dice: 13->9 (2+2)
        assert Move(13, 9) in moves

    def test_doubles_combining_three_dice(self):
        """Doubles: combine 3 of 4 dice."""
        board = empty_board()
        board[13] = 3
        engine = setup_engine_for_move(board, Color.WHITE, die1=2, die2=2,
                                       off_white=12)
        moves = engine.get_valid_moves()
        # Combined 3 dice: 13->7 (2+2+2)
        assert Move(13, 7) in moves

    def test_doubles_combining_four_dice(self):
        """Doubles: combine all 4 dice."""
        board = empty_board()
        board[13] = 3
        engine = setup_engine_for_move(board, Color.WHITE, die1=2, die2=2,
                                       off_white=12)
        moves = engine.get_valid_moves()
        # Combined 4 dice: 13->5 (2+2+2+2)
        assert Move(13, 5) in moves

    def test_combined_move_with_intermediate_hit(self):
        """Combined move where an intermediate point has a blot."""
        board = empty_board()
        board[13] = 1
        board[10] = -1  # black blot at intermediate point (die=3 first)
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        moves = engine.get_valid_moves()
        # Combined: 13->9, going through 10 (hitting black blot)
        assert Move(13, 9) in moves

    def test_combined_move_execution(self):
        """Actually execute a combined move and verify board state."""
        board = empty_board()
        board[13] = 2
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=13)
        result = engine.make_move(Move(13, 9))
        assert result is True
        assert engine.state.points[13] == 1  # one checker moved
        assert engine.state.points[9] == 1   # landed here
        # Both dice consumed
        assert len(engine.state.remaining_dice) == 0

    def test_combined_move_with_hit_execution(self):
        """Execute a combined move that hits at intermediate point."""
        board = empty_board()
        board[13] = 1
        board[10] = -1  # blot at intermediate
        board[12] = -2  # block the die=1-first path (13->12 blocked)
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        result = engine.make_move(Move(13, 9))
        assert result is True
        assert engine.state.points[9] == 1
        assert engine.state.points[10] == 0  # blot was hit (13->10->9)
        assert engine.state.bar_black == 1

    def test_bar_entry_plus_continuation(self):
        """Enter from bar then continue with second die as combined move."""
        board = empty_board()
        board[6] = 5
        board[5] = 5
        board[4] = 4
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       bar_white=1)
        moves = engine.get_valid_moves()
        # Bar entry: 25->22 (die=3), 25->24 (die=1)
        # Combined: 25->21 (die=3+1: enter at 22, then move to 21)
        # Combined: 25->21 (die=1+3: enter at 24, then move to 21)
        assert Move(25, 21) in moves

    def test_combined_ending_in_bear_off(self):
        """Combined move where the final step is bearing off."""
        board = empty_board()
        board[4] = 2
        board[2] = 5
        board[1] = 5
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=3)
        moves = engine.get_valid_moves()
        # Single: 4->1 (die=3), 4->3 (die=1)
        # Combined: 4->off (die=3+1: 4->1->off or die=1+3: 4->3->off)
        assert Move(4, 0) in moves

    def test_combined_bear_off_execution(self):
        """Execute a combined move that ends in bearing off."""
        board = empty_board()
        board[4] = 2
        board[2] = 5
        board[1] = 5
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=3)
        result = engine.make_move(Move(4, 0))
        assert result is True
        assert engine.state.off_white == 4
        assert engine.state.points[4] == 1

    def test_max_dice_usage_filter_still_works(self):
        """Combined moves should respect the max-dice-usage filter."""
        board = empty_board()
        board[6] = 1
        board[5] = 1
        engine = setup_engine_for_move(board, Color.WHITE, die1=4, die2=2,
                                       off_white=13)
        moves = engine.get_valid_moves()
        # Both single moves should be available (each allows using 2 dice)
        assert Move(6, 2) in moves or Move(6, 4) in moves
        assert Move(5, 1) in moves or Move(5, 3) in moves

    def test_combined_move_black(self):
        """Black combined move works correctly (opposite direction)."""
        board = empty_board()
        board[12] = -2
        engine = setup_engine_for_move(board, Color.BLACK, die1=3, die2=1,
                                       off_black=13)
        moves = engine.get_valid_moves()
        # Single: 12->15 (die=3), 12->13 (die=1)
        # Combined: 12->16 (3+1)
        assert Move(12, 16) in moves


# -----------------------------------------------------------------------
# Crawford Rule
# -----------------------------------------------------------------------

class TestCrawfordRule:
    """Tests for the Crawford Rule in match play.

    The Crawford Rule: when a player reaches match point minus 1 (needs
    exactly 1 more point to win), the next game is a Crawford game where
    NO doubling is allowed.  After the Crawford game, normal doubling
    resumes.
    """

    def test_doubling_blocked_during_crawford_game(self):
        """Doubling is not allowed when is_crawford_game is True."""
        engine = BackgammonEngine()
        engine.state.status = GameStatus.ROLLING
        engine.state.current_turn = Color.WHITE
        engine.state.is_crawford_game = True
        engine.state.cube_owner = None  # centered cube

        # can_double should return False
        assert engine.can_double(Color.WHITE) is False

        # offer_double should also fail
        assert engine.offer_double(Color.WHITE) is False

    def test_doubling_allowed_when_not_crawford(self):
        """Doubling works normally when is_crawford_game is False."""
        engine = BackgammonEngine()
        engine.state.status = GameStatus.ROLLING
        engine.state.current_turn = Color.WHITE
        engine.state.is_crawford_game = False
        engine.state.cube_owner = None

        assert engine.can_double(Color.WHITE) is True
        assert engine.offer_double(Color.WHITE) is True

    def test_crawford_game_in_snapshot(self):
        """is_crawford_game is serialized in the state snapshot."""
        engine = BackgammonEngine()
        engine.state.is_crawford_game = True
        snap = engine.get_state_snapshot()
        assert snap["is_crawford_game"] is True

        engine.state.is_crawford_game = False
        snap = engine.get_state_snapshot()
        assert snap["is_crawford_game"] is False

    def test_crawford_default_is_false(self):
        """By default, is_crawford_game is False."""
        engine = BackgammonEngine()
        assert engine.state.is_crawford_game is False
        snap = engine.get_state_snapshot()
        assert snap["is_crawford_game"] is False

    def test_crawford_blocks_both_colors(self):
        """Neither player can double during a Crawford game."""
        engine = BackgammonEngine()
        engine.state.status = GameStatus.ROLLING
        engine.state.is_crawford_game = True
        engine.state.cube_owner = None

        engine.state.current_turn = Color.WHITE
        assert engine.can_double(Color.WHITE) is False

        engine.state.current_turn = Color.BLACK
        assert engine.can_double(Color.BLACK) is False

    def test_crawford_blocks_even_with_owned_cube(self):
        """Crawford blocks doubling even when the player owns the cube."""
        engine = BackgammonEngine()
        engine.state.status = GameStatus.ROLLING
        engine.state.current_turn = Color.WHITE
        engine.state.is_crawford_game = True
        engine.state.cube_owner = Color.WHITE  # White owns cube

        assert engine.can_double(Color.WHITE) is False


# -----------------------------------------------------------------------
# Doubling blocked by pending resignation (#181)
# -----------------------------------------------------------------------

class TestDoubleBlockedByResignation:
    """Doubling must be blocked when a resignation offer is pending.

    This is the symmetric counterpart to the existing check in
    offer_resign() which already blocks when a double is pending.
    See: https://github.com/alanmanderson/backgammon/issues/181
    """

    def test_can_double_returns_false_when_resign_offered(self):
        """can_double returns False while resign_offered is True."""
        engine = BackgammonEngine()
        engine.state.status = GameStatus.ROLLING
        engine.state.current_turn = Color.WHITE
        engine.state.cube_owner = None  # centered cube

        # Sanity: doubling is normally allowed
        assert engine.can_double(Color.WHITE) is True

        # Simulate a pending resignation
        engine.state.resign_offered = True
        engine.state.resign_offered_by = Color.BLACK

        assert engine.can_double(Color.WHITE) is False

    def test_offer_double_fails_when_resign_offered(self):
        """offer_double returns False (via can_double) when resignation pending."""
        engine = BackgammonEngine()
        engine.state.status = GameStatus.ROLLING
        engine.state.current_turn = Color.WHITE
        engine.state.cube_owner = None

        engine.state.resign_offered = True
        engine.state.resign_offered_by = Color.BLACK

        assert engine.offer_double(Color.WHITE) is False
        # Cube value should remain unchanged
        assert engine.state.cube_value == 1
        assert engine.state.double_offered is False

    def test_can_double_restored_after_resign_rejected(self):
        """After a resignation is rejected, doubling is available again."""
        engine = BackgammonEngine()
        engine.state.status = GameStatus.ROLLING
        engine.state.current_turn = Color.WHITE
        engine.state.cube_owner = None

        # Offer resignation
        engine.state.resign_offered = True
        engine.state.resign_offered_by = Color.BLACK
        assert engine.can_double(Color.WHITE) is False

        # Reject resignation clears the flag
        engine.reject_resign(Color.WHITE)
        assert engine.can_double(Color.WHITE) is True


# -----------------------------------------------------------------------
# Full-turn enumeration
# -----------------------------------------------------------------------

class TestEnumerateCompleteTurns:
    """Tests for BackgammonEngine.enumerate_complete_turns()."""

    def test_opening_31_returns_multiple_turns(self):
        """Opening 3-1 should produce multiple distinct turns."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(3, 1))
        turns = engine.enumerate_complete_turns()
        # There should be many possible turns (typically 15-20)
        assert len(turns) > 10
        # Each turn should use 2 dice (2 moves)
        for turn in turns:
            assert len(turn) == 2

    def test_all_turns_are_legal(self):
        """Every move in every enumerated turn must be a legal move."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(5, 3))
        turns = engine.enumerate_complete_turns()
        for turn in turns:
            test_engine = BackgammonEngine()
            test_engine.start_game(first_player=Color.WHITE, dice=DiceRoll(5, 3))
            for move in turn:
                valid = test_engine.get_valid_moves()
                assert move in valid, (
                    f"Move {move.from_point}->{move.to_point} not in valid moves"
                )
                test_engine.make_move(move)

    def test_turns_are_deduplicated(self):
        """No two enumerated turns should result in the same board state."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(3, 1))
        turns = engine.enumerate_complete_turns()
        color = engine.state.current_turn
        final_states = set()
        for turn in turns:
            saved = engine._snapshot_internals()
            for move in turn:
                engine._apply_move_internal(color, move)
            key = (tuple(engine.state.points), engine.state.bar_white,
                   engine.state.bar_black, engine.state.off_white,
                   engine.state.off_black)
            assert key not in final_states, "Duplicate final state found"
            final_states.add(key)
            engine._restore_internals(saved)

    def test_doubles_enumerate_four_moves(self):
        """Doubles should produce turns of length 4 when all dice can be used."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(3, 3)
        turns = engine.enumerate_complete_turns()
        assert len(turns) > 0
        for turn in turns:
            assert len(turn) == 4

    def test_higher_die_rule(self):
        """When only one die can be used, the higher die must be used."""
        # White has one checker on point 10, point 3 blocked.
        # Die 4: 10->6 (valid). Die 3: 10->7 (valid).
        # After either move, the other die can't reach anywhere useful
        # (both routes converge on blocked point 3), so max_usable = 1.
        # Higher die rule: must use die 4. Only turn should be [10->6].
        board = empty_board()
        board[10] = 1
        board[3] = -2  # blocks the second hop for both paths
        engine = setup_engine_for_move(board, Color.WHITE, die1=4, die2=3,
                                       off_white=14)
        turns = engine.enumerate_complete_turns()
        assert len(turns) == 1
        assert turns[0][0].from_point == 10
        assert turns[0][0].to_point == 6  # used die 4, not die 3

    def test_no_moves_returns_empty_sequence(self):
        """When no moves are possible, return a single empty sequence."""
        board = empty_board()
        board[1] = 1  # White on point 1 (home board)
        # Block all entry points for die values
        board[24] = -2  # Block point 24
        board[23] = -2  # Block point 23
        # White on bar can't enter
        engine = setup_engine_for_move(board, Color.WHITE, die1=1, die2=2,
                                       bar_white=1)
        turns = engine.enumerate_complete_turns()
        # One "turn" of zero moves (completely blocked)
        assert turns == [[]]

    def test_engine_state_unchanged_after_enumeration(self):
        """Enumeration must not alter the engine state."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE, dice=DiceRoll(6, 1))
        before = (list(engine.state.points), engine.state.bar_white,
                  engine.state.bar_black, engine.state.off_white,
                  engine.state.off_black, list(engine.state.remaining_dice))
        engine.enumerate_complete_turns()
        after = (list(engine.state.points), engine.state.bar_white,
                 engine.state.bar_black, engine.state.off_white,
                 engine.state.off_black, list(engine.state.remaining_dice))
        assert before == after


# -----------------------------------------------------------------------
# Combined move hit tracking (issue #180)
# -----------------------------------------------------------------------

class TestCombinedMoveHitTracking:
    """Tests that combined moves correctly record intermediate hits in
    turn_moves and notation.

    Fixes issue #180: combined moves previously lost intermediate hit
    information because only the combined Move(from, to) was recorded
    instead of the decomposed step moves.
    """

    def test_combined_move_records_step_moves(self):
        """A combined move should record decomposed steps in turn_moves."""
        board = empty_board()
        board[13] = 2
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=13)
        engine.make_move(Move(13, 9))
        # Should record two step moves, not one combined move.
        assert len(engine.state.turn_moves) == 2
        # Steps should chain: first move ends where second begins.
        assert engine.state.turn_moves[0].from_point == 13
        assert engine.state.turn_moves[0].to_point == engine.state.turn_moves[1].from_point
        assert engine.state.turn_moves[1].to_point == 9

    def test_intermediate_hit_recorded_in_turn_moves(self):
        """When a combined move hits at an intermediate point, the hit
        should appear in the decomposed step moves in turn_moves."""
        board = empty_board()
        board[13] = 1
        board[10] = -1  # blot at intermediate point
        board[12] = -2  # block die=1-first path so only 13->10->9 works
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        engine.make_move(Move(13, 9))

        # Step 1: 13->10, hitting the blot.
        assert engine.state.turn_moves[0] == Move(13, 10, is_hit=True)
        # Step 2: 10->9, no hit.
        assert engine.state.turn_moves[1] == Move(10, 9, is_hit=False)

    def test_intermediate_hit_notation(self):
        """Notation should show '*' at the intermediate hit point."""
        board = empty_board()
        board[13] = 1
        board[10] = -1  # blot at intermediate
        board[12] = -2  # block the non-hitting path
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        engine.make_move(Move(13, 9))

        notation = moves_to_notation(engine.state.turn_moves, Color.WHITE)
        # Should show the hit at point 10: "13/10*/9"
        assert notation == "13/10*/9"

    def test_combined_move_no_hit_notation(self):
        """Combined move with no hits should produce clean notation."""
        board = empty_board()
        board[13] = 2
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=13)
        engine.make_move(Move(13, 9))

        notation = moves_to_notation(engine.state.turn_moves, Color.WHITE)
        # No hits anywhere: "13/12/9" or "13/10/9" depending on path.
        assert "*" not in notation
        # Should be a chain notation (not two separate moves).
        assert "/" in notation
        assert " " not in notation  # single chain, no space separator

    def test_combined_hit_at_final_dest_notation(self):
        """Combined move that hits only at the final destination."""
        board = empty_board()
        board[13] = 1
        board[9] = -1  # blot at final destination
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        engine.make_move(Move(13, 9, is_hit=True))

        notation = moves_to_notation(engine.state.turn_moves, Color.WHITE)
        # Hit at final: last segment should have "*"
        assert notation.endswith("9*") or notation.endswith("/9*")

    def test_combined_hit_at_both_intermediate_and_final(self):
        """Combined move that hits at both intermediate AND final points."""
        board = empty_board()
        board[13] = 1
        board[10] = -1  # blot at intermediate
        board[9] = -1   # blot at final
        board[12] = -2  # block the non-hitting path
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        engine.make_move(Move(13, 9, is_hit=True))

        # Both steps should record hits.
        assert engine.state.turn_moves[0] == Move(13, 10, is_hit=True)
        assert engine.state.turn_moves[1] == Move(10, 9, is_hit=True)
        notation = moves_to_notation(engine.state.turn_moves, Color.WHITE)
        assert notation == "13/10*/9*"

    def test_combined_move_black_intermediate_hit(self):
        """Black combined move with intermediate hit works correctly."""
        board = empty_board()
        board[12] = -1
        board[15] = 1   # white blot at intermediate (die=3 first)
        board[13] = 2   # block die=1-first path
        engine = setup_engine_for_move(board, Color.BLACK, die1=3, die2=1,
                                       off_black=14)
        engine.make_move(Move(12, 16))

        # Step 1: 12->15, hitting the white blot.
        assert engine.state.turn_moves[0] == Move(12, 15, is_hit=True)
        # Step 2: 15->16, no hit.
        assert engine.state.turn_moves[1] == Move(15, 16, is_hit=False)
        notation = moves_to_notation(engine.state.turn_moves, Color.BLACK)
        assert notation == "12/15*/16"

    def test_undo_after_combined_move_restores_turn_moves(self):
        """Undoing a combined move should restore turn_moves correctly."""
        board = empty_board()
        board[13] = 1
        board[10] = -1  # blot at intermediate
        board[12] = -2  # block non-hitting path
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        assert len(engine.state.turn_moves) == 0

        engine.make_move(Move(13, 9))
        assert len(engine.state.turn_moves) == 2

        engine.undo_turn()
        assert len(engine.state.turn_moves) == 0
        # Board should be restored too.
        assert engine.state.points[13] == 1
        assert engine.state.points[10] == -1

    def test_make_move_matches_by_coordinates(self):
        """make_move should match moves by coordinates, not requiring
        the caller to know the is_hit flag."""
        board = empty_board()
        board[13] = 1
        board[10] = -1
        board[12] = -2  # force hitting path
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        # Caller passes Move without is_hit — should still work.
        result = engine.make_move(Move(13, 9))
        assert result is True
        assert engine.state.points[9] == 1
        assert engine.state.bar_black == 1

    def test_history_records_step_moves_for_combined(self):
        """moves_history should contain the decomposed steps after the
        turn ends, not the combined move."""
        board = empty_board()
        board[13] = 1
        board[10] = -1
        board[12] = -2
        engine = setup_engine_for_move(board, Color.WHITE, die1=3, die2=1,
                                       off_white=14)
        engine.make_move(Move(13, 9))
        engine.end_turn()

        # The last entry in moves_history should have the step moves.
        assert len(engine.state.moves_history) > 0
        color, dice, moves = engine.state.moves_history[-1]
        assert color == Color.WHITE
        assert len(moves) == 2
        assert moves[0] == Move(13, 10, is_hit=True)
        assert moves[1] == Move(10, 9, is_hit=False)
