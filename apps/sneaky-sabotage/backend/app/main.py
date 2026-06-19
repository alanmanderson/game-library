"""Main FastAPI application for Sneaky Sabotage."""

import logging
import os
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

try:
    from pythonjsonlogger.json import JsonFormatter as _JsonFormatter
except ImportError:
    from pythonjsonlogger import jsonlogger as _jl

    _JsonFormatter = _jl.JsonFormatter

from app.config import settings
from app.routes import router
from app.websocket import manager, websocket_endpoint


def setup_logging() -> None:
    handler = logging.StreamHandler()
    formatter = _JsonFormatter(
        fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
        rename_fields={"asctime": "timestamp", "levelname": "level"},
    )
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)


setup_logging()
logger = logging.getLogger(__name__)

_start_time: float = time.time()

app = FastAPI(title="Sneaky Sabotage", version="1.0.0")

# Log service integration (optional — only if URL is configured)
try:
    from app.logservice import setup_log_service

    setup_log_service(app, service="sneaky-sabotage")
except Exception:
    pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
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

app.websocket("/ws/{game_id}/{player_id}")(websocket_endpoint)


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "active_connections": manager.connection_count(),
        "uptime_seconds": round(time.time() - _start_time),
        "version": os.environ.get("GIT_SHA", "dev")[:7],
    }


# Serve built frontend in production
_frontend_dist = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "frontend",
    "dist",
)

if os.path.isdir(_frontend_dist):
    _frontend_dist_resolved = os.path.realpath(_frontend_dist)

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path:
            file_path = os.path.realpath(os.path.join(_frontend_dist, full_path))
            if file_path.startswith(_frontend_dist_resolved + os.sep) and os.path.isfile(
                file_path
            ):
                return FileResponse(file_path)
        return FileResponse(os.path.join(_frontend_dist, "index.html"))
