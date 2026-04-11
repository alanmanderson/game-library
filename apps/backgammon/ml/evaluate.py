"""
Model Evaluation
=================
Evaluates the trained backgammon model against baseline opponents:
1. Random player (selects random valid moves)
2. Simple heuristic player (basic positional strategy)

Also provides analysis of model predictions on standard positions.
"""

import sys
import os
import time
import random
import json
import numpy as np
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from app.game_engine import BackgammonEngine, Color, GameStatus, WinType, Move

from encoder import encode_state
from model import BackgammonNet, compute_equity, load_model


class RandomPlayer:
    """Baseline: selects random valid moves."""

    def select_move(self, engine: BackgammonEngine, valid_moves: list[Move]) -> Move:
        return random.choice(valid_moves) if valid_moves else None


class HeuristicPlayer:
    """Simple heuristic player using basic positional rules.

    Strategy priorities:
    1. Bear off if possible
    2. Hit opponent blots
    3. Make points (move to own occupied points)
    4. Avoid leaving blots
    5. Advance toward home board
    """

    def select_move(self, engine: BackgammonEngine, valid_moves: list[Move]) -> Move:
        if not valid_moves:
            return None

        color = engine.state.current_turn
        scored_moves = []

        for move in valid_moves:
            score = 0.0

            # Bearing off is always good
            if (color == Color.WHITE and move.to_point == 0) or \
               (color == Color.BLACK and move.to_point == 25):
                score += 100.0

            # Hitting is good
            if move.is_hit:
                score += 30.0

            # Making a point (stacking) is good
            if 1 <= move.to_point <= 24:
                val = engine.state.points[move.to_point]
                own_count = val if color == Color.WHITE else -val
                if own_count >= 1:
                    score += 15.0  # Making a point

            # Avoid leaving blots (penalize moves from stacked points)
            if 1 <= move.from_point <= 24:
                val = engine.state.points[move.from_point]
                own_count = val if color == Color.WHITE else -val
                if own_count == 2:
                    score -= 5.0  # Leaves a blot behind

            # Advance toward home board
            if color == Color.WHITE:
                if 1 <= move.to_point <= 6:
                    score += 5.0  # Moving to home board
                elif 1 <= move.to_point <= 12:
                    score += 2.0  # Moving toward home
            else:
                if 19 <= move.to_point <= 24:
                    score += 5.0
                elif 13 <= move.to_point <= 24:
                    score += 2.0

            scored_moves.append((score, move))

        scored_moves.sort(key=lambda x: -x[0])
        return scored_moves[0][1]


class NeuralPlayer:
    """Neural network player using the trained model."""

    def __init__(self, model: BackgammonNet, device: str = 'cpu'):
        self.model = model.to(device)
        self.model.eval()
        self.device = device

    def select_move(self, engine: BackgammonEngine, valid_moves: list[Move]) -> Move:
        if not valid_moves:
            return None

        current_color = engine.state.current_turn
        best_move = None
        best_equity = float('-inf')

        for move in valid_moves:
            snapshot = engine._snapshot_internals()
            engine._apply_move_internal(current_color, move)

            with torch.no_grad():
                features = encode_state(engine, current_color)
                features_tensor = torch.from_numpy(features).to(self.device)
                outputs = self.model(features_tensor)
                equity = compute_equity(outputs).item()

            engine._restore_internals(snapshot)

            if equity > best_equity:
                best_equity = equity
                best_move = move

        return best_move


def play_match(player_white, player_black, num_games: int = 1000, verbose: bool = False) -> dict:
    """Play a match between two players.

    Args:
        player_white: Player object for White.
        player_black: Player object for Black.
        num_games: Number of games to play.
        verbose: Print game-by-game results.

    Returns:
        Dictionary with match statistics.
    """
    white_wins = 0
    black_wins = 0
    white_gammons = 0
    black_gammons = 0
    white_backgammons = 0
    black_backgammons = 0
    total_points_white = 0
    total_points_black = 0
    total_moves = 0
    draws = 0

    start_time = time.time()

    for game_num in range(num_games):
        engine = BackgammonEngine()
        engine.start_game()

        move_count = 0
        max_moves = 500

        while engine.state.status != GameStatus.FINISHED and move_count < max_moves:
            current_color = engine.state.current_turn

            if engine.state.status == GameStatus.ROLLING:
                engine.roll_dice()
                if engine.state.status == GameStatus.ROLLING:
                    continue
                if engine.state.status == GameStatus.FINISHED:
                    break

            if engine.state.status == GameStatus.MOVING:
                player = player_white if current_color == Color.WHITE else player_black

                while engine.state.status == GameStatus.MOVING:
                    valid_moves = engine.get_valid_moves()
                    if not valid_moves:
                        engine.end_turn()
                        break

                    move = player.select_move(engine, valid_moves)
                    if move is None:
                        engine.end_turn()
                        break

                    success = engine.make_move(move)
                    if not success:
                        engine.end_turn()
                        break

                    if engine.state.status == GameStatus.FINISHED:
                        break

                move_count += 1

        total_moves += move_count

        if engine.state.winner == Color.WHITE:
            white_wins += 1
            win_type = engine.state.win_type
            if win_type == WinType.GAMMON:
                white_gammons += 1
                total_points_white += 2
            elif win_type == WinType.BACKGAMMON:
                white_backgammons += 1
                total_points_white += 3
            else:
                total_points_white += 1
        elif engine.state.winner == Color.BLACK:
            black_wins += 1
            win_type = engine.state.win_type
            if win_type == WinType.GAMMON:
                black_gammons += 1
                total_points_black += 2
            elif win_type == WinType.BACKGAMMON:
                black_backgammons += 1
                total_points_black += 3
            else:
                total_points_black += 1
        else:
            draws += 1

        if verbose and (game_num + 1) % 100 == 0:
            print(f"  Game {game_num+1}: W={white_wins} B={black_wins}")

    elapsed = time.time() - start_time

    results = {
        'num_games': num_games,
        'white_wins': white_wins,
        'black_wins': black_wins,
        'draws': draws,
        'white_win_pct': white_wins / max(1, num_games) * 100,
        'black_win_pct': black_wins / max(1, num_games) * 100,
        'white_gammons': white_gammons,
        'black_gammons': black_gammons,
        'white_backgammons': white_backgammons,
        'black_backgammons': black_backgammons,
        'white_points': total_points_white,
        'black_points': total_points_black,
        'white_ppg': total_points_white / max(1, num_games),
        'black_ppg': total_points_black / max(1, num_games),
        'avg_game_length': total_moves / max(1, num_games),
        'elapsed_sec': elapsed,
        'games_per_sec': num_games / max(0.001, elapsed),
    }

    return results


def evaluate_model(model_path: str, num_games: int = 1000):
    """Run full evaluation suite for a trained model.

    Args:
        model_path: Path to saved model file.
        num_games: Number of games per matchup.
    """
    model = load_model(model_path)
    neural = NeuralPlayer(model)
    rand = RandomPlayer()
    heuristic = HeuristicPlayer()

    print("=" * 70)
    print("BACKGAMMON MODEL EVALUATION")
    print("=" * 70)
    print(f"Model: {model_path}")
    print(f"Games per matchup: {num_games}")
    print()

    # Test 1: Neural (White) vs Random (Black)
    print("Match 1: Neural (White) vs Random (Black)")
    print("-" * 50)
    results1 = play_match(neural, rand, num_games, verbose=True)
    print(f"  Neural wins: {results1['white_win_pct']:.1f}%")
    print(f"  Random wins: {results1['black_win_pct']:.1f}%")
    print(f"  Neural PPG:  {results1['white_ppg']:.3f}")
    print(f"  Speed: {results1['games_per_sec']:.1f} games/sec")
    print()

    # Test 2: Random (White) vs Neural (Black)
    print("Match 2: Random (White) vs Neural (Black)")
    print("-" * 50)
    results2 = play_match(rand, neural, num_games, verbose=True)
    print(f"  Random wins:  {results2['white_win_pct']:.1f}%")
    print(f"  Neural wins:  {results2['black_win_pct']:.1f}%")
    print(f"  Neural PPG:   {results2['black_ppg']:.3f}")
    print()

    # Combined neural vs random
    neural_total_wins = results1['white_wins'] + results2['black_wins']
    random_total_wins = results1['black_wins'] + results2['white_wins']
    total = num_games * 2
    neural_combined_pct = neural_total_wins / total * 100

    print("=" * 50)
    print("COMBINED: Neural vs Random")
    print(f"  Neural: {neural_total_wins}/{total} ({neural_combined_pct:.1f}%)")
    print(f"  Random: {random_total_wins}/{total} ({100-neural_combined_pct:.1f}%)")
    print()

    # Test 3: Neural (White) vs Heuristic (Black)
    print("Match 3: Neural (White) vs Heuristic (Black)")
    print("-" * 50)
    results3 = play_match(neural, heuristic, num_games, verbose=True)
    print(f"  Neural wins:    {results3['white_win_pct']:.1f}%")
    print(f"  Heuristic wins: {results3['black_win_pct']:.1f}%")
    print(f"  Neural PPG:     {results3['white_ppg']:.3f}")
    print()

    # Test 4: Heuristic (White) vs Neural (Black)
    print("Match 4: Heuristic (White) vs Neural (Black)")
    print("-" * 50)
    results4 = play_match(heuristic, neural, num_games, verbose=True)
    print(f"  Heuristic wins: {results4['white_win_pct']:.1f}%")
    print(f"  Neural wins:    {results4['black_win_pct']:.1f}%")
    print(f"  Neural PPG:     {results4['black_ppg']:.3f}")
    print()

    # Combined neural vs heuristic
    neural_vs_h_wins = results3['white_wins'] + results4['black_wins']
    heuristic_wins = results3['black_wins'] + results4['white_wins']
    neural_vs_h_pct = neural_vs_h_wins / total * 100

    print("=" * 50)
    print("COMBINED: Neural vs Heuristic")
    print(f"  Neural:    {neural_vs_h_wins}/{total} ({neural_vs_h_pct:.1f}%)")
    print(f"  Heuristic: {heuristic_wins}/{total} ({100-neural_vs_h_pct:.1f}%)")
    print()

    # Test 5: Baseline - Random vs Heuristic
    print("Match 5: Random (White) vs Heuristic (Black) [Baseline]")
    print("-" * 50)
    results5 = play_match(rand, heuristic, num_games, verbose=True)
    print(f"  Random wins:    {results5['white_win_pct']:.1f}%")
    print(f"  Heuristic wins: {results5['black_win_pct']:.1f}%")
    print()

    # Summary
    print("=" * 70)
    print("EVALUATION SUMMARY")
    print("=" * 70)
    print(f"  Neural vs Random:     {neural_combined_pct:.1f}% win rate")
    print(f"  Neural vs Heuristic:  {neural_vs_h_pct:.1f}% win rate")
    print(f"  Random vs Heuristic:  {results5['white_win_pct']:.1f}% win rate (baseline)")
    print()

    # Save results
    all_results = {
        'model_path': model_path,
        'num_games_per_match': num_games,
        'neural_vs_random_pct': neural_combined_pct,
        'neural_vs_heuristic_pct': neural_vs_h_pct,
        'random_vs_heuristic_pct': results5['white_win_pct'],
        'matches': {
            'neural_white_vs_random': results1,
            'random_vs_neural_black': results2,
            'neural_white_vs_heuristic': results3,
            'heuristic_vs_neural_black': results4,
            'random_vs_heuristic': results5,
        }
    }

    results_path = os.path.join(os.path.dirname(model_path), 'evaluation_results.json')
    with open(results_path, 'w') as f:
        json.dump(all_results, f, indent=2)
    print(f"Results saved to: {results_path}")

    return all_results


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Evaluate trained backgammon model')
    parser.add_argument('model_path', help='Path to trained model file')
    parser.add_argument('--games', type=int, default=1000, help='Games per matchup')
    args = parser.parse_args()

    evaluate_model(args.model_path, args.games)


if __name__ == '__main__':
    main()
