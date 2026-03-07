"""Add match play columns to tables.

Revision ID: 003
Revises: 002
Create Date: 2026-03-05

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tables",
        sa.Column("match_points", sa.Integer, nullable=False, server_default="5"),
    )
    op.add_column(
        "tables",
        sa.Column("white_match_score", sa.Integer, nullable=False, server_default="0"),
    )
    op.add_column(
        "tables",
        sa.Column("black_match_score", sa.Integer, nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("tables", "black_match_score")
    op.drop_column("tables", "white_match_score")
    op.drop_column("tables", "match_points")
