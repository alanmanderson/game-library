"""Add seasons, league tiers via rating, and is_ranked flag on tables.

Revision ID: 013
Revises: 012
"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Season table — defined start/end dates, single is_active season at a time.
    op.create_table(
        "seasons",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Seed "Spring 2026" as the currently active season. Covers Mar-May 2026.
    seasons = sa.table(
        "seasons",
        sa.column("name", sa.String),
        sa.column("start_date", sa.DateTime(timezone=True)),
        sa.column("end_date", sa.DateTime(timezone=True)),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        seasons,
        [
            {
                "name": "Spring 2026",
                "start_date": datetime(2026, 3, 1, tzinfo=timezone.utc),
                "end_date": datetime(2026, 5, 31, 23, 59, 59, tzinfo=timezone.utc),
                "is_active": True,
            }
        ],
    )

    # is_ranked flag on tables — default True so existing tables count as ranked.
    op.add_column(
        "tables",
        sa.Column(
            "is_ranked",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )

    # TODO: Season history — a PlayerSeasonStats table (player_id, season_id,
    # end_rating, peak_rating, wins, losses, tier_final) is intentionally
    # deferred. Until it exists, season history UI has no data to show.


def downgrade() -> None:
    op.drop_column("tables", "is_ranked")
    op.drop_table("seasons")
