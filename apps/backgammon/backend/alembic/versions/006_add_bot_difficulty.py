"""Add bot_difficulty column to tables.

Revision ID: 006
Revises: 005
"""

from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tables", sa.Column("bot_difficulty", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("tables", "bot_difficulty")
