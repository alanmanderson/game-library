"""Cube-decision analysis: compute equity via ML and classify verdicts.

This module provides two things:

1. :func:`classify_cube_action` — a pure function mapping ``(action,
   equity)`` to a ``(verdict, correct)`` tuple using standard cube-theory
   thresholds. The helper is tested in isolation so the thresholds are
   easy to tune without exercising the websocket/ML stack.

2. :func:`evaluate_cube_equity` — a thin, best-effort wrapper around the
   ML model that returns the equity of the current position from the
   acting player's perspective. Returns ``None`` if the model isn't
   loaded or encoding fails; callers should still persist the action row
   with NULL equity so raw counts remain consistent.

**Thresholds (offerer's perspective)**

- ``offer``    : best ≥ 0.40 · borderline 0.30–0.40 · mistake 0.20–0.30 · blunder < 0.20
- ``accept``   : best ≥ −0.50 · borderline −0.60 to −0.50 · mistake −0.70 to −0.60 · blunder < −0.70
- ``decline``  : best < −0.50 · borderline −0.50 to −0.40 · mistake −0.40 to −0.30 · blunder ≥ −0.30

For ``accept`` / ``decline`` the equity passed in is from the
**taker's** perspective (i.e. the player who received the offer), which
is the opposite color of the offerer. The websocket handler flips the
perspective when recording an accept/decline.
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


VERDICTS = ("best", "borderline", "mistake", "blunder")


def classify_cube_action(action: str, equity: float) -> tuple[str, bool]:
    """Return ``(verdict, correct)`` for a cube action given the pre-action equity.

    ``correct`` is ``True`` for the "best" verdict and ``False`` otherwise.
    Raises ``ValueError`` for an unknown action string.
    """
    if action == "offer":
        if equity >= 0.40:
            return "best", True
        if equity >= 0.30:
            return "borderline", False
        if equity >= 0.20:
            return "mistake", False
        return "blunder", False

    if action == "accept":
        # From the taker's perspective, taking is correct above the
        # dead-cube take point (~-0.5).
        if equity >= -0.50:
            return "best", True
        if equity >= -0.60:
            return "borderline", False
        if equity >= -0.70:
            return "mistake", False
        return "blunder", False

    if action == "decline":
        # Dropping is correct when the taker's equity would be below the
        # take point.
        if equity < -0.50:
            return "best", True
        if equity < -0.40:
            return "borderline", False
        if equity < -0.30:
            return "mistake", False
        return "blunder", False

    raise ValueError(f"Unknown cube action: {action!r}")


def evaluate_cube_equity(engine, perspective) -> Optional[float]:
    """Return ML equity in ``perspective``'s view, or ``None`` on failure.

    Lazily loads the standard (hard) ML bot via the bot_service loader.
    Any failure (model missing, torch/numpy missing, encoding error) is
    logged at debug level and returns ``None`` — never raises.
    """
    try:
        # Local import to avoid a hard dependency cycle at import time.
        from app.services.bot_service import _load_ml_bot
        bot = _load_ml_bot()
        if bot is None:
            return None
        # MLBotPlayer loads torch and encoder lazily at construction time;
        # we just reuse the analysis helper which runs a single forward
        # pass for the current position.
        # get_position_analysis always uses engine.state.current_turn as
        # its perspective, so we call it and then flip equity if the
        # perspective we want differs.
        analysis = bot.get_position_analysis(engine)
        equity = float(analysis["equity"])
        current = engine.state.current_turn
        if perspective != current:
            equity = -equity
        return equity
    except Exception as exc:  # Broad catch: never fail the WS action
        logger.debug("Cube equity evaluation failed: %s", exc)
        return None
