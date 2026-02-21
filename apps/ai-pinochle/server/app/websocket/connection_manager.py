import uuid
from dataclasses import dataclass, field

from starlette.websockets import WebSocket


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

    async def send_personal(self, websocket: WebSocket, message: dict):
        await websocket.send_json(message)

    async def broadcast(self, room_code: str, message: dict):
        for conn in self._rooms.get(room_code, []):
            await conn.websocket.send_json(message)

    def get_connections(self, room_code: str) -> list[Connection]:
        return self._rooms.get(room_code, [])


manager = ConnectionManager()
