"""Add tournament tables.

Revision ID: 010
Revises: 009
"""

from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tournaments",
        sa.Column("id", sa.String(8), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("max_players", sa.Integer(), nullable=False),
        sa.Column("match_points", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("status", sa.String(20), nullable=False, server_default="registering"),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("players.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("winner_id", sa.String(36), sa.ForeignKey("players.id", ondelete="SET NULL"), nullable=True),
        sa.CheckConstraint("status IN ('registering', 'in_progress', 'completed')", name="ck_tournaments_status"),
    )

    op.create_table(
        "tournament_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tournament_id", sa.String(8), sa.ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("player_id", sa.String(36), sa.ForeignKey("players.id", ondelete="SET NULL"), nullable=True),
        sa.Column("seed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("eliminated", sa.Boolean(), nullable=False, server_default="false"),
        sa.UniqueConstraint("tournament_id", "player_id", name="uq_tournament_player"),
    )
    op.create_index("ix_tournament_entries_tournament_id", "tournament_entries", ["tournament_id"])
    op.create_index("ix_tournament_entries_player_id", "tournament_entries", ["player_id"])

    op.create_table(
        "tournament_matches",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tournament_id", sa.String(8), sa.ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("match_number", sa.Integer(), nullable=False),
        sa.Column("player1_id", sa.String(36), sa.ForeignKey("players.id", ondelete="SET NULL"), nullable=True),
        sa.Column("player2_id", sa.String(36), sa.ForeignKey("players.id", ondelete="SET NULL"), nullable=True),
        sa.Column("table_id", sa.String(8), sa.ForeignKey("tables.id", ondelete="SET NULL"), nullable=True),
        sa.Column("winner_id", sa.String(36), sa.ForeignKey("players.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.CheckConstraint("status IN ('pending', 'playing', 'completed', 'bye')", name="ck_tournament_match_status"),
    )
    op.create_index("ix_tournament_matches_tournament_id", "tournament_matches", ["tournament_id"])


def downgrade() -> None:
    op.drop_index("ix_tournament_matches_tournament_id", table_name="tournament_matches")
    op.drop_table("tournament_matches")
    op.drop_index("ix_tournament_entries_player_id", table_name="tournament_entries")
    op.drop_index("ix_tournament_entries_tournament_id", table_name="tournament_entries")
    op.drop_table("tournament_entries")
    op.drop_table("tournaments")
