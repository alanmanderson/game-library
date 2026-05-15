"""Add game_analyses table to cache per-move ML analysis.

Revision ID: 015
Revises: 014
"""

from alembic import op
import sqlalchemy as sa


revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "game_analyses",
        sa.Column(
            "table_id",
            sa.String(8),
            sa.ForeignKey("tables.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("move_analyses", sa.JSON(), nullable=False),
        sa.Column(
            "ml_available",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
        sa.Column(
            "moves_analysed",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("game_analyses")
