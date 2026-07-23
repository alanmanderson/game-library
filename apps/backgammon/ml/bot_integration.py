"""
Bot Integration Module
=======================
Provides a drop-in replacement for the random move selection in the
existing bot_service.py. This module shows how to integrate the trained
neural network model into the backgammon game's bot player.

Usage in bot_service.py:
    from ml.bot_integration import MLBotPlayer
    ml_bot = MLBotPlayer("ml/models/backgammon_model_final.pt")
    best_move = ml_bot.select_move(engine)

The MLBotPlayer class also handles doubling cube decisions.
"""

import sys
import os
import numpy as np
import torch

# Add paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from app.game_engine import BackgammonEngine, Color, Move, _opponent

from encoder import encode_state, encode_state_v2
from model import BackgammonNet, BackgammonNetV2, compute_equity, load_model


class MLBotPlayer:
    """ML-powered bot player for integration with the game server.

    This replaces the random.choice(valid_moves) in bot_service.py
    with intelligent move selection using the trained neural network.
    """

    def __init__(self, model_path: str, device: str = 'cpu'):
        """Initialize the ML bot.

        Args:
            model_path: Path to the trained model .pt file.
            device: 'cpu' or 'cuda'.
        """
        self.model = load_model(model_path)
        self.model = self.model.to(device)
        self.model.eval()
        self.device = device

    def select_move(self, engine: BackgammonEngine) -> Move:
        """Select the best move from the current position.

        Evaluates all valid moves by applying each one, encoding the
        resulting position, and selecting the move that maximizes equity
        for the bot's color.

        Args:
            engine: The current game engine instance.

        Returns:
            The best Move, or None if no valid moves.
        """
        valid_moves = engine.get_valid_moves()
        if not valid_moves:
            return None

        current_color = engine.state.current_turn
        best_move = None
        best_equity = float('-inf')

        for move in valid_moves:
            # Save state, try the move, evaluate, restore
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

    def should_accept_double(self, engine: BackgammonEngine) -> bool:
        """Decide whether to accept a doubling cube offer.

        Uses the dead cube model: accept if equity > -0.5
        (the theoretical take point for money play without recubes).

        Args:
            engine: The current game engine instance.

        Returns:
            True if the bot should accept the double.
        """
        # current_turn is the player who offered the double; the accepter is their opponent
        accepter_color = _opponent(engine.state.current_turn)

        with torch.no_grad():
            features = encode_state(engine, accepter_color)
            features_tensor = torch.from_numpy(features).to(self.device)
            outputs = self.model(features_tensor)
            equity = compute_equity(outputs).item()

        # Dead cube take point: accept if equity > -0.5
        # (losing 1 point by passing vs risking 2 points by taking)
        return equity > -0.5

    def should_double(self, engine: BackgammonEngine) -> bool:
        """Decide whether to offer a double.

        Uses simplified doubling window: double if equity > 0.5
        (aggressive but reasonable for money play).

        Args:
            engine: The current game engine instance.

        Returns:
            True if the bot should offer a double.
        """
        bot_color = engine.state.current_turn

        with torch.no_grad():
            features = encode_state(engine, bot_color)
            features_tensor = torch.from_numpy(features).to(self.device)
            outputs = self.model(features_tensor)
            equity = compute_equity(outputs).item()

        # Double if equity is strong enough (>0.5 is a reasonable threshold)
        return equity > 0.5

    def get_position_analysis(self, engine: BackgammonEngine) -> dict:
        """Get detailed analysis of the current position.

        Useful for debugging and understanding the model's evaluation.

        Args:
            engine: The current game engine instance.

        Returns:
            Dictionary with detailed position analysis.
        """
        color = engine.state.current_turn

        with torch.no_grad():
            features = encode_state(engine, color)
            features_tensor = torch.from_numpy(features).to(self.device)
            outputs = self.model(features_tensor)
            equity = compute_equity(outputs).item()

        return {
            'perspective': color.value,
            'win_probability': outputs[0].item(),
            'win_gammon_probability': outputs[1].item(),
            'lose_gammon_probability': outputs[2].item(),
            'win_backgammon_probability': outputs[3].item(),
            'lose_backgammon_probability': outputs[4].item(),
            'equity': equity,
        }


class MLBotPlayerV2:
    """V2 ML bot with 213-feature encoding, ReLU network, and bearoff DB."""
    def __init__(self, single_model_path=None, bearoff_db_path=None, device='cpu'):
        self.device = device
        self.single_model = None
        self.bearoff_db = None
        if single_model_path and os.path.exists(single_model_path):
            self.single_model = load_model(single_model_path).to(device)
            self.single_model.eval()
        if bearoff_db_path and os.path.exists(bearoff_db_path):
            from bearoff import BearoffDB
            self.bearoff_db = BearoffDB()
            self.bearoff_db.load(bearoff_db_path)

    def _encode(self, engine, perspective):
        model = self.single_model
        if model is not None and model.fc1.in_features <= 198:
            return encode_state(engine, perspective)
        return encode_state_v2(engine, perspective)

    def _evaluate_position(self, engine, perspective):
        if self.bearoff_db and self.bearoff_db.is_bearoff_position(engine, perspective):
            own_pos, opp_pos = self.bearoff_db.get_position_key(engine, perspective)
            equity = self.bearoff_db.lookup(own_pos, opp_pos)
            if equity is not None:
                return equity
        model = self.single_model
        if model is None:
            return 0.0
        with torch.no_grad():
            features = self._encode(engine, perspective)
            ft = torch.from_numpy(features).to(self.device)
            return compute_equity(model(ft)).item()

    def select_move(self, engine):
        valid_moves = engine.get_valid_moves()
        if not valid_moves:
            return None
        current_color = engine.state.current_turn
        best_move, best_equity = None, float('-inf')
        for move in valid_moves:
            snapshot = engine._snapshot_internals()
            engine._apply_move_internal(current_color, move)
            equity = self._evaluate_position(engine, current_color)
            engine._restore_internals(snapshot)
            if equity > best_equity:
                best_equity = equity
                best_move = move
        return best_move

    def should_accept_double(self, engine):
        # current_turn is the offerer; evaluate from the accepter's perspective
        return self._evaluate_position(engine, _opponent(engine.state.current_turn)) > -0.5

    def should_double(self, engine):
        return self._evaluate_position(engine, engine.state.current_turn) > 0.5


# Example showing how to modify bot_service.py
INTEGRATION_EXAMPLE = """
# =================================================================
# How to integrate into backend/app/services/bot_service.py
# =================================================================
#
# 1. Add import at the top of bot_service.py:
#
#    import os
#    import sys
#    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'ml'))
#    from bot_integration import MLBotPlayer
#
# 2. Initialize the ML bot (in module scope or in a setup function):
#
#    ML_MODEL_PATH = os.path.join(
#        os.path.dirname(__file__), '..', '..', '..', 'ml', 'models', 'backgammon_model_final.pt'
#    )
#    ml_bot = MLBotPlayer(ML_MODEL_PATH)
#
# 3. Replace the random move selection in execute_bot_turn():
#
#    # OLD (random):
#    # move = random.choice(valid_moves)
#
#    # NEW (ML):
#    move = ml_bot.select_move(engine)
#    if move is None:
#        await game_service.end_turn(table_id)
#        break
#
# 4. For doubling decisions, replace the auto-accept:
#
#    # OLD:
#    # Always accept doubles
#
#    # NEW:
#    if ml_bot.should_accept_double(engine):
#        await game_service.accept_double(table_id, "BOT")
#    else:
#        await game_service.reject_double(table_id, "BOT")
# =================================================================
"""


if __name__ == '__main__':
    print(INTEGRATION_EXAMPLE)
