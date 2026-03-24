"""
Pydantic models for the Bughouse Chess API.

Defines request/response models for REST endpoints and WebSocket message schemas.
"""

from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


# --- Enums ---

class GameStatus(str, Enum):
    WAITING = "waiting"
    IN_PROGRESS = "in_progress"
    FINISHED = "finished"


class SeatName(str, Enum):
    BOARD_A_WHITE = "board_a_white"
    BOARD_A_BLACK = "board_a_black"
    BOARD_B_WHITE = "board_b_white"
    BOARD_B_BLACK = "board_b_black"


class WSMessageType(str, Enum):
    # Client -> Server
    MOVE = "move"
    DROP = "drop"
    RESIGN = "resign"

    # Server -> Client
    GAME_STATE = "game_state"
    MOVE_MADE = "move_made"
    PIECE_DROPPED = "piece_dropped"
    GAME_OVER = "game_over"
    ERROR = "error"
    PLAYER_JOINED = "player_joined"
    PLAYER_LEFT = "player_left"
    SPECTATOR_JOINED = "spectator_joined"
    GAME_STARTED = "game_started"


# --- REST Request Models ---

class CreateGameRequest(BaseModel):
    player_name: str = Field(
        ..., min_length=1, max_length=30, description="Display name for the creating player"
    )
    preferred_seat: Optional[SeatName] = Field(
        None, description="Preferred seat, or null for auto-assign"
    )


class JoinGameRequest(BaseModel):
    player_name: str = Field(
        ..., min_length=1, max_length=30, description="Display name for the joining player"
    )
    preferred_seat: Optional[SeatName] = Field(
        None, description="Preferred seat, or null for auto-assign"
    )


class AddBotRequest(BaseModel):
    seat: Optional[SeatName] = Field(
        None, description="Preferred seat for the bot, or null for auto-assign"
    )


class WatchGameRequest(BaseModel):
    spectator_name: Optional[str] = Field(
        None, max_length=30, description="Optional display name for spectator"
    )


# --- REST Response Models ---

class CreateGameResponse(BaseModel):
    game_id: str = Field(..., description="Short 6-character game code")
    player_token: str = Field(..., description="Secret token for this player session")
    seat: int = Field(..., description="Assigned seat (0-3)")
    player_name: str


class JoinGameResponse(BaseModel):
    game_id: str
    player_token: str
    seat: int = Field(..., description="Assigned seat (0-3)")
    player_name: str


class WatchGameResponse(BaseModel):
    game_id: str
    spectator_token: str
    spectator_name: Optional[str] = None


class PlayerInfo(BaseModel):
    seat: SeatName
    name: str
    connected: bool = False


class GameInfoResponse(BaseModel):
    game_id: str
    status: GameStatus
    players: list[PlayerInfo]
    spectator_count: int
    created_at: float


class GameListItem(BaseModel):
    game_id: str
    status: GameStatus
    player_count: int
    players: list[PlayerInfo]
    created_at: float


# --- Board State Models (for WebSocket game_state messages) ---

class BoardState(BaseModel):
    fen: str
    turn: str  # "white" or "black"
    legal_moves: list[str]
    legal_drops: list[str]
    in_check: bool
    last_move: Optional[dict] = None
    move_number: int


class PocketState(BaseModel):
    board_a_white: dict[str, int] = Field(default_factory=dict)
    board_a_black: dict[str, int] = Field(default_factory=dict)
    board_b_white: dict[str, int] = Field(default_factory=dict)
    board_b_black: dict[str, int] = Field(default_factory=dict)


class FullGameState(BaseModel):
    game_id: str
    boards: list[BoardState]
    pockets: PocketState
    game_over: bool
    winner: Optional[str] = None
    result_reason: Optional[str] = None
    players: list[PlayerInfo] = Field(default_factory=list)
    status: GameStatus = GameStatus.WAITING
    created_at: float
    started_at: Optional[float] = None
    ended_at: Optional[float] = None


# --- WebSocket Message Models ---

class WSMoveMessage(BaseModel):
    type: str = WSMessageType.MOVE
    board: int = Field(..., ge=0, le=1)
    from_sq: str = Field(..., alias="from")
    to_sq: str = Field(..., alias="to")
    promotion: Optional[str] = None

    model_config = {"populate_by_name": True}


class WSDropMessage(BaseModel):
    type: str = WSMessageType.DROP
    board: int = Field(..., ge=0, le=1)
    piece: str
    square: str


class WSResignMessage(BaseModel):
    type: str = WSMessageType.RESIGN


# --- Auth Models ---

class RegisterRequest(BaseModel):
    email: str = Field(..., description="User email")
    display_name: str = Field(..., min_length=1, max_length=30, description="Display name")
    password: str = Field(..., min_length=6, description="Password (min 6 chars)")


class LoginRequest(BaseModel):
    email: str = Field(..., description="User email")
    password: str = Field(..., description="Password")


class UserInfo(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_url: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    user: UserInfo


class UpdateDisplayNameRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=30)


# Server -> Client messages are built as plain dicts in the WebSocket handler
# since they vary in structure. The types above document the expected shapes.
