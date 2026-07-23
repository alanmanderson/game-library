"""Initial schema for Sneaky Sabotage.

Revision ID: 001
Revises: None
Create Date: 2026-06-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "games",
        sa.Column("id", sa.String(6), primary_key=True),
        sa.Column("status", sa.String(20), server_default="lobby"),
        sa.Column("current_round", sa.Integer(), server_default="0"),
        sa.Column("max_rounds", sa.Integer(), server_default="4"),
        sa.Column("timer_seconds", sa.Integer(), server_default="300"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "players",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("game_id", sa.String(6), sa.ForeignKey("games.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("is_host", sa.Boolean(), server_default="false"),
        sa.Column("total_score", sa.Integer(), server_default="0"),
        sa.Column("session_token", sa.String(64), nullable=False),
        sa.Column("connected", sa.Boolean(), server_default="true"),
    )
    op.create_table(
        "rounds",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("game_id", sa.String(6), sa.ForeignKey("games.id", ondelete="CASCADE"), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("puzzle_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), server_default="role_reveal"),
        sa.Column("answer_submitted", sa.String(200), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.Column("timer_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "player_roles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("round_id", sa.Integer(), sa.ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False),
        sa.Column("player_id", sa.String(36), sa.ForeignKey("players.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(10), nullable=False),
    )
    op.create_table(
        "votes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("round_id", sa.Integer(), sa.ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False),
        sa.Column("voter_id", sa.String(36), sa.ForeignKey("players.id", ondelete="CASCADE"), nullable=False),
        sa.Column("accused_id", sa.String(36), sa.ForeignKey("players.id", ondelete="CASCADE"), nullable=True),
        sa.Column("is_saboteur_guess", sa.Boolean(), server_default="false"),
    )


def downgrade() -> None:
    op.drop_table("votes")
    op.drop_table("player_roles")
    op.drop_table("rounds")
    op.drop_table("players")
    op.drop_table("games")
