#!/usr/bin/env python3
"""
Main Training Script
=====================
Orchestrates the complete training pipeline:
1. Creates the neural network model
2. Runs TD(lambda) self-play training
3. Evaluates against baselines
4. Saves the final model and results

Usage:
    python train.py                    # Full training (100K games)
    python train.py --games 50000      # Custom game count
    python train.py --quick            # Quick training (10K games)
"""

import sys
import os
import time
import json
import argparse

# Ensure imports work
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import torch
import numpy as np

from model import BackgammonNet, save_model
from td_trainer import TDTrainer
from evaluate import evaluate_model, play_match, NeuralPlayer, RandomPlayer, HeuristicPlayer


def main():
    parser = argparse.ArgumentParser(description='Train backgammon AI')
    parser.add_argument('--games', type=int, default=100000, help='Training games')
    parser.add_argument('--quick', action='store_true', help='Quick mode (10K games)')
    parser.add_argument('--hidden', type=int, default=80, help='Hidden layer size')
    parser.add_argument('--alpha', type=float, default=0.01, help='Learning rate')
    parser.add_argument('--lambda_', type=float, default=0.7, help='TD lambda')
    parser.add_argument('--explore', type=float, default=0.1, help='Exploration rate')
    parser.add_argument('--eval-games', type=int, default=500, help='Evaluation games per matchup')
    parser.add_argument('--save-dir', type=str, default=None, help='Save directory')
    args = parser.parse_args()

    if args.quick:
        args.games = 10000
        args.eval_games = 200

    save_dir = args.save_dir or os.path.join(os.path.dirname(__file__), 'models')
    os.makedirs(save_dir, exist_ok=True)

    print("=" * 70)
    print("BACKGAMMON AI TRAINING PIPELINE")
    print("=" * 70)
    print(f"Training games:  {args.games:,}")
    print(f"Hidden size:     {args.hidden}")
    print(f"Learning rate:   {args.alpha}")
    print(f"TD Lambda:       {args.lambda_}")
    print(f"Exploration:     {args.explore}")
    print(f"Eval games:      {args.eval_games}")
    print(f"Save directory:  {save_dir}")
    print(f"Device:          cpu")
    print()

    # Phase 1: Create model
    print("Phase 1: Creating neural network...")
    model = BackgammonNet(hidden_size=args.hidden)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"  Architecture: 198 → {args.hidden} → {args.hidden} → 5")
    print(f"  Total parameters: {total_params:,}")
    print()

    # Phase 2: Quick baseline evaluation (untrained model vs random)
    print("Phase 2: Baseline evaluation (untrained model)...")
    untrained_neural = NeuralPlayer(model)
    rand = RandomPlayer()
    baseline = play_match(untrained_neural, rand, min(200, args.eval_games))
    print(f"  Untrained model vs Random: {baseline['white_win_pct']:.1f}% win rate")
    print()

    # Phase 3: Training
    print("Phase 3: TD(lambda) Self-Play Training")
    print("=" * 70)
    trainer = TDTrainer(
        model=model,
        alpha=args.alpha,
        lambda_=args.lambda_,
        exploration_rate=args.explore,
        exploration_decay=0.9999,
        min_exploration=0.0,
    )

    log_every = max(100, args.games // 100)
    save_every = max(1000, args.games // 10)

    final_path = trainer.train(
        num_games=args.games,
        save_every=save_every,
        save_dir=save_dir,
        log_every=log_every,
    )
    print()

    # Phase 4: Full evaluation
    print("Phase 4: Full Evaluation")
    print("=" * 70)
    results = evaluate_model(final_path, args.eval_games)

    # Phase 5: Save training summary
    summary = {
        'model_architecture': {
            'input_size': 198,
            'hidden_size': args.hidden,
            'output_size': 5,
            'num_layers': 3,
            'activation': 'sigmoid',
            'total_parameters': total_params,
        },
        'training_config': {
            'algorithm': 'TD(lambda)',
            'num_games': args.games,
            'alpha': args.alpha,
            'lambda': args.lambda_,
            'initial_exploration': args.explore,
            'exploration_decay': 0.9999,
        },
        'training_stats': {
            'games_played': trainer.games_played,
            'white_win_rate': trainer.white_wins / max(1, trainer.games_played),
            'gammon_rate': (trainer.gammons + trainer.backgammons) / max(1, trainer.games_played),
            'avg_game_length': trainer.avg_game_length,
        },
        'evaluation': {
            'neural_vs_random_pct': results.get('neural_vs_random_pct', 0),
            'neural_vs_heuristic_pct': results.get('neural_vs_heuristic_pct', 0),
            'random_vs_heuristic_pct': results.get('random_vs_heuristic_pct', 0),
        },
        'model_path': final_path,
    }

    summary_path = os.path.join(save_dir, 'training_summary.json')
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)

    print()
    print("=" * 70)
    print("TRAINING COMPLETE")
    print("=" * 70)
    print(f"  Model saved to: {final_path}")
    print(f"  Summary saved to: {summary_path}")
    print(f"  Neural vs Random: {results.get('neural_vs_random_pct', 0):.1f}%")
    print(f"  Neural vs Heuristic: {results.get('neural_vs_heuristic_pct', 0):.1f}%")


if __name__ == '__main__':
    main()
