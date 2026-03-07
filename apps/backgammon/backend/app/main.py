"""Main FastAPI application for Backgammon Online."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.auth_routes import auth_router
from app.api.websocket import websocket_endpoint
from app.config import settings

app = FastAPI(title="Backgammon Online", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(auth_router)

# Register the WebSocket endpoint for real-time game play
app.websocket("/ws/{table_id}/{player_id}")(websocket_endpoint)
