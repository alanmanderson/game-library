"""Add cube_action_records table for per-action cube decision analysis.

Each row captures a single cube action (offer / accept / decline) along
with the ML-evaluated equity BEFORE the action and a classification
verdict (best / borderline / mistake / blunder). Enables computing
cube-decision accuracy on the Advanced Stats dashboard.

Revision ID: 016
Revises: 015
"""

from alembic import op
import sqlalchemy as sa


revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cube_action_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "table_id",
            sa.String(8),
            sa.ForeignKey("tables.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "player_id",
            sa.String(36),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("cube_value_before", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("equity_before", sa.Float(), nullable=True),
        sa.Column("correct", sa.Boolean(), nullable=True),
        sa.Column("verdict", sa.String(16), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_cube_action_records_player_id",
        "cube_action_records",
        ["player_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_cube_action_records_player_id", table_name="cube_action_records"
    )
    op.drop_table("cube_action_records")
