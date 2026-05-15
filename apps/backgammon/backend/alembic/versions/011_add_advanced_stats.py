"""Add advanced stats: rating_history table + cube counters on players.

Revision ID: 011
Revises: 010
"""

from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Cube action counters on players (lifetime totals)
    op.add_column(
        "players",
        sa.Column("cube_offers", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "players",
        sa.Column("cube_accepts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "players",
        sa.Column("cube_declines", sa.Integer(), nullable=False, server_default="0"),
    )

    # Per-game ELO rating snapshots
    op.create_table(
        "rating_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "player_id",
            sa.String(36),
            sa.ForeignKey("players.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("rating_change", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "opponent_id",
            sa.String(36),
            sa.ForeignKey("players.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "table_id",
            sa.String(8),
            sa.ForeignKey("tables.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_rating_history_player_id", "rating_history", ["player_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_rating_history_player_id", table_name="rating_history")
    op.drop_table("rating_history")
    op.drop_column("players", "cube_declines")
    op.drop_column("players", "cube_accepts")
    op.drop_column("players", "cube_offers")
