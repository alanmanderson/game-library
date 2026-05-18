import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from starlette.websockets import WebSocket, WebSocketState

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
        # Tracks when a player disconnected from a room.
        # Shape: {room_code: {user_id: datetime}}
        # A background task should periodically check these timestamps and
        # forfeit the game if a player has been disconnected for longer than
        # a configurable timeout (e.g. 5 minutes).
        self.disconnect_times: dict[str, dict[uuid.UUID, datetime]] = {}
        # Optional Redis broker for multi-instance fan-out. Wired up in
        # ``app.main`` at lifespan start; unset means single-process mode.
        self._broker = None

    def set_broker(self, broker) -> None:
        """Attach (or detach, with ``None``) the Redis broker. Manager-owned."""
        self._broker = broker

    def get_room_lock(self, room_code: str) -> asyncio.Lock:
        """Return the asyncio.Lock for a room, creating it if it doesn't exist."""
        if room_code not in self._room_locks:
            self._room_locks[room_code] = asyncio.Lock()
        return self._room_locks[room_code]

    async def connect(self, room_code: str, connection: Connection):
        state = getattr(connection.websocket, "client_state", None)
        if state is None or state == WebSocketState.CONNECTING:
            await connection.websocket.accept()

        was_empty = not self._rooms.get(room_code)

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

        # First local subscriber in this process → subscribe via broker so we
        # receive broadcasts originating on other instances.
        if was_empty and self._broker is not None:
            await self._broker.subscribe(room_code)

    def disconnect(self, room_code: str, websocket: WebSocket):
        conns = self._rooms.get(room_code, [])
        self._rooms[room_code] = [c for c in conns if c.websocket is not websocket]
        if not self._rooms[room_code]:
            del self._rooms[room_code]
            self._room_locks.pop(room_code, None)
            if self._broker is not None:
                # Fire-and-forget: unsubscribe is best-effort cleanup.
                try:
                    asyncio.create_task(self._broker.unsubscribe(room_code))
                except RuntimeError:
                    # No running loop (shouldn't happen in normal flow).
                    logger.debug("No loop to schedule broker unsubscribe")

    def record_disconnect(self, room_code: str, user_id: uuid.UUID):
        """Record the time a player disconnected from a room."""
        self.disconnect_times.setdefault(room_code, {})[user_id] = datetime.now(timezone.utc)

    def clear_disconnect(self, room_code: str, user_id: uuid.UUID):
        """Remove a player's disconnect timestamp when they reconnect."""
        self.disconnect_times.get(room_code, {}).pop(user_id, None)
        if not self.disconnect_times.get(room_code):
            self.disconnect_times.pop(room_code, None)

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
        """Fan-out to every local WS in the room AND publish to the broker.

        Local delivery happens first (no Redis hop) so in-process subscribers
        see events with the same latency as before. The broker publish is
        awaited too so a publish error is logged (it's swallowed inside the
        broker). Other processes that have subscribers in this room receive
        the event through ``_deliver_remote`` and deliver to *their* locals.
        """
        log_message(room_code, "OUT", "*all*", message)
        await self._deliver_local(room_code, message)
        if self._broker is not None:
            await self._broker.publish(room_code, message)

    async def _deliver_local(self, room_code: str, message: dict) -> None:
        """Send ``message`` to every local WebSocket in ``room_code``."""
        stale = []
        for conn in self._rooms.get(room_code, []):
            try:
                await conn.websocket.send_json(message)
            except Exception:
                logger.warning("Removing stale connection for user %s", conn.user_id)
                stale.append(conn.websocket)
        for ws in stale:
            self.disconnect(room_code, ws)

    async def deliver_remote(self, room_code: str, message: dict) -> None:
        """Broker callback: an event arrived from another process.

        Deliver to local sockets only — do NOT re-publish (the originator
        already did that, and the broker drops our own echoes so we won't
        loop). This is the receiving half of multi-instance fan-out.
        """
        log_message(room_code, "OUT", "*remote*", message)
        await self._deliver_local(room_code, message)

    def get_connections(self, room_code: str) -> list[Connection]:
        return self._rooms.get(room_code, [])

    def clear(self):
        self._rooms.clear()


manager = ConnectionManager()
