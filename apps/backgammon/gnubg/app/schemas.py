"""Pydantic request/response models for the gnubg wrapper service.

The board representation mirrors the main backend's ``game_engine``:

- ``points`` is a 26-element list. Indices 1-24 are play points; 0 and 25
  are padding. Positive values = white checkers, negative = black.
- White moves 24 -> 1. Black moves 1 -> 24.
- ``bar_*`` / ``off_*`` hold the counts off-board for each color.

Kept deliberately minimal — the gnubg service has no auth and no
persistence; schema stability is the only contract callers rely on.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


Color = Literal["white", "black"]


class MatchScore(BaseModel):
    """Current match score for cubeful evaluations."""

    white: int = Field(ge=0)
    black: int = Field(ge=0)
    length: int = Field(ge=1)


class Board(BaseModel):
    """Board state as passed to every endpoint."""

    points: list[int] = Field(min_length=26, max_length=26)
    bar_white: int = Field(ge=0)
    bar_black: int = Field(ge=0)
    off_white: int = Field(ge=0, le=15)
    off_black: int = Field(ge=0, le=15)
    turn: Color
    cube_value: int = 1
    cube_owner: Optional[Color] = None
    match_score: Optional[MatchScore] = None

    @field_validator("cube_value")
    @classmethod
    def _cube_is_power_of_two(cls, v: int) -> int:
        if v < 1 or (v & (v - 1)) != 0:
            raise ValueError("cube_value must be a power of two >= 1")
        return v


class MoveDice(Board):
    """Board + dice."""

    dice: list[int] = Field(min_length=2, max_length=2)

    @field_validator("dice")
    @classmethod
    def _dice_values(cls, v: list[int]) -> list[int]:
        for d in v:
            if not 1 <= d <= 6:
                raise ValueError("dice values must be in [1,6]")
        return v


class MoveStep(BaseModel):
    from_point: int
    to_point: int


class AnalyzeMoveRequest(MoveDice):
    chosen_moves: list[MoveStep]


# ── Responses ──────────────────────────────────────────────────────────────


class Probs(BaseModel):
    win: float
    win_g: float
    lose_g: float
    win_bg: float
    lose_bg: float


class EvaluateResponse(BaseModel):
    equity: float
    probs: Probs


class Candidate(BaseModel):
    moves: list[MoveStep]
    notation: str
    equity: float
    probs: Probs


class BestMoveResponse(BaseModel):
    best: Candidate
    candidates: list[Candidate]


class AnalyzeMoveResponse(BaseModel):
    best: Candidate
    chosen: Candidate
    equity_loss: float
    quality: Literal[
        "very_good", "good", "doubtful", "bad", "very_bad", "blunder"
    ]


class CubeDecisionResponse(BaseModel):
    equity_no_double: float
    equity_double_take: float
    equity_double_pass: float
    should_offer: bool
    should_accept: bool


class HealthResponse(BaseModel):
    status: str
    gnubg_version: str
    ready: bool
