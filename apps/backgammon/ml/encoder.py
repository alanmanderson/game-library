"""
Board State Encoder
====================
Converts backgammon game engine state into the standard 198-feature
neural network input encoding (TD-Gammon / Tesauro encoding).

Encoding scheme (198 features total):
- 24 points × 4 units × 2 players = 192 features
  For each point, 4 units per player using truncated unary:
    0 checkers: [0, 0, 0, 0]
    1 checker:  [1, 0, 0, 0]
    2 checkers: [1, 1, 0, 0]
    3 checkers: [1, 1, 1, 0]
    n checkers: [1, 1, 1, (n-3)/2]  (n >= 4)
- 2 bar features (one per player, normalized by /2)
- 2 borne-off features (one per player, normalized by /15)
- 2 turn indicator features ([1,0] or [0,1])

The encoding is always from White's perspective. When evaluating
for Black, the board is flipped so that the network always evaluates
from a consistent viewpoint.
"""

import sys
import os
import numpy as np

# Add backend to path so we can import the game engine
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from app.game_engine import BackgammonEngine, Color, GameState


def _encode_point_checkers(count: int) -> list[float]:
    """Encode checker count at a single point into 4 features."""
    if count <= 0:
        return [0.0, 0.0, 0.0, 0.0]
    elif count == 1:
        return [1.0, 0.0, 0.0, 0.0]
    elif count == 2:
        return [1.0, 1.0, 0.0, 0.0]
    elif count == 3:
        return [1.0, 1.0, 1.0, 0.0]
    else:
        return [1.0, 1.0, 1.0, (count - 3) / 2.0]


def encode_state(engine: BackgammonEngine, perspective: Color = Color.WHITE) -> np.ndarray:
    """Encode the current board position as a 198-feature vector.

    The encoding is from the given perspective. When perspective is BLACK,
    the board is flipped so the network always sees the position as if
    it were the 'home' player.

    Args:
        engine: The backgammon engine instance.
        perspective: Which player's perspective to encode from.

    Returns:
        numpy array of shape (198,) with float32 values.
    """
    state = engine.state
    features = []

    if perspective == Color.WHITE:
        # Encode from White's perspective
        for i in range(1, 25):
            val = state.points[i]
            white_count = max(0, val)
            black_count = max(0, -val)
            features.extend(_encode_point_checkers(white_count))
            features.extend(_encode_point_checkers(black_count))

        # Bar
        features.append(state.bar_white / 2.0)
        features.append(state.bar_black / 2.0)
        # Borne off
        features.append(state.off_white / 15.0)
        features.append(state.off_black / 15.0)
        # Turn indicator
        if state.current_turn == Color.WHITE:
            features.extend([1.0, 0.0])
        else:
            features.extend([0.0, 1.0])
    else:
        # Encode from Black's perspective: flip the board
        # Point i from Black's view = Point (25-i) from the array
        # Black's checkers become positive, White's become negative
        for i in range(24, 0, -1):
            val = state.points[i]
            black_count = max(0, -val)  # Black's checkers (perspective player)
            white_count = max(0, val)   # White's checkers (opponent)
            features.extend(_encode_point_checkers(black_count))
            features.extend(_encode_point_checkers(white_count))

        # Bar (perspective player first)
        features.append(state.bar_black / 2.0)
        features.append(state.bar_white / 2.0)
        # Borne off
        features.append(state.off_black / 15.0)
        features.append(state.off_white / 15.0)
        # Turn indicator
        if state.current_turn == Color.BLACK:
            features.extend([1.0, 0.0])
        else:
            features.extend([0.0, 1.0])

    return np.array(features, dtype=np.float32)


def encode_state_from_raw(
    points: list[int],
    bar_white: int,
    bar_black: int,
    off_white: int,
    off_black: int,
    current_turn: str,
    perspective: str = "white"
) -> np.ndarray:
    """Encode from raw state values (useful for testing/integration).

    Args:
        points: 26-element list (indices 0-25, 1-24 are board points).
        bar_white: White checkers on bar.
        bar_black: Black checkers on bar.
        off_white: White checkers borne off.
        off_black: Black checkers borne off.
        current_turn: "white" or "black".
        perspective: "white" or "black".

    Returns:
        numpy array of shape (198,).
    """
    features = []
    is_white_perspective = (perspective == "white")

    if is_white_perspective:
        for i in range(1, 25):
            val = points[i]
            white_count = max(0, val)
            black_count = max(0, -val)
            features.extend(_encode_point_checkers(white_count))
            features.extend(_encode_point_checkers(black_count))
        features.append(bar_white / 2.0)
        features.append(bar_black / 2.0)
        features.append(off_white / 15.0)
        features.append(off_black / 15.0)
        features.extend([1.0, 0.0] if current_turn == "white" else [0.0, 1.0])
    else:
        for i in range(24, 0, -1):
            val = points[i]
            black_count = max(0, -val)
            white_count = max(0, val)
            features.extend(_encode_point_checkers(black_count))
            features.extend(_encode_point_checkers(white_count))
        features.append(bar_black / 2.0)
        features.append(bar_white / 2.0)
        features.append(off_black / 15.0)
        features.append(off_white / 15.0)
        features.extend([1.0, 0.0] if current_turn == "black" else [0.0, 1.0])

    return np.array(features, dtype=np.float32)


def get_outcome_targets(winner: str, win_type: str, perspective: str) -> np.ndarray:
    """Convert game outcome to target output vector.

    Args:
        winner: "white" or "black".
        win_type: "normal", "gammon", or "backgammon".
        perspective: "white" or "black".

    Returns:
        numpy array of shape (5,):
            [P(win), P(win_gammon), P(lose_gammon), P(win_bg), P(lose_bg)]
    """
    perspective_wins = (winner == perspective)

    if perspective_wins:
        if win_type == "backgammon":
            return np.array([1.0, 1.0, 0.0, 1.0, 0.0], dtype=np.float32)
        elif win_type == "gammon":
            return np.array([1.0, 1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        else:
            return np.array([1.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
    else:
        if win_type == "backgammon":
            return np.array([0.0, 0.0, 1.0, 0.0, 1.0], dtype=np.float32)
        elif win_type == "gammon":
            return np.array([0.0, 0.0, 1.0, 0.0, 0.0], dtype=np.float32)
        else:
            return np.array([0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
