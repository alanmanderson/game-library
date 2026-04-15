"""Integration tests for the GnubgEngine subprocess wrapper.

These require a real ``gnubg`` binary on PATH. When it's missing (CI
without the package, local dev), the tests auto-skip.
"""

from __future__ import annotations

import shutil

import pytest

from app.engine import GnubgEngine
from app.schemas import Board, MoveDice


# All tests in this module are async.
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(
        shutil.which("gnubg") is None,
        reason="gnubg binary not installed",
    ),
]


def _starting_board() -> Board:
    """Standard backgammon opening position, white to move."""
    points = [0] * 26
    # White: 2 on 24, 5 on 13, 3 on 8, 5 on 6
    points[24] = 2
    points[13] = 5
    points[8] = 3
    points[6] = 5
    # Black (negative): 2 on 1, 5 on 12, 3 on 17, 5 on 19
    points[1] = -2
    points[12] = -5
    points[17] = -3
    points[19] = -5
    return Board(
        points=points,
        bar_white=0,
        bar_black=0,
        off_white=0,
        off_black=0,
        turn="white",
    )


@pytest.fixture
async def engine():
    eng = GnubgEngine()
    await eng.start()
    try:
        yield eng
    finally:
        await eng.stop()


async def test_health(engine: GnubgEngine):
    version, ready = await engine.health()
    assert ready is True
    assert version != "unknown"


async def test_evaluate_starting_position(engine: GnubgEngine):
    """Opening position equity should be near zero (fair game)."""
    resp = await engine.evaluate(_starting_board())
    assert -0.2 <= resp.equity <= 0.2
    # Probabilities sum to ~1 for win + lose.
    assert 0.3 <= resp.probs.win <= 0.7


async def test_best_move_roundtrip(engine: GnubgEngine):
    """gnubg should return at least one candidate for an opening roll."""
    board = _starting_board()
    req = MoveDice(**board.model_dump(), dice=[3, 1])
    resp = await engine.best_move(req)
    assert resp.best is not None
    assert len(resp.candidates) >= 1
    assert resp.best.moves  # non-empty
    # 3-1 opening has a well-known best (8/5 6/5). We don't assert the
    # exact move — engine strength varies — just that parsing worked.
