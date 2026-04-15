"""Add daily/weekly challenges and per-player progress tracking.

Revision ID: 014
Revises: 013
"""

from alembic import op
import sqlalchemy as sa


revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


# Seed templates for the initial set of challenges. New challenges can be added
# later via subsequent migrations; existing PlayerChallenge rows reference these
# by their string id so renaming requires a data migration.
SEED_CHALLENGES: list[dict] = [
    {
        "id": "daily_play_3",
        "name": "Play 3 Games",
        "description": "Play any 3 games today.",
        "type": "daily",
        "target": 3,
        "metric": "games",
        "reward_points": 10,
    },
    {
        "id": "daily_win_2",
        "name": "Win 2 Games",
        "description": "Win 2 games today.",
        "type": "daily",
        "target": 2,
        "metric": "wins",
        "reward_points": 25,
    },
    {
        "id": "daily_gammon",
        "name": "Score a Gammon",
        "description": "Win a game by gammon or backgammon.",
        "type": "daily",
        "target": 1,
        "metric": "gammons",
        "reward_points": 40,
    },
    {
        "id": "weekly_play_10",
        "name": "Play 10 Games",
        "description": "Play 10 games this week.",
        "type": "weekly",
        "target": 10,
        "metric": "games",
        "reward_points": 50,
    },
    {
        "id": "weekly_beat_hard_bot",
        "name": "Beat a Hard or Expert Bot",
        "description": "Win a game against a Hard or Expert bot.",
        "type": "weekly",
        "target": 1,
        "metric": "wins_vs_hard_bot",
        "reward_points": 75,
    },
]


def upgrade() -> None:
    op.create_table(
        "challenges",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("target", sa.Integer(), nullable=False),
        sa.Column("metric", sa.String(64), nullable=False),
        sa.Column("reward_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
        sa.CheckConstraint("type IN ('daily', 'weekly')", name="ck_challenges_type"),
    )

    op.create_table(
        "player_challenges",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "player_id",
            sa.String(36),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "challenge_id",
            sa.String(64),
            sa.ForeignKey("challenges.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("period_key", sa.String(16), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "player_id", "challenge_id", "period_key", name="uq_player_challenge_period"
        ),
    )

    op.add_column(
        "players",
        sa.Column(
            "challenge_points",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    # Seed default challenge templates.
    challenges_tbl = sa.table(
        "challenges",
        sa.column("id", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("type", sa.String),
        sa.column("target", sa.Integer),
        sa.column("metric", sa.String),
        sa.column("reward_points", sa.Integer),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        challenges_tbl,
        [{**c, "is_active": True} for c in SEED_CHALLENGES],
    )


def downgrade() -> None:
    op.drop_column("players", "challenge_points")
    op.drop_table("player_challenges")
    op.drop_table("challenges")
