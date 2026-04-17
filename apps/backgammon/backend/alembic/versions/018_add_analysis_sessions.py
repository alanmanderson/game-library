"""Add analysis_sessions and analysis_session_moves tables.

Revision ID: 018
Revises: 017
Create Date: 2026-04-16
"""

from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analysis_sessions",
        sa.Column("id", sa.String(8), primary_key=True),
        sa.Column(
            "player_id",
            sa.String(36),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("game_type", sa.String(10), nullable=False, server_default="money"),
        sa.Column("match_length", sa.Integer, nullable=True),
        sa.Column("player_color", sa.String(5), nullable=False, server_default="white"),
        sa.Column("gnubg_ply", sa.Integer, nullable=False, server_default="2"),
        sa.Column("auto_analysis", sa.String(20), nullable=False, server_default="off"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("result", sa.String(20), nullable=True),
        sa.Column("loaded_from", sa.JSON, nullable=True),
        sa.Column("game_state_json", sa.JSON, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('active', 'completed', 'abandoned')",
            name="ck_analysis_session_status",
        ),
    )

    op.create_table(
        "analysis_session_moves",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(8),
            sa.ForeignKey("analysis_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("game_number", sa.Integer, nullable=False, server_default="1"),
        sa.Column("move_number", sa.Integer, nullable=False),
        sa.Column("player", sa.String(5), nullable=False),
        sa.Column("dice_roll", sa.String(10), nullable=False),
        sa.Column("move_notation", sa.String(200), nullable=False),
        sa.Column("position_snapshot", sa.JSON, nullable=True),
        sa.Column("best_move_notation", sa.String(200), nullable=True),
        sa.Column("equity", sa.Float, nullable=True),
        sa.Column("best_equity", sa.Float, nullable=True),
        sa.Column("equity_loss", sa.Float, nullable=True),
        sa.Column("quality", sa.String(20), nullable=True),
        sa.Column("best_probs_json", sa.JSON, nullable=True),
        sa.Column("chosen_probs_json", sa.JSON, nullable=True),
        sa.Column("annotation", sa.String(1000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("analysis_session_moves")
    op.drop_table("analysis_sessions")
