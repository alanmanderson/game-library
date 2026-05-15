#!/usr/bin/env python3
"""
V2 Two-Phase Training Pipeline
=================================
Trains separate contact and race networks using the V2 213-feature encoding
and BackgammonNetV2 architecture (ReLU, 160 hidden, Kaiming init).

Phase 1: Generate random self-play games, classify positions as contact/race
Phase 2: Supervised pre-training on position->outcome pairs
Phase 3: TD self-play refinement with the pre-trained models
Phase 4: Evaluation against V1 and baselines

Can also train a single unified V2 model if --single is specified.
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
from encoder import encode_state_v2
from model import BackgammonNetV2, compute_equity, save_model, load_model


def is_contact_position(engine: BackgammonEngine) -> bool:
    """Determine if the current position has contact between sides."""
    state = engine.state
    if state.bar_white > 0 or state.bar_black > 0:
        return True

    rightmost_white = 0
    leftmost_black = 25
    for i in range(1, 25):
        if state.points[i] > 0:
            rightmost_white = i
    for i in range(1, 25):
        if state.points[i] < 0:
            leftmost_black = i
            break

    return rightmost_white >= leftmost_black


def generate_random_games_v2(
    num_games: int,
    network_type: str = "all",
    log_every: int = 5000,
) -> tuple:
    """Play random games and collect V2-encoded positions with outcomes.

    Args:
        num_games: Number of random games to play.
        network_type: "contact", "race", or "all" to filter positions.
        log_every: Log progress every N games.

    Returns:
        features: numpy array of shape (N, 213)
        targets: numpy array of shape (N, 5)
    """
    all_features = []
    all_targets = []
    start = time.time()
    contact_count = 0
    race_count = 0

    for game_num in range(num_games):
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
                if random.random() < 0.3:  # Sample 30% of positions
                    is_contact = is_contact_position(engine)

                    # Filter by network type
                    include = (
                        network_type == "all"
                        or (network_type == "contact" and is_contact)
                        or (network_type == "race" and not is_contact)
                    )

                    if include:
                        features = encode_state_v2(engine, current_color)
                        positions.append((features, current_color.value, is_contact))

                while engine.state.status == GameStatus.MOVING:
                    valid_moves = engine.get_valid_moves()
                    if not valid_moves:
                        engine.end_turn()
                        break
                    engine.make_move(random.choice(valid_moves))
                    if engine.state.status == GameStatus.FINISHED:
                        break
                move_count += 1

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

            from encoder import get_outcome_targets
            for feat, persp, is_contact in positions:
                target = get_outcome_targets(winner_str, wt, persp)
                all_features.append(feat)
                all_targets.append(target)
                if is_contact:
                    contact_count += 1
                else:
                    race_count += 1

        if (game_num + 1) % log_every == 0:
            elapsed = time.time() - start
            print(f"  Generated {game_num+1}/{num_games} games "
                  f"({len(all_features)} positions, "
                  f"contact={contact_count}, race={race_count}, "
                  f"{(game_num+1)/elapsed:.1f} games/s)")

    features = np.array(all_features, dtype=np.float32) if all_features else np.zeros((0, 213), dtype=np.float32)
    targets = np.array(all_targets, dtype=np.float32) if all_targets else np.zeros((0, 5), dtype=np.float32)
    return features, targets


def supervised_train_v2(model, features, targets, epochs=30, batch_size=512, lr=0.001):
    """Train V2 model on position->outcome pairs using MSE loss."""
    if len(features) == 0:
        print("  No training data available!")
        return 0.0

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

        avg_loss = total_loss / max(1, n_batches)
        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"  Epoch {epoch+1:>3d}/{epochs}: Loss = {avg_loss:.6f}")

    return avg_loss


def td_refine_v2(
    model,
    num_games=5000,
    alpha=0.0005,
    explore=0.05,
    lambda_=0.7,
    network_type="all",
    log_every=500,
):
    """Refine V2 model with TD self-play."""
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
                is_contact = is_contact_position(engine)
                should_record = (
                    network_type == "all"
                    or (network_type == "contact" and is_contact)
                    or (network_type == "race" and not is_contact)
                )

                if should_record:
                    features = encode_state_v2(engine, current_color)
                    positions.append((features, current_color.value))

                while engine.state.status == GameStatus.MOVING:
                    valid_moves = engine.get_valid_moves()
                    if not valid_moves:
                        engine.end_turn()
                        break

                    if random.random() < explore:
                        move = random.choice(valid_moves)
                    else:
                        best_move = None
                        best_eq = float('-inf')
                        for m in valid_moves:
                            snap = engine._snapshot_internals()
                            engine._apply_move_internal(current_color, m)
                            with torch.no_grad():
                                f = encode_state_v2(engine, current_color)
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
        from encoder import get_outcome_targets
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
                    weight = lambda_ ** (n - 1 - t)
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


def quick_eval_v2(model, num_games=200):
    """Quick evaluation of V2 model against random player."""
    from evaluate import RandomPlayer, play_match, NeuralPlayerV2
    neural = NeuralPlayerV2(model)
    rand = RandomPlayer()

    r1 = play_match(neural, rand, num_games // 2)
    r2 = play_match(rand, neural, num_games // 2)

    neural_wins = r1['white_wins'] + r2['black_wins']
    total = num_games
    return neural_wins / total * 100


def train_single_v2(args, save_dir):
    """Train a single unified V2 model."""
    print(f"\nPhase 1: Generating {args.random_games:,} random games (V2 encoding)...")
    print("-" * 50)
    t0 = time.time()
    features, targets = generate_random_games_v2(args.random_games, network_type="all")
    print(f"  Generated {len(features):,} training positions in {time.time()-t0:.0f}s")

    print(f"\nPhase 2: Supervised pre-training ({args.epochs} epochs)...")
    print("-" * 50)
    model = BackgammonNetV2(hidden_size=args.hidden)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"  Architecture: 213 -> {args.hidden} -> {args.hidden} -> 5 (V2 ReLU)")
    print(f"  Parameters: {total_params:,}")

    supervised_train_v2(model, features, targets, epochs=args.epochs)

    # Save supervised checkpoint
    sup_path = os.path.join(save_dir, 'v2_supervised.pt')
    save_model(model, sup_path, metadata={'phase': 'supervised', 'positions': len(features)})

    print(f"\nPhase 3: TD refinement ({args.td_games:,} games)...")
    print("-" * 50)
    model = td_refine_v2(model, num_games=args.td_games, alpha=0.0005, explore=0.05)

    # Save final model
    final_path = os.path.join(save_dir, 'v2_model.pt')
    save_model(model, final_path, metadata={
        'phases': ['supervised', 'td_refine'],
        'random_games': args.random_games,
        'td_games': args.td_games,
        'hidden_size': args.hidden,
        'network_type': 'single',
    })

    return model, final_path


def train_contact_race(args, save_dir):
    """Train separate contact and race V2 models."""
    # --- Contact model ---
    print(f"\n{'='*70}")
    print("TRAINING CONTACT MODEL")
    print(f"{'='*70}")

    print(f"\nPhase 1: Generating {args.random_games:,} random games (contact positions)...")
    t0 = time.time()
    contact_features, contact_targets = generate_random_games_v2(
        args.random_games, network_type="contact"
    )
    print(f"  Generated {len(contact_features):,} contact positions in {time.time()-t0:.0f}s")

    print(f"\nPhase 2: Supervised pre-training ({args.epochs} epochs)...")
    contact_model = BackgammonNetV2(hidden_size=args.hidden)
    supervised_train_v2(contact_model, contact_features, contact_targets, epochs=args.epochs)

    print(f"\nPhase 3: TD refinement ({args.td_games:,} games)...")
    contact_model = td_refine_v2(
        contact_model, num_games=args.td_games, network_type="contact"
    )

    contact_path = os.path.join(save_dir, 'v2_contact.pt')
    save_model(contact_model, contact_path, metadata={
        'network_type': 'contact',
        'random_games': args.random_games,
        'td_games': args.td_games,
    })

    # --- Race model ---
    print(f"\n{'='*70}")
    print("TRAINING RACE MODEL")
    print(f"{'='*70}")

    print(f"\nPhase 1: Generating {args.random_games:,} random games (race positions)...")
    t0 = time.time()
    race_features, race_targets = generate_random_games_v2(
        args.random_games, network_type="race"
    )
    print(f"  Generated {len(race_features):,} race positions in {time.time()-t0:.0f}s")

    print(f"\nPhase 2: Supervised pre-training ({args.epochs} epochs)...")
    race_model = BackgammonNetV2(hidden_size=args.hidden)
    supervised_train_v2(race_model, race_features, race_targets, epochs=args.epochs)

    print(f"\nPhase 3: TD refinement ({args.td_games:,} games)...")
    race_model = td_refine_v2(
        race_model, num_games=args.td_games, network_type="race"
    )

    race_path = os.path.join(save_dir, 'v2_race.pt')
    save_model(race_model, race_path, metadata={
        'network_type': 'race',
        'random_games': args.random_games,
        'td_games': args.td_games,
    })

    return (contact_model, race_model), (contact_path, race_path)


def main():
    import argparse
    parser = argparse.ArgumentParser(description='V2 backgammon AI training pipeline')
    parser.add_argument('--random-games', type=int, default=50000, help='Random games for Phase 1')
    parser.add_argument('--epochs', type=int, default=30, help='Supervised training epochs')
    parser.add_argument('--td-games', type=int, default=5000, help='TD refinement games')
    parser.add_argument('--hidden', type=int, default=160, help='Hidden layer size')
    parser.add_argument('--eval-games', type=int, default=500, help='Evaluation games')
    parser.add_argument('--save-dir', type=str, default=None, help='Save directory')
    parser.add_argument('--single', action='store_true', help='Train single model instead of contact/race')
    parser.add_argument('--network-type', choices=['contact', 'race', 'all'], default='all',
                        help='Train only one network type (with --single)')
    args = parser.parse_args()

    save_dir = args.save_dir or os.path.join(os.path.dirname(__file__), 'models')
    os.makedirs(save_dir, exist_ok=True)

    print("=" * 70)
    print("BACKGAMMON AI V2 - ENHANCED TRAINING PIPELINE")
    print("=" * 70)
    total_start = time.time()

    if args.single:
        model, final_path = train_single_v2(args, save_dir)
    else:
        models, paths = train_contact_race(args, save_dir)
        # For evaluation, use the contact model as the primary
        model = models[0]
        final_path = paths[0]

    # Phase 4: Evaluation
    total_time = time.time() - total_start
    print(f"\nPhase 4: Evaluation ({args.eval_games} games per matchup)...")
    print("=" * 70)

    try:
        pct = quick_eval_v2(model, args.eval_games)
        print(f"  V2 vs Random: {pct:.1f}%")
    except Exception as e:
        print(f"  Evaluation error: {e}")
        pct = 0

    # Save training summary
    summary = {
        'model_version': 2,
        'architecture': {
            'input_size': 213,
            'hidden_size': args.hidden,
            'hidden_layers': 2,
            'output_size': 5,
            'activation': 'relu',
            'output_activation': 'sigmoid',
            'total_parameters': sum(p.numel() for p in model.parameters()),
        },
        'training': {
            'random_games': args.random_games,
            'supervised_epochs': args.epochs,
            'td_games': args.td_games,
            'total_time_sec': total_time,
            'mode': 'single' if args.single else 'contact_race',
        },
        'evaluation': {
            'vs_random_pct': pct,
        },
    }

    summary_path = os.path.join(save_dir, 'v2_training_summary.json')
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)

    print()
    print("=" * 70)
    print("V2 TRAINING COMPLETE")
    print("=" * 70)
    print(f"  Total time: {total_time:.0f}s ({total_time/60:.1f}m)")
    print(f"  V2 vs Random: {pct:.1f}%")
    if not args.single:
        print(f"  Contact model: {paths[0]}")
        print(f"  Race model: {paths[1]}")
    else:
        print(f"  Model: {final_path}")


if __name__ == '__main__':
    main()
