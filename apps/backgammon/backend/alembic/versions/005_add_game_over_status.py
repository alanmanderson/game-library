"""Add game_over to table status check constraint.

Revision ID: 005
Revises: 004
Create Date: 2026-04-11

"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _drop_status_check_constraints():
    """Drop all check constraints on tables.status, regardless of name.

    PostgreSQL may auto-name constraints differently than the explicit name
    we use, so find and drop them by inspecting the catalog.
    """
    conn = op.get_bind()
    rows = conn.execute(text(
        "SELECT conname FROM pg_constraint "
        "WHERE conrelid = 'tables'::regclass "
        "AND contype = 'c' "
        "AND pg_get_constraintdef(oid) LIKE '%status%'"
    )).fetchall()
    for (name,) in rows:
        op.drop_constraint(name, "tables", type_="check")


def upgrade() -> None:
    _drop_status_check_constraints()
    op.create_check_constraint(
        "ck_tables_status",
        "tables",
        "status IN ('waiting', 'playing', 'game_over', 'finished')",
    )


def downgrade() -> None:
    _drop_status_check_constraints()
    op.create_check_constraint(
        "ck_tables_status",
        "tables",
        "status IN ('waiting', 'playing', 'finished')",
    )
