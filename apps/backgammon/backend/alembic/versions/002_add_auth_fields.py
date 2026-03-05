"""Add authentication fields to players table.

Revision ID: 002
Revises: 001
Create Date: 2026-03-04

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("players", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("players", sa.Column("password_hash", sa.String(255), nullable=True))
    op.add_column("players", sa.Column("google_id", sa.String(255), nullable=True))
    op.add_column(
        "players",
        sa.Column("is_guest", sa.Boolean, nullable=False, server_default="false"),
    )
    op.add_column(
        "players",
        sa.Column(
            "auth_provider", sa.String(20), nullable=False, server_default="local"
        ),
    )

    # Unique constraints (only when not null)
    op.create_unique_constraint("uq_players_email", "players", ["email"])
    op.create_unique_constraint("uq_players_google_id", "players", ["google_id"])


def downgrade() -> None:
    op.drop_constraint("uq_players_google_id", "players", type_="unique")
    op.drop_constraint("uq_players_email", "players", type_="unique")
    op.drop_column("players", "auth_provider")
    op.drop_column("players", "is_guest")
    op.drop_column("players", "google_id")
    op.drop_column("players", "password_hash")
    op.drop_column("players", "email")
