"""HTTP client for the internal gnubg analysis service.

The client is a thin wrapper around ``httpx.AsyncClient`` with timeouts
set appropriately per endpoint. Every method returns ``None`` when

- ``GNUBG_URL`` is unset (feature disabled), or
- the gnubg service is unreachable / times out / returns non-2xx.

Callers are expected to fall back to whatever they were doing before:
the bot service falls back to its "expert" path, the analysis service
falls back to the ML evaluator, and so on. This keeps the gnubg
integration strictly additive — if the service is down, nothing breaks.

The module holds a single lazy ``httpx.AsyncClient`` created on first
use. It's not closed automatically; FastAPI's lifespan can call
``close_gnubg_client`` on shutdown if we want to be tidy, but since the
client is stateless HTTP any leaked connections are harmless.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx

from app.config import settings
from app.game_engine import BackgammonEngine, Color

logger = logging.getLogger(__name__)


# Timeouts must be generous: gnubg's `hint` command evaluates every legal
# move at the requested ply depth. Complex positions (e.g. doubles with
# many bearing-off options) can take minutes even at 2-ply on a 1-vCPU VM.
_TIMEOUT_HEALTH = httpx.Timeout(10.0, connect=2.0)
_TIMEOUT_2PLY = httpx.Timeout(120.0, connect=5.0)   # 2-ply: up to 2 min per position
_TIMEOUT_3PLY = httpx.Timeout(600.0, connect=5.0)   # 3-ply: up to 10 min per position

# Number of retries on timeout or connection error before giving up.
_MAX_RETRIES = 1


_client: Optional[httpx.AsyncClient] = None


def _get_client() -> Optional[httpx.AsyncClient]:
    """Return the shared httpx client, or None if gnubg is disabled."""
    global _client
    if not settings.gnubg_url:
        return None
    if _client is None:
        _client = httpx.AsyncClient(base_url=settings.gnubg_url.rstrip("/"))
    return _client


async def close_gnubg_client() -> None:
    """Close the shared client. Safe to call multiple times."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _board_payload(
    snapshot: dict,
    turn: Color,
    *,
    cube_value: int = 1,
    cube_owner: Optional[Color] = None,
    match_score: Optional[dict] = None,
) -> dict:
    """Convert a GameEngine state snapshot into the gnubg request body.

    Accepts the output of ``engine.get_state_snapshot()`` so callers
    don't have to reach into GameState internals.
    """
    payload: dict[str, Any] = {
        "points": list(snapshot["points"]),
        "bar_white": int(snapshot.get("bar_white") or 0),
        "bar_black": int(snapshot.get("bar_black") or 0),
        "off_white": int(snapshot.get("off_white") or 0),
        "off_black": int(snapshot.get("off_black") or 0),
        "turn": turn.value,
        "cube_value": cube_value,
        "cube_owner": cube_owner.value if cube_owner else None,
        "match_score": match_score,
    }
    return payload


def board_payload_from_engine(
    engine: BackgammonEngine, turn: Optional[Color] = None
) -> dict:
    """Build a gnubg request body from a live engine.

    When *turn* is omitted the engine's current turn is used.
    """
    snapshot = engine.get_state_snapshot()
    actual_turn = turn or engine.state.current_turn
    return _board_payload(
        snapshot,
        actual_turn,
        cube_value=engine.state.cube_value,
        cube_owner=engine.state.cube_owner,
    )


# ── Availability ───────────────────────────────────────────────────────────


async def is_available() -> bool:
    """Return True if gnubg is configured and healthy.

    Called sparingly — a full HTTP round-trip. Callers typically gate a
    single request on this then fall through on failure of the real
    call, so don't use this on a hot path.
    """
    client = _get_client()
    if client is None:
        return False
    try:
        resp = await client.get("/health", timeout=_TIMEOUT_HEALTH)
        if resp.status_code != 200:
            logger.warning("gnubg health check returned %s", resp.status_code)
            return False
        data = resp.json()
        ready = bool(data.get("ready", False))
        if not ready:
            logger.warning("gnubg health check: service not ready (response: %s)",
                           str(data)[:200])
        return ready
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("gnubg health check failed: %s", exc)
        return False


# ── RPC methods ────────────────────────────────────────────────────────────


async def _post(
    path: str, payload: dict, timeout: httpx.Timeout
) -> Optional[dict]:
    client = _get_client()
    if client is None:
        return None
    last_exc: Optional[Exception] = None
    t0 = time.monotonic()
    for attempt in range(_MAX_RETRIES + 1):
        try:
            resp = await client.post(path, json=payload, timeout=timeout)
            elapsed = time.monotonic() - t0
            if resp.status_code != 200:
                logger.warning("gnubg %s returned %s after %.1fs: %s",
                               path, resp.status_code, elapsed, resp.text[:200])
                return None
            logger.debug("gnubg %s OK in %.1fs", path, elapsed)
            return resp.json()
        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            last_exc = exc
            if attempt < _MAX_RETRIES:
                logger.info("gnubg %s attempt %d timed out after %.1fs, retrying...",
                            path, attempt + 1, time.monotonic() - t0)
                continue
        except httpx.HTTPError as exc:
            logger.warning("gnubg %s failed after %.1fs: %s",
                           path, time.monotonic() - t0, exc)
            return None
        except ValueError as exc:  # JSON decode error
            logger.warning("gnubg %s returned non-JSON after %.1fs: %s",
                           path, time.monotonic() - t0, exc)
            return None
    logger.warning("gnubg %s failed after %d attempts (%.1fs total): %s",
                   path, _MAX_RETRIES + 1, time.monotonic() - t0, last_exc)
    return None


def _timeout_for_ply(ply: Optional[int]) -> httpx.Timeout:
    """Select the appropriate timeout based on ply depth."""
    if (ply or 0) >= 3:
        return _TIMEOUT_3PLY
    return _TIMEOUT_2PLY


async def evaluate(board: dict, ply: Optional[int] = None) -> Optional[dict]:
    """Return ``{"equity": ..., "probs": {...}}`` or ``None`` if unavailable."""
    payload = {**board}
    if ply is not None:
        payload["ply"] = ply
    return await _post("/evaluate", payload, _timeout_for_ply(ply))


async def best_move(board: dict, dice: list[int], ply: Optional[int] = None) -> Optional[dict]:
    """Return ``{"best": {...}, "candidates": [...]}`` or ``None``."""
    payload = {**board, "dice": list(dice)}
    if ply is not None:
        payload["ply"] = ply
    return await _post("/best-move", payload, _timeout_for_ply(ply))


async def analyze_move(
    board: dict, dice: list[int], chosen_moves: list[dict], ply: Optional[int] = None
) -> Optional[dict]:
    """Analyze a specific move vs gnubg's best.

    ``chosen_moves`` is a list of ``{"from_point": int, "to_point": int}``.
    Returns ``{"best": {...}, "chosen": {...}, "equity_loss": ...,
    "quality": ...}`` or ``None``.
    """
    payload = {
        **board,
        "dice": list(dice),
        "chosen_moves": list(chosen_moves),
    }
    if ply is not None:
        payload["ply"] = ply
    return await _post("/analyze-move", payload, _timeout_for_ply(ply))


async def cube_decision(board: dict, ply: Optional[int] = None) -> Optional[dict]:
    """Return cube equities + decisions or ``None``."""
    payload = {**board}
    if ply is not None:
        payload["ply"] = ply
    return await _post("/cube-decision", payload, _timeout_for_ply(ply))


# ── Synchronous helpers (for thread-pool contexts like analysis_service) ───

# The analysis pipeline runs inside ``asyncio.to_thread`` and benefits from
# a plain blocking HTTP client rather than bouncing back to the event loop.

_sync_client: Optional[httpx.Client] = None


def _get_sync_client() -> Optional[httpx.Client]:
    global _sync_client
    if not settings.gnubg_url:
        return None
    if _sync_client is None:
        _sync_client = httpx.Client(base_url=settings.gnubg_url.rstrip("/"))
    return _sync_client


def close_sync_client() -> None:
    global _sync_client
    if _sync_client is not None:
        _sync_client.close()
        _sync_client = None


def _post_sync(path: str, payload: dict, timeout: httpx.Timeout) -> Optional[dict]:
    client = _get_sync_client()
    if client is None:
        return None
    last_exc: Optional[Exception] = None
    t0 = time.monotonic()
    for attempt in range(_MAX_RETRIES + 1):
        try:
            resp = client.post(path, json=payload, timeout=timeout)
            elapsed = time.monotonic() - t0
            if resp.status_code != 200:
                logger.warning("gnubg %s (sync) returned %s after %.1fs: %s",
                               path, resp.status_code, elapsed, resp.text[:200])
                return None
            logger.debug("gnubg %s (sync) OK in %.1fs", path, elapsed)
            return resp.json()
        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            last_exc = exc
            if attempt < _MAX_RETRIES:
                logger.info("gnubg %s (sync) attempt %d timed out after %.1fs, retrying...",
                            path, attempt + 1, time.monotonic() - t0)
                continue
        except httpx.HTTPError as exc:
            logger.warning("gnubg %s (sync) failed after %.1fs: %s",
                           path, time.monotonic() - t0, exc)
            return None
        except ValueError as exc:
            logger.warning("gnubg %s (sync) returned non-JSON after %.1fs: %s",
                           path, time.monotonic() - t0, exc)
            return None
    logger.warning("gnubg %s (sync) failed after %d attempts (%.1fs total): %s",
                   path, _MAX_RETRIES + 1, time.monotonic() - t0, last_exc)
    return None


def analyze_move_sync(
    board: dict, dice: list[int], chosen_moves: list[dict], ply: Optional[int] = None
) -> Optional[dict]:
    payload = {**board, "dice": list(dice), "chosen_moves": list(chosen_moves)}
    if ply is not None:
        payload["ply"] = ply
    return _post_sync("/analyze-move", payload, _timeout_for_ply(ply))


def best_move_sync(board: dict, dice: list[int], ply: Optional[int] = None) -> Optional[dict]:
    """Synchronous version of best_move for thread-pool contexts."""
    payload = {**board, "dice": list(dice)}
    if ply is not None:
        payload["ply"] = ply
    return _post_sync("/best-move", payload, _timeout_for_ply(ply))


def is_available_sync() -> bool:
    """Blocking health check for the thread-pool analysis path."""
    client = _get_sync_client()
    if client is None:
        return False
    try:
        resp = client.get("/health", timeout=_TIMEOUT_HEALTH)
        if resp.status_code != 200:
            logger.warning("gnubg health check (sync) returned %s", resp.status_code)
            return False
        data = resp.json()
        ready = bool(data.get("ready", False))
        if not ready:
            logger.warning("gnubg health check (sync): service not ready (response: %s)",
                           str(data)[:200])
        return ready
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("gnubg health check (sync) failed: %s", exc)
        return False
