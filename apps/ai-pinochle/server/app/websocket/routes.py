import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User
from app.websocket.connection_manager import Connection, manager
from app.websocket.handlers import handle_message

router = APIRouter()


async def _authenticate(token: str, db: AsyncSession) -> User | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id_str = payload.get("sub")
        if user_id_str is None:
            return None
        user_id = uuid.UUID(user_id_str)
    except (JWTError, ValueError):
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


@router.websocket("/{room_code}")
async def game_websocket(websocket: WebSocket, room_code: str):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    db_factory = getattr(websocket.app.state, "_test_db_factory", None)

    if db_factory:
        async with db_factory() as db:
            await _run_websocket(websocket, room_code, token, db)
    else:
        async with AsyncSessionLocal() as db:
            await _run_websocket(websocket, room_code, token, db)


async def _run_websocket(
    websocket: WebSocket, room_code: str, token: str, db: AsyncSession
):
    user = await _authenticate(token, db)
    if user is None:
        await websocket.close(code=4001, reason="Invalid token")
        return

    conn = Connection(websocket=websocket, user_id=user.id, username=user.username)
    await manager.connect(room_code, conn)

    try:
        while True:
            data = await websocket.receive_json()
            await handle_message(websocket, data, room_code, user.id, db)
            await db.commit()
    except WebSocketDisconnect:
        manager.disconnect(room_code, websocket)
