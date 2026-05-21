"""Pydantic schemas for the backgammon API request/response models."""

from datetime import datetime
from typing import Literal, Optional

import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator


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
    challenge_points: int = 0
    board_theme: str = "classic"
    checker_style: str = "classic"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def tier(self) -> str:
        """League tier derived from rating."""
        from app.tiers import tier_for_rating
        return tier_for_rating(self.rating)


class PlayerPreferencesUpdate(BaseModel):
    """Partial update for a player's cosmetic preferences."""

    board_theme: Optional[str] = Field(default=None, min_length=1, max_length=64)
    checker_style: Optional[str] = Field(default=None, min_length=1, max_length=64)


# ── Auth Schemas ─────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    nickname: str = Field(min_length=2, max_length=50)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        errors = []
        if not re.search(r"[A-Z]", v):
            errors.append("one uppercase letter")
        if not re.search(r"[0-9]", v):
            errors.append("one number")
        if not re.search(r"[^A-Za-z0-9]", v):
            errors.append("one special character")
        if errors:
            raise ValueError(f"Password must contain at least {', '.join(errors)}")
        return v


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


class LogoutResponse(BaseModel):
    message: str


# ── Table Schemas ────────────────────────────────────────────────────────────


class TableCreate(BaseModel):
    player_id: str
    preferred_color: Optional[str] = None  # "white", "black", or None (random)
    match_points: int = Field(default=5, ge=1, le=10)
    is_public: bool = False
    time_control: str = Field(default="unlimited")
    is_ranked: bool = True


class PassAndPlayCreate(BaseModel):
    """Request body for creating a pass-and-play game (two players, one device)."""
    player2_name: str = Field(default="Player 2", min_length=1, max_length=50)
    preferred_color: Optional[str] = None  # "white", "black", or None (random)
    match_points: int = Field(default=5, ge=1, le=99)
    doubling_cube: bool = True
    crawford_rule: bool = True


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
    is_ranked: bool = True
    game_mode: str = "online"


class InviteBotRequest(BaseModel):
    difficulty: Literal["easy", "medium", "hard", "expert", "gnu"] = "hard"


class LobbyTable(BaseModel):
    id: str
    creator_nickname: str
    match_points: Optional[int] = None
    preferred_color: Optional[str] = None
    created_at: datetime
    is_ranked: bool = True


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
    is_ranked: bool = True


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
    player_id: Optional[str] = None
    dice_roll: str
    moves_notation: str
    bot_strategy: Optional[str] = None
    created_at: datetime


class PaginatedMoveHistoryResponse(BaseModel):
    total: int
    limit: int
    offset: int
    records: list[MoveRecordResponse]


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
    challenge_points: int = 0
    active_season: Optional["SeasonResponse"] = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def tier(self) -> str:
        """League tier derived from rating."""
        from app.tiers import tier_for_rating
        return tier_for_rating(self.rating)


# ── Advanced Stats Schemas ──────────────────────────────────────────────


class ColorWinRate(BaseModel):
    games: int
    wins: int
    win_rate: float


class TimeControlWinRate(BaseModel):
    games: int
    wins: int
    win_rate: float


class CubeStats(BaseModel):
    offered: int
    accepted: int
    declined: int
    accept_rate: float  # accepted / (accepted + declined)
    # Cube-decision accuracy (offers/takes/drops vs ML-optimal equity).
    # `accuracy` is the fraction of scored actions classified as the
    # best decision, as a percentage (0–100). `None` when no actions
    # have been scored yet (e.g. ML model not loaded, or no cube use).
    accuracy: float | None = None
    # Count of actions by verdict: best / borderline / mistake / blunder.
    by_verdict: dict[str, int] = {
        "best": 0,
        "borderline": 0,
        "mistake": 0,
        "blunder": 0,
    }


class RatingHistoryPoint(BaseModel):
    played_at: datetime
    rating_after: int
    rating_change: int


class AdvancedStatsResponse(BaseModel):
    total_games: int
    gammon_wins: int
    gammon_losses: int
    gammon_rate: float  # gammon_wins / total_wins
    backgammon_wins: int
    backgammon_losses: int
    backgammon_rate: float  # backgammon_wins / total_wins
    win_rate_as_white: ColorWinRate
    win_rate_as_black: ColorWinRate
    win_rate_by_time_control: dict[str, TimeControlWinRate]
    cube_stats: CubeStats
    rating_history: list[RatingHistoryPoint]


# ── Replay Schemas ───────────────────────────────────────────────────────


class ReplayMoveRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    move_number: int
    player_nickname: Optional[str] = None
    dice_roll: str
    moves_notation: str
    game_state_after: Optional[dict] = None
    created_at: datetime


class ReplayResponse(BaseModel):
    table_id: str
    status: str
    white_player_id: Optional[str] = None
    black_player_id: Optional[str] = None
    white_player_nickname: Optional[str] = None
    black_player_nickname: Optional[str] = None
    winner_color: Optional[str] = None  # "white" | "black" | None
    winner_nickname: Optional[str] = None
    win_type: Optional[str] = None  # "normal" | "gammon" | "backgammon"
    final_score: Optional[int] = None
    white_match_score: Optional[int] = None
    black_match_score: Optional[int] = None
    match_points: Optional[int] = None
    initial_state: dict
    moves: list[ReplayMoveRecord]


# ── Analysis Schemas ─────────────────────────────────────────────────────


class MoveCandidate(BaseModel):
    """A ranked candidate move from the analysis engine."""
    rank: int
    notation: str
    equity: float
    equity_diff: float  # relative to rank #1 (always <= 0)
    probs: Optional[dict[str, float]] = None


class MoveAnalysis(BaseModel):
    """Per-move analysis of a completed game."""

    move_number: int
    player_color: str          # "white" | "black"
    player_nickname: Optional[str] = None
    dice_roll: str
    moves_notation: str
    equity_before: float       # equity of the board BEFORE the move
    equity_after: float        # equity AFTER the actual move chosen
    best_equity: float         # equity if the player had played the best turn
    equity_loss: float         # max(0, best_equity - equity_after)
    quality: str               # "best" | "good" | "inaccuracy" | "mistake" | "blunder"
    best_move_notation: Optional[str] = None
    # Optional enrichment populated when the gnubg evaluator is used.
    # Frontend consumers should treat these as nullable — they're absent
    # when the heuristic or ML evaluator produced this analysis.
    best_probs: Optional[dict[str, float]] = None
    chosen_probs: Optional[dict[str, float]] = None
    best_win_prob: Optional[float] = None
    chosen_win_prob: Optional[float] = None
    source: Optional[str] = None  # "gnubg" | "ml" | "heuristic"
    top_moves: Optional[list[MoveCandidate]] = None


class AnalysisResponse(BaseModel):
    """Full game analysis payload."""

    table_id: str
    ml_available: bool
    moves_analysed: int
    total_moves: int
    move_analyses: list[MoveAnalysis]
    analysis_source: Optional[str] = None  # e.g. "GNU Backgammon (2-ply)", "ML neural network (0-ply)"
    analysis_ply: Optional[int] = None     # ply depth used (0, 2, 3) or None if not gnubg
    status: str = "complete"               # "complete" | "running" | "failed"
    progress: Optional[float] = None       # 0.0-1.0, set when status="running"


class CubeDecision(BaseModel):
    """Cube action analysis for a position."""
    action: str                          # "No double", "Double/Take", "Double/Drop", "Too good to double"
    equity_no_double: Optional[float] = None
    equity_double_take: Optional[float] = None
    equity_double_drop: Optional[float] = None


class DeepDiveResponse(BaseModel):
    """Full deep-dive analysis for a single position at maximum depth."""
    table_id: str
    move_number: int
    player_color: str
    dice_roll: str
    moves_notation: str
    # Win probabilities (0..1)
    win_prob: Optional[float] = None
    win_g_prob: Optional[float] = None
    win_bg_prob: Optional[float] = None
    lose_prob: Optional[float] = None
    lose_g_prob: Optional[float] = None
    lose_bg_prob: Optional[float] = None
    # Equity
    cubeless_equity: Optional[float] = None
    cubeful_equity: Optional[float] = None
    # Top candidate moves
    top_moves: list[MoveCandidate] = []
    # Cube decision
    cube_decision: Optional[CubeDecision] = None
    # Meta
    source: str = "gnubg"
    ply: int = 3
    position_id: Optional[str] = None
    analysis_time_ms: Optional[int] = None


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

    @computed_field  # type: ignore[prop-decorator]
    @property
    def tier(self) -> str:
        """League tier derived from rating."""
        from app.tiers import tier_for_rating
        return tier_for_rating(self.rating)


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    total: int
    # Populated when the request provides ``viewer_id`` and that player is
    # ranked but falls outside the returned pagination window. Allows the
    # frontend to display a "you are #N" sticky footer.
    viewer_entry: Optional["LeaderboardEntry"] = None


# ── Season Schemas ────────────────────────────────────────────────────────


class SeasonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    start_date: datetime
    end_date: datetime
    is_active: bool


class PlayerSeasonHistoryEntry(BaseModel):
    """One row of a player's season history (snapshot per season)."""

    season_id: int
    season_name: str
    start_date: datetime
    end_date: datetime
    is_active: bool
    end_rating: int
    peak_rating: int
    wins: int
    losses: int
    gammons_won: int
    gammons_lost: int
    tier_final: str
    games_played: int
    updated_at: datetime


# ── Challenge Schemas ────────────────────────────────────────────────────


class ChallengeProgress(BaseModel):
    """A single challenge with the current player's progress attached."""

    id: str
    name: str
    description: str
    type: Literal["daily", "weekly"]
    target: int
    metric: str
    reward_points: int
    progress: int
    completed_at: Optional[datetime] = None
    period_key: str


class ChallengesResponse(BaseModel):
    daily: list[ChallengeProgress]
    weekly: list[ChallengeProgress]
    challenge_points: int


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


# ── Analysis Session Schemas ────────────────────────────────────────────


class AnalysisSessionCreate(BaseModel):
    game_type: Literal["money", "match"] = "money"
    match_length: Optional[int] = Field(default=None, ge=1, le=25)
    player_color: Literal["white", "black", "random"] = "white"
    gnubg_ply: int = Field(default=2, ge=0, le=3)
    auto_analysis: Literal["off", "per_move", "per_turn"] = "off"


class AnalysisSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    player_id: str
    game_type: str
    match_length: Optional[int] = None
    player_color: str
    gnubg_ply: int
    auto_analysis: str
    status: str
    result: Optional[str] = None
    loaded_from: Optional[dict] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class AnalysisGameStateResponse(BaseModel):
    session: AnalysisSessionResponse
    game_state: dict
    move_count: int
    current_view_index: int  # -1 = live position


class AnalysisMoveResponse(BaseModel):
    move_number: int
    player: str
    dice_roll: str
    move_notation: str
    quality: Optional[str] = None
    equity_loss: Optional[float] = None
    annotation: Optional[str] = None


class AnalysisHintCandidate(BaseModel):
    rank: int
    notation: str
    moves: list[dict]
    equity: float
    equity_diff: float
    probs: Optional[dict] = None


class AnalysisCubeAction(BaseModel):
    recommendation: str
    equity_no_double: float
    equity_double_take: float
    equity_double_drop: float


class AnalysisHintResponse(BaseModel):
    cube_action: Optional[AnalysisCubeAction] = None
    candidates: list[AnalysisHintCandidate]


class AnalysisEvalResponse(BaseModel):
    equity: float
    probs: dict
    position_class: Optional[str] = None


class AnalysisMoveRequest(BaseModel):
    from_point: int
    to_point: int


class AnalysisNavigateRequest(BaseModel):
    direction: Literal["first", "prev", "next", "last"]


class AnalysisJumpRequest(BaseModel):
    move_number: int = Field(ge=0)


class AnalysisAnnotateRequest(BaseModel):
    move_number: int = Field(ge=1)
    note: str = Field(max_length=1000)


class AnalysisLoadGameRequest(BaseModel):
    table_id: str
    move_number: Optional[int] = None


class AnalysisLoadPositionRequest(BaseModel):
    position_id: str
    match_id: Optional[str] = None


class AnalysisLoadXgidRequest(BaseModel):
    xgid: str


class AnalysisSettingsUpdate(BaseModel):
    gnubg_ply: Optional[int] = Field(default=None, ge=0, le=3)
    auto_analysis: Optional[Literal["off", "per_move", "per_turn"]] = None


class AnalysisSessionListResponse(BaseModel):
    sessions: list[AnalysisSessionResponse]


class AnalysisRespondDoubleRequest(BaseModel):
    accept: bool
