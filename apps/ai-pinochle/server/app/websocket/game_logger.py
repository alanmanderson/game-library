import json
import logging
import logging.handlers
import os
from datetime import datetime, timezone

LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "logs", "games")

# Create logs directory at import time
os.makedirs(LOG_DIR, exist_ok=True)

# Cache of per-game loggers to avoid recreating them on every log call
_game_loggers: dict[str, logging.Logger] = {}


def _get_game_logger(room_code: str) -> logging.Logger:
    """Get or create a logger for a specific game room."""
    if room_code not in _game_loggers:
        logger = logging.getLogger(f"game.{room_code}")
        logger.setLevel(logging.DEBUG)

        # Avoid adding duplicate handlers
        if not logger.handlers:
            log_path = os.path.join(LOG_DIR, f"{room_code}.log")
            handler = logging.handlers.RotatingFileHandler(
                log_path, maxBytes=10 * 1024 * 1024, backupCount=3
            )
            formatter = logging.Formatter("%(message)s")
            handler.setFormatter(formatter)
            logger.addHandler(handler)

        _game_loggers[room_code] = logger

    return _game_loggers[room_code]


def _sanitize(value: str) -> str:
    """Replace newlines and control characters with spaces."""
    return value.replace("\n", " ").replace("\r", " ").replace("\t", " ")


def log_message(
    room_code: str, direction: str, who: str, message: dict
) -> None:
    """Append a timestamped WebSocket message to the per-game log file.

    direction: "IN" (client->server), "OUT" (server->client)
    who: username, or "*all*" for broadcasts
    """
    logger = _get_game_logger(room_code)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    compact = json.dumps(message, separators=(",", ":"))
    safe_who = _sanitize(who)
    line = f"[{ts}] {direction:<3} {safe_who:<16} {compact}"
    logger.debug(line)


def log_event(room_code: str, who: str, event_text: str) -> None:
    """Log a non-message event (connect, disconnect)."""
    logger = _get_game_logger(room_code)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    safe_who = _sanitize(who)
    line = f"[{ts}] --- {safe_who:<16} {event_text}"
    logger.debug(line)
