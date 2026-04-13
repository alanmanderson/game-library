"""Main FastAPI application for Backgammon Online."""

import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
try:
    from pythonjsonlogger.json import JsonFormatter as _JsonFormatter
except ImportError:
    from pythonjsonlogger import jsonlogger as _jl
    _JsonFormatter = _jl.JsonFormatter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import router
from app.api.auth_routes import auth_router
from app.api.tournament_routes import tournament_router
from app.api.websocket import manager as ws_manager, websocket_endpoint, websocket_spectator_endpoint
from app.config import settings
from app.database import async_session, get_db
from app.limiter import limiter
from app.services.game_service import game_manager

# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------


def setup_logging() -> None:
    """Configure structured JSON logging for the entire application."""
    handler = logging.StreamHandler()
    formatter = _JsonFormatter(
        fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
        rename_fields={"asctime": "timestamp", "levelname": "level"},
    )
    handler.setFormatter(formatter)
    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(logging.INFO)


setup_logging()

logger = logging.getLogger(__name__)

CLEANUP_INTERVAL_SECONDS = 600  # 10 minutes

# Track application start time for uptime reporting
_start_time: float = time.time()


async def _periodic_engine_cleanup() -> None:
    """Background task that periodically cleans up stale game engines."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        try:
            async with async_session() as db:
                cleaned = await game_manager.cleanup_stale_engines(db)
                if cleaned:
                    logger.info("Periodic cleanup removed %d stale engine(s)", cleaned)
        except Exception:  # Broad catch intentional: background task must not crash the server
            logger.exception("Error during periodic engine cleanup")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: start background tasks on startup, cancel on shutdown."""
    global _start_time
    _start_time = time.time()
    logger.info("Application starting up")
    cleanup_task = asyncio.create_task(_periodic_engine_cleanup())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

    # Gracefully close all WebSocket connections
    await ws_manager.close_all()
    logger.info("Application shut down")


app = FastAPI(title="Backgammon Online", version="1.0.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# ---------------------------------------------------------------------------
# Request logging middleware
# ---------------------------------------------------------------------------


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log each HTTP request with method, path, status, and duration."""
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    # Skip noisy health-check logs in production
    if request.url.path != "/api/health":
        logger.info(
            "request",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(duration * 1000),
            },
        )
    return response


app.include_router(router)
app.include_router(auth_router)
app.include_router(tournament_router)

# Register the WebSocket endpoint for spectators watching live games (must be before player endpoint)
app.websocket("/ws/{table_id}/spectate")(websocket_spectator_endpoint)

# Register the WebSocket endpoint for real-time game play
app.websocket("/ws/{table_id}/{player_id}")(websocket_endpoint)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "active_games": len(game_manager.engines),
            "active_connections": ws_manager.connection_count(),
            "uptime_seconds": round(time.time() - _start_time),
        }
    except (SQLAlchemyError, ConnectionError, OSError):
        raise HTTPException(status_code=503, detail="Database unavailable")
