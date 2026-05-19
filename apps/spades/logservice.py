"""
Logging service SDK for Python backends (FastAPI / Flask).

Usage (FastAPI):
    from logservice import setup_log_service

    # In your main.py, after creating the app:
    setup_log_service(app, service="backgammon")

Usage (Flask):
    from logservice import setup_log_service_flask

    # In your app factory:
    setup_log_service_flask(app, service="spades")
"""

import atexit
import json
import logging
import os
import threading
import traceback
import time
from datetime import datetime, timezone
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import URLError

LOG_SERVICE_URL = os.getenv("LOG_SERVICE_URL", "")
LOG_SERVICE_KEY = os.getenv("LOG_SERVICE_API_KEY", "")

logger = logging.getLogger("logservice.sdk")


class LogServiceHandler(logging.Handler):
    """A logging.Handler that buffers and sends log entries to the log service."""

    def __init__(
        self,
        service: str,
        endpoint: str = "",
        flush_interval: float = 5.0,
        max_buffer: int = 20,
    ):
        super().__init__(level=logging.WARNING)
        self.service = service
        self.endpoint = endpoint or LOG_SERVICE_URL
        self._buffer: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._flush_interval = flush_interval
        self._max_buffer = max_buffer
        self._timer: threading.Timer | None = None
        self._start_timer()
        atexit.register(self.flush)

    def _start_timer(self) -> None:
        self._timer = threading.Timer(self._flush_interval, self._timed_flush)
        self._timer.daemon = True
        self._timer.start()

    def _timed_flush(self) -> None:
        self.flush()
        self._start_timer()

    def emit(self, record: logging.LogRecord) -> None:
        level_map = {
            logging.DEBUG: "debug",
            logging.INFO: "info",
            logging.WARNING: "warn",
            logging.ERROR: "error",
            logging.CRITICAL: "fatal",
        }
        level = level_map.get(record.levelno, "info")

        entry: dict[str, Any] = {
            "service": self.service,
            "source": "backend",
            "level": level,
            "message": record.getMessage(),
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
        }

        if record.exc_info and record.exc_info[1]:
            exc = record.exc_info[1]
            entry["error_type"] = type(exc).__name__
            entry["stack_trace"] = "".join(
                traceback.format_exception(*record.exc_info)
            )

        # Include extra context fields
        extra = {}
        for key in ("request_method", "request_path", "status_code", "user_id"):
            val = getattr(record, key, None)
            if val is not None:
                extra[key] = val
        if extra:
            entry["context"] = extra

        with self._lock:
            self._buffer.append(entry)
            if len(self._buffer) >= self._max_buffer:
                self._flush_locked()

    def flush(self) -> None:
        with self._lock:
            self._flush_locked()

    def _flush_locked(self) -> None:
        if not self._buffer or not self.endpoint:
            return
        entries = self._buffer[:]
        self._buffer.clear()

        try:
            payload = json.dumps({"entries": entries}).encode()
            headers = {"Content-Type": "application/json"}
            if LOG_SERVICE_KEY:
                headers["Authorization"] = f"Bearer {LOG_SERVICE_KEY}"
            req = Request(self.endpoint, data=payload, headers=headers, method="POST")
            urlopen(req, timeout=5)
        except (URLError, OSError):
            pass  # Never let logging failures affect the application


def _make_fastapi_middleware(service: str):
    """Returns an ASGI middleware class for FastAPI."""
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request as StarletteRequest
    from starlette.responses import Response

    class _LogServiceMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: StarletteRequest, call_next):
            start = time.time()
            try:
                response = await call_next(request)
                return response
            except Exception as exc:
                duration_ms = round((time.time() - start) * 1000)
                logger.error(
                    "Unhandled exception: %s",
                    str(exc),
                    exc_info=True,
                    extra={
                        "request_method": request.method,
                        "request_path": request.url.path,
                        "status_code": 500,
                    },
                )
                raise

    return _LogServiceMiddleware


def setup_log_service(app: Any, service: str) -> LogServiceHandler:
    """Set up log service for a FastAPI app: adds handler + middleware."""
    handler = LogServiceHandler(service=service)
    logging.getLogger().addHandler(handler)

    middleware_cls = _make_fastapi_middleware(service)
    app.add_middleware(middleware_cls)
    return handler


def setup_log_service_flask(app: Any, service: str) -> LogServiceHandler:
    """Set up log service for a Flask app: adds handler + error hook."""
    handler = LogServiceHandler(service=service)
    logging.getLogger().addHandler(handler)

    @app.errorhandler(Exception)
    def _log_exception(exc: Exception):
        logger.error(
            "Unhandled exception: %s",
            str(exc),
            exc_info=True,
        )
        return {"error": "Internal server error"}, 500

    return handler
