"""Pydantic schemas for the backgammon API request/response models."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ── Player Schemas ───────────────────────────────────────────────────────────


class PlayerCreate(BaseModel):
    nickname: str = Field(min_length=1, max_length=50)


class PlayerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    nickname: str
    created_at: datetime
    is_guest: bool = False
    auth_provider: str = "local"
    rating: int = 1500
    rating_games: int = 0


# ── Auth Schemas ─────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    nickname: str = Field(min_length=2, max_length=50)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    id_token: str
    nickname: Optional[str] = None


class GuestRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=50)


class AuthResponse(BaseModel):
    token: str
    player: PlayerResponse


# ── Table Schemas ────────────────────────────────────────────────────────────


class TableCreate(BaseModel):
    player_id: str
    preferred_color: Optional[str] = None  # "white", "black", or None (random)
    match_points: int = Field(default=5, ge=1, le=10)
    is_public: bool = False
    time_control: str = Field(default="unlimited")


class TableResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    white_player: Optional[PlayerResponse] = None
    black_player: Optional[PlayerResponse] = None
    created_at: datetime
    match_points: int = 5
    white_match_score: int = 0
    black_match_score: int = 0
    bot_difficulty: Optional[str] = None
    is_public: bool = False
    time_control: str = "unlimited"
    white_time_remaining_ms: Optional[int] = None
    black_time_remaining_ms: Optional[int] = None


class InviteBotRequest(BaseModel):
    difficulty: Literal["easy", "medium", "hard", "expert"] = "hard"


class LobbyTable(BaseModel):
    id: str
    creator_nickname: str
    match_points: Optional[int] = None
    preferred_color: Optional[str] = None
    created_at: datetime


class ActiveGame(BaseModel):
    """A table with an active game in progress, shown in the spectator lobby."""
    id: str
    white_player_nickname: str
    black_player_nickname: str
    match_points: Optional[int] = None
    white_match_score: int = 0
    black_match_score: int = 0
    spectator_count: int = 0
    created_at: datetime


class JoinTableRequest(BaseModel):
    player_id: str


# ── Game / Move Schemas ──────────────────────────────────────────────────────


class MoveRequest(BaseModel):
    from_point: int
    to_point: int


class DiceRollResponse(BaseModel):
    die1: int
    die2: int


class GameStateResponse(BaseModel):
    points: list[int]
    bar_white: int
    bar_black: int
    off_white: int
    off_black: int
    current_turn: Optional[str] = None
    dice: Optional[list[int]] = None
    remaining_dice: Optional[list[int]] = None
    status: str
    valid_moves: Optional[list[dict]] = None
    winner: Optional[str] = None
    win_type: Optional[str] = None


class MoveRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    move_number: int
    dice_roll: str
    moves_notation: str
    created_at: datetime


# ── Stats Schemas ────────────────────────────────────────────────────────────


class PlayerStatsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    opponent_nickname: str
    games_played: int
    games_won: int
    games_lost: int
    total_points_won: int
    total_points_lost: int
    gammons_won: int
    gammons_lost: int
    backgammons_won: int
    backgammons_lost: int


class StatsOverview(BaseModel):
    total_games: int
    total_wins: int
    total_losses: int
    win_rate: float
    per_opponent: list[PlayerStatsResponse]


# ── Dashboard Schemas ───────────────────────────────────────────────────────


class GameHistoryItem(BaseModel):
    table_id: str
    opponent_nickname: str
    player_color: str  # "white" or "black"
    result: str  # "win", "loss", or "abandoned"
    win_type: Optional[str] = None  # "normal", "gammon", "backgammon"
    score: Optional[int] = None
    played_at: datetime
    table_status: str


class DashboardResponse(BaseModel):
    total_games: int
    wins: int
    losses: int
    win_rate: float
    abandoned_games: int
    total_count: int = 0
    games: list[GameHistoryItem]
    rating: int = 1500
    rating_games: int = 0


# ── Leaderboard Schemas ───────────────────────────────────────────────────


class LeaderboardEntry(BaseModel):
    rank: int
    player_id: str
    nickname: str
    rating: int
    rating_games: int
    total_wins: int
    total_games: int
    win_rate: float


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    total: int


class TournamentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    max_players: int = Field(ge=2, le=64)
    match_points: int = Field(default=3, ge=1, le=10)


class TournamentEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    player_id: Optional[str] = None
    player_nickname: str
    seed: int
    eliminated: bool


class TournamentMatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    round_number: int
    match_number: int
    player1_id: Optional[str] = None
    player1_nickname: Optional[str] = None
    player2_id: Optional[str] = None
    player2_nickname: Optional[str] = None
    table_id: Optional[str] = None
    winner_id: Optional[str] = None
    status: str


class TournamentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    max_players: int
    match_points: int
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    winner_id: Optional[str] = None
    winner_nickname: Optional[str] = None
    player_count: int = 0


class TournamentBracketResponse(BaseModel):
    tournament: TournamentResponse
    entries: list[TournamentEntryResponse]
    matches: list[TournamentMatchResponse]
    total_rounds: int
