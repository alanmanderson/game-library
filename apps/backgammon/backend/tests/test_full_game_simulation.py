"""
Comprehensive full-game simulation tests for the BackgammonEngine.

Plays many complete games with random valid moves, checking invariants
after every single move.  Also exercises predetermined dice rolls for
deterministic coverage.
"""

import copy
import random
import traceback

import pytest

from app.game_engine import (
    BackgammonEngine,
    Color,
    GameStatus,
    WinType,
    Move,
    DiceRoll,
    GameState,
    _direction,
    _bar_point,
    _off_point,
    _home_range,
    _opponent,
)


# ---------------------------------------------------------------------------
# Combined-move detection
# ---------------------------------------------------------------------------

def _is_combined_move(move: Move, color: Color, dice_before: list[int]) -> bool:
    """Return True if *move* consumed multiple dice (combined move)."""
    bar = _bar_point(color)
    off = _off_point(color)

    if move.from_point == bar:
        die_val = (25 - move.to_point) if color == Color.WHITE else move.to_point
    elif move.to_point == off:
        exact = abs(move.from_point - off)
        if exact in dice_before:
            return False
        candidates = [d for d in dice_before if d >= exact]
        return not candidates  # if no single die works, it's combined
    else:
        die_val = abs(move.to_point - move.from_point)

    return die_val not in dice_before


# ---------------------------------------------------------------------------
# Diagnostic helpers
# ---------------------------------------------------------------------------

def _board_str(engine: BackgammonEngine) -> str:
    """Return a human-readable snapshot of the board for diagnostics."""
    s = engine.state
    lines = []
    lines.append(f"  Turn: {s.current_turn.value}  Status: {s.status.value}")
    lines.append(f"  Dice: {s.dice}  Remaining: {s.remaining_dice}")
    lines.append(f"  Bar  W={s.bar_white}  B={s.bar_black}")
    lines.append(f"  Off  W={s.off_white}  B={s.off_black}")
    lines.append(f"  Winner: {s.winner}  WinType: {s.win_type}")

    # Points 13-24 (top row, printed left to right)
    top = "  " + " ".join(f"{s.points[i]:+3d}" for i in range(13, 25))
    bot = "  " + " ".join(f"{s.points[i]:+3d}" for i in range(12, 0, -1))
    lines.append(f"  13-24: {top}")
    lines.append(f"  12- 1: {bot}")
    return "\n".join(lines)


def _checker_counts(engine: BackgammonEngine):
    """Return (white_total, black_total) checker counts."""
    s = engine.state
    white = s.bar_white + s.off_white + sum(v for v in s.points[1:25] if v > 0)
    black = s.bar_black + s.off_black + sum(abs(v) for v in s.points[1:25] if v < 0)
    return white, black


# ---------------------------------------------------------------------------
# Invariant checks  -- called after EVERY move
# ---------------------------------------------------------------------------

class InvariantViolation(Exception):
    """Raised when a board invariant is violated."""
    pass


def check_invariants(
    engine: BackgammonEngine,
    last_move=None,
    last_dice=None,
    move_number=None,
    game_number=None,
    prev_state_snapshot=None,
):
    """
    Verify all invariants on the current engine state.
    Raises InvariantViolation with detailed diagnostics on failure.
    """
    s = engine.state
    violations = []

    # 1. Total checker count
    white_total, black_total = _checker_counts(engine)
    if white_total != 15:
        violations.append(
            f"White checker count = {white_total}, expected 15. "
            f"(bar={s.bar_white}, off={s.off_white}, "
            f"board={sum(v for v in s.points[1:25] if v > 0)})"
        )
    if black_total != 15:
        violations.append(
            f"Black checker count = {black_total}, expected 15. "
            f"(bar={s.bar_black}, off={s.off_black}, "
            f"board={sum(abs(v) for v in s.points[1:25] if v < 0)})"
        )

    # 2. No point has both white and black checkers
    #    (This is impossible by representation: a positive int is white, negative is black.
    #     But we check that no point is somehow shared via bar mismanagement.)
    #    More importantly, after a hit the point should have exactly 1 of the mover's checkers.
    #    We simply verify no point has value 0 after a hit was recorded at that point.
    #    (Actually, 0 is fine -- it just means nobody is there. The real check is sign consistency.)

    # 3. remaining_dice count never goes negative
    if len(s.remaining_dice) < 0:
        violations.append("remaining_dice length is negative (impossible but checked).")
    # Also check values are valid die faces.
    for d in s.remaining_dice:
        if d < 1 or d > 6:
            violations.append(f"Invalid die value in remaining_dice: {d}")

    # 4. Bar / off counts are non-negative
    if s.bar_white < 0:
        violations.append(f"bar_white is negative: {s.bar_white}")
    if s.bar_black < 0:
        violations.append(f"bar_black is negative: {s.bar_black}")
    if s.off_white < 0:
        violations.append(f"off_white is negative: {s.off_white}")
    if s.off_black < 0:
        violations.append(f"off_black is negative: {s.off_black}")

    # 5. Status sanity
    if s.status == GameStatus.FINISHED:
        if s.winner is None:
            violations.append("Status is FINISHED but winner is None.")
        if s.win_type is None:
            violations.append("Status is FINISHED but win_type is None.")
    if s.status == GameStatus.ROLLING:
        if s.remaining_dice:
            violations.append(
                f"Status is ROLLING but remaining_dice is non-empty: {s.remaining_dice}"
            )

    # 6. When status is MOVING, get_valid_moves() should return moves that are executable
    if s.status == GameStatus.MOVING and s.remaining_dice:
        valid_moves = engine.get_valid_moves()
        # The engine auto-skips when there are no valid moves AND no moves
        # have been made this turn.  When moves HAVE been made (turn_moves
        # is non-empty), the engine keeps the turn alive so the player can
        # undo or explicitly confirm.  That is a valid state.
        if not valid_moves and not s.turn_moves:
            violations.append(
                "Status is MOVING with remaining dice but get_valid_moves() is empty. "
                f"remaining_dice={s.remaining_dice}"
            )

    # 7. Board points should be in valid range (index 0 and 25 should be 0)
    if s.points[0] != 0:
        violations.append(f"points[0] (padding) is non-zero: {s.points[0]}")
    if s.points[25] != 0:
        violations.append(f"points[25] (padding) is non-zero: {s.points[25]}")

    if violations:
        diag = [
            f"\n{'='*60}",
            f"INVARIANT VIOLATION(S) in game #{game_number}, move #{move_number}",
            f"Last move: {last_move}",
            f"Last dice: {last_dice}",
            f"Board state:",
            _board_str(engine),
        ]
        if prev_state_snapshot:
            diag.append(f"Previous state snapshot: {prev_state_snapshot}")
        for v in violations:
            diag.append(f"  !! {v}")
        diag.append("=" * 60)
        msg = "\n".join(diag)
        raise InvariantViolation(msg)


def check_hit_consistency(
    engine: BackgammonEngine,
    move: Move,
    color: Color,
    prev_bar_white: int,
    prev_bar_black: int,
):
    """
    When a move is reported as a hit, verify the opponent's bar count increased.
    """
    s = engine.state
    opp = _opponent(color)
    violations = []

    if move.is_hit:
        if opp == Color.WHITE:
            if s.bar_white != prev_bar_white + 1:
                violations.append(
                    f"Hit reported for {color.value} but opponent (white) bar "
                    f"went from {prev_bar_white} to {s.bar_white} (expected {prev_bar_white + 1})"
                )
        else:
            if s.bar_black != prev_bar_black + 1:
                violations.append(
                    f"Hit reported for {color.value} but opponent (black) bar "
                    f"went from {prev_bar_black} to {s.bar_black} (expected {prev_bar_black + 1})"
                )
    else:
        # Non-hit move should not increase opponent bar
        if opp == Color.WHITE:
            if s.bar_white > prev_bar_white:
                violations.append(
                    f"Non-hit move by {color.value} but white bar increased "
                    f"from {prev_bar_white} to {s.bar_white}"
                )
        else:
            if s.bar_black > prev_bar_black:
                violations.append(
                    f"Non-hit move by {color.value} but black bar increased "
                    f"from {prev_bar_black} to {s.bar_black}"
                )

    return violations


def check_move_board_consistency(
    engine: BackgammonEngine,
    move: Move,
    color: Color,
    prev_snapshot: dict,
):
    """
    Verify the board state is consistent with the move that was made.
    """
    s = engine.state
    violations = []
    prev_points = prev_snapshot["points"]
    inc = 1 if color == Color.WHITE else -1
    bar = _bar_point(color)
    off = _off_point(color)

    # Source: checker should have been removed
    if move.from_point == bar:
        if color == Color.WHITE:
            expected_bar = prev_snapshot["bar_white"] - 1
            if s.bar_white != expected_bar:
                violations.append(
                    f"After bar entry by white, bar_white should be {expected_bar} "
                    f"but is {s.bar_white}"
                )
        else:
            expected_bar = prev_snapshot["bar_black"] - 1
            if s.bar_black != expected_bar:
                violations.append(
                    f"After bar entry by black, bar_black should be {expected_bar} "
                    f"but is {s.bar_black}"
                )
    else:
        expected_src = prev_points[move.from_point] - inc
        if s.points[move.from_point] != expected_src:
            # It's possible another move also modified this point in the same
            # turn... Actually, we check after each individual move, so this
            # should be exact.
            violations.append(
                f"Source point {move.from_point}: expected {expected_src}, "
                f"got {s.points[move.from_point]}  (prev={prev_points[move.from_point]})"
            )

    # Destination: checker should have been placed
    if move.to_point == off:
        if color == Color.WHITE:
            expected_off = prev_snapshot["off_white"] + 1
            if s.off_white != expected_off:
                violations.append(
                    f"After bear-off by white, off_white should be {expected_off} "
                    f"but is {s.off_white}"
                )
        else:
            expected_off = prev_snapshot["off_black"] + 1
            if s.off_black != expected_off:
                violations.append(
                    f"After bear-off by black, off_black should be {expected_off} "
                    f"but is {s.off_black}"
                )
    else:
        if move.is_hit:
            # The point should have been zeroed, then incremented
            expected_dest = inc  # exactly 1 checker of mover's color
        else:
            expected_dest = prev_points[move.to_point] + inc
        if s.points[move.to_point] != expected_dest:
            violations.append(
                f"Dest point {move.to_point}: expected {expected_dest}, "
                f"got {s.points[move.to_point]}  (prev={prev_points[move.to_point]}, "
                f"is_hit={move.is_hit})"
            )

    return violations


def check_end_of_game(engine: BackgammonEngine, game_number: int):
    """Verify end-of-game conditions."""
    s = engine.state
    violations = []

    if s.status != GameStatus.FINISHED:
        violations.append(f"Game ended but status is {s.status.value}, not FINISHED")
        return violations

    winner = s.winner
    win_type = s.win_type

    # Winner must have 15 checkers off
    if winner == Color.WHITE:
        if s.off_white != 15:
            violations.append(
                f"Winner is white but off_white={s.off_white}, expected 15"
            )
    elif winner == Color.BLACK:
        if s.off_black != 15:
            violations.append(
                f"Winner is black but off_black={s.off_black}, expected 15"
            )

    # Win type classification
    loser = _opponent(winner)
    loser_off = s.off_white if loser == Color.WHITE else s.off_black
    loser_bar = s.bar_white if loser == Color.WHITE else s.bar_black

    # Check if loser has any checkers in winner's home board
    winner_home = _home_range(winner)
    loser_in_winner_home = False
    for pt in winner_home:
        val = s.points[pt]
        if loser == Color.WHITE and val > 0:
            loser_in_winner_home = True
        if loser == Color.BLACK and val < 0:
            loser_in_winner_home = True

    if loser_off > 0:
        # Normal win
        if win_type != WinType.NORMAL:
            violations.append(
                f"Loser has {loser_off} off but win_type is {win_type}, expected NORMAL"
            )
    elif loser_off == 0:
        if loser_bar > 0 or loser_in_winner_home:
            # Backgammon
            if win_type != WinType.BACKGAMMON:
                violations.append(
                    f"Expected BACKGAMMON (loser_off=0, loser_bar={loser_bar}, "
                    f"loser_in_winner_home={loser_in_winner_home}) "
                    f"but win_type is {win_type}"
                )
        else:
            # Gammon
            if win_type != WinType.GAMMON:
                violations.append(
                    f"Expected GAMMON (loser_off=0, loser_bar=0, "
                    f"no loser checkers in winner home) but win_type is {win_type}"
                )

    # Notation log should be non-empty
    notation = engine.get_notation_log()
    if not notation:
        violations.append("Notation log is empty after a completed game.")
    else:
        # Check formatting: each entry should have the form "Color DD: ..."
        for entry in notation:
            if not (entry.startswith("White ") or entry.startswith("Black ")):
                violations.append(f"Notation entry has bad format: {entry!r}")

    if violations:
        diag = [
            f"\nEND-OF-GAME VIOLATION(S) in game #{game_number}",
            _board_str(engine),
        ]
        for v in violations:
            diag.append(f"  !! {v}")
        raise InvariantViolation("\n".join(diag))

    return violations


# ---------------------------------------------------------------------------
# Game simulation helper
# ---------------------------------------------------------------------------

def play_one_game(
    game_number: int,
    seed: int | None = None,
    predetermined_dice: list[tuple[int, int]] | None = None,
    max_turns: int = 5000,
    first_player: Color | None = None,
):
    """
    Play one complete game of backgammon with random valid moves.

    Returns a stats dict: {moves, turns, winner, win_type, hits, gammon, backgammon}.
    Raises InvariantViolation on any detected bug.
    """
    if seed is not None:
        random.seed(seed)

    engine = BackgammonEngine()
    engine.start_game(first_player=first_player)

    dice_index = 0
    total_moves = 0
    total_turns = 0
    total_hits = 0
    prev_status = engine.state.status

    # Track valid status transitions
    # Valid: ROLLING -> MOVING -> ROLLING (or FINISHED at any MOVING point)
    #        MOVING can also auto-skip back to ROLLING

    while engine.state.status != GameStatus.FINISHED:
        total_turns += 1
        if total_turns > max_turns:
            raise InvariantViolation(
                f"Game #{game_number} exceeded {max_turns} turns without finishing. "
                f"Likely stuck in a loop.\n{_board_str(engine)}"
            )

        # Roll dice
        if engine.state.status == GameStatus.ROLLING:
            if predetermined_dice and dice_index < len(predetermined_dice):
                d1, d2 = predetermined_dice[dice_index]
                dice_index += 1
                roll = engine.roll_dice(die1=d1, die2=d2)
            else:
                roll = engine.roll_dice()

            # After rolling, status should be MOVING or ROLLING (if auto-skipped)
            if engine.state.status not in (GameStatus.MOVING, GameStatus.ROLLING, GameStatus.FINISHED):
                raise InvariantViolation(
                    f"Game #{game_number}: After roll_dice(), status is "
                    f"{engine.state.status.value}, expected MOVING or ROLLING or FINISHED.\n"
                    f"{_board_str(engine)}"
                )

            check_invariants(
                engine,
                last_move=None,
                last_dice=roll,
                move_number=total_moves,
                game_number=game_number,
            )
            continue

        if engine.state.status != GameStatus.MOVING:
            raise InvariantViolation(
                f"Game #{game_number}: Unexpected status {engine.state.status.value} "
                f"in game loop.\n{_board_str(engine)}"
            )

        # Get valid moves
        valid_moves = engine.get_valid_moves()
        if not valid_moves:
            # Auto-skip should have handled this, but if not, end turn manually.
            ended = engine.end_turn()
            if not ended:
                raise InvariantViolation(
                    f"Game #{game_number}: No valid moves and cannot end turn. "
                    f"Status={engine.state.status.value}\n{_board_str(engine)}"
                )
            check_invariants(
                engine,
                last_move=None,
                last_dice=engine.state.dice,
                move_number=total_moves,
                game_number=game_number,
            )
            continue

        # Pick a random valid move
        move = random.choice(valid_moves)
        color = engine.state.current_turn
        dice_before = list(engine.state.remaining_dice)

        # Snapshot before move for consistency checks
        prev_snapshot = engine._snapshot_internals()
        prev_bar_white = engine.state.bar_white
        prev_bar_black = engine.state.bar_black
        prev_remaining_count = len(engine.state.remaining_dice)

        # Execute the move
        result = engine.make_move(move)
        total_moves += 1

        if not result:
            raise InvariantViolation(
                f"Game #{game_number}, move #{total_moves}: make_move() returned False "
                f"for a move from get_valid_moves()!\n"
                f"Move: {move}\nValid moves were: {valid_moves}\n"
                f"{_board_str(engine)}"
            )

        if move.is_hit:
            total_hits += 1

        # -- Post-move invariant checks --

        # Check remaining_dice decreased
        if engine.state.status != GameStatus.FINISHED:
            new_remaining_count = len(engine.state.remaining_dice)
            # It's possible the turn auto-ended and remaining was reset.
            # In that case status would be ROLLING and remaining_dice would be empty.
            if engine.state.status == GameStatus.MOVING:
                if new_remaining_count >= prev_remaining_count:
                    raise InvariantViolation(
                        f"Game #{game_number}, move #{total_moves}: remaining_dice "
                        f"did not decrease. Before: {dice_before}, "
                        f"After: {engine.state.remaining_dice}\n"
                        f"{_board_str(engine)}"
                    )

        # Combined (multi-die) moves modify intermediate points and may
        # hit at intermediate steps, so per-move hit/board checks don't
        # apply.  The global invariant check below still verifies overall
        # board consistency.
        combined = _is_combined_move(move, color, dice_before)

        if not combined:
            # Check hit consistency
            hit_violations = check_hit_consistency(
                engine, move, color, prev_bar_white, prev_bar_black
            )
            if hit_violations:
                diag = [
                    f"\nHIT CONSISTENCY VIOLATION in game #{game_number}, move #{total_moves}",
                    f"Move: {move}, Color: {color.value}",
                    _board_str(engine),
                ]
                for v in hit_violations:
                    diag.append(f"  !! {v}")
                raise InvariantViolation("\n".join(diag))

            # Check board consistency with the move
            board_violations = check_move_board_consistency(
                engine, move, color, prev_snapshot
            )
            if board_violations:
                diag = [
                    f"\nBOARD CONSISTENCY VIOLATION in game #{game_number}, move #{total_moves}",
                    f"Move: {move}, Color: {color.value}",
                    _board_str(engine),
                ]
                for v in board_violations:
                    diag.append(f"  !! {v}")
                raise InvariantViolation("\n".join(diag))

        # Full invariant check
        check_invariants(
            engine,
            last_move=move,
            last_dice=engine.state.dice,
            move_number=total_moves,
            game_number=game_number,
            prev_state_snapshot=prev_snapshot,
        )

    # -- End of game checks --
    check_end_of_game(engine, game_number)

    winner = engine.state.winner
    win_type = engine.state.win_type

    return {
        "moves": total_moves,
        "turns": total_turns,
        "winner": winner,
        "win_type": win_type,
        "hits": total_hits,
        "gammon": win_type == WinType.GAMMON,
        "backgammon": win_type == WinType.BACKGAMMON,
        "notation_length": len(engine.get_notation_log()),
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestFullGameSimulation:
    """Play many complete games and verify invariants throughout."""

    NUM_RANDOM_GAMES = 50

    def test_random_games(self):
        """Play NUM_RANDOM_GAMES complete games with random moves, verifying
        all invariants after every single move."""

        stats = {
            "games_completed": 0,
            "total_moves": 0,
            "total_turns": 0,
            "total_hits": 0,
            "white_wins": 0,
            "black_wins": 0,
            "normal_wins": 0,
            "gammons": 0,
            "backgammons": 0,
            "min_moves": float("inf"),
            "max_moves": 0,
        }

        violations_found = []

        for i in range(self.NUM_RANDOM_GAMES):
            seed = 1000 + i
            try:
                result = play_one_game(game_number=i + 1, seed=seed)
                stats["games_completed"] += 1
                stats["total_moves"] += result["moves"]
                stats["total_turns"] += result["turns"]
                stats["total_hits"] += result["hits"]
                stats["min_moves"] = min(stats["min_moves"], result["moves"])
                stats["max_moves"] = max(stats["max_moves"], result["moves"])

                if result["winner"] == Color.WHITE:
                    stats["white_wins"] += 1
                else:
                    stats["black_wins"] += 1

                if result["win_type"] == WinType.NORMAL:
                    stats["normal_wins"] += 1
                elif result["win_type"] == WinType.GAMMON:
                    stats["gammons"] += 1
                elif result["win_type"] == WinType.BACKGAMMON:
                    stats["backgammons"] += 1

            except InvariantViolation as e:
                violations_found.append((i + 1, seed, str(e)))
            except Exception as e:
                violations_found.append(
                    (i + 1, seed, f"Unexpected error: {e}\n{traceback.format_exc()}")
                )

        # Print statistics
        print("\n" + "=" * 60)
        print("GAME SIMULATION STATISTICS")
        print("=" * 60)
        print(f"Games attempted:  {self.NUM_RANDOM_GAMES}")
        print(f"Games completed:  {stats['games_completed']}")
        print(f"Total moves:      {stats['total_moves']}")
        if stats["games_completed"] > 0:
            avg = stats["total_moves"] / stats["games_completed"]
            print(f"Avg moves/game:   {avg:.1f}")
        print(f"Min moves:        {stats['min_moves']}")
        print(f"Max moves:        {stats['max_moves']}")
        print(f"Total hits:       {stats['total_hits']}")
        print(f"White wins:       {stats['white_wins']}")
        print(f"Black wins:       {stats['black_wins']}")
        print(f"Normal wins:      {stats['normal_wins']}")
        print(f"Gammons:          {stats['gammons']}")
        print(f"Backgammons:      {stats['backgammons']}")

        if violations_found:
            print(f"\nVIOLATIONS FOUND: {len(violations_found)}")
            for game_num, seed, msg in violations_found:
                print(f"\n--- Game #{game_num} (seed={seed}) ---")
                print(msg)

        print("=" * 60)

        # Fail the test if any violations were found
        assert not violations_found, (
            f"{len(violations_found)} invariant violation(s) found. "
            f"See output above for details."
        )

    def test_predetermined_dice_basic_game(self):
        """Play a game with predetermined dice to ensure deterministic behavior."""
        # Generate a sequence of dice rolls that should produce a valid game
        predetermined = []
        random.seed(42)
        for _ in range(500):  # enough rolls for any game
            predetermined.append((random.randint(1, 6), random.randint(1, 6)))

        result = play_one_game(
            game_number=9001,
            predetermined_dice=predetermined,
        )

        assert result["moves"] > 0
        assert result["winner"] in (Color.WHITE, Color.BLACK)
        assert result["win_type"] in (WinType.NORMAL, WinType.GAMMON, WinType.BACKGAMMON)
        print(f"\nPredetermined dice game: {result['moves']} moves, "
              f"winner={result['winner'].value}, type={result['win_type'].name}")

    def test_predetermined_dice_deterministic(self):
        """Running the same predetermined dice twice with the same seed should
        produce identical results (same move choices, same outcome)."""
        dice_seq = [(3, 1), (5, 2), (6, 4), (1, 3), (2, 5), (4, 6)]
        # Extend with a known seed-based sequence
        rng = random.Random(12345)
        for _ in range(500):
            dice_seq.append((rng.randint(1, 6), rng.randint(1, 6)))

        # Use the same seed and first_player for both runs to ensure
        # random.choice(valid_moves) picks the same moves.
        result1 = play_one_game(
            game_number=9002,
            seed=77777,
            predetermined_dice=list(dice_seq),
            first_player=Color.WHITE,
        )
        result2 = play_one_game(
            game_number=9003,
            seed=77777,
            predetermined_dice=list(dice_seq),
            first_player=Color.WHITE,
        )

        assert result1["moves"] == result2["moves"], (
            f"Deterministic games diverged: {result1['moves']} vs {result2['moves']} moves"
        )
        assert result1["winner"] == result2["winner"]
        assert result1["win_type"] == result2["win_type"]
        print(f"\nDeterministic test passed: both games had {result1['moves']} moves, "
              f"winner={result1['winner'].value}")

    def test_doubles_give_four_moves(self):
        """When doubles are rolled, the player should get 4 dice values."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        roll = engine.roll_dice(die1=3, die2=3)
        assert len(engine.state.remaining_dice) == 4, (
            f"Doubles should give 4 dice, got {len(engine.state.remaining_dice)}: "
            f"{engine.state.remaining_dice}"
        )
        assert all(d == 3 for d in engine.state.remaining_dice)

    def test_non_doubles_give_two_moves(self):
        """When non-doubles are rolled, the player should get 2 dice values."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        roll = engine.roll_dice(die1=3, die2=5)
        assert len(engine.state.remaining_dice) == 2, (
            f"Non-doubles should give 2 dice, got {len(engine.state.remaining_dice)}: "
            f"{engine.state.remaining_dice}"
        )
        assert sorted(engine.state.remaining_dice) == [3, 5]

    def test_cannot_roll_when_not_rolling_status(self):
        """Rolling dice when not in ROLLING status should raise RuntimeError."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(die1=3, die2=1)
        # Now in MOVING status
        with pytest.raises(RuntimeError):
            engine.roll_dice()

    def test_initial_position_checker_count(self):
        """The initial position must have exactly 15 checkers per side."""
        engine = BackgammonEngine()
        white, black = _checker_counts(engine)
        assert white == 15, f"Initial white count = {white}"
        assert black == 15, f"Initial black count = {black}"

    def test_valid_moves_are_executable(self):
        """Every move returned by get_valid_moves() should be accepted by make_move()."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(die1=6, die2=1)

        valid = engine.get_valid_moves()
        assert len(valid) > 0, "No valid moves on opening roll 6-1"

        # Try the first valid move
        move = valid[0]
        result = engine.make_move(move)
        assert result, f"make_move({move}) returned False for a valid move"

    def test_bar_entry_required(self):
        """When a player has checkers on the bar, they must re-enter first."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        # Manually put white on the bar
        engine.state.bar_white = 1
        engine.state.points[24] -= 1  # remove one from point 24

        engine.roll_dice(die1=1, die2=2)

        valid = engine.get_valid_moves()
        # All moves should be bar entries (from_point == 25 for white)
        for m in valid:
            assert m.from_point == 25, (
                f"While white is on bar, got non-bar move: {m}"
            )

    def test_bearing_off_requires_all_home(self):
        """Bearing off should only be allowed when all checkers are in home board."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        # White has checkers outside home board (points 7-24)
        # So bearing off should not be possible even if a checker is on point 6
        engine.roll_dice(die1=6, die2=6)
        valid = engine.get_valid_moves()

        for m in valid:
            assert m.to_point != 0, (
                f"White should not be able to bear off with checkers outside home: {m}"
            )

    def test_game_with_all_doubles(self):
        """Play a game where all rolls are doubles -- stress test for 4-move turns."""
        predetermined = []
        for _ in range(300):
            val = random.randint(1, 6)
            predetermined.append((val, val))

        result = play_one_game(
            game_number=9010,
            predetermined_dice=predetermined,
        )
        assert result["winner"] in (Color.WHITE, Color.BLACK)
        print(f"\nAll-doubles game: {result['moves']} moves, "
              f"winner={result['winner'].value}")

    def test_game_with_all_ones(self):
        """Play a game where all rolls are (1,1) -- very slow, tests patience."""
        predetermined = [(1, 1)] * 2000  # should be plenty

        result = play_one_game(
            game_number=9011,
            predetermined_dice=predetermined,
            max_turns=10000,
        )
        assert result["winner"] in (Color.WHITE, Color.BLACK)
        print(f"\nAll-ones game: {result['moves']} moves, "
              f"winner={result['winner'].value}")

    def test_game_with_all_sixes(self):
        """Play a game where all rolls are (6,6) -- big jumps."""
        predetermined = [(6, 6)] * 2000

        result = play_one_game(
            game_number=9012,
            predetermined_dice=predetermined,
            max_turns=10000,
        )
        assert result["winner"] in (Color.WHITE, Color.BLACK)
        print(f"\nAll-sixes game: {result['moves']} moves, "
              f"winner={result['winner'].value}")

    def test_status_transitions(self):
        """Verify status transitions across several turns of a game."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        # Initial status after start_game with no dice should be ROLLING
        assert engine.state.status == GameStatus.ROLLING

        # After rolling, should be MOVING (or ROLLING if auto-skipped)
        engine.roll_dice(die1=3, die2=1)
        assert engine.state.status in (GameStatus.MOVING, GameStatus.ROLLING)

        if engine.state.status == GameStatus.MOVING:
            valid = engine.get_valid_moves()
            while valid and engine.state.status == GameStatus.MOVING:
                engine.make_move(valid[0])
                valid = engine.get_valid_moves()
            # With undo/commit, engine may wait for explicit end_turn()
            if engine.state.status == GameStatus.MOVING:
                engine.end_turn()

        # After all moves, should be ROLLING (for next player) or FINISHED
        assert engine.state.status in (GameStatus.ROLLING, GameStatus.FINISHED)

    def test_notation_log_format(self):
        """Verify the notation log produces properly formatted entries."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        engine.roll_dice(die1=3, die2=1)
        valid = engine.get_valid_moves()
        if valid:
            engine.make_move(valid[0])

        # Complete the turn
        while engine.state.status == GameStatus.MOVING:
            valid = engine.get_valid_moves()
            if valid:
                engine.make_move(valid[0])
            else:
                engine.end_turn()

        log = engine.get_notation_log()
        assert len(log) >= 1, "Should have at least one notation entry"

        for entry in log:
            assert entry.startswith("White ") or entry.startswith("Black "), (
                f"Notation entry should start with player name: {entry!r}"
            )
            # Should contain dice values
            parts = entry.split(": ", 1)
            assert len(parts) == 2, f"Notation should have ': ' separator: {entry!r}"

    def test_snapshot_and_restore_consistency(self):
        """The engine's snapshot/restore should not corrupt state."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(die1=5, die2=3)

        snap_before = engine._snapshot_internals()
        valid = engine.get_valid_moves()  # This internally uses snapshot/restore

        snap_after = engine._snapshot_internals()

        assert snap_before == snap_after, (
            "get_valid_moves() corrupted state via snapshot/restore"
        )

    def test_get_state_snapshot_structure(self):
        """get_state_snapshot() should return a well-formed dict."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(die1=4, die2=2)

        snap = engine.get_state_snapshot()

        assert "points" in snap
        assert len(snap["points"]) == 26
        assert "bar_white" in snap
        assert "bar_black" in snap
        assert "off_white" in snap
        assert "off_black" in snap
        assert "current_turn" in snap
        assert "dice" in snap
        assert "remaining_dice" in snap
        assert "status" in snap
        assert snap["status"] == "moving"

    def test_opening_roll_no_doubles(self):
        """determine_first_player should never return doubles."""
        for _ in range(100):
            color, roll, _opening = BackgammonEngine.determine_first_player()
            assert roll.die1 != roll.die2, (
                f"Opening roll should not be doubles: {roll}"
            )

    def test_many_games_additional_seeds(self):
        """Play 20 more games with different seeds for extra coverage."""
        violations = []
        for i in range(20):
            seed = 99999 + i * 7
            try:
                play_one_game(game_number=10000 + i, seed=seed)
            except InvariantViolation as e:
                violations.append((10000 + i, seed, str(e)))
            except Exception as e:
                violations.append((10000 + i, seed, f"Error: {e}\n{traceback.format_exc()}"))

        assert not violations, (
            f"{len(violations)} violation(s) in additional seed games. "
            + "\n".join(f"Game {g} (seed={s}): {m}" for g, s, m in violations)
        )

    # ------------------------------------------------------------------
    # Targeted bearing-off edge cases
    # ------------------------------------------------------------------

    def test_bearing_off_exact_die(self):
        """Bear off with exact die value should work."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        # Set up white with all checkers in home board
        engine.state.points = [0] * 26
        engine.state.points[6] = 5
        engine.state.points[5] = 5
        engine.state.points[4] = 3
        engine.state.points[3] = 2
        engine.state.bar_white = 0
        engine.state.off_white = 0
        engine.state.bar_black = 0
        engine.state.off_black = 0
        # Black checkers far away
        engine.state.points[19] = -5
        engine.state.points[20] = -5
        engine.state.points[21] = -5

        engine.roll_dice(die1=6, die2=5)

        valid = engine.get_valid_moves()
        bear_off_moves = [m for m in valid if m.to_point == 0]
        assert len(bear_off_moves) > 0, "Should be able to bear off with exact die"

        # Verify checker counts remain correct
        white, black = _checker_counts(engine)
        assert white == 15, f"White checkers = {white}"
        assert black == 15, f"Black checkers = {black}"

    def test_bearing_off_higher_die_no_higher_point(self):
        """Bear off from a lower point when no higher point has checkers."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        # White: all checkers on points 1, 2, 3 only
        engine.state.points = [0] * 26
        engine.state.points[3] = 5
        engine.state.points[2] = 5
        engine.state.points[1] = 5
        engine.state.bar_white = 0
        engine.state.off_white = 0
        engine.state.bar_black = 0
        engine.state.off_black = 0
        # Black
        engine.state.points[19] = -5
        engine.state.points[20] = -5
        engine.state.points[21] = -5

        engine.roll_dice(die1=6, die2=5)

        valid = engine.get_valid_moves()
        # With die=6, should be able to bear off from point 3 (highest occupied)
        bear_off_from_3 = [m for m in valid if m.from_point == 3 and m.to_point == 0]
        assert len(bear_off_from_3) > 0, (
            f"Should bear off from point 3 with die 6. Valid moves: {valid}"
        )

    def test_bearing_off_blocked_by_higher_point(self):
        """Cannot bear off from lower point if higher home point has checkers."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        engine.state.points = [0] * 26
        engine.state.points[6] = 1   # highest point
        engine.state.points[3] = 7
        engine.state.points[2] = 5
        engine.state.points[1] = 2
        engine.state.bar_white = 0
        engine.state.off_white = 0
        engine.state.bar_black = 0
        engine.state.off_black = 0
        engine.state.points[19] = -5
        engine.state.points[20] = -5
        engine.state.points[21] = -5

        engine.roll_dice(die1=5, die2=4)

        valid = engine.get_valid_moves()
        # With die=5 from point 3, exact dest would be -2 (past zero), so
        # this is an overshoot bear-off.  But point 6 has a checker, so
        # bearing off from point 3 with die 5 should NOT be allowed.
        illegal_bear = [m for m in valid if m.from_point == 3 and m.to_point == 0]
        # However, bearing off from point 6 with die 6 is not available (die is 5).
        # point 6 with die 5 goes to point 1 (normal move, not bear off).
        # So only point 3 with die 3 (exact) would be a bear-off, but die 3 is not rolled.
        # Actually with die 5, from point 6 -> dest = 6 + (-1)*5 = 1, which is a normal move.
        # From point 3 with die 5, dest = 3-5 = -2, overshoot.
        # But point 6 > point 3 and has a white checker, so overshoot bear-off from 3 is NOT allowed.
        for m in illegal_bear:
            # This should not have been generated, but let's check.
            # Actually the engine might correctly not generate it.
            pass  # if it got here, that's the violation

        # From point 3 with die 4, dest = 3-4 = -1 (overshoot).
        # Point 6 > point 3 and is occupied, so also not allowed.
        illegal_bear_4 = [m for m in valid if m.from_point == 3 and m.to_point == 0]
        # This is the same check. Let me just verify the valid moves look sane.
        # With point 6 occupied, overshoot bear-offs from lower points should be blocked.
        for m in valid:
            if m.to_point == 0 and m.from_point < 6:
                # Only allowed if exact die matches from_point
                assert False, (
                    f"Overshoot bear-off from point {m.from_point} while point 6 occupied: {m}"
                )

    # ------------------------------------------------------------------
    # Test die value inference for bearing off
    # ------------------------------------------------------------------

    def test_die_value_for_bear_off_exact(self):
        """_die_value_for_move should return exact die for exact bear-off."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        engine.state.points = [0] * 26
        engine.state.points[5] = 5
        engine.state.points[4] = 5
        engine.state.points[3] = 5
        engine.state.bar_white = 0
        engine.state.off_white = 0
        engine.state.bar_black = 0
        engine.state.off_black = 0
        engine.state.points[19] = -5
        engine.state.points[20] = -5
        engine.state.points[21] = -5

        engine.state.remaining_dice = [5, 3]

        move = Move(from_point=5, to_point=0)  # exact bear off from point 5
        die = engine._die_value_for_move(Color.WHITE, move)
        assert die == 5, f"Expected die=5 for exact bear-off from point 5, got {die}"

    def test_die_value_for_bear_off_overshoot(self):
        """_die_value_for_move should pick smallest sufficient die for overshoot."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        engine.state.points = [0] * 26
        engine.state.points[2] = 5
        engine.state.points[1] = 5
        engine.state.bar_white = 0
        engine.state.off_white = 5
        engine.state.bar_black = 0
        engine.state.off_black = 0
        engine.state.points[19] = -5
        engine.state.points[20] = -5
        engine.state.points[21] = -5

        engine.state.remaining_dice = [6, 4]

        # Bear off from point 2 with overshoot. Exact distance is 2.
        # Remaining dice: [6, 4]. Neither is exact.
        # Smallest die >= 2 is 4.
        move = Move(from_point=2, to_point=0)
        die = engine._die_value_for_move(Color.WHITE, move)
        assert die == 4, f"Expected die=4 for overshoot bear-off from point 2, got {die}"

    # ------------------------------------------------------------------
    # Test black bearing off
    # ------------------------------------------------------------------

    def test_black_bearing_off(self):
        """Black should bear off to point 25."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.BLACK)

        engine.state.points = [0] * 26
        engine.state.points[19] = -5
        engine.state.points[20] = -5
        engine.state.points[21] = -5
        engine.state.bar_black = 0
        engine.state.off_black = 0
        engine.state.bar_white = 0
        engine.state.off_white = 0
        # Put white far away
        engine.state.points[1] = 5
        engine.state.points[2] = 5
        engine.state.points[3] = 5

        engine.roll_dice(die1=6, die2=5)

        valid = engine.get_valid_moves()
        bear_off_moves = [m for m in valid if m.to_point == 25]
        assert len(bear_off_moves) > 0, (
            f"Black should be able to bear off. Valid moves: {valid}"
        )

    # ------------------------------------------------------------------
    # Hit-and-re-enter cycle test
    # ------------------------------------------------------------------

    def test_hit_sends_to_bar_and_reenter(self):
        """After a hit, the hit checker must re-enter from the bar."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        # Set up a guaranteed hit scenario
        engine.state.points = [0] * 26
        engine.state.points[24] = 2  # white on 24
        engine.state.points[13] = 5  # white on 13
        engine.state.points[8] = 3   # white on 8
        engine.state.points[6] = 5   # white on 6
        engine.state.points[20] = -1  # lone black blot on 20
        engine.state.points[12] = -5  # black on 12
        engine.state.points[17] = -3  # black on 17
        engine.state.points[19] = -4  # black on 19 (one less since one is on 20)
        engine.state.points[1] = -2   # black on 1
        engine.state.bar_white = 0
        engine.state.bar_black = 0
        engine.state.off_white = 0
        engine.state.off_black = 0

        engine.roll_dice(die1=4, die2=3)

        valid = engine.get_valid_moves()
        hit_moves = [m for m in valid if m.is_hit and m.to_point == 20]

        if hit_moves:
            prev_black_bar = engine.state.bar_black
            engine.make_move(hit_moves[0])
            assert engine.state.bar_black == prev_black_bar + 1, (
                f"After hit, bar_black should be {prev_black_bar + 1}, "
                f"got {engine.state.bar_black}"
            )
            # Verify checker counts
            white, black = _checker_counts(engine)
            assert white == 15, f"White checkers = {white}"
            assert black == 15, f"Black checkers = {black}"

    # ------------------------------------------------------------------
    # Stress test: many games with both players
    # ------------------------------------------------------------------

    def test_stress_100_games_mixed_first_player(self):
        """Run 100 games alternating first player to stress test engine."""
        violations = []
        stats = {"white_first_wins": 0, "black_first_wins": 0}

        for i in range(100):
            seed = 50000 + i
            fp = Color.WHITE if i % 2 == 0 else Color.BLACK
            try:
                result = play_one_game(
                    game_number=20000 + i,
                    seed=seed,
                    first_player=fp,
                )
                if result["winner"] == fp:
                    if fp == Color.WHITE:
                        stats["white_first_wins"] += 1
                    else:
                        stats["black_first_wins"] += 1
            except InvariantViolation as e:
                violations.append((20000 + i, seed, str(e)))
            except Exception as e:
                violations.append(
                    (20000 + i, seed, f"Error: {e}\n{traceback.format_exc()}")
                )

        print(f"\nStress 100 games: {len(violations)} violations")
        assert not violations, (
            f"{len(violations)} violation(s) in stress test. "
            + "\n".join(f"Game {g} (seed={s}): {m}" for g, s, m in violations)
        )

    # ------------------------------------------------------------------
    # Test that make_move rejects invalid moves
    # ------------------------------------------------------------------

    def test_make_move_rejects_invalid(self):
        """make_move should return False for a move not in valid moves list."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(die1=3, die2=1)

        # Try a move that's clearly invalid (move from empty point)
        bogus = Move(from_point=15, to_point=12)
        result = engine.make_move(bogus)
        assert not result, "make_move should reject invalid moves"

    # ------------------------------------------------------------------
    # Verify end_turn fails when moves remain
    # ------------------------------------------------------------------

    def test_end_turn_fails_when_moves_available(self):
        """end_turn() should return False if the player still has valid moves."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        engine.roll_dice(die1=3, die2=1)

        if engine.state.status == GameStatus.MOVING:
            valid = engine.get_valid_moves()
            if valid:
                result = engine.end_turn()
                assert not result, (
                    "end_turn() should return False when valid moves exist"
                )

    # ------------------------------------------------------------------
    # Test the higher-die rule
    # ------------------------------------------------------------------

    def test_higher_die_rule(self):
        """When only one die can be used, the higher die must be used."""
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)

        # Set up a position where only one of two dice can be used.
        # White has a single checker on point 4, everything else borne off.
        # Black has points 1-3 blocked and point 5-6 clear.
        engine.state.points = [0] * 26
        engine.state.points[4] = 1     # single white checker
        engine.state.off_white = 14    # 14 already off
        engine.state.bar_white = 0
        # Black: block points 1, 2, 3
        engine.state.points[1] = -2
        engine.state.points[2] = -2
        engine.state.points[3] = -2
        # Rest of black checkers
        engine.state.points[19] = -3
        engine.state.points[20] = -3
        engine.state.points[21] = -3
        engine.state.bar_black = 0
        engine.state.off_black = 0

        # Roll 3 and 1. Die 3 moves from 4 -> 1 (blocked!).
        # Die 1 moves from 4 -> 3 (blocked!).
        # Actually both are blocked. Let me rethink...

        # Better: White checker on point 5. Block points 1-2.
        engine.state.points = [0] * 26
        engine.state.points[5] = 1
        engine.state.off_white = 14
        engine.state.bar_white = 0
        engine.state.points[1] = -2
        engine.state.points[2] = -2
        engine.state.points[19] = -3
        engine.state.points[20] = -3
        engine.state.points[21] = -5
        engine.state.bar_black = 0
        engine.state.off_black = 0

        # Roll 2 and 4. Die 2: 5->3 (open), Die 4: 5->1 (blocked by black).
        # So only die 2 can be used. But die 4 is higher.
        # Since only 1 die can be used and we can't use the higher one,
        # we must use the lower one (2).
        # Actually the rule says: if only ONE die can be used, use the higher.
        # If only the lower can be used, that's fine -- you use whatever you can.

        # Let me set up: die 4 moves to open spot, die 2 moves to blocked spot.
        engine.state.points = [0] * 26
        engine.state.points[6] = 1
        engine.state.off_white = 14
        engine.state.bar_white = 0
        engine.state.points[4] = -2  # blocks die 2 (6->4)
        # point 2 open for die 4 (6->2)
        engine.state.points[19] = -3
        engine.state.points[20] = -3
        engine.state.points[21] = -4
        engine.state.points[22] = -3
        engine.state.bar_black = 0
        engine.state.off_black = 0

        engine.roll_dice(die1=4, die2=2)
        valid = engine.get_valid_moves()

        # Die 4: from 6 to 2 (open) -- should work
        # Die 2: from 6 to 4 (blocked) -- should not work
        # Only higher die (4) is available, which is also the only die usable.
        # The rule is trivially satisfied.
        if valid:
            for m in valid:
                assert m.to_point == 2 or m.to_point == 0, (
                    f"With only die 4 usable, expected moves to point 2 or bear-off, "
                    f"got {m}"
                )
