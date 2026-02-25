import json
import os
from datetime import datetime, timezone

LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "logs", "games")


def _ensure_dir():
    os.makedirs(LOG_DIR, exist_ok=True)


def log_message(
    room_code: str, direction: str, who: str, message: dict
) -> None:
    """Append a timestamped WebSocket message to the per-game log file.

    direction: "IN" (client->server), "OUT" (server->client)
    who: username, or "*all*" for broadcasts
    """
    _ensure_dir()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    compact = json.dumps(message, separators=(",", ":"))
    line = f"[{ts}] {direction:<3} {who:<16} {compact}\n"
    path = os.path.join(LOG_DIR, f"{room_code}.log")
    with open(path, "a") as f:
        f.write(line)


def log_event(room_code: str, who: str, event_text: str) -> None:
    """Log a non-message event (connect, disconnect)."""
    _ensure_dir()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    line = f"[{ts}] --- {who:<16} {event_text}\n"
    path = os.path.join(LOG_DIR, f"{room_code}.log")
    with open(path, "a") as f:
        f.write(line)
