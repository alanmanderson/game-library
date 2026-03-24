import asyncio
import logging
import uuid
from dataclasses import dataclass

from starlette.websockets import WebSocket

from app.websocket.game_logger import log_message

logger = logging.getLogger(__name__)


@dataclass
class Connection:
    websocket: WebSocket
    user_id: uuid.UUID
    username: str


class ConnectionManager:
    def __init__(self):
        self._rooms: dict[str, list[Connection]] = {}
        self._room_locks: dict[str, asyncio.Lock] = {}

    def get_room_lock(self, room_code: str) -> asyncio.Lock:
        """Return the asyncio.Lock for a room, creating it if it doesn't exist."""
        if room_code not in self._room_locks:
            self._room_locks[room_code] = asyncio.Lock()
        return self._room_locks[room_code]

    async def connect(self, room_code: str, connection: Connection):
        await connection.websocket.accept()

        # Close any existing connection from the same user in this room
        existing_conns = self._rooms.get(room_code, [])
        for old_conn in existing_conns:
            if old_conn.user_id == connection.user_id:
                logger.info(
                    "Closing duplicate connection for user %s in room %s",
                    connection.user_id,
                    room_code,
                )
                try:
                    await old_conn.websocket.close(
                        code=4002, reason="Superseded by new connection"
                    )
                except Exception:
                    logger.debug("Failed to close old websocket for user %s", connection.user_id)
        # Remove old connections for this user before adding the new one
        self._rooms[room_code] = [
            c for c in existing_conns if c.user_id != connection.user_id
        ]

        self._rooms.setdefault(room_code, []).append(connection)

    def disconnect(self, room_code: str, websocket: WebSocket):
        conns = self._rooms.get(room_code, [])
        self._rooms[room_code] = [c for c in conns if c.websocket is not websocket]
        if not self._rooms[room_code]:
            del self._rooms[room_code]
            self._room_locks.pop(room_code, None)

    def _find_connection(self, websocket: WebSocket) -> tuple[str | None, Connection | None]:
        """Look up room_code and Connection for a websocket."""
        for room_code, conns in self._rooms.items():
            for conn in conns:
                if conn.websocket is websocket:
                    return room_code, conn
        return None, None

    async def send_personal(self, websocket: WebSocket, message: dict):
        await websocket.send_json(message)
        room_code, conn = self._find_connection(websocket)
        if room_code and conn:
            log_message(room_code, "OUT", conn.username, message)

    async def broadcast(self, room_code: str, message: dict):
        log_message(room_code, "OUT", "*all*", message)
        stale = []
        for conn in self._rooms.get(room_code, []):
            try:
                await conn.websocket.send_json(message)
            except Exception:
                logger.warning("Removing stale connection for user %s", conn.user_id)
                stale.append(conn.websocket)
        for ws in stale:
            self.disconnect(room_code, ws)

    def get_connections(self, room_code: str) -> list[Connection]:
        return self._rooms.get(room_code, [])

    def clear(self):
        self._rooms.clear()


manager = ConnectionManager()
