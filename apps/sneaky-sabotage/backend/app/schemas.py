from pydantic import BaseModel, Field


class CreateGameRequest(BaseModel):
    player_name: str = Field(..., min_length=1, max_length=50)
    timer_seconds: int = Field(default=300)
    max_rounds: int = Field(default=4, ge=1, le=8)


class CreateGameResponse(BaseModel):
    game_id: str
    player_id: str
    session_token: str


class JoinGameRequest(BaseModel):
    player_name: str = Field(..., min_length=1, max_length=50)


class JoinGameResponse(BaseModel):
    game_id: str
    player_id: str
    session_token: str


class PlayerInfo(BaseModel):
    id: str
    name: str
    is_host: bool
    total_score: int
    connected: bool


class GameInfo(BaseModel):
    id: str
    status: str
    current_round: int
    max_rounds: int
    timer_seconds: int
    players: list[PlayerInfo]
