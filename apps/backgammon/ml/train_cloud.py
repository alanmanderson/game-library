#!/usr/bin/env python3
"""
Cloud Training Orchestrator
=============================
Wraps TDTrainer for extended cloud training with:
- Resume from existing model checkpoint
- Periodic evaluation against the baseline model
- Early stopping after 5 consecutive evals with no improvement (>1%)
- Target detection: stops when win rate vs baseline reaches 70%
- JSON progress log (progress.jsonl) for machine-readable monitoring
- Named checkpoints: model_at_N.pt and best_model.pt

Usage:
    python train_cloud.py --baseline models/backgammon_model_final.pt \
        --games 25000 --alpha 0.0003 --lambda_ 0.7 --explore 0.05 \
        --hidden 80 --output-dir output_A

    # Resume from checkpoint:
    python train_cloud.py --baseline models/backgammon_model_final.pt \
        --resume output_A/latest_checkpoint.pt --games 25000 \
        --output-dir output_A
"""

import sys
import os
import time
import json
import argparse

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.game_engine import BackgammonEngine, Color, GameStatus, WinType, Move
from encoder import encode_state, encode_state_v2, get_outcome_targets
from model import BackgammonNet, BackgammonNetV2, compute_equity, save_model, load_model
from td_trainer import TDTrainer
from evaluate import NeuralPlayer, NeuralPlayerV2, RandomPlayer, HeuristicPlayer, play_match, make_neural_player


def model_vs_model_quick(model_a, model_b, num_games=200):
    """Quick head-to-head between two models. Returns model_a's win rate."""
    player_a = make_neural_player(model_a)
    player_b = make_neural_player(model_b)

    half = num_games // 2
    r1 = play_match(player_a, player_b, half)
    r2 = play_match(player_b, player_a, half)

    a_wins = r1['white_wins'] + r2['black_wins']
    total = r1['num_games'] + r2['num_games']
    return a_wins / max(1, total) * 100


def quick_eval_vs_random(model, num_games=200):
    """Quick evaluation against random player."""
    neural = make_neural_player(model)
    rand = RandomPlayer()
    half = num_games // 2

    r1 = play_match(neural, rand, half)
    r2 = play_match(rand, neural, half)

    neural_wins = r1['white_wins'] + r2['black_wins']
    total = r1['num_games'] + r2['num_games']
    return neural_wins / max(1, total) * 100


def quick_eval_vs_heuristic(model, num_games=200):
    """Quick evaluation against heuristic player."""
    neural = make_neural_player(model)
    heur = HeuristicPlayer()
    half = num_games // 2

    r1 = play_match(neural, heur, half)
    r2 = play_match(heur, neural, half)

    neural_wins = r1['white_wins'] + r2['black_wins']
    total = r1['num_games'] + r2['num_games']
    return neural_wins / max(1, total) * 100


def log_progress(output_dir, entry):
    """Append a JSON entry to progress.jsonl."""
    path = os.path.join(output_dir, 'progress.jsonl')
    with open(path, 'a') as f:
        f.write(json.dumps(entry) + '\n')


def train_cloud(args):
    output_dir = args.output_dir
    os.makedirs(output_dir, exist_ok=True)

    use_v2 = getattr(args, 'v2', False)
    network_type = getattr(args, 'network_type', None)

    # Load or create model
    if args.resume:
        print(f"Resuming from checkpoint: {args.resume}")
        model = load_model(args.resume)
        # Read how many games were already played from metadata
        ckpt = torch.load(args.resume, map_location='cpu', weights_only=False)
        games_completed = ckpt.get('metadata', {}).get('games_played', 0)
        print(f"  Previously completed: {games_completed} games")
        # Auto-detect V2
        if isinstance(model, BackgammonNetV2):
            use_v2 = True
    elif args.baseline:
        print(f"Starting from baseline model: {args.baseline}")
        model = load_model(args.baseline)
        games_completed = 0
    else:
        if use_v2:
            print(f"Starting fresh V2 model (hidden={args.hidden})")
            model = BackgammonNetV2(hidden_size=args.hidden)
        else:
            print(f"Starting fresh model (hidden={args.hidden})")
            model = BackgammonNet(hidden_size=args.hidden)
        games_completed = 0

    # If hidden size differs from loaded model (config C: larger model),
    # we need a fresh model with supervised pre-training
    model_hidden = model.fc1.out_features
    if args.hidden != model_hidden and not args.resume:
        print(f"  Requested hidden={args.hidden} but loaded model has hidden={model_hidden}")
        if args.hidden != model_hidden:
            print(f"  Creating fresh model with hidden={args.hidden}")
            print(f"  Will do supervised pre-training first...")
            if use_v2:
                model = BackgammonNetV2(hidden_size=args.hidden)
                model = _supervised_pretrain_v2(model, output_dir, network_type=network_type)
            else:
                model = BackgammonNet(hidden_size=args.hidden)
                model = _supervised_pretrain(model, output_dir)

    # Load baseline for comparison
    baseline_model = None
    if args.baseline:
        baseline_model = load_model(args.baseline)
        print(f"Baseline model loaded for evaluation")

    # Training config
    total_games = args.games
    eval_every = args.eval_every
    checkpoint_every = args.checkpoint_every
    target_win_rate = args.target
    patience = args.patience

    print(f"\nTraining config:")
    print(f"  Model: {'V2' if use_v2 else 'V1'}")
    if network_type:
        print(f"  Network type: {network_type}")
    print(f"  Total games: {total_games}")
    print(f"  Alpha: {args.alpha}, Lambda: {args.lambda_}")
    print(f"  Exploration: {args.explore}")
    print(f"  Hidden: {model.fc1.out_features}")
    print(f"  Eval every: {eval_every} games")
    print(f"  Checkpoint every: {checkpoint_every} games")
    print(f"  Target vs baseline: {target_win_rate}%")
    print(f"  Early stop patience: {patience} evals")
    print()

    # Setup trainer
    if use_v2:
        trainer = TDTrainerV2(
            model=model,
            alpha=args.alpha,
            lambda_=args.lambda_,
            exploration_rate=args.explore,
            exploration_decay=args.explore_decay,
            min_exploration=args.min_explore,
            network_type=network_type or "all",
        )
    else:
        trainer = TDTrainer(
            model=model,
            alpha=args.alpha,
            lambda_=args.lambda_,
            exploration_rate=args.explore,
            exploration_decay=args.explore_decay,
            min_exploration=args.min_explore,
        )
    trainer.games_played = games_completed

    # Tracking
    best_vs_baseline = 0.0
    no_improvement_count = 0
    start_time = time.time()
    games_this_session = 0

    # Log start
    log_progress(output_dir, {
        'event': 'start',
        'timestamp': time.time(),
        'config': {
            'total_games': total_games,
            'alpha': args.alpha,
            'lambda': args.lambda_,
            'explore': args.explore,
            'hidden': model.fc1.out_features,
            'resumed_from': games_completed,
        }
    })

    # Training loop — run in chunks of eval_every
    remaining = total_games - games_completed
    games_done_in_session = 0

    while games_done_in_session < remaining:
        chunk_size = min(eval_every, remaining - games_done_in_session)

        # Train a chunk using TDTrainer internals
        chunk_start = time.time()
        for i in range(1, chunk_size + 1):
            pos_history, winner, win_type, game_length = trainer._play_one_game()

            trainer.games_played += 1
            if winner == "white":
                trainer.white_wins += 1
            if win_type == "gammon":
                trainer.gammons += 1
            elif win_type == "backgammon":
                trainer.backgammons += 1
            trainer.avg_game_length = (
                trainer.avg_game_length * (trainer.games_played - 1) + game_length
            ) / trainer.games_played

            loss = trainer._td_update_batch(pos_history, winner, win_type)
            trainer.loss_history.append(loss)

            trainer.exploration_rate = max(
                trainer.min_exploration,
                trainer.exploration_rate * trainer.exploration_decay
            )

            # Periodic console output
            if trainer.games_played % 500 == 0:
                elapsed = time.time() - start_time
                gps = (games_done_in_session + i) / max(0.001, elapsed)
                avg_loss = np.mean(trainer.loss_history[-500:]) if trainer.loss_history else 0
                print(
                    f"Game {trainer.games_played:>7d} | "
                    f"Loss: {avg_loss:.4f} | "
                    f"Exp: {trainer.exploration_rate:.4f} | "
                    f"{gps:.1f} g/s"
                )

        games_done_in_session += chunk_size
        chunk_elapsed = time.time() - chunk_start

        # Save checkpoint
        ckpt_path = os.path.join(output_dir, f'model_at_{trainer.games_played}.pt')
        save_model(model, ckpt_path, metadata={
            'games_played': trainer.games_played,
            'exploration_rate': trainer.exploration_rate,
            'alpha': args.alpha,
            'lambda': args.lambda_,
        })
        # Also save as latest_checkpoint for easy resume
        latest_path = os.path.join(output_dir, 'latest_checkpoint.pt')
        save_model(model, latest_path, metadata={
            'games_played': trainer.games_played,
            'exploration_rate': trainer.exploration_rate,
            'alpha': args.alpha,
            'lambda': args.lambda_,
        })

        # Evaluate
        print(f"\n--- Evaluation at {trainer.games_played} games ---")

        vs_random = quick_eval_vs_random(model, 200)
        vs_heuristic = quick_eval_vs_heuristic(model, 200)
        print(f"  vs Random:    {vs_random:.1f}%")
        print(f"  vs Heuristic: {vs_heuristic:.1f}%")

        vs_baseline = 0.0
        if baseline_model is not None:
            vs_baseline = model_vs_model_quick(model, baseline_model, 200)
            print(f"  vs Baseline:  {vs_baseline:.1f}%")

        # Log progress
        log_progress(output_dir, {
            'event': 'eval',
            'timestamp': time.time(),
            'games_played': trainer.games_played,
            'vs_random': vs_random,
            'vs_heuristic': vs_heuristic,
            'vs_baseline': vs_baseline,
            'best_vs_baseline': max(best_vs_baseline, vs_baseline),
            'exploration_rate': trainer.exploration_rate,
            'avg_loss': float(np.mean(trainer.loss_history[-eval_every:])) if trainer.loss_history else 0,
            'chunk_time_sec': chunk_elapsed,
            'games_per_sec': chunk_size / max(0.001, chunk_elapsed),
        })

        # Check target
        if vs_baseline >= target_win_rate:
            print(f"\n  TARGET REACHED: {vs_baseline:.1f}% >= {target_win_rate}%")
            best_path = os.path.join(output_dir, 'best_model.pt')
            save_model(model, best_path, metadata={
                'games_played': trainer.games_played,
                'vs_baseline': vs_baseline,
                'vs_random': vs_random,
                'vs_heuristic': vs_heuristic,
                'target_reached': True,
            })
            log_progress(output_dir, {
                'event': 'target_reached',
                'timestamp': time.time(),
                'games_played': trainer.games_played,
                'vs_baseline': vs_baseline,
            })
            break

        # Check improvement
        if vs_baseline > best_vs_baseline + 1.0:
            best_vs_baseline = vs_baseline
            no_improvement_count = 0
            best_path = os.path.join(output_dir, 'best_model.pt')
            save_model(model, best_path, metadata={
                'games_played': trainer.games_played,
                'vs_baseline': vs_baseline,
                'vs_random': vs_random,
                'vs_heuristic': vs_heuristic,
            })
            print(f"  New best: {vs_baseline:.1f}% vs baseline")
        else:
            no_improvement_count += 1
            print(f"  No improvement ({no_improvement_count}/{patience})")

        if no_improvement_count >= patience:
            print(f"\n  EARLY STOPPING: No improvement for {patience} consecutive evals")
            log_progress(output_dir, {
                'event': 'early_stop',
                'timestamp': time.time(),
                'games_played': trainer.games_played,
                'best_vs_baseline': best_vs_baseline,
            })
            break

        print()

    # Final save
    total_elapsed = time.time() - start_time
    final_path = os.path.join(output_dir, 'final_model.pt')
    save_model(model, final_path, metadata={
        'games_played': trainer.games_played,
        'total_training_time_sec': total_elapsed,
        'best_vs_baseline': best_vs_baseline,
        'alpha': args.alpha,
        'lambda': args.lambda_,
    })

    log_progress(output_dir, {
        'event': 'complete',
        'timestamp': time.time(),
        'games_played': trainer.games_played,
        'best_vs_baseline': best_vs_baseline,
        'total_time_sec': total_elapsed,
    })

    print(f"\nTraining complete!")
    print(f"  Total games: {trainer.games_played}")
    print(f"  Time: {total_elapsed:.0f}s ({total_elapsed/3600:.1f}h)")
    print(f"  Best vs baseline: {best_vs_baseline:.1f}%")
    print(f"  Output: {output_dir}")


def _supervised_pretrain(model, output_dir, num_games=10000, epochs=20):
    """Quick supervised pre-training for fresh larger models."""
    from train_fast import generate_random_games, supervised_train

    print(f"  Generating {num_games} random games for pre-training...")
    features, targets = generate_random_games(num_games, log_every=2000)
    print(f"  Got {len(features)} positions. Training {epochs} epochs...")
    supervised_train(model, features, targets, epochs=epochs, lr=0.001)

    pretrain_path = os.path.join(output_dir, 'pretrained.pt')
    save_model(model, pretrain_path, metadata={'phase': 'supervised_pretrain'})
    print(f"  Pre-trained model saved: {pretrain_path}")
    return model


def _supervised_pretrain_v2(model, output_dir, num_games=10000, epochs=20, network_type=None):
    """Quick supervised pre-training for fresh V2 models."""
    from train_fast_v2 import generate_random_games_v2, supervised_train_v2

    nt = network_type or "all"
    print(f"  Generating {num_games} random games for V2 pre-training ({nt})...")
    features, targets = generate_random_games_v2(num_games, network_type=nt, log_every=2000)
    print(f"  Got {len(features)} positions. Training {epochs} epochs...")
    supervised_train_v2(model, features, targets, epochs=epochs, lr=0.001)

    pretrain_path = os.path.join(output_dir, 'pretrained_v2.pt')
    save_model(model, pretrain_path, metadata={'phase': 'supervised_pretrain_v2', 'network_type': nt})
    print(f"  Pre-trained V2 model saved: {pretrain_path}")
    return model


class TDTrainerV2:
    """V2 TD trainer that uses encode_state_v2 and supports network_type filtering."""

    def __init__(self, model, alpha=0.001, lambda_=0.7, exploration_rate=0.1,
                 exploration_decay=0.9999, min_exploration=0.0, network_type="all"):
        self.model = model
        self.alpha = alpha
        self.lambda_ = lambda_
        self.exploration_rate = exploration_rate
        self.exploration_decay = exploration_decay
        self.min_exploration = min_exploration
        self.network_type = network_type
        self.optimizer = torch.optim.Adam(model.parameters(), lr=alpha)
        self.loss_fn = torch.nn.MSELoss()

        self.games_played = 0
        self.white_wins = 0
        self.gammons = 0
        self.backgammons = 0
        self.avg_game_length = 0.0
        self.loss_history = []

    def _is_contact(self, engine):
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

    def _should_record(self, engine):
        if self.network_type == "all":
            return True
        is_contact = self._is_contact(engine)
        if self.network_type == "contact":
            return is_contact
        return not is_contact  # race

    def _play_one_game(self):
        import random as rng
        engine = BackgammonEngine()
        engine.start_game()
        position_history = []
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
                if self._should_record(engine):
                    features = encode_state_v2(engine, current_color)
                    position_history.append((features, current_color.value))

                while engine.state.status == GameStatus.MOVING:
                    valid_moves = engine.get_valid_moves()
                    if not valid_moves:
                        engine.end_turn()
                        break

                    if rng.random() < self.exploration_rate:
                        move = rng.choice(valid_moves)
                    else:
                        best_move = None
                        best_eq = float('-inf')
                        for m in valid_moves:
                            snap = engine._snapshot_internals()
                            engine._apply_move_internal(current_color, m)
                            with torch.no_grad():
                                f = encode_state_v2(engine, current_color)
                                ft = torch.from_numpy(f)
                                out = self.model(ft)
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
        if winner is None:
            winner_str = "white"
            win_type_str = "normal"
        else:
            winner_str = winner.value
            if win_type == WinType.BACKGAMMON:
                win_type_str = "backgammon"
            elif win_type == WinType.GAMMON:
                win_type_str = "gammon"
            else:
                win_type_str = "normal"

        return position_history, winner_str, win_type_str, move_count

    def _td_update_batch(self, position_history, winner, win_type):
        if len(position_history) < 2:
            return 0.0

        n = len(position_history)
        self.model.train()
        all_features = torch.stack([torch.from_numpy(p[0]) for p in position_history])
        predictions = self.model(all_features)
        targets = torch.zeros_like(predictions)

        with torch.no_grad():
            final_perspective = position_history[-1][1]
            outcome = get_outcome_targets(winner, win_type, final_perspective)
            final_target = torch.from_numpy(outcome)
            targets[-1] = final_target

            for t in range(n - 2, -1, -1):
                curr_persp = position_history[t][1]
                next_persp = position_history[t + 1][1]
                next_pred = predictions[t + 1].detach()
                if curr_persp != next_persp:
                    flipped = torch.zeros_like(next_pred)
                    flipped[0] = 1.0 - next_pred[0]
                    flipped[1] = next_pred[2]
                    flipped[2] = next_pred[1]
                    flipped[3] = next_pred[4]
                    flipped[4] = next_pred[3]
                    next_pred = flipped

                weight = self.lambda_ ** (n - 1 - t)
                if curr_persp != final_perspective:
                    outcome_curr = get_outcome_targets(winner, win_type, curr_persp)
                    final_t = torch.from_numpy(outcome_curr)
                    targets[t] = (1.0 - weight) * next_pred + weight * final_t
                else:
                    targets[t] = (1.0 - weight) * next_pred + weight * final_target

        loss = self.loss_fn(predictions, targets)
        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
        self.optimizer.step()
        return loss.item()


def main():
    parser = argparse.ArgumentParser(description='Cloud training orchestrator for backgammon AI')
    parser.add_argument('--baseline', type=str, default=None,
                        help='Path to baseline model for comparison')
    parser.add_argument('--resume', type=str, default=None,
                        help='Path to checkpoint to resume from')
    parser.add_argument('--games', type=int, default=25000,
                        help='Total training games')
    parser.add_argument('--alpha', type=float, default=0.0003,
                        help='Learning rate')
    parser.add_argument('--lambda_', type=float, default=0.7,
                        help='TD lambda parameter')
    parser.add_argument('--explore', type=float, default=0.05,
                        help='Initial exploration rate')
    parser.add_argument('--explore-decay', type=float, default=0.99995,
                        help='Exploration decay per game')
    parser.add_argument('--min-explore', type=float, default=0.01,
                        help='Minimum exploration rate')
    parser.add_argument('--hidden', type=int, default=80,
                        help='Hidden layer size')
    parser.add_argument('--eval-every', type=int, default=5000,
                        help='Evaluate every N games')
    parser.add_argument('--checkpoint-every', type=int, default=2500,
                        help='Save checkpoint every N games')
    parser.add_argument('--target', type=float, default=70.0,
                        help='Target win rate vs baseline to stop')
    parser.add_argument('--patience', type=int, default=5,
                        help='Early stop after N evals with no >1%% improvement')
    parser.add_argument('--output-dir', type=str, default='output',
                        help='Output directory for checkpoints and logs')
    parser.add_argument('--v2', action='store_true',
                        help='Use V2 model architecture (213 features, ReLU, 160 hidden)')
    parser.add_argument('--network-type', choices=['contact', 'race'],
                        default=None,
                        help='Train contact or race network only (V2)')
    args = parser.parse_args()

    train_cloud(args)


if __name__ == '__main__':
    main()
