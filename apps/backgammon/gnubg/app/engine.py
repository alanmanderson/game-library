"""Long-lived ``gnubg -t`` subprocess wrapper.

Design
------
- One subprocess per engine instance. The process is launched lazily on
  first use and kept alive for the lifetime of the server.
- All interaction is serialised through an ``asyncio.Lock``. gnubg's TTY
  protocol is line-based and single-threaded; concurrent commands would
  interleave output and break parsing.
- Commands are sent as newline-terminated strings. We read stdout until
  a known sentinel (gnubg's prompt or a marker we emit via ``echo``).
- Board state is passed to gnubg via Position ID / Match ID. These are
  gnubg's own 14-char / 12-char base64-like encodings — round-tripping
  is deterministic and well-documented in the gnubg manual.

Failure modes handled
---------------------
- Subprocess not started / crashed → ``ensure_started`` relaunches.
- Timeout waiting for prompt → raises, caller returns 503.
- Parse error on gnubg output → raises, caller returns 500.
- gnubg not installed (no binary on PATH) → startup raises; ``/health``
  surfaces ``ready: false`` rather than 500.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from typing import Optional

from . import parser
from .schemas import (
    AnalyzeMoveRequest,
    AnalyzeMoveResponse,
    BestMoveResponse,
    Board,
    Candidate,
    CubeDecisionResponse,
    EvaluateResponse,
    MoveDice,
    MoveStep,
    Probs,
)

logger = logging.getLogger(__name__)

# gnubg has no `echo` command, so we can't emit an arbitrary sentinel line.
# Instead we send a deliberately unknown keyword and wait for gnubg's
# "Unknown keyword `<name>`." reply — it echoes our token back to us,
# giving a reliable framing marker without relying on prompt format.
_SENTINEL = "__gnubg_sentinel_done__"
_STARTUP_TIMEOUT = 15.0
_COMMAND_TIMEOUT = 180.0  # 3-ply evaluations can take minutes per position


class GnubgUnavailableError(RuntimeError):
    """Raised when the gnubg binary cannot be launched."""


class GnubgEngine:
    """Manages one long-lived ``gnubg -t`` subprocess."""

    def __init__(self, binary: str = "gnubg") -> None:
        self._binary = binary
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._lock = asyncio.Lock()
        self._version: str = "unknown"
        self._ready: bool = False
        self._current_ply: int = 2  # tracks the active ply level in gnubg

    # ── Lifecycle ──────────────────────────────────────────────────────────

    @property
    def ready(self) -> bool:
        return self._ready and self._proc is not None and self._proc.returncode is None

    @property
    def version(self) -> str:
        return self._version

    async def start(self) -> None:
        """Launch the subprocess. Idempotent."""
        if self.ready:
            return

        path = shutil.which(self._binary)
        if path is None:
            self._ready = False
            raise GnubgUnavailableError(
                f"gnubg binary not found on PATH (looked for {self._binary!r})"
            )

        # `-t` = TTY mode (accepts commands on stdin, prints to stdout).
        # `-q` silences the startup banner — but we want the banner once so
        # we can capture the version, so don't use -q.
        self._proc = await asyncio.create_subprocess_exec(
            path, "-t",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env={**os.environ, "LC_ALL": "C"},
        )

        # Read the startup banner up to the first prompt or sentinel we inject.
        banner = await self._drain_until_sentinel(timeout=_STARTUP_TIMEOUT,
                                                  initial=True)
        self._version = parser.parse_version(banner)

        # Configure gnubg: 2-ply evaluator for stronger play.
        # "set cache" / "set threads" would bloat the B1s; use defaults.
        await self._raw_command("set output cubeful on")
        await self._raw_command("set output matchpc off")
        await self._raw_command("set output winpc off")
        # Use full chain notation (e.g. "13/7/4") instead of shorthand ("13/4")
        await self._raw_command("set output shortmoves off")

        # Set 2-ply evaluation for both chequer play and cube decisions
        await self._raw_command("set evaluation chequer ply 2")
        await self._raw_command("set evaluation cube ply 2")

        # Enable move filtering to improve performance with 2-ply
        # Format: set evaluation movefilter n [1-ply-threshold] [2-ply-threshold] [n-extra] [threshold]
        await self._raw_command("set evaluation movefilter 1 0 0 8 0.16")

        # Disable interactive confirmations.
        await self._raw_command("set confirm new off")
        await self._raw_command("set confirm save off")

        # Log the current evaluation settings for verification
        eval_settings = await self._raw_command("show evaluation")
        logger.info("gnubg evaluation settings:\n%s", eval_settings)

        self._ready = True
        logger.info("gnubg engine started (version=%s)", self._version)

    async def stop(self) -> None:
        if self._proc is not None:
            try:
                self._proc.terminate()
                await asyncio.wait_for(self._proc.wait(), timeout=5.0)
            except (asyncio.TimeoutError, ProcessLookupError):
                try:
                    self._proc.kill()
                except ProcessLookupError:
                    pass
            self._proc = None
        self._ready = False

    async def _ensure_started(self) -> None:
        if not self.ready:
            await self.start()

    async def _set_ply(self, ply: Optional[int]) -> None:
        """Set the evaluation ply level if it differs from current. Caller holds the lock."""
        if ply is None or ply == self._current_ply:
            return
        await self._raw_command(f"set evaluation chequer ply {ply}")
        await self._raw_command(f"set evaluation cube ply {ply}")
        self._current_ply = ply
        logger.info("gnubg ply changed to %d", ply)

    # ── Low-level I/O ──────────────────────────────────────────────────────

    async def _drain_until_sentinel(
        self, timeout: float, initial: bool = False
    ) -> str:
        """Read stdout until we see the sentinel (or on startup, a prompt)."""
        assert self._proc is not None and self._proc.stdout is not None

        if initial:
            # Send the sentinel token; gnubg will reply with "Unknown keyword
            # `<sentinel>`." which we use as the end-of-banner marker.
            assert self._proc.stdin is not None
            self._proc.stdin.write(f"{_SENTINEL}\n".encode())
            await self._proc.stdin.drain()

        buf = bytearray()

        async def _read() -> str:
            while True:
                chunk = await self._proc.stdout.readline()  # type: ignore[union-attr]
                if not chunk:
                    raise RuntimeError(
                        "gnubg subprocess closed stdout unexpectedly"
                    )
                buf.extend(chunk)
                if _SENTINEL.encode() in chunk:
                    # Strip the sentinel-bearing line from the buffer.
                    text = bytes(buf).decode("utf-8", errors="replace")
                    # Cut at the sentinel line.
                    out_lines = []
                    for line in text.splitlines():
                        if _SENTINEL in line:
                            break
                        out_lines.append(line)
                    return "\n".join(out_lines)

        return await asyncio.wait_for(_read(), timeout=timeout)

    async def _raw_command(self, cmd: str, timeout: float = _COMMAND_TIMEOUT) -> str:
        """Send a single command and return captured output up to sentinel.

        Caller must hold ``self._lock``.
        """
        assert self._proc is not None and self._proc.stdin is not None
        self._proc.stdin.write(f"{cmd}\n".encode())
        self._proc.stdin.write(f"{_SENTINEL}\n".encode())
        await self._proc.stdin.drain()
        return await self._drain_until_sentinel(timeout=timeout)

    # ── Position encoding ──────────────────────────────────────────────────

    @staticmethod
    def _encode_position_id(board: Board) -> str:
        """Encode the board into gnubg's 14-char Position ID.

        gnubg's Position ID is a 77-bit bitfield packed into 10 bytes and
        base64-encoded (using a custom alphabet that matches RFC 4648
        without padding). The bitfield encodes, for each of 26 points
        (starting with the bar) and for both players, a unary run of
        checker counts terminated by a zero bit.

        Spec: gnubg source, ``lib/positionid.c``, ``PositionKey``.
        """
        # Build the unary bitstream. gnubg encodes player-on-roll first.
        is_white = board.turn == "white"

        # gnubg iterates points in the player-on-roll's perspective:
        # point 0 = that player's bar, 1..24 = play points 24..1 from their
        # POV, 25 = opponent's bar. For the white-on-roll case the mapping
        # matches the backend's own indexing naturally.
        def _player_counts(for_white: bool) -> list[int]:
            counts: list[int] = []
            # bar for this player
            counts.append(board.bar_white if for_white else board.bar_black)
            # the 24 play points in the order the player sees them.
            # White's "point 1" in gnubg numbering is their 1-point (home),
            # which equals backend point 1. Black mirrors.
            for i in range(1, 25):
                pt = i if for_white else (25 - i)
                v = board.points[pt]
                counts.append(v if for_white else -v)
                counts[-1] = max(0, counts[-1])
            return counts

        player_counts = _player_counts(is_white)
        opp_counts = _player_counts(not is_white)

        bits: list[int] = []
        # Player-on-roll's counts first (25 slots), then opponent's (25).
        # Each count c is encoded as c ones followed by a single zero.
        for c in player_counts:
            bits.extend([1] * c)
            bits.append(0)
        for c in opp_counts:
            bits.extend([1] * c)
            bits.append(0)

        # Pad to a multiple of 8.
        while len(bits) % 8 != 0:
            bits.append(0)
        # gnubg packs bits little-endian within each byte.
        out = bytearray()
        for i in range(0, len(bits), 8):
            b = 0
            for j in range(8):
                if bits[i + j]:
                    b |= 1 << j
            out.append(b)

        # gnubg uses an unpadded urlsafe base64 alphabet variant. The
        # standard alphabet matches what the gnubg parser accepts.
        import base64
        encoded = base64.b64encode(bytes(out)).decode("ascii").rstrip("=")
        # gnubg position IDs are 14 chars; truncate/pad defensively.
        return encoded[:14]

    # ── High-level API ─────────────────────────────────────────────────────

    async def health(self) -> tuple[str, bool]:
        """Return ``(version, ready)``. Never raises."""
        try:
            await self._ensure_started()
        except GnubgUnavailableError:
            return ("unavailable", False)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("health: %s", exc)
            return ("error", False)
        return (self._version, self.ready)

    @staticmethod
    def _simple_board(board: Board) -> str:
        """Encode the board as gnubg's ``set board simple`` 26-int format.

        gnubg expects: [bar_on_roll, pt_on_roll_1, ..., pt_on_roll_24,
        bar_opp]. All counts are positive for the player on roll and
        negative for their opponent. When white is on roll the 1-point is
        backend index 1; when black is on roll the 1-point is backend
        index 24 (the board mirrors).
        """
        is_white = board.turn == "white"
        nums: list[int] = []
        # index 0 = bar for player on roll
        nums.append(board.bar_white if is_white else board.bar_black)
        # indices 1..24 = board from player-on-roll's POV, positive = on-roll
        for i in range(1, 25):
            pt = i if is_white else (25 - i)
            v = board.points[pt]
            nums.append(v if is_white else -v)
        # index 25 = bar for opponent
        nums.append(board.bar_black if is_white else board.bar_white)
        return " ".join(str(n) for n in nums)

    async def _set_board(self, board: Board) -> None:
        """Load ``board`` into gnubg. Caller holds the lock."""
        # `set board simple` is more robust across gnubg versions than
        # Position ID encoding, and doesn't require a game in progress.
        await self._raw_command("new game")
        await self._raw_command(
            f"set turn {board.turn}"
        )
        await self._raw_command(f"set board simple {self._simple_board(board)}")
        if board.cube_value != 1:
            await self._raw_command(f"set cube value {board.cube_value}")
        if board.cube_owner:
            await self._raw_command(f"set cube owner {board.cube_owner}")
        else:
            await self._raw_command("set cube centre")
        if board.match_score is not None:
            await self._raw_command(f"set matchlength {board.match_score.length}")
            await self._raw_command(
                f"set score {board.match_score.white} {board.match_score.black}"
            )

    async def evaluate(self, board: Board) -> EvaluateResponse:
        await self._ensure_started()
        async with self._lock:
            await self._set_ply(board.ply)
            await self._set_board(board)
            out = await self._raw_command("eval")
            parsed = parser.parse_eval(out)
        return EvaluateResponse(
            equity=parsed.equity,
            probs=Probs(**parsed.probs.__dict__),
        )

    async def best_move(self, req: MoveDice) -> BestMoveResponse:
        await self._ensure_started()
        async with self._lock:
            await self._set_ply(req.ply)
            await self._set_board(req)
            await self._raw_command(f"set dice {req.dice[0]} {req.dice[1]}")
            out = await self._raw_command("hint")
            candidates = parser.parse_hint(out)

        result = [
            Candidate(
                moves=[
                    MoveStep(from_point=f, to_point=t)
                    for (f, t) in parser.parse_notation_steps(c.notation, req.turn)
                ],
                notation=c.notation,
                equity=c.equity,
                probs=Probs(**c.probs.__dict__),
            )
            for c in candidates[:5]
        ]
        if not result:
            raise RuntimeError("gnubg returned no candidate moves")
        return BestMoveResponse(best=result[0], candidates=result)

    async def analyze_move(self, req: AnalyzeMoveRequest) -> AnalyzeMoveResponse:
        """Evaluate both the player's actual move and gnubg's best move.

        Uses a single subprocess round-trip: `hint` gives the ranked list
        of candidates, from which we pull gnubg's best plus any candidate
        whose notation matches the player's chosen moves. If the chosen
        move isn't in the top candidates we evaluate it separately.
        """
        best_resp = await self.best_move(req)
        best = best_resp.best

        chosen_notation = _steps_to_notation(req.chosen_moves, req.turn)
        chosen_candidate: Optional[Candidate] = None
        for c in best_resp.candidates:
            if _normalise_notation(c.notation) == _normalise_notation(chosen_notation):
                chosen_candidate = c
                break

        if chosen_candidate is None:
            # Evaluate the chosen move explicitly. We apply the move on a
            # scratch board and re-eval.
            applied = _apply_moves(req, req.chosen_moves)
            # Flip turn when evaluating from current player's perspective:
            # we still want equity for the player who just moved, so keep
            # turn as-is and negate the "opponent-to-move" equity.
            # Simpler: evaluate from the post-move side and negate.
            post = applied.model_copy(update={"turn": _opposite(req.turn)})
            post_eval = await self.evaluate(post)
            # Flip probs/equity to the mover's perspective.
            chosen_candidate = Candidate(
                moves=list(req.chosen_moves),
                notation=chosen_notation,
                equity=-post_eval.equity,
                probs=_flip_probs(post_eval.probs),
            )

        equity_loss = max(0.0, best.equity - chosen_candidate.equity)
        return AnalyzeMoveResponse(
            best=best,
            chosen=chosen_candidate,
            equity_loss=equity_loss,
            quality=parser.classify_quality(equity_loss),  # type: ignore[arg-type]
        )

    async def cube_decision(self, board: Board) -> CubeDecisionResponse:
        await self._ensure_started()
        async with self._lock:
            await self._set_ply(board.ply)
            await self._set_board(board)
            out = await self._raw_command("cube")
            parsed = parser.parse_cube(out)
        return CubeDecisionResponse(
            equity_no_double=parsed.equity_no_double,
            equity_double_take=parsed.equity_double_take,
            equity_double_pass=parsed.equity_double_pass,
            should_offer=parsed.should_offer,
            should_accept=parsed.should_accept,
        )


# ── Helpers ────────────────────────────────────────────────────────────────

def _opposite(turn: str) -> str:
    return "black" if turn == "white" else "white"


def _flip_probs(p: Probs) -> Probs:
    return Probs(
        win=1.0 - p.win,
        win_g=p.lose_g,
        lose_g=p.win_g,
        win_bg=p.lose_bg,
        lose_bg=p.win_bg,
    )


def _steps_to_notation(steps: list[MoveStep], turn: str) -> str:
    """Render MoveSteps back into gnubg-style notation."""
    bar_for_turn = 25 if turn == "white" else 0
    off_for_turn = 0 if turn == "white" else 25

    def _tok(v: int, is_from: bool) -> str:
        if is_from and v == bar_for_turn:
            return "bar"
        if (not is_from) and v == off_for_turn:
            return "off"
        return str(v)

    return " ".join(f"{_tok(s.from_point, True)}/{_tok(s.to_point, False)}"
                    for s in steps)


def _normalise_notation(s: str) -> str:
    return " ".join(s.split()).lower().rstrip("*")


def _apply_moves(board: Board, steps: list[MoveStep]) -> Board:
    """Apply a sequence of moves to a board (for chosen-move re-evaluation).

    Intentionally tolerant: we don't re-validate legality; we just update
    the point/bar/off counts. If the move is bogus the resulting eval
    will still come back from gnubg (from a different board state), and
    the equity comparison is at worst slightly off for this one move.
    """
    is_white = board.turn == "white"
    sign = 1 if is_white else -1
    bar_self = 25 if is_white else 0
    off_self = 0 if is_white else 25

    points = list(board.points)
    bar_w = board.bar_white
    bar_b = board.bar_black
    off_w = board.off_white
    off_b = board.off_black

    for step in steps:
        # Pick up from source
        if step.from_point == bar_self:
            if is_white:
                bar_w = max(0, bar_w - 1)
            else:
                bar_b = max(0, bar_b - 1)
        else:
            points[step.from_point] -= sign
        # Drop at destination
        if step.to_point == off_self:
            if is_white:
                off_w += 1
            else:
                off_b += 1
        else:
            # Handle hit: if the destination has a single opponent checker
            if points[step.to_point] * sign == -1:
                # Send opponent to bar
                if is_white:
                    bar_b += 1
                else:
                    bar_w += 1
                points[step.to_point] = 0
            points[step.to_point] += sign

    return board.model_copy(update={
        "points": points,
        "bar_white": bar_w,
        "bar_black": bar_b,
        "off_white": off_w,
        "off_black": off_b,
    })
