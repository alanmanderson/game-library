"""Add ply and analysis_source columns to game_analyses.

Supports per-ply caching: the analysis endpoint now accepts a ply
parameter (0, 2, 3) and stores which depth was used so it can
serve the correct cached result or recompute when depth changes.

Revision ID: 020
Revises: 019
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("game_analyses", sa.Column("ply", sa.Integer(), nullable=True))
    op.add_column("game_analyses", sa.Column("analysis_source", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("game_analyses", "analysis_source")
    op.drop_column("game_analyses", "ply")
