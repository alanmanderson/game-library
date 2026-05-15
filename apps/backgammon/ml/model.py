"""
Backgammon Neural Network Model
================================
PyTorch implementation of a TD-Gammon style position evaluator.

Architecture:
- Input: 198 features (standard Tesauro encoding)
- Hidden Layer 1: 80 units, sigmoid activation
- Hidden Layer 2: 80 units, sigmoid activation
- Output: 5 units, sigmoid activation

Outputs represent:
  [0] P(win)            - Probability perspective player wins
  [1] P(win_gammon)     - Probability of winning a gammon (subset of wins)
  [2] P(lose_gammon)    - Probability of losing a gammon (subset of losses)
  [3] P(win_backgammon) - Probability of winning a backgammon (subset of gammon wins)
  [4] P(lose_backgammon)- Probability of losing a backgammon (subset of gammon losses)
"""

import os
import torch
import torch.nn as nn
import numpy as np


class BackgammonNet(nn.Module):
    """Neural network for backgammon position evaluation."""

    def __init__(self, input_size: int = 198, hidden_size: int = 80, output_size: int = 5):
        super().__init__()
        self.fc1 = nn.Linear(input_size, hidden_size)
        self.fc2 = nn.Linear(hidden_size, hidden_size)
        self.fc3 = nn.Linear(hidden_size, output_size)
        self.sigmoid = nn.Sigmoid()

        # Initialize weights with small random values
        self._init_weights()

    def _init_weights(self):
        for layer in [self.fc1, self.fc2, self.fc3]:
            nn.init.uniform_(layer.weight, -0.5, 0.5)
            nn.init.zeros_(layer.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass.

        Args:
            x: Input tensor of shape (batch_size, 198) or (198,).

        Returns:
            Output tensor of shape (batch_size, 5) or (5,).
        """
        x = self.sigmoid(self.fc1(x))
        x = self.sigmoid(self.fc2(x))
        x = self.sigmoid(self.fc3(x))
        return x


def compute_equity(outputs: torch.Tensor) -> torch.Tensor:
    """Compute the expected equity from network outputs.

    Equity formula (money game, cubeless):
    E = P(win) - P(lose) + P(win_gammon) - P(lose_gammon) + P(win_bg) - P(lose_bg)

    Where P(lose) = 1 - P(win).

    This simplifies to:
    E = 2*P(win) - 1 + P(win_gammon) - P(lose_gammon) + P(win_bg) - P(lose_bg)

    Args:
        outputs: Network outputs of shape (..., 5).

    Returns:
        Equity scalar(s), range approximately [-3, +3].
    """
    p_win = outputs[..., 0]
    p_win_gammon = outputs[..., 1]
    p_lose_gammon = outputs[..., 2]
    p_win_bg = outputs[..., 3]
    p_lose_bg = outputs[..., 4]

    equity = (2.0 * p_win - 1.0
              + p_win_gammon - p_lose_gammon
              + p_win_bg - p_lose_bg)
    return equity


class BackgammonNetV2(nn.Module):
    """V2 network: 213->160->160->5, ReLU hidden, sigmoid output, Kaiming init."""
    VERSION = 2
    def __init__(self, input_size=213, hidden_size=160, output_size=5):
        super().__init__()
        self.fc1 = nn.Linear(input_size, hidden_size)
        self.fc2 = nn.Linear(hidden_size, hidden_size)
        self.fc3 = nn.Linear(hidden_size, output_size)
        self.relu = nn.ReLU()
        self.sigmoid = nn.Sigmoid()
        nn.init.kaiming_normal_(self.fc1.weight, nonlinearity='relu')
        nn.init.zeros_(self.fc1.bias)
        nn.init.kaiming_normal_(self.fc2.weight, nonlinearity='relu')
        nn.init.zeros_(self.fc2.bias)
        nn.init.xavier_uniform_(self.fc3.weight)
        nn.init.zeros_(self.fc3.bias)
    def forward(self, x):
        return self.sigmoid(self.fc3(self.relu(self.fc2(self.relu(self.fc1(x))))))


def save_model(model, path: str, metadata: dict = None):
    """Save model weights and optional metadata."""
    save_dict = {
        'model_state_dict': model.state_dict(),
        'input_size': model.fc1.in_features,
        'hidden_size': model.fc1.out_features,
        'output_size': model.fc3.out_features,
        'version': getattr(model, 'VERSION', 1),
    }
    if metadata:
        save_dict['metadata'] = metadata
    torch.save(save_dict, path)


def load_model(path: str):
    """Load a model from disk, auto-detecting V1 vs V2."""
    checkpoint = torch.load(path, map_location='cpu', weights_only=False)
    version = checkpoint.get('version', 1)
    input_size = checkpoint.get('input_size', 198)
    hidden_size = checkpoint.get('hidden_size', 80)
    output_size = checkpoint.get('output_size', 5)
    if version >= 2 or input_size > 198:
        model = BackgammonNetV2(input_size=input_size, hidden_size=hidden_size, output_size=output_size)
    else:
        model = BackgammonNet(input_size=input_size, hidden_size=hidden_size, output_size=output_size)
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()
    return model


def get_model_version(path: str) -> int:
    """Get the version of a saved model without fully loading it."""
    checkpoint = torch.load(path, map_location='cpu', weights_only=False)
    if checkpoint.get('version', 1) >= 2 or checkpoint.get('input_size', 198) > 198:
        return 2
    return 1
