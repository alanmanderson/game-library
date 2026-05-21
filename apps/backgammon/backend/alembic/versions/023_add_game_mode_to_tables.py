"""Add game_mode column to tables.

Supports pass-and-play mode where two players share one device.
Defaults to "online" for all existing rows.

Revision ID: 021
Revises: 020
Create Date: 2026-05-21
"""

from alembic import op
import sqlalchemy as sa

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tables",
        sa.Column(
            "game_mode",
            sa.String(20),
            nullable=False,
            server_default="online",
        ),
    )


def downgrade() -> None:
    op.drop_column("tables", "game_mode")
