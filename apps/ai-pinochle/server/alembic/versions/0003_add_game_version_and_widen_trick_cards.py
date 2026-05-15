"""Add version column to games + widen tricks card columns to fit '10X' codes.

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-14

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "games",
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
    )
    # Card codes are up to 3 chars (e.g. "10S"); migration 0001 used String(2).
    for col in ("north_card", "east_card", "south_card", "west_card"):
        op.alter_column("tricks", col, type_=sa.String(3), existing_nullable=True)


def downgrade() -> None:
    for col in ("north_card", "east_card", "south_card", "west_card"):
        op.alter_column("tricks", col, type_=sa.String(2), existing_nullable=True)
    op.drop_column("games", "version")
