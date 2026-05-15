"""Add status column to game_analyses for background analysis tracking.

3-ply analysis runs as a background job. The status column tracks
whether analysis is running, complete, or failed so the frontend
can poll for progress.

Revision ID: 021
Revises: 020
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "game_analyses",
        sa.Column("status", sa.String(20), nullable=False, server_default="complete"),
    )


def downgrade() -> None:
    op.drop_column("game_analyses", "status")
