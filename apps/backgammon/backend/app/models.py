"""SQLAlchemy models for the backgammon application."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
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
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    black_player_id: str | None = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    status: str = Column(String(20), nullable=False, default="waiting", index=True)
    winner_id: str | None = Column(
        String(36), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
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
