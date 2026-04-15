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
from typing import Any, Optional

import httpx

from app.config import settings
from app.game_engine import BackgammonEngine, Color

logger = logging.getLogger(__name__)


# Timeouts chosen per the plan: fast ops get 5s, analysis is heavier (may
# enumerate all candidate moves on a slow subprocess) so allow 10s.
_TIMEOUT_FAST = httpx.Timeout(5.0, connect=2.0)
_TIMEOUT_SLOW = httpx.Timeout(10.0, connect=2.0)


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
        resp = await client.get("/health", timeout=_TIMEOUT_FAST)
        if resp.status_code != 200:
            return False
        data = resp.json()
        return bool(data.get("ready", False))
    except (httpx.HTTPError, ValueError):
        return False


# ── RPC methods ────────────────────────────────────────────────────────────


async def _post(
    path: str, payload: dict, timeout: httpx.Timeout
) -> Optional[dict]:
    client = _get_client()
    if client is None:
        return None
    try:
        resp = await client.post(path, json=payload, timeout=timeout)
        if resp.status_code != 200:
            logger.warning("gnubg %s returned %s: %s",
                           path, resp.status_code, resp.text[:200])
            return None
        return resp.json()
    except httpx.HTTPError as exc:
        logger.warning("gnubg %s failed: %s", path, exc)
        return None
    except ValueError as exc:  # JSON decode error
        logger.warning("gnubg %s returned non-JSON: %s", path, exc)
        return None


async def evaluate(board: dict) -> Optional[dict]:
    """Return ``{"equity": ..., "probs": {...}}`` or ``None`` if unavailable."""
    return await _post("/evaluate", board, _TIMEOUT_FAST)


async def best_move(board: dict, dice: list[int]) -> Optional[dict]:
    """Return ``{"best": {...}, "candidates": [...]}`` or ``None``."""
    payload = {**board, "dice": list(dice)}
    return await _post("/best-move", payload, _TIMEOUT_FAST)


async def analyze_move(
    board: dict, dice: list[int], chosen_moves: list[dict]
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
    return await _post("/analyze-move", payload, _TIMEOUT_SLOW)


async def cube_decision(board: dict) -> Optional[dict]:
    """Return cube equities + decisions or ``None``."""
    return await _post("/cube-decision", board, _TIMEOUT_FAST)


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
    try:
        resp = client.post(path, json=payload, timeout=timeout)
        if resp.status_code != 200:
            logger.warning("gnubg %s (sync) returned %s", path, resp.status_code)
            return None
        return resp.json()
    except httpx.HTTPError as exc:
        logger.warning("gnubg %s (sync) failed: %s", path, exc)
        return None
    except ValueError as exc:
        logger.warning("gnubg %s (sync) returned non-JSON: %s", path, exc)
        return None


def analyze_move_sync(
    board: dict, dice: list[int], chosen_moves: list[dict]
) -> Optional[dict]:
    payload = {**board, "dice": list(dice), "chosen_moves": list(chosen_moves)}
    return _post_sync("/analyze-move", payload, _TIMEOUT_SLOW)


def is_available_sync() -> bool:
    """Blocking health check for the thread-pool analysis path."""
    client = _get_sync_client()
    if client is None:
        return False
    try:
        resp = client.get("/health", timeout=_TIMEOUT_FAST)
        if resp.status_code != 200:
            return False
        return bool(resp.json().get("ready", False))
    except (httpx.HTTPError, ValueError):
        return False
