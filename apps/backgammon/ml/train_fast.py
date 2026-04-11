#!/usr/bin/env python3
"""
Fast Two-Phase Training Pipeline
==================================
Phase 1: Generate large dataset via random self-play (~9 games/sec)
          Record all board positions with game outcomes.
Phase 2: Supervised pre-training on position->outcome pairs (very fast).
Phase 3: TD self-play refinement with the pre-trained model (~2-4 g/s).
Phase 4: Evaluation against baselines.

This approach is 10-50x faster than pure TD self-play because:
- Random game generation is fast (no neural evaluation per move)
- Supervised batch training leverages GPU/vectorization
- TD refinement starts from a much better model (shorter games, better moves)
"""

import sys
import os
import time
import random
import json
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.game_engine import BackgammonEngine, Color, GameStatus, WinType, Move
from encoder import encode_state, get_outcome_targets
from model import BackgammonNet, compute_equity, save_model, load_model


def generate_random_games(num_games: int, log_every: int = 5000) -> tuple:
    """Play random games and collect all positions with outcomes.

    Returns:
        features: numpy array of shape (N, 198)
        targets: numpy array of shape (N, 5)
    """
    all_features = []
    all_targets = []
    start = time.time()

    for game_num in range(num_games):
        engine = BackgammonEngine()
        engine.start_game()
        positions = []  # (features, perspective_str)
        move_count = 0

        while engine.state.status != GameStatus.FINISHED and move_count < 500:
            current_color = engine.state.current_turn

            if engine.state.status == GameStatus.ROLLING:
                engine.roll_dice()
                if engine.state.status == GameStatus.ROLLING:
                    continue
                if engine.state.status == GameStatus.FINISHED:
                    break

            if engine.state.status == GameStatus.MOVING:
                # Sample positions (not every single one to reduce dataset size)
                if random.random() < 0.3:  # Sample 30% of positions
                    features = encode_state(engine, current_color)
                    positions.append((features, current_color.value))

                while engine.state.status == GameStatus.MOVING:
                    valid_moves = engine.get_valid_moves()
                    if not valid_moves:
                        engine.end_turn()
                        break
                    engine.make_move(random.choice(valid_moves))
                    if engine.state.status == GameStatus.FINISHED:
                        break
                move_count += 1

        # Record outcome for all positions
        winner = engine.state.winner
        win_type = engine.state.win_type
        if winner is not None:
            winner_str = winner.value
            if win_type == WinType.BACKGAMMON:
                wt = "backgammon"
            elif win_type == WinType.GAMMON:
                wt = "gammon"
            else:
                wt = "normal"

            for feat, persp in positions:
                target = get_outcome_targets(winner_str, wt, persp)
                all_features.append(feat)
                all_targets.append(target)

        if (game_num + 1) % log_every == 0:
            elapsed = time.time() - start
            print(f"  Generated {game_num+1}/{num_games} games "
                  f"({len(all_features)} positions, "
                  f"{(game_num+1)/elapsed:.1f} games/s)")

    features = np.array(all_features, dtype=np.float32)
    targets = np.array(all_targets, dtype=np.float32)
    return features, targets


def supervised_train(model, features, targets, epochs=30, batch_size=512, lr=0.001):
    """Train the model on position->outcome pairs using MSE loss."""
    dataset = TensorDataset(
        torch.from_numpy(features),
        torch.from_numpy(targets)
    )
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
    optimizer = optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()

    model.train()
    for epoch in range(epochs):
        total_loss = 0.0
        n_batches = 0
        for batch_x, batch_y in loader:
            pred = model(batch_x)
            loss = loss_fn(pred, batch_y)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            n_batches += 1

        avg_loss = total_loss / n_batches
        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"  Epoch {epoch+1:>3d}/{epochs}: Loss = {avg_loss:.6f}")

    return avg_loss


def td_refine(model, num_games=5000, alpha=0.0005, explore=0.05, log_every=500):
    """Refine the pre-trained model with TD self-play."""
    optimizer = optim.Adam(model.parameters(), lr=alpha)
    loss_fn = nn.MSELoss()

    stats = {'white_wins': 0, 'gammons': 0, 'total': 0, 'avg_len': 0}
    start = time.time()

    for game_num in range(1, num_games + 1):
        engine = BackgammonEngine()
        engine.start_game()
        positions = []
        move_count = 0

        while engine.state.status != GameStatus.FINISHED and move_count < 500:
            current_color = engine.state.current_turn

            if engine.state.status == GameStatus.ROLLING:
                engine.roll_dice()
                if engine.state.status == GameStatus.ROLLING:
                    continue
                if engine.state.status == GameStatus.FINISHED:
                    break

            if engine.state.status == GameStatus.MOVING:
                features = encode_state(engine, current_color)
                positions.append((features, current_color.value))

                while engine.state.status == GameStatus.MOVING:
                    valid_moves = engine.get_valid_moves()
                    if not valid_moves:
                        engine.end_turn()
                        break

                    # Neural move selection with exploration
                    if random.random() < explore:
                        move = random.choice(valid_moves)
                    else:
                        best_move = None
                        best_eq = float('-inf')
                        for m in valid_moves:
                            snap = engine._snapshot_internals()
                            engine._apply_move_internal(current_color, m)
                            with torch.no_grad():
                                f = encode_state(engine, current_color)
                                ft = torch.from_numpy(f)
                                out = model(ft)
                                eq = compute_equity(out).item()
                            engine._restore_internals(snap)
                            if eq > best_eq:
                                best_eq = eq
                                best_move = m
                        move = best_move

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

        # TD update
        winner = engine.state.winner
        win_type = engine.state.win_type
        if winner is None or len(positions) < 2:
            continue

        winner_str = winner.value
        if win_type == WinType.BACKGAMMON:
            wt = "backgammon"
        elif win_type == WinType.GAMMON:
            wt = "gammon"
        else:
            wt = "normal"

        stats['total'] += 1
        if winner_str == "white":
            stats['white_wins'] += 1
        if wt in ("gammon", "backgammon"):
            stats['gammons'] += 1
        stats['avg_len'] = (stats['avg_len'] * (stats['total'] - 1) + move_count) / stats['total']

        # Batch TD update
        n = len(positions)
        all_feat = torch.stack([torch.from_numpy(p[0]) for p in positions])
        model.train()
        predictions = model(all_feat)

        with torch.no_grad():
            targets = torch.zeros_like(predictions)
            for t in range(n):
                persp = positions[t][1]
                outcome = get_outcome_targets(winner_str, wt, persp)
                final_target = torch.from_numpy(outcome)

                if t < n - 1:
                    next_pred = predictions[t + 1].detach()
                    next_persp = positions[t + 1][1]
                    if persp != next_persp:
                        flipped = torch.zeros(5)
                        flipped[0] = 1.0 - next_pred[0]
                        flipped[1] = next_pred[2]
                        flipped[2] = next_pred[1]
                        flipped[3] = next_pred[4]
                        flipped[4] = next_pred[3]
                        next_pred = flipped
                    weight = 0.7 ** (n - 1 - t)
                    targets[t] = (1.0 - weight) * next_pred + weight * final_target
                else:
                    targets[t] = final_target

        loss = loss_fn(predictions, targets)
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()

        if game_num % log_every == 0:
            elapsed = time.time() - start
            w_pct = stats['white_wins'] / max(1, stats['total']) * 100
            g_pct = stats['gammons'] / max(1, stats['total']) * 100
            print(f"  TD Game {game_num:>5d}/{num_games} | "
                  f"Loss: {loss.item():.4f} | W%: {w_pct:.1f} | G%: {g_pct:.1f} | "
                  f"Len: {stats['avg_len']:.0f} | {game_num/elapsed:.1f} g/s")

    return model


def quick_eval(model, num_games=200):
    """Quick evaluation against random player."""
    from evaluate import NeuralPlayer, RandomPlayer, play_match
    neural = NeuralPlayer(model)
    rand = RandomPlayer()

    r1 = play_match(neural, rand, num_games // 2)
    r2 = play_match(rand, neural, num_games // 2)

    neural_wins = r1['white_wins'] + r2['black_wins']
    total = num_games
    pct = neural_wins / total * 100
    return pct


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Fast two-phase backgammon AI training')
    parser.add_argument('--random-games', type=int, default=50000, help='Random games for Phase 1')
    parser.add_argument('--epochs', type=int, default=30, help='Supervised training epochs')
    parser.add_argument('--td-games', type=int, default=5000, help='TD refinement games')
    parser.add_argument('--hidden', type=int, default=80, help='Hidden layer size')
    parser.add_argument('--eval-games', type=int, default=500, help='Evaluation games')
    parser.add_argument('--save-dir', type=str, default=None, help='Save directory')
    args = parser.parse_args()

    save_dir = args.save_dir or os.path.join(os.path.dirname(__file__), 'models')
    os.makedirs(save_dir, exist_ok=True)

    print("=" * 70)
    print("BACKGAMMON AI - FAST TWO-PHASE TRAINING")
    print("=" * 70)
    total_start = time.time()

    # Phase 1: Generate random games
    print(f"\nPhase 1: Generating {args.random_games:,} random self-play games...")
    print("-" * 50)
    t0 = time.time()
    features, targets = generate_random_games(args.random_games)
    t1 = time.time()
    print(f"  Generated {len(features):,} training positions in {t1-t0:.0f}s")
    print(f"  Dataset: {features.shape} features, {targets.shape} targets")

    # Phase 2: Supervised pre-training
    print(f"\nPhase 2: Supervised pre-training ({args.epochs} epochs)...")
    print("-" * 50)
    model = BackgammonNet(hidden_size=args.hidden)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"  Architecture: 198 -> {args.hidden} -> {args.hidden} -> 5")
    print(f"  Parameters: {total_params:,}")

    t0 = time.time()
    final_loss = supervised_train(model, features, targets, epochs=args.epochs)
    t1 = time.time()
    print(f"  Training completed in {t1-t0:.0f}s")

    # Quick eval after supervised
    print(f"\n  Evaluating after supervised training...")
    pct = quick_eval(model, 200)
    print(f"  vs Random: {pct:.1f}% win rate")

    # Save supervised checkpoint
    sup_path = os.path.join(save_dir, 'checkpoint_supervised.pt')
    save_model(model, sup_path, metadata={'phase': 'supervised', 'positions': len(features)})

    # Phase 3: TD refinement
    print(f"\nPhase 3: TD self-play refinement ({args.td_games:,} games)...")
    print("-" * 50)
    t0 = time.time()
    model = td_refine(model, num_games=args.td_games, alpha=0.0005, explore=0.05)
    t1 = time.time()
    print(f"  TD refinement completed in {t1-t0:.0f}s")

    # Save TD-refined model
    final_path = os.path.join(save_dir, 'backgammon_model_final.pt')
    total_time = time.time() - total_start
    save_model(model, final_path, metadata={
        'phases': ['supervised', 'td_refine'],
        'random_games': args.random_games,
        'training_positions': len(features),
        'td_games': args.td_games,
        'hidden_size': args.hidden,
        'total_training_time_sec': total_time,
    })

    # Phase 4: Full evaluation
    print(f"\nPhase 4: Full Evaluation ({args.eval_games} games per matchup)...")
    print("=" * 70)
    from evaluate import evaluate_model
    results = evaluate_model(final_path, args.eval_games)

    # Save summary
    summary = {
        'model_architecture': {
            'input_size': 198,
            'hidden_size': args.hidden,
            'hidden_layers': 2,
            'output_size': 5,
            'activation': 'sigmoid',
            'total_parameters': total_params,
        },
        'training': {
            'phase1_random_games': args.random_games,
            'phase1_positions': len(features),
            'phase2_epochs': args.epochs,
            'phase3_td_games': args.td_games,
            'total_time_sec': total_time,
        },
        'evaluation': {
            'neural_vs_random_pct': results.get('neural_vs_random_pct', 0),
            'neural_vs_heuristic_pct': results.get('neural_vs_heuristic_pct', 0),
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
    print(f"  Total time: {total_time:.0f}s ({total_time/60:.1f}m)")
    print(f"  Model: {final_path}")
    print(f"  Neural vs Random:    {results.get('neural_vs_random_pct', 0):.1f}%")
    print(f"  Neural vs Heuristic: {results.get('neural_vs_heuristic_pct', 0):.1f}%")


if __name__ == '__main__':
    main()
