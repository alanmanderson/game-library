"""Add cosmetic preferences: board_theme + checker_style on players.

Revision ID: 012
Revises: 011
"""

from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "players",
        sa.Column(
            "board_theme",
            sa.String(64),
            nullable=False,
            server_default="classic",
        ),
    )
    op.add_column(
        "players",
        sa.Column(
            "checker_style",
            sa.String(64),
            nullable=False,
            server_default="classic",
        ),
    )


def downgrade() -> None:
    op.drop_column("players", "checker_style")
    op.drop_column("players", "board_theme")
