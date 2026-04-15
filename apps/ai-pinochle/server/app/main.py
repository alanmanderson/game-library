import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.auth import router as auth_router
from app.api.games import router as games_router
from app.config import settings
from app.websocket.background import maintenance_loop
from app.websocket.routes import router as ws_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(maintenance_loop(), name="ws_maintenance")
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


app = FastAPI(title="Pinochle API", lifespan=lifespan)

_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(games_router, prefix="/games", tags=["games"])
app.include_router(ws_router, prefix="/ws", tags=["websocket"])

# Serve card images so mobile clients can load them via URL
_img_dir = Path(__file__).resolve().parent.parent.parent / "public" / "img"
if _img_dir.is_dir():
    app.mount("/img", StaticFiles(directory=str(_img_dir)), name="images")
