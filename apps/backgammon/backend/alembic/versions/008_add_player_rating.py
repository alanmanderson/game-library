"""Add rating and rating_games columns to players.

Revision ID: 008
Revises: 007
"""

from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("players", sa.Column("rating", sa.Integer(), nullable=False, server_default="1500"))
    op.add_column("players", sa.Column("rating_games", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("players", "rating_games")
    op.drop_column("players", "rating")
