"""Initial schema for backgammon application.

Revision ID: 001
Revises: None
Create Date: 2026-03-04

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Players table ────────────────────────────────────────────────────
    op.create_table(
        "players",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("nickname", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # ── Tables table ─────────────────────────────────────────────────────
    op.create_table(
        "tables",
        sa.Column("id", sa.String(8), primary_key=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column(
            "white_player_id",
            sa.String(36),
            sa.ForeignKey("players.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "black_player_id",
            sa.String(36),
            sa.ForeignKey("players.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="waiting"),
        sa.Column(
            "winner_id",
            sa.String(36),
            sa.ForeignKey("players.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("win_type", sa.String(20), nullable=True),
        sa.Column("final_score", sa.Integer, nullable=True),
        sa.Column("game_state", sa.JSON, nullable=True),
        sa.Column("finished_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_tables_status", "tables", ["status"])
    op.create_index("ix_tables_white_player_id", "tables", ["white_player_id"])
    op.create_index("ix_tables_black_player_id", "tables", ["black_player_id"])

    # ── Move records table ───────────────────────────────────────────────
    op.create_table(
        "move_records",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "table_id",
            sa.String(8),
            sa.ForeignKey("tables.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "player_id",
            sa.String(36),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("move_number", sa.Integer, nullable=False),
        sa.Column("dice_roll", sa.String(10), nullable=False),
        sa.Column("moves_notation", sa.String(200), nullable=False),
        sa.Column("game_state_after", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_move_records_table_id", "move_records", ["table_id"])
    op.create_index("ix_move_records_player_id", "move_records", ["player_id"])

    # ── Player stats table ───────────────────────────────────────────────
    op.create_table(
        "player_stats",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "player_id",
            sa.String(36),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "opponent_id",
            sa.String(36),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("games_played", sa.Integer, nullable=False, server_default="0"),
        sa.Column("games_won", sa.Integer, nullable=False, server_default="0"),
        sa.Column("games_lost", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_points_won", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_points_lost", sa.Integer, nullable=False, server_default="0"),
        sa.Column("gammons_won", sa.Integer, nullable=False, server_default="0"),
        sa.Column("gammons_lost", sa.Integer, nullable=False, server_default="0"),
        sa.Column("backgammons_won", sa.Integer, nullable=False, server_default="0"),
        sa.Column("backgammons_lost", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint("player_id", "opponent_id", name="uq_player_opponent"),
    )
    op.create_index("ix_player_stats_player_id", "player_stats", ["player_id"])
    op.create_index("ix_player_stats_opponent_id", "player_stats", ["opponent_id"])


def downgrade() -> None:
    op.drop_table("player_stats")
    op.drop_table("move_records")
    op.drop_table("tables")
    op.drop_table("players")
