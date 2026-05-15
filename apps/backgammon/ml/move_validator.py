"""
Move Validator and Expert Judge
================================
Validates that the ML model's move selections are legal and provides
expert analysis of move quality. This module serves as the quality
assurance layer ensuring the model only suggests valid moves.

It also provides heuristic move scoring based on established backgammon
principles, which can be used to:
1. Validate model outputs are sensible
2. Label training data with move quality scores
3. Compare model choices against expert heuristics
"""

import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from app.game_engine import BackgammonEngine, Color, GameStatus, Move


# Backgammon strategic principles for move scoring
STRATEGIC_WEIGHTS = {
    'bear_off': 50.0,          # Bearing off is always excellent
    'hit_blot': 25.0,          # Hitting opponent blots
    'make_point': 20.0,        # Making a new point (2+ checkers)
    'extend_prime': 30.0,      # Extending a prime (consecutive points)
    'anchor_opponent_home': 15.0,  # Anchoring in opponent's home board
    'advance_builder': 10.0,   # Moving builders toward home
    'leave_blot_penalty': -15.0,   # Leaving a blot
    'break_point_penalty': -10.0,  # Breaking a made point
    'stack_penalty': -5.0,     # Stacking too many on one point (>5)
    'home_board_strength': 8.0,    # Building home board points
    'bar_entry': 40.0,         # Getting off the bar
    'pip_advantage': 0.5,      # Per-pip race advantage
}


def validate_move(engine: BackgammonEngine, move: Move) -> tuple[bool, str]:
    """Validate that a move is legal in the current position.

    Args:
        engine: Current game engine state.
        move: The move to validate.

    Returns:
        Tuple of (is_valid, reason_string).
    """
    valid_moves = engine.get_valid_moves()

    for vm in valid_moves:
        if vm.from_point == move.from_point and vm.to_point == move.to_point:
            return True, "Legal move"

    return False, f"Move {move.from_point}->{move.to_point} not in valid moves list"


def score_move_expert(engine: BackgammonEngine, move: Move, color: Color) -> dict:
    """Score a move using expert backgammon heuristics.

    Returns a detailed breakdown of the move's strategic value.

    Args:
        engine: Current game engine state.
        move: The move to evaluate.
        color: The player making the move.

    Returns:
        Dictionary with score breakdown.
    """
    state = engine.state
    score = 0.0
    reasons = []
    inc = 1 if color == Color.WHITE else -1

    # 1. Bearing off
    off_point = 0 if color == Color.WHITE else 25
    if move.to_point == off_point:
        score += STRATEGIC_WEIGHTS['bear_off']
        reasons.append(('bear_off', STRATEGIC_WEIGHTS['bear_off']))

    # 2. Hitting
    if move.is_hit:
        score += STRATEGIC_WEIGHTS['hit_blot']
        reasons.append(('hit_blot', STRATEGIC_WEIGHTS['hit_blot']))

    # 3. Getting off the bar
    bar_point = 25 if color == Color.WHITE else 0
    if move.from_point == bar_point:
        score += STRATEGIC_WEIGHTS['bar_entry']
        reasons.append(('bar_entry', STRATEGIC_WEIGHTS['bar_entry']))

    # 4. Making a point (landing on a point with exactly 1 of our checkers)
    if 1 <= move.to_point <= 24:
        own_count = state.points[move.to_point] * inc
        if own_count == 1:  # Will become 2 = making a point
            score += STRATEGIC_WEIGHTS['make_point']
            reasons.append(('make_point', STRATEGIC_WEIGHTS['make_point']))

            # Check if it extends a prime
            prime_len = _count_prime_at(state, move.to_point, color)
            if prime_len >= 3:
                bonus = STRATEGIC_WEIGHTS['extend_prime'] * (prime_len - 2)
                score += bonus
                reasons.append(('extend_prime', bonus))

        # Home board point
        if color == Color.WHITE and 1 <= move.to_point <= 6:
            score += STRATEGIC_WEIGHTS['home_board_strength']
            reasons.append(('home_board', STRATEGIC_WEIGHTS['home_board_strength']))
        elif color == Color.BLACK and 19 <= move.to_point <= 24:
            score += STRATEGIC_WEIGHTS['home_board_strength']
            reasons.append(('home_board', STRATEGIC_WEIGHTS['home_board_strength']))

        # Stacking penalty
        if own_count >= 5:
            score += STRATEGIC_WEIGHTS['stack_penalty']
            reasons.append(('stack_penalty', STRATEGIC_WEIGHTS['stack_penalty']))

    # 5. Leaving a blot behind
    if 1 <= move.from_point <= 24:
        own_at_source = state.points[move.from_point] * inc
        if own_at_source == 2:  # Will become 1 = leaving a blot
            score += STRATEGIC_WEIGHTS['leave_blot_penalty']
            reasons.append(('leave_blot', STRATEGIC_WEIGHTS['leave_blot_penalty']))

    # 6. Breaking a point
    if 1 <= move.from_point <= 24:
        own_at_source = state.points[move.from_point] * inc
        if own_at_source == 2:  # Breaking a 2-stack
            score += STRATEGIC_WEIGHTS['break_point_penalty']
            reasons.append(('break_point', STRATEGIC_WEIGHTS['break_point_penalty']))

    return {
        'total_score': score,
        'reasons': reasons,
        'move': f"{move.from_point}->{move.to_point}",
        'is_hit': move.is_hit,
    }


def _count_prime_at(state, point: int, color: Color) -> int:
    """Count the length of a prime (consecutive made points) including the given point."""
    inc = 1 if color == Color.WHITE else -1
    prime_len = 0

    # Count consecutive made points in both directions
    for direction in [-1, 1]:
        p = point
        while 1 <= p <= 24:
            own = state.points[p] * inc
            if own >= 2:
                prime_len += 1
                p += direction
            else:
                break

    return prime_len - 1  # Subtract 1 because we counted 'point' twice


def rank_moves_expert(engine: BackgammonEngine, color: Color) -> list[dict]:
    """Rank all valid moves by expert heuristic score.

    Args:
        engine: Current game engine state.
        color: The player making the move.

    Returns:
        List of move analyses, sorted by score (best first).
    """
    valid_moves = engine.get_valid_moves()
    analyses = []

    for move in valid_moves:
        analysis = score_move_expert(engine, move, color)
        analysis['move_obj'] = move
        analyses.append(analysis)

    analyses.sort(key=lambda x: -x['total_score'])
    return analyses


def compare_model_vs_expert(engine, model_move: Move, color: Color) -> dict:
    """Compare the model's chosen move against the expert ranking.

    Args:
        engine: Current game engine state.
        model_move: The move selected by the ML model.
        color: The player making the move.

    Returns:
        Comparison analysis dictionary.
    """
    expert_ranking = rank_moves_expert(engine, color)

    if not expert_ranking:
        return {'agreement': True, 'rank': 0, 'total_moves': 0}

    model_rank = None
    for i, analysis in enumerate(expert_ranking):
        m = analysis['move_obj']
        if m.from_point == model_move.from_point and m.to_point == model_move.to_point:
            model_rank = i
            break

    best_move = expert_ranking[0]
    model_analysis = score_move_expert(engine, model_move, color)

    return {
        'agreement': model_rank == 0,
        'model_rank': model_rank,
        'total_moves': len(expert_ranking),
        'model_score': model_analysis['total_score'],
        'best_score': best_move['total_score'],
        'score_gap': best_move['total_score'] - model_analysis['total_score'],
        'model_reasons': model_analysis['reasons'],
        'best_reasons': best_move['reasons'],
    }


def validate_model_game(model_path: str, num_games: int = 100) -> dict:
    """Play games with the model and validate all moves are legal.

    Also tracks agreement with expert heuristics.

    Args:
        model_path: Path to trained model.
        num_games: Number of validation games.

    Returns:
        Validation report dictionary.
    """
    import torch
    from model import load_model, compute_equity
    from encoder import encode_state

    model = load_model(model_path)
    model.eval()

    total_moves = 0
    valid_moves_count = 0
    expert_agreements = 0
    total_score_gap = 0.0

    for _ in range(num_games):
        engine = BackgammonEngine()
        engine.start_game()
        move_count = 0

        while engine.state.status != GameStatus.FINISHED and move_count < 500:
            current_color = engine.state.current_turn

            if engine.state.status == GameStatus.ROLLING:
                engine.roll_dice()
                if engine.state.status != GameStatus.MOVING:
                    continue

            if engine.state.status == GameStatus.MOVING:
                while engine.state.status == GameStatus.MOVING:
                    valid_moves = engine.get_valid_moves()
                    if not valid_moves:
                        engine.end_turn()
                        break

                    # Model selects move
                    best_move = None
                    best_equity = float('-inf')
                    for move in valid_moves:
                        snapshot = engine._snapshot_internals()
                        engine._apply_move_internal(current_color, move)
                        with torch.no_grad():
                            features = encode_state(engine, current_color)
                            ft = torch.from_numpy(features)
                            outputs = model(ft)
                            equity = compute_equity(outputs).item()
                        engine._restore_internals(snapshot)
                        if equity > best_equity:
                            best_equity = equity
                            best_move = move

                    # Validate
                    is_valid, _ = validate_move(engine, best_move)
                    total_moves += 1
                    if is_valid:
                        valid_moves_count += 1

                    # Compare with expert
                    comparison = compare_model_vs_expert(engine, best_move, current_color)
                    if comparison.get('agreement'):
                        expert_agreements += 1
                    total_score_gap += comparison.get('score_gap', 0)

                    engine.make_move(best_move)
                    if engine.state.status == GameStatus.FINISHED:
                        break

                move_count += 1

    return {
        'num_games': num_games,
        'total_moves_evaluated': total_moves,
        'all_moves_valid': valid_moves_count == total_moves,
        'validity_rate': valid_moves_count / max(1, total_moves) * 100,
        'expert_agreement_rate': expert_agreements / max(1, total_moves) * 100,
        'avg_score_gap': total_score_gap / max(1, total_moves),
    }


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Validate backgammon model moves')
    parser.add_argument('model_path', help='Path to model file')
    parser.add_argument('--games', type=int, default=100, help='Validation games')
    args = parser.parse_args()

    results = validate_model_game(args.model_path, args.games)
    print("\nValidation Results:")
    print(f"  Games played: {results['num_games']}")
    print(f"  Total moves: {results['total_moves_evaluated']}")
    print(f"  All moves legal: {results['all_moves_valid']}")
    print(f"  Validity rate: {results['validity_rate']:.1f}%")
    print(f"  Expert agreement: {results['expert_agreement_rate']:.1f}%")
    print(f"  Avg score gap: {results['avg_score_gap']:.2f}")
