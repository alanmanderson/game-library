import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class GameStatus(str, enum.Enum):
    LOBBY = "lobby"
    PLAYING = "playing"
    FINISHED = "finished"


class RoundStatus(str, enum.Enum):
    ROLE_REVEAL = "role_reveal"
    SOLVING = "solving"
    VOTING = "voting"
    SABOTEUR_GUESS = "saboteur_guess"
    RESULTS = "results"
    COMPLETE = "complete"


class Role(str, enum.Enum):
    AGENT = "agent"
    SABOTEUR = "saboteur"
    INSIDER = "insider"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Game(Base):
    __tablename__ = "games"

    id = Column(String(6), primary_key=True)
    status = Column(String(20), default=GameStatus.LOBBY.value)
    current_round = Column(Integer, default=0)
    max_rounds = Column(Integer, default=4)
    timer_seconds = Column(Integer, default=300)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    players = relationship("Player", back_populates="game", cascade="all, delete-orphan")
    rounds = relationship("Round", back_populates="game", cascade="all, delete-orphan")


class Player(Base):
    __tablename__ = "players"

    id = Column(String(36), primary_key=True)
    game_id = Column(String(6), ForeignKey("games.id", ondelete="CASCADE"))
    name = Column(String(50), nullable=False)
    is_host = Column(Boolean, default=False)
    total_score = Column(Integer, default=0)
    session_token = Column(String(64), nullable=False)
    connected = Column(Boolean, default=True)

    game = relationship("Game", back_populates="players")
    roles = relationship("PlayerRole", back_populates="player", cascade="all, delete-orphan")


class Round(Base):
    __tablename__ = "rounds"

    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(String(6), ForeignKey("games.id", ondelete="CASCADE"))
    round_number = Column(Integer, nullable=False)
    puzzle_id = Column(Integer, nullable=False)
    status = Column(String(20), default=RoundStatus.ROLE_REVEAL.value)
    answer_submitted = Column(String(200), nullable=True)
    is_correct = Column(Boolean, nullable=True)
    timer_started_at = Column(DateTime(timezone=True), nullable=True)

    game = relationship("Game", back_populates="rounds")
    player_roles = relationship("PlayerRole", back_populates="round", cascade="all, delete-orphan")
    votes = relationship("Vote", back_populates="round", cascade="all, delete-orphan")


class PlayerRole(Base):
    __tablename__ = "player_roles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    round_id = Column(Integer, ForeignKey("rounds.id", ondelete="CASCADE"))
    player_id = Column(String(36), ForeignKey("players.id", ondelete="CASCADE"))
    role = Column(String(10), nullable=False)

    round = relationship("Round", back_populates="player_roles")
    player = relationship("Player", back_populates="roles")


class Vote(Base):
    __tablename__ = "votes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    round_id = Column(Integer, ForeignKey("rounds.id", ondelete="CASCADE"))
    voter_id = Column(String(36), ForeignKey("players.id", ondelete="CASCADE"))
    accused_id = Column(String(36), ForeignKey("players.id", ondelete="CASCADE"), nullable=True)
    is_saboteur_guess = Column(Boolean, default=False)

    round = relationship("Round", back_populates="votes")
