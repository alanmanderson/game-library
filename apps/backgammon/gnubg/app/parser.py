"""Pure functions for parsing ``gnubg -t`` text output.

gnubg's TTY output format is reasonably stable across 1.0x releases.
Parsing is line-based with a few regex anchors; every function returns
either a typed result or raises ``ParseError`` — callers (the engine)
can decide whether to retry or surface the error to the HTTP client.

These are the gnubg outputs we care about:

1. ``eval`` prints win probabilities and cubeless/cubeful equity.
2. ``hint`` prints a ranked list of candidate moves, each with its own
   probabilities and equity.
3. ``cube`` prints the three cube equities (no double / double-take /
   double-pass) plus gnubg's recommendation.

The shapes are captured in the ``parse_*`` functions below. Tests in
``tests/test_parser.py`` exercise every branch against canned strings.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


class ParseError(RuntimeError):
    """Raised when gnubg output doesn't match any recognised pattern."""


@dataclass
class ParsedProbs:
    win: float
    win_g: float
    lose_g: float
    win_bg: float
    lose_bg: float


@dataclass
class ParsedEval:
    equity: float
    probs: ParsedProbs


@dataclass
class ParsedCandidate:
    rank: int                      # 1-indexed; rank 1 is gnubg's "best"
    notation: str                  # "13/7 13/11" (as printed by gnubg)
    equity: float
    probs: ParsedProbs


@dataclass
class ParsedCube:
    equity_no_double: float
    equity_double_take: float
    equity_double_pass: float
    should_offer: bool
    should_accept: bool


# ── Regexes ────────────────────────────────────────────────────────────────

# Probability lines like:
#   "Win   W(g)  W(bg)  L(g)  L(bg)"
#   "0.550 0.150 0.010  0.120 0.005"
# or the inline form:
#   "Cubeless equity = +0.320"
#   "Win=0.55 W(g)=0.15 W(bg)=0.01 L(g)=0.12 L(bg)=0.005"
_NUM = r"[-+]?\d+(?:\.\d+)?"
_NUM_GROUP = rf"({_NUM})"

_PROB_INLINE = re.compile(
    rf"Win\s*=\s*{_NUM_GROUP}\s+"
    rf"W\(g\)\s*=\s*{_NUM_GROUP}\s+"
    rf"W\(bg\)\s*=\s*{_NUM_GROUP}\s+"
    rf"L\(g\)\s*=\s*{_NUM_GROUP}\s+"
    rf"L\(bg\)\s*=\s*{_NUM_GROUP}",
    re.IGNORECASE,
)

# Five floats on a single line, typical of gnubg's tabular eval/hint output.
_FIVE_FLOATS = re.compile(
    rf"^\s*{_NUM_GROUP}\s+{_NUM_GROUP}\s+{_NUM_GROUP}\s+{_NUM_GROUP}\s+{_NUM_GROUP}\s*$"
)

_EQUITY_LINE = re.compile(
    rf"(?:Cubeless\s+(?:equity|eval)|Equity)\s*[=:]?\s*{_NUM_GROUP}",
    re.IGNORECASE,
)

# Candidate header inside `hint` output: "  1.  Cubeful 0-ply   13/7 8/5"
# or "1. 13/7 8/5 eq.: +0.321"
_CANDIDATE_HEADER = re.compile(
    rf"^\s*(\d+)\.\s+(?:(?:Cubeful|Cubeless)\s+[\w-]+\s+)?(.+?)\s+(?:Equity|eq\.?|Eq\.?):?\s*{_NUM_GROUP}",
    re.IGNORECASE,
)

# Version line: "GNU Backgammon 1.07.01"
_VERSION = re.compile(r"GNU\s+Backgammon\s+(\S+)", re.IGNORECASE)

_CUBE_NO_DOUBLE = re.compile(
    rf"(?:No\s+double|No\s+redouble)[^=\n]*[=:]\s*{_NUM_GROUP}",
    re.IGNORECASE,
)
_CUBE_DOUBLE_TAKE = re.compile(
    rf"Double,?\s+take[^=\n]*[=:]\s*{_NUM_GROUP}", re.IGNORECASE
)
_CUBE_DOUBLE_PASS = re.compile(
    rf"Double,?\s+(?:pass|drop)[^=\n]*[=:]\s*{_NUM_GROUP}", re.IGNORECASE
)
_PROPER_CUBE_ACTION = re.compile(
    r"Proper\s+cube\s+action\s*[:=]\s*(.+)", re.IGNORECASE
)


# ── Helpers ────────────────────────────────────────────────────────────────

def _find_probs(text: str) -> Optional[ParsedProbs]:
    """Search *text* for a probability group, inline or tabular."""
    m = _PROB_INLINE.search(text)
    if m:
        return ParsedProbs(
            win=float(m.group(1)),
            win_g=float(m.group(2)),
            win_bg=float(m.group(3)),
            lose_g=float(m.group(4)),
            lose_bg=float(m.group(5)),
        )
    # Try tabular: a line of exactly five floats. Standard gnubg prints the
    # tabular header "   Win   W(g)  W(bg)   L(g)  L(bg)" above the row.
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if re.search(r"\bWin\b.*\bW\(g\).*\bL\(g\)", line, re.IGNORECASE):
            # Next line with five floats
            for j in range(i + 1, min(i + 4, len(lines))):
                m2 = _FIVE_FLOATS.match(lines[j])
                if m2:
                    return ParsedProbs(
                        win=float(m2.group(1)),
                        win_g=float(m2.group(2)),
                        win_bg=float(m2.group(3)),
                        lose_g=float(m2.group(4)),
                        lose_bg=float(m2.group(5)),
                    )
    return None


def _find_equity(text: str) -> Optional[float]:
    m = _EQUITY_LINE.search(text)
    if m:
        return float(m.group(1))
    return None


# ── Public API ─────────────────────────────────────────────────────────────


def parse_version(text: str) -> str:
    """Extract the gnubg version from startup banner text."""
    m = _VERSION.search(text)
    if m:
        return m.group(1).strip().rstrip(".,;)")
    return "unknown"


def parse_eval(text: str) -> ParsedEval:
    """Parse the output of ``eval`` into equity + probs."""
    probs = _find_probs(text)
    equity = _find_equity(text)
    if probs is None or equity is None:
        raise ParseError(f"could not parse eval output:\n{text}")
    return ParsedEval(equity=equity, probs=probs)


def parse_hint(text: str) -> list[ParsedCandidate]:
    """Parse ``hint`` output into a ranked list of candidates.

    gnubg's hint output contains a block per candidate move. Each block
    has a header line (``"1. 13/7 8/5 Equity: +0.321"``) followed by a
    probability line. We split on the numbered header and parse each
    block separately — this is tolerant of minor formatting drift (extra
    blank lines, leading spaces, etc).
    """
    candidates: list[ParsedCandidate] = []
    lines = text.splitlines()

    # Find the starting index of each numbered candidate block.
    block_starts: list[int] = []
    for i, line in enumerate(lines):
        if _CANDIDATE_HEADER.match(line):
            block_starts.append(i)

    if not block_starts:
        raise ParseError(f"no candidate moves found in hint output:\n{text}")

    block_starts.append(len(lines))

    for idx in range(len(block_starts) - 1):
        start = block_starts[idx]
        end = block_starts[idx + 1]
        block = "\n".join(lines[start:end])
        header = _CANDIDATE_HEADER.match(lines[start])
        assert header is not None  # guaranteed by loop above
        rank = int(header.group(1))
        notation = header.group(2).strip()
        equity = float(header.group(3))
        probs = _find_probs(block)
        if probs is None:
            # A hint block without explicit probs can still be useful; fill with
            # conservative zeros and rely on equity alone.
            probs = ParsedProbs(win=0.0, win_g=0.0, lose_g=0.0, win_bg=0.0, lose_bg=0.0)
        candidates.append(
            ParsedCandidate(
                rank=rank, notation=notation, equity=equity, probs=probs
            )
        )

    candidates.sort(key=lambda c: c.rank)
    return candidates


def parse_cube(text: str) -> ParsedCube:
    """Parse ``cube`` / cube-decision output."""
    m_nd = _CUBE_NO_DOUBLE.search(text)
    m_dt = _CUBE_DOUBLE_TAKE.search(text)
    m_dp = _CUBE_DOUBLE_PASS.search(text)
    if not (m_nd and m_dt and m_dp):
        raise ParseError(f"could not parse cube output:\n{text}")

    eq_no_double = float(m_nd.group(1))
    eq_double_take = float(m_dt.group(1))
    eq_double_pass = float(m_dp.group(1))

    action_match = _PROPER_CUBE_ACTION.search(text)
    action = action_match.group(1).strip().lower() if action_match else ""

    # Defaults derived from equities if gnubg didn't emit a verdict.
    # All equities are from the doubler's (would-be doubler's) perspective.
    # Offer a double when double-and-pass beats no-double (i.e. we gain by
    # forcing the decision) AND we wouldn't mind a take.
    # The opponent should accept if their equity is better than passing —
    # from the doubler's POV, that's when double-take equity is *lower*
    # than double-pass equity (less of a win for us).
    should_offer = eq_double_take > eq_no_double
    should_accept = eq_double_take <= eq_double_pass

    if action:
        if "double" in action and "no double" not in action:
            should_offer = True
        if "no double" in action or "no redouble" in action:
            should_offer = False
        if "take" in action:
            should_accept = True
        if "pass" in action or "drop" in action:
            should_accept = False

    return ParsedCube(
        equity_no_double=eq_no_double,
        equity_double_take=eq_double_take,
        equity_double_pass=eq_double_pass,
        should_offer=should_offer,
        should_accept=should_accept,
    )


# ── Move notation parsing ──────────────────────────────────────────────────

# "13/7" → (13, 7). "bar/22" → (bar, 22). "6/off" → (6, off).
_MOVE_STEP = re.compile(
    r"(bar|off|\d+)\s*/\s*(bar|off|\d+)(?:\*+)?(?:\s*\((\d+)\))?",
    re.IGNORECASE,
)


def parse_notation_steps(notation: str, turn: str) -> list[tuple[int, int]]:
    """Parse ``"13/7 8/5"`` into ``[(13, 7), (8, 5)]`` in backend indexing.

    Backend convention:
      - bar_white entry point = 25, bar_black entry point = 0
      - off_white = 0, off_black = 25
      - points 1..24 are play points
    gnubg prints ``bar`` for the moving player's bar and ``off`` for the
    destination when bearing off, so we resolve based on *turn*.
    """
    steps: list[tuple[int, int]] = []

    bar_for_turn = 25 if turn == "white" else 0
    off_for_turn = 0 if turn == "white" else 25

    def _resolve(tok: str, is_from: bool) -> int:
        t = tok.lower()
        if t == "bar":
            return bar_for_turn
        if t == "off":
            return off_for_turn
        return int(t)

    for m in _MOVE_STEP.finditer(notation):
        src = _resolve(m.group(1), is_from=True)
        dst = _resolve(m.group(2), is_from=False)
        repeat = int(m.group(3)) if m.group(3) else 1
        for _ in range(repeat):
            steps.append((src, dst))

    return steps


def classify_quality(equity_loss: float) -> str:
    """gnubg-compatible move quality buckets.

    Thresholds roughly match gnubg's own classifications: very good (0),
    good (<=0.02), doubtful (<=0.04), bad (<=0.08), very bad (<=0.16),
    otherwise blunder. ``equity_loss`` should already be non-negative.
    """
    if equity_loss < 0:
        equity_loss = 0.0
    if equity_loss <= 0.0001:
        return "very_good"
    if equity_loss <= 0.02:
        return "good"
    if equity_loss <= 0.04:
        return "doubtful"
    if equity_loss <= 0.08:
        return "bad"
    if equity_loss <= 0.16:
        return "very_bad"
    return "blunder"
