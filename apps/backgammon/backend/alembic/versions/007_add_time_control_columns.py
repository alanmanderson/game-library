"""Add time control columns to tables.

Revision ID: 007
Revises: 006
"""

from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tables", sa.Column("time_control", sa.String(20), nullable=False, server_default="unlimited"))
    op.add_column("tables", sa.Column("white_time_remaining_ms", sa.Integer(), nullable=True))
    op.add_column("tables", sa.Column("black_time_remaining_ms", sa.Integer(), nullable=True))
    op.add_column("tables", sa.Column("turn_started_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("tables", "turn_started_at")
    op.drop_column("tables", "black_time_remaining_ms")
    op.drop_column("tables", "white_time_remaining_ms")
    op.drop_column("tables", "time_control")
