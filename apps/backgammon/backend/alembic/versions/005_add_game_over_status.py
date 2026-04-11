"""Add game_over to table status check constraint.

Revision ID: 005
Revises: 004
Create Date: 2026-04-11

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_tables_status", "tables", type_="check")
    op.create_check_constraint(
        "ck_tables_status",
        "tables",
        "status IN ('waiting', 'playing', 'game_over', 'finished')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_tables_status", "tables", type_="check")
    op.create_check_constraint(
        "ck_tables_status",
        "tables",
        "status IN ('waiting', 'playing', 'finished')",
    )
