"""Add player_season_stats table for per-player per-season history snapshots.

Persists a row per (player, season) so the Dashboard can show finished
seasons ("Spring 2026: Gold, 1704 rating, 12-8") alongside the current
in-progress season. Populated incrementally by
:func:`app.services.game_service._finish_game` on every rated game
finish and read by ``GET /api/players/{player_id}/season-history``.

Backfill for games finished before this migration ran is intentionally
deferred — the table simply starts empty and begins filling from the
first rated finalization after deploy. A one-shot backfill from
``Table`` + ``RatingHistory`` rows can be added later if needed.

Revision ID: 017
Revises: 016
"""

from alembic import op
import sqlalchemy as sa


revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "player_season_stats",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "player_id",
            sa.String(36),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "season_id",
            sa.Integer(),
            sa.ForeignKey("seasons.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("end_rating", sa.Integer(), nullable=False, server_default="1500"),
        sa.Column("peak_rating", sa.Integer(), nullable=False, server_default="1500"),
        sa.Column("wins", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("losses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("gammons_won", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("gammons_lost", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "tier_final",
            sa.String(16),
            nullable=False,
            server_default="Silver",
        ),
        sa.Column("games_played", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "player_id", "season_id", name="uq_player_season_stats_player_season"
        ),
    )


def downgrade() -> None:
    op.drop_table("player_season_stats")
