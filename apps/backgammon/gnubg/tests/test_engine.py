"""Tests for the GnubgEngine subprocess wrapper.

Integration tests (marked ``integration``) require a real ``gnubg``
binary on PATH. When it's missing, those tests auto-skip.

Unit tests for pure helpers (``_collapse_chains``, ``_moves_match``)
run without gnubg.
"""

from __future__ import annotations

import shutil

import pytest

from app.engine import GnubgEngine, _collapse_chains, _moves_match
from app.schemas import Board, MoveStep, MoveDice


# ---------- Unit tests for _collapse_chains / _moves_match ----------

def _ms(from_pt: int, to_pt: int) -> MoveStep:
    return MoveStep(from_point=from_pt, to_point=to_pt)


class TestCollapseChains:
    def test_empty(self):
        assert _collapse_chains([]) == []

    def test_single(self):
        assert _collapse_chains([_ms(13, 7)]) == [(13, 7)]

    def test_sequential_chain(self):
        # 13/7/4 = two consecutive hops
        assert _collapse_chains([_ms(13, 7), _ms(7, 4)]) == [(13, 4)]

    def test_no_chain(self):
        # Two independent moves: 13/7 8/5
        result = _collapse_chains([_ms(13, 7), _ms(8, 5)])
        assert sorted(result) == [(8, 5), (13, 7)]

    def test_bearing_off_cross_checker(self):
        # Player records: 5/off 6/5 (bear off from 5, then move 6→5)
        # Should collapse to (6, 0) — same as gnubg's 6/off
        result = _collapse_chains([_ms(5, 0), _ms(6, 5)])
        assert result == [(6, 0)]

    def test_bearing_off_same_order_as_gnubg(self):
        # gnubg order: 6/5 5/off — sequential chain works directly
        result = _collapse_chains([_ms(6, 5), _ms(5, 0)])
        assert result == [(6, 0)]

    def test_four_move_reverse_order(self):
        # Player bears off in reverse order: 6/off 12/6 18/12 24/18
        result = _collapse_chains([_ms(6, 0), _ms(12, 6), _ms(18, 12), _ms(24, 18)])
        assert result == [(24, 0)]

    def test_two_independent_bearoffs(self):
        # 5/off 3/off — no chain possible (0 ≠ 3)
        result = _collapse_chains([_ms(5, 0), _ms(3, 0)])
        assert sorted(result) == [(3, 0), (5, 0)]


class TestMovesMatch:
    def test_identical(self):
        assert _moves_match([_ms(13, 7)], [_ms(13, 7)])

    def test_different_order(self):
        assert _moves_match(
            [_ms(13, 7), _ms(8, 5)],
            [_ms(8, 5), _ms(13, 7)],
        )

    def test_chain_vs_hops(self):
        # gnubg: 20/8 (collapsed)  vs  game: 20/14 14/8 (two hops)
        assert _moves_match(
            [_ms(20, 8)],
            [_ms(20, 14), _ms(14, 8)],
        )

    def test_bearing_off_cross_checker(self):
        # gnubg best: 6/off (= 6/5/off collapsed)
        # player played: 5/off 6/5
        assert _moves_match(
            [_ms(6, 0)],
            [_ms(5, 0), _ms(6, 5)],
        )

    def test_bearing_off_with_additional_move(self):
        # gnubg: 6/off 3/2  vs  player: 5/off 6/5 3/2
        assert _moves_match(
            [_ms(6, 0), _ms(3, 2)],
            [_ms(5, 0), _ms(6, 5), _ms(3, 2)],
        )

    def test_no_match(self):
        assert not _moves_match(
            [_ms(13, 7)],
            [_ms(13, 8)],
        )


# ---------- Integration tests (require gnubg binary) ----------

_needs_gnubg = pytest.mark.skipif(
    shutil.which("gnubg") is None,
    reason="gnubg binary not installed",
)


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


@_needs_gnubg
@pytest.mark.asyncio
async def test_health(engine: GnubgEngine):
    version, ready = await engine.health()
    assert ready is True
    assert version != "unknown"


@_needs_gnubg
@pytest.mark.asyncio
async def test_evaluate_starting_position(engine: GnubgEngine):
    """Opening position equity should be near zero (fair game)."""
    resp = await engine.evaluate(_starting_board())
    assert -0.2 <= resp.equity <= 0.2
    # Probabilities sum to ~1 for win + lose.
    assert 0.3 <= resp.probs.win <= 0.7


@_needs_gnubg
@pytest.mark.asyncio
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
