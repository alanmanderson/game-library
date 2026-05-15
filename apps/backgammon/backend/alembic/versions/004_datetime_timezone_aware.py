"""Make all datetime columns timezone-aware and add missing columns.

Revision ID: 004
Revises: 003
Create Date: 2026-03-28

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Existing columns that need timezone=True
ALTER_COLUMNS = [
    ("players", "created_at", False),
    ("tables", "created_at", False),
    ("tables", "finished_at", True),
    ("move_records", "created_at", False),
]


def upgrade() -> None:
    # Add missing updated_at columns
    op.add_column(
        "tables",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "player_stats",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Convert existing datetime columns to timezone-aware
    for table, column, nullable in ALTER_COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=nullable,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )


def downgrade() -> None:
    for table, column, nullable in ALTER_COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(),
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=nullable,
        )

    op.drop_column("player_stats", "updated_at")
    op.drop_column("tables", "updated_at")
