"""Add first_name and last_name to users

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-02

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("first_name", sa.String(), nullable=False, server_default=""))
    op.add_column("users", sa.Column("last_name", sa.String(), nullable=False, server_default=""))

    # Backfill: use email prefix for first_name where available
    op.execute(
        "UPDATE users SET first_name = split_part(email, '@', 1) "
        "WHERE email IS NOT NULL AND first_name = ''"
    )
    # Fallback: use username for any remaining rows
    op.execute(
        "UPDATE users SET first_name = username WHERE first_name = ''"
    )


def downgrade() -> None:
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
