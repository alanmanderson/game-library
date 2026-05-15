"""Add missing index on Table.winner_id.

Dashboard and history queries filter the tables table by winner_id. Without
an index this is a full table scan as the table grows.

Note: ix_tables_white_player_id and ix_tables_black_player_id already exist
from migration 001, so only winner_id needs to be added here.

Revision ID: 019
Revises: 018
Create Date: 2026-04-25
"""

from alembic import op

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_tables_winner_id", "tables", ["winner_id"])


def downgrade() -> None:
    op.drop_index("ix_tables_winner_id", table_name="tables")
