"""Main FastAPI application for Backgammon Online."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import router
from app.api.auth_routes import auth_router
from app.api.websocket import manager as ws_manager, websocket_endpoint
from app.config import settings
from app.database import async_session, get_db
from app.limiter import limiter
from app.services.game_service import game_manager

logger = logging.getLogger(__name__)

CLEANUP_INTERVAL_SECONDS = 600  # 10 minutes


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
    cleanup_task = asyncio.create_task(_periodic_engine_cleanup())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

    # Gracefully close all WebSocket connections
    await ws_manager.close_all()


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

app.include_router(router)
app.include_router(auth_router)

# Register the WebSocket endpoint for real-time game play
app.websocket("/ws/{table_id}/{player_id}")(websocket_endpoint)


@app.get("/api/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "healthy"}
    except (SQLAlchemyError, ConnectionError, OSError):
        raise HTTPException(status_code=503, detail="Database unavailable")
