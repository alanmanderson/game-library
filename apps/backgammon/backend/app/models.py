"""SQLAlchemy models for the backgammon application."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import relationship

from app.database import Base


class Player(Base):
    __tablename__ = "players"

    id: str = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    nickname: str = Column(String(50), nullable=False)
    created_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Auth fields
    email: str | None = Column(String(255), nullable=True, unique=True)
    password_hash: str | None = Column(String(255), nullable=True)
    google_id: str | None = Column(String(255), nullable=True, unique=True)
    is_guest: bool = Column(Boolean, default=False, nullable=False)
    auth_provider: str = Column(String(20), default="local", nullable=False)

    # Rating fields
    rating: int = Column(Integer, default=1500, nullable=False)
    rating_games: int = Column(Integer, default=0, nullable=False)

    # Cube action counters (lifetime totals across all games)
    cube_offers: int = Column(Integer, default=0, nullable=False, server_default="0")
    cube_accepts: int = Column(Integer, default=0, nullable=False, server_default="0")
    cube_declines: int = Column(Integer, default=0, nullable=False, server_default="0")

    # Accumulated reward points from completed daily/weekly challenges.
    challenge_points: int = Column(Integer, default=0, nullable=False, server_default="0")

    # Cosmetic preferences — selected board theme + checker style.
    # Validated against known IDs by the preferences endpoint; unknown values
    # simply fall back to "classic" in the frontend so an old column value
    # never breaks rendering.
    board_theme: str = Column(String(64), default="classic", nullable=False, server_default="classic")
    checker_style: str = Column(String(64), default="classic", nullable=False, server_default="classic")

    # Relationships
    white_tables = relationship(
        "Table", foreign_keys="Table.white_player_id", back_populates="white_player"
    )
    black_tables = relationship(
        "Table", foreign_keys="Table.black_player_id", back_populates="black_player"
    )
    won_tables = relationship(
        "Table", foreign_keys="Table.winner_id", back_populates="winner"
    )
    move_records = relationship("MoveRecord", back_populates="player")

    def __repr__(self) -> str:
        return f"<Player(id={self.id!r}, nickname={self.nickname!r})>"


class Table(Base):
    __tablename__ = "tables"
    __table_args__ = (
        CheckConstraint("status IN ('waiting', 'playing', 'game_over', 'finished')", name="ck_tables_status"),
    )

    id: str = Column(String(8), primary_key=True)
    created_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    white_player_id: str | None = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True, index=True
    )
    black_player_id: str | None = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: str = Column(String(20), nullable=False, default="waiting", index=True)
    winner_id: str | None = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True, index=True
    )
    win_type: str | None = Column(String(20), nullable=True)
    final_score: int | None = Column(Integer, nullable=True)
    game_state: dict | None = Column(MutableDict.as_mutable(JSON), nullable=True)
    finished_at: datetime | None = Column(DateTime(timezone=True), nullable=True)
    updated_at: datetime | None = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=True)
    # Match play
    match_points: int = Column(Integer, nullable=False, default=5)
    white_match_score: int = Column(Integer, nullable=False, default=0)
    black_match_score: int = Column(Integer, nullable=False, default=0)
    # Bot difficulty
    bot_difficulty: str | None = Column(String(10), nullable=True)
    # Lobby visibility
    is_public: bool = Column(Boolean, default=False, server_default="false")
    # Time control
    time_control: str = Column(String(20), default="unlimited", nullable=False, server_default="unlimited")
    white_time_remaining_ms: int | None = Column(Integer, nullable=True)
    black_time_remaining_ms: int | None = Column(Integer, nullable=True)
    turn_started_at: datetime | None = Column(DateTime(timezone=True), nullable=True)
    # Ranked vs casual — ranked games update ELO ratings, casual games do not.
    is_ranked: bool = Column(Boolean, default=True, nullable=False, server_default="true")

    # Relationships
    white_player = relationship(
        "Player", foreign_keys=[white_player_id], back_populates="white_tables"
    )
    black_player = relationship(
        "Player", foreign_keys=[black_player_id], back_populates="black_tables"
    )
    winner = relationship(
        "Player", foreign_keys=[winner_id], back_populates="won_tables"
    )
    move_records = relationship(
        "MoveRecord", back_populates="table", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Table(id={self.id!r}, status={self.status!r})>"


class MoveRecord(Base):
    __tablename__ = "move_records"

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    table_id: str = Column(
        String(8), ForeignKey("tables.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: str = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True, index=True
    )
    move_number: int = Column(Integer, nullable=False)
    dice_roll: str = Column(String(10), nullable=False)
    moves_notation: str = Column(String(200), nullable=False)
    game_state_after: dict | None = Column(MutableDict.as_mutable(JSON), nullable=True)
    bot_strategy: str | None = Column(String(20), nullable=True)
    created_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    table = relationship("Table", back_populates="move_records")
    player = relationship("Player", back_populates="move_records")

    def __repr__(self) -> str:
        return (
            f"<MoveRecord(id={self.id!r}, table_id={self.table_id!r}, "
            f"move_number={self.move_number!r})>"
        )


class Tournament(Base):
    __tablename__ = "tournaments"
    __table_args__ = (
        CheckConstraint("status IN ('registering', 'in_progress', 'completed')", name="ck_tournaments_status"),
    )

    id: str = Column(String(8), primary_key=True)
    name: str = Column(String(100), nullable=False)
    max_players: int = Column(Integer, nullable=False)
    match_points: int = Column(Integer, nullable=False, default=3)
    status: str = Column(String(20), nullable=False, default="registering")
    created_by: str | None = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    created_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    winner_id: str | None = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    creator = relationship("Player", foreign_keys=[created_by])
    winner = relationship("Player", foreign_keys=[winner_id])
    entries = relationship("TournamentEntry", back_populates="tournament", cascade="all, delete-orphan")
    matches = relationship("TournamentMatch", back_populates="tournament", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Tournament(id={self.id!r}, name={self.name!r}, status={self.status!r})>"


class TournamentEntry(Base):
    __tablename__ = "tournament_entries"
    __table_args__ = (
        UniqueConstraint("tournament_id", "player_id", name="uq_tournament_player"),
    )

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    tournament_id: str = Column(
        String(8), ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: str | None = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True, index=True
    )
    seed: int = Column(Integer, nullable=False, default=0)
    eliminated: bool = Column(Boolean, default=False, nullable=False)

    # Relationships
    tournament = relationship("Tournament", back_populates="entries")
    player = relationship("Player", foreign_keys=[player_id])

    def __repr__(self) -> str:
        return f"<TournamentEntry(tournament_id={self.tournament_id!r}, player_id={self.player_id!r})>"


class TournamentMatch(Base):
    __tablename__ = "tournament_matches"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'playing', 'completed', 'bye')", name="ck_tournament_match_status"),
    )

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    tournament_id: str = Column(
        String(8), ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    round_number: int = Column(Integer, nullable=False)
    match_number: int = Column(Integer, nullable=False)
    player1_id: str | None = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    player2_id: str | None = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    table_id: str | None = Column(
        String(8), ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )
    winner_id: str | None = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    status: str = Column(String(20), nullable=False, default="pending")

    # Relationships
    tournament = relationship("Tournament", back_populates="matches")
    player1 = relationship("Player", foreign_keys=[player1_id])
    player2 = relationship("Player", foreign_keys=[player2_id])
    table = relationship("Table", foreign_keys=[table_id])
    winner = relationship("Player", foreign_keys=[winner_id])

    def __repr__(self) -> str:
        return (
            f"<TournamentMatch(id={self.id!r}, tournament_id={self.tournament_id!r}, "
            f"round={self.round_number!r}, match={self.match_number!r}, status={self.status!r})>"
        )


class GameAnalysis(Base):
    """Cached per-move game analysis for a finished table.

    A single row holds the analysis payload (a JSON list of per-move
    analyses) for one table.  Computing analysis is expensive
    (hundreds of ML evaluations per game), so we cache the result
    and serve it directly on subsequent requests.
    """

    __tablename__ = "game_analyses"

    table_id: str = Column(
        String(8), ForeignKey("tables.id", ondelete="CASCADE"), primary_key=True
    )
    # JSON list of per-move analysis dicts — see schemas.MoveAnalysis.
    move_analyses: list = Column(JSON, nullable=False)
    # True if the analysis was produced with the ML model; False if we
    # fell back to a simple heuristic (e.g. model not installed).
    ml_available: bool = Column(Boolean, nullable=False, default=True)
    moves_analysed: int = Column(Integer, nullable=False, default=0)
    # Ply depth used for this cached analysis. NULL means legacy (pre-ply) cache.
    ply: int = Column(Integer, nullable=True)
    # Human-readable description of the analysis engine/depth used.
    analysis_source: str = Column(String(100), nullable=True)
    # Background analysis status: "complete", "running", or "failed".
    status: str = Column(String(20), nullable=False, default="complete")
    created_at: datetime = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    table = relationship("Table", foreign_keys=[table_id])

    def __repr__(self) -> str:
        return (
            f"<GameAnalysis(table_id={self.table_id!r}, "
            f"moves_analysed={self.moves_analysed!r})>"
        )


class PlayerStats(Base):
    __tablename__ = "player_stats"
    __table_args__ = (
        UniqueConstraint("player_id", "opponent_id", name="uq_player_opponent"),
    )

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    player_id: str = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True, index=True
    )
    opponent_id: str = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True, index=True
    )
    games_played: int = Column(Integer, nullable=False, default=0)
    games_won: int = Column(Integer, nullable=False, default=0)
    games_lost: int = Column(Integer, nullable=False, default=0)
    total_points_won: int = Column(Integer, nullable=False, default=0)
    total_points_lost: int = Column(Integer, nullable=False, default=0)
    gammons_won: int = Column(Integer, nullable=False, default=0)
    gammons_lost: int = Column(Integer, nullable=False, default=0)
    backgammons_won: int = Column(Integer, nullable=False, default=0)
    backgammons_lost: int = Column(Integer, nullable=False, default=0)
    updated_at: datetime | None = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=True)

    # Relationships
    player = relationship("Player", foreign_keys=[player_id])
    opponent = relationship("Player", foreign_keys=[opponent_id])

    def __repr__(self) -> str:
        return (
            f"<PlayerStats(player_id={self.player_id!r}, "
            f"opponent_id={self.opponent_id!r}, "
            f"games_played={self.games_played!r})>"
        )


class RatingHistory(Base):
    """Per-player snapshot of ELO rating after each rated game.

    A new row is written by :func:`app.services.rating_service.update_ratings`
    each time a player's rating changes, enabling a historical rating graph
    on the player's dashboard.
    """

    __tablename__ = "rating_history"

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    player_id: str = Column(
        String(36), ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rating: int = Column(Integer, nullable=False)
    rating_change: int = Column(Integer, nullable=False, default=0)
    opponent_id: str | None = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    table_id: str | None = Column(
        String(8), ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )
    created_at: datetime = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    player = relationship("Player", foreign_keys=[player_id])
    opponent = relationship("Player", foreign_keys=[opponent_id])

    def __repr__(self) -> str:
        return (
            f"<RatingHistory(player_id={self.player_id!r}, "
            f"rating={self.rating!r}, created_at={self.created_at!r})>"
        )


class Season(Base):
    """A ranked-play season with defined start and end dates.

    Exactly one season should have ``is_active = True`` at a time. A future
    scheduler (not implemented) will flip the flag at the season boundary
    and seed a new row for the next season. For now the active season is
    maintained by hand in the migration.
    """

    __tablename__ = "seasons"

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    name: str = Column(String(64), nullable=False, unique=True)
    start_date: datetime = Column(DateTime(timezone=True), nullable=False)
    end_date: datetime = Column(DateTime(timezone=True), nullable=False)
    is_active: bool = Column(Boolean, default=False, nullable=False, server_default="false")
    created_at: datetime = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Season(id={self.id!r}, name={self.name!r}, is_active={self.is_active!r})>"


class PlayerSeasonStats(Base):
    """Per-player, per-season snapshot of ranked play.

    A single row per (player_id, season_id) accumulates wins, losses,
    gammons, peak rating, and ``tier_final`` (derived from ``end_rating``
    after every update) over the life of a season. ``end_rating`` always
    reflects the player's rating AFTER the most recent rated game finish
    within the season, so for the currently-active season it doubles as
    "rating right now".

    Upserted by :func:`app.services.game_service._finish_game` on every
    rated game that completes between two registered humans. Exposed via
    ``GET /api/players/{player_id}/season-history``.
    """

    __tablename__ = "player_season_stats"
    __table_args__ = (
        UniqueConstraint(
            "player_id", "season_id", name="uq_player_season_stats_player_season"
        ),
    )

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    player_id: str = Column(
        String(36),
        ForeignKey("players.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    season_id: int = Column(
        Integer,
        ForeignKey("seasons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    end_rating: int = Column(Integer, nullable=False, default=1500, server_default="1500")
    peak_rating: int = Column(Integer, nullable=False, default=1500, server_default="1500")
    wins: int = Column(Integer, nullable=False, default=0, server_default="0")
    losses: int = Column(Integer, nullable=False, default=0, server_default="0")
    gammons_won: int = Column(Integer, nullable=False, default=0, server_default="0")
    gammons_lost: int = Column(Integer, nullable=False, default=0, server_default="0")
    tier_final: str = Column(
        String(16), nullable=False, default="Silver", server_default="Silver"
    )
    games_played: int = Column(Integer, nullable=False, default=0, server_default="0")
    updated_at: datetime = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    player = relationship("Player", foreign_keys=[player_id])
    season = relationship("Season", foreign_keys=[season_id])

    def __repr__(self) -> str:
        return (
            f"<PlayerSeasonStats(player_id={self.player_id!r}, "
            f"season_id={self.season_id!r}, end_rating={self.end_rating!r}, "
            f"tier_final={self.tier_final!r})>"
        )


class Challenge(Base):
    """A daily or weekly challenge template.

    Templates are seeded via migrations and identified by a stable string id
    so that :class:`PlayerChallenge` rows keep referencing them across
    deployments. ``metric`` drives the progress-tracking logic in
    :mod:`app.services.challenge_service`.
    """

    __tablename__ = "challenges"
    __table_args__ = (
        CheckConstraint("type IN ('daily', 'weekly')", name="ck_challenges_type"),
    )

    id: str = Column(String(64), primary_key=True)
    name: str = Column(String(100), nullable=False)
    description: str = Column(String(255), nullable=False)
    type: str = Column(String(16), nullable=False)
    target: int = Column(Integer, nullable=False)
    metric: str = Column(String(64), nullable=False)
    reward_points: int = Column(Integer, nullable=False, default=0, server_default="0")
    is_active: bool = Column(Boolean, nullable=False, default=True, server_default="true")

    def __repr__(self) -> str:
        return f"<Challenge(id={self.id!r}, type={self.type!r}, target={self.target!r})>"


class PlayerChallenge(Base):
    """Per-player progress for a given challenge within a given period.

    ``period_key`` is a string "YYYY-MM-DD" for daily challenges and
    "YYYY-Www" for weekly challenges. A unique (player, challenge, period)
    triple guarantees one row per active window.
    """

    __tablename__ = "player_challenges"
    __table_args__ = (
        UniqueConstraint(
            "player_id", "challenge_id", "period_key", name="uq_player_challenge_period"
        ),
    )

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    player_id: str = Column(
        String(36), ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    challenge_id: str = Column(
        String(64), ForeignKey("challenges.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period_key: str = Column(String(16), nullable=False)
    progress: int = Column(Integer, nullable=False, default=0, server_default="0")
    completed_at: datetime | None = Column(DateTime(timezone=True), nullable=True)
    created_at: datetime = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    challenge = relationship("Challenge", foreign_keys=[challenge_id])
    player = relationship("Player", foreign_keys=[player_id])

    def __repr__(self) -> str:
        return (
            f"<PlayerChallenge(player_id={self.player_id!r}, "
            f"challenge_id={self.challenge_id!r}, "
            f"period_key={self.period_key!r}, "
            f"progress={self.progress!r})>"
        )



class AnalysisSession(Base):
    __tablename__ = "analysis_sessions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'completed', 'abandoned')",
            name="ck_analysis_session_status",
        ),
    )

    id: str = Column(String(8), primary_key=True)
    player_id: str = Column(
        String(36), ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    game_type: str = Column(String(10), nullable=False, default="money")
    match_length: int | None = Column(Integer, nullable=True)
    player_color: str = Column(String(5), nullable=False, default="white")
    gnubg_ply: int = Column(Integer, nullable=False, default=2)
    auto_analysis: str = Column(String(20), nullable=False, default="off")
    status: str = Column(String(20), nullable=False, default="active")
    result: str | None = Column(String(20), nullable=True)
    loaded_from: dict | None = Column(JSON, nullable=True)
    game_state_json: dict | None = Column(MutableDict.as_mutable(JSON), nullable=True)
    created_at: datetime = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    completed_at: datetime | None = Column(DateTime(timezone=True), nullable=True)

    player = relationship("Player", foreign_keys=[player_id])

    def __repr__(self) -> str:
        return f"<AnalysisSession(id={self.id!r}, player_id={self.player_id!r}, status={self.status!r})>"


class AnalysisSessionMove(Base):
    __tablename__ = "analysis_session_moves"

    id: str = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_id: str = Column(
        String(8), ForeignKey("analysis_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    game_number: int = Column(Integer, nullable=False, default=1)
    move_number: int = Column(Integer, nullable=False)
    player: str = Column(String(5), nullable=False)
    dice_roll: str = Column(String(10), nullable=False)
    move_notation: str = Column(String(200), nullable=False)
    position_snapshot: dict | None = Column(JSON, nullable=True)
    best_move_notation: str | None = Column(String(200), nullable=True)
    equity: float | None = Column(Float, nullable=True)
    best_equity: float | None = Column(Float, nullable=True)
    equity_loss: float | None = Column(Float, nullable=True)
    quality: str | None = Column(String(20), nullable=True)
    best_probs_json: dict | None = Column(JSON, nullable=True)
    chosen_probs_json: dict | None = Column(JSON, nullable=True)
    annotation: str | None = Column(String(1000), nullable=True)
    created_at: datetime = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    session = relationship("AnalysisSession", foreign_keys=[session_id])

    def __repr__(self) -> str:
        return (
            f"<AnalysisSessionMove(session_id={self.session_id!r}, "
            f"move_number={self.move_number!r})>"
        )


class CubeActionRecord(Base):
    """Per-action record of a cube decision (offer / accept / decline).

    Captures the acting player, the cube value before the action, and the
    ML-evaluated equity in the acting player's perspective just before the
    action. A classification (``verdict`` plus ``correct`` boolean) is
    derived at record time from standard cube-theory equity thresholds so
    that aggregate accuracy can be computed with a simple COUNT query on
    :meth:`app.services.stats_service.get_advanced_stats`.

    When the ML model is unavailable (or encoding fails), the row is still
    persisted with ``equity_before``, ``correct``, and ``verdict`` set to
    NULL so that raw cube-action counts stay consistent with the Player
    counter columns.
    """

    __tablename__ = "cube_action_records"

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    table_id: str | None = Column(
        String(8), ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )
    player_id: str = Column(
        String(36),
        ForeignKey("players.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: str = Column(String(16), nullable=False)  # "offer" | "accept" | "decline"
    cube_value_before: int = Column(
        Integer, nullable=False, default=1, server_default="1"
    )
    equity_before: float | None = Column(Float, nullable=True)
    correct: bool | None = Column(Boolean, nullable=True)
    verdict: str | None = Column(String(16), nullable=True)
    created_at: datetime = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<CubeActionRecord(player_id={self.player_id!r}, "
            f"action={self.action!r}, verdict={self.verdict!r})>"
        )
