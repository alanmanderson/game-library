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

    async def connect(self, room_code: str, connection: Connection):
        await connection.websocket.accept()
        self._rooms.setdefault(room_code, []).append(connection)

    def disconnect(self, room_code: str, websocket: WebSocket):
        conns = self._rooms.get(room_code, [])
        self._rooms[room_code] = [c for c in conns if c.websocket is not websocket]
        if not self._rooms[room_code]:
            del self._rooms[room_code]

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
