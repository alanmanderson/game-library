"""SQLAlchemy models for the backgammon application."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Player(Base):
    __tablename__ = "players"

    id: str = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    nickname: str = Column(String(50), nullable=False)
    created_at: datetime = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Auth fields
    email: str | None = Column(String(255), nullable=True, unique=True)
    password_hash: str | None = Column(String(255), nullable=True)
    google_id: str | None = Column(String(255), nullable=True, unique=True)
    is_guest: bool = Column(Boolean, default=False, nullable=False)
    auth_provider: str = Column(String(20), default="local", nullable=False)

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

    id: str = Column(String(8), primary_key=True)
    created_at: datetime = Column(DateTime, default=datetime.utcnow, nullable=False)
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
    game_state: dict | None = Column(JSON, nullable=True)
    finished_at: datetime | None = Column(DateTime, nullable=True)

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
        String(36), ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    move_number: int = Column(Integer, nullable=False)
    dice_roll: str = Column(String(10), nullable=False)
    moves_notation: str = Column(String(200), nullable=False)
    game_state_after: dict | None = Column(JSON, nullable=True)
    created_at: datetime = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    table = relationship("Table", back_populates="move_records")
    player = relationship("Player", back_populates="move_records")

    def __repr__(self) -> str:
        return (
            f"<MoveRecord(id={self.id!r}, table_id={self.table_id!r}, "
            f"move_number={self.move_number!r})>"
        )


class PlayerStats(Base):
    __tablename__ = "player_stats"
    __table_args__ = (
        UniqueConstraint("player_id", "opponent_id", name="uq_player_opponent"),
    )

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    player_id: str = Column(
        String(36), ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    opponent_id: str = Column(
        String(36), ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True
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

    # Relationships
    player = relationship("Player", foreign_keys=[player_id])
    opponent = relationship("Player", foreign_keys=[opponent_id])

    def __repr__(self) -> str:
        return (
            f"<PlayerStats(player_id={self.player_id!r}, "
            f"opponent_id={self.opponent_id!r}, "
            f"games_played={self.games_played!r})>"
        )
