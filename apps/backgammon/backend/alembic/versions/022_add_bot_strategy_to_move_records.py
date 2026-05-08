"""Add bot_strategy column to move_records.

Tracks which bot engine/strategy was used for each bot move
(e.g. gnubg, v2_nn, v1_nn, opening_book, bearoff_db, race,
heuristic, random).  NULL for human moves.

Revision ID: 022
Revises: 021
Create Date: 2026-05-08
"""

from alembic import op
import sqlalchemy as sa

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "move_records",
        sa.Column("bot_strategy", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("move_records", "bot_strategy")
