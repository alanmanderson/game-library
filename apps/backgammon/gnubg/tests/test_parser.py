"""Unit tests for the gnubg output parser.

Fixtures here are representative samples of what ``gnubg -t`` emits for
``eval``, ``hint``, and ``cube`` on recent 1.0x releases. The parser is
intentionally permissive — it handles both the tabular and the inline
forms of the probability block.
"""

from __future__ import annotations

import pytest

from app.parser import (
    ParseError,
    classify_quality,
    parse_cube,
    parse_eval,
    parse_hint,
    parse_notation_steps,
    parse_version,
)


# ── Version ─────────────────────────────────────────────────────────────


def test_parse_version_from_banner():
    banner = """\
GNU Backgammon 1.07.01  Copyright 1999-2023 ...
This is free software; see the source for copying ...
"""
    assert parse_version(banner) == "1.07.01"


def test_parse_version_unknown():
    assert parse_version("some unrelated output") == "unknown"


# ── Eval ────────────────────────────────────────────────────────────────


EVAL_INLINE = """\
           Win=0.524 W(g)=0.131 W(bg)=0.004 L(g)=0.118 L(bg)=0.003
Cubeless equity  = +0.142
"""

EVAL_TABULAR = """\
            Win   W(g)  W(bg)   L(g)  L(bg)
           0.524 0.131 0.004  0.118 0.003
Cubeless equity:  +0.142
"""


def test_parse_eval_inline():
    out = parse_eval(EVAL_INLINE)
    assert out.equity == pytest.approx(0.142)
    assert out.probs.win == pytest.approx(0.524)
    assert out.probs.win_g == pytest.approx(0.131)
    assert out.probs.lose_g == pytest.approx(0.118)
    assert out.probs.win_bg == pytest.approx(0.004)
    assert out.probs.lose_bg == pytest.approx(0.003)


def test_parse_eval_tabular():
    out = parse_eval(EVAL_TABULAR)
    assert out.equity == pytest.approx(0.142)
    assert out.probs.win == pytest.approx(0.524)


def test_parse_eval_missing_equity_raises():
    with pytest.raises(ParseError):
        parse_eval("Win=0.5 W(g)=0.1 W(bg)=0.0 L(g)=0.1 L(bg)=0.0\n")


def test_parse_eval_missing_probs_raises():
    with pytest.raises(ParseError):
        parse_eval("Cubeless equity = +0.123")


# ── Hint ────────────────────────────────────────────────────────────────


HINT_BASIC = """\
   1.  13/7 8/5 Equity: +0.321
         Win=0.550 W(g)=0.150 W(bg)=0.010 L(g)=0.120 L(bg)=0.005
   2.  13/7 13/11 Equity: +0.280
         Win=0.540 W(g)=0.140 W(bg)=0.008 L(g)=0.115 L(bg)=0.004
   3.  24/18 Equity: -0.050
         Win=0.480 W(g)=0.100 W(bg)=0.003 L(g)=0.130 L(bg)=0.006
"""


def test_parse_hint_three_candidates():
    cands = parse_hint(HINT_BASIC)
    assert len(cands) == 3
    assert cands[0].rank == 1
    assert cands[0].notation == "13/7 8/5"
    assert cands[0].equity == pytest.approx(0.321)
    assert cands[0].probs.win == pytest.approx(0.550)
    assert cands[1].notation == "13/7 13/11"
    assert cands[2].equity == pytest.approx(-0.05)


def test_parse_hint_no_candidates():
    with pytest.raises(ParseError):
        parse_hint("no moves available")


HINT_WITHOUT_PROBS = """\
   1.  bar/20 13/11 Equity: -0.150
"""


def test_parse_hint_tolerates_missing_probs():
    cands = parse_hint(HINT_WITHOUT_PROBS)
    assert len(cands) == 1
    assert cands[0].notation == "bar/20 13/11"
    assert cands[0].equity == pytest.approx(-0.15)
    assert cands[0].probs.win == 0.0


# ── Cube ────────────────────────────────────────────────────────────────


CUBE_DOUBLE_TAKE = """\
Cubeful equities:
  1. No double       :  +0.450
  2. Double, take    :  +0.820
  3. Double, pass    :  +1.000
Proper cube action: Double, take
"""

CUBE_NO_DOUBLE = """\
Cubeful equities:
  1. No double       :  +0.100
  2. Double, take    :  +0.080
  3. Double, pass    :  +1.000
Proper cube action: No double
"""


def test_parse_cube_double_take():
    cube = parse_cube(CUBE_DOUBLE_TAKE)
    assert cube.equity_no_double == pytest.approx(0.450)
    assert cube.equity_double_take == pytest.approx(0.820)
    assert cube.equity_double_pass == pytest.approx(1.000)
    assert cube.should_offer is True
    assert cube.should_accept is True


def test_parse_cube_no_double():
    cube = parse_cube(CUBE_NO_DOUBLE)
    assert cube.should_offer is False
    assert cube.should_accept is True  # take is still better than pass


def test_parse_cube_missing_raises():
    with pytest.raises(ParseError):
        parse_cube("garbage")


# ── Notation → steps ────────────────────────────────────────────────────


def test_parse_notation_white():
    steps = parse_notation_steps("13/7 8/5", "white")
    assert steps == [(13, 7), (8, 5)]


def test_parse_notation_with_hit_and_bar():
    # Hit asterisks are stripped; bar maps to 25 for white.
    steps = parse_notation_steps("bar/22* 13/11", "white")
    assert steps == [(25, 22), (13, 11)]


def test_parse_notation_bearoff_white():
    steps = parse_notation_steps("6/off 4/off", "white")
    assert steps == [(6, 0), (4, 0)]


def test_parse_notation_bearoff_black():
    # black bears off to 25, bar is 0
    steps = parse_notation_steps("bar/3 19/off", "black")
    assert steps == [(0, 3), (19, 25)]


def test_parse_notation_repeat_suffix():
    # gnubg sometimes prints "13/7(2)" for two identical checker moves.
    steps = parse_notation_steps("13/7(2) 8/5", "white")
    assert steps == [(13, 7), (13, 7), (8, 5)]


# ── Quality classification ──────────────────────────────────────────────


def test_classify_quality_buckets():
    assert classify_quality(0.0) == "very_good"
    assert classify_quality(0.01) == "good"
    assert classify_quality(0.03) == "doubtful"
    assert classify_quality(0.05) == "bad"
    assert classify_quality(0.10) == "very_bad"
    assert classify_quality(0.50) == "blunder"


def test_classify_quality_negative_clamped():
    # Chosen move can theoretically score higher than "best" due to
    # rounding; treat it as very_good rather than blowing up.
    assert classify_quality(-0.01) == "very_good"
