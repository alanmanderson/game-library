"""Create initial schema

Revision ID: 0001
Revises:
Create Date: 2026-02-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# PostgreSQL ENUM types defined once at module level so upgrade/downgrade share them.
game_status_enum = sa.Enum("IN_PROGRESS", "COMPLETED", "ABANDONED", name="game_status")
suit_enum = sa.Enum("CLUBS", "DIAMONDS", "HEARTS", "SPADES", name="suit")


def upgrade() -> None:
    bind = op.get_bind()
    game_status_enum.create(bind, checkfirst=True)
    suit_enum.create(bind, checkfirst=True)

    # ------------------------------------------------------------------
    # users
    # ------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("google_auth_id", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.UniqueConstraint("username", name="uq_users_username"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("google_auth_id", name="uq_users_google_auth_id"),
    )

    # ------------------------------------------------------------------
    # games
    # ------------------------------------------------------------------
    op.create_table(
        "games",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("room_code", sa.String(6), nullable=False),
        sa.Column(
            "status",
            sa.Enum("IN_PROGRESS", "COMPLETED", "ABANDONED", name="game_status", create_type=False),
            nullable=False,
            server_default="IN_PROGRESS",
        ),
        sa.Column(
            "north_player_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_games_north_player"),
            nullable=True,
        ),
        sa.Column(
            "east_player_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_games_east_player"),
            nullable=True,
        ),
        sa.Column(
            "south_player_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_games_south_player"),
            nullable=True,
        ),
        sa.Column(
            "west_player_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_games_west_player"),
            nullable=True,
        ),
        sa.Column("ns_total_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ew_total_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_state_json", postgresql.JSONB(), nullable=True),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("ended_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.UniqueConstraint("room_code", name="uq_games_room_code"),
    )
    op.create_index("ix_games_room_code", "games", ["room_code"])
    op.create_index("ix_games_status", "games", ["status"])

    # ------------------------------------------------------------------
    # hands
    # ------------------------------------------------------------------
    op.create_table(
        "hands",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "game_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("games.id", ondelete="CASCADE", name="fk_hands_game"),
            nullable=False,
        ),
        sa.Column("hand_number", sa.Integer(), nullable=False),
        sa.Column(
            "winning_bidder_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_hands_winning_bidder"),
            nullable=True,
        ),
        sa.Column("winning_bid_amount", sa.Integer(), nullable=True),
        sa.Column(
            "is_shoot_the_moon",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "trump_suit",
            sa.Enum("CLUBS", "DIAMONDS", "HEARTS", "SPADES", name="suit", create_type=False),
            nullable=True,
        ),
        sa.Column("ns_meld_score", sa.Integer(), nullable=True),
        sa.Column("ew_meld_score", sa.Integer(), nullable=True),
        sa.Column("ns_trick_score", sa.Integer(), nullable=True),
        sa.Column("ew_trick_score", sa.Integer(), nullable=True),
        sa.Column("is_set", sa.Boolean(), nullable=True),
    )
    op.create_index("ix_hands_game_id", "hands", ["game_id"])

    # ------------------------------------------------------------------
    # bids
    # ------------------------------------------------------------------
    op.create_table(
        "bids",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "hand_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("hands.id", ondelete="CASCADE", name="fk_bids_hand"),
            nullable=False,
        ),
        sa.Column(
            "player_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_bids_player"),
            nullable=False,
        ),
        # NULL bid_amount means the player passed.
        sa.Column("bid_amount", sa.Integer(), nullable=True),
        sa.Column(
            "is_shoot_the_moon",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("bid_sequence", sa.Integer(), nullable=False),
    )
    op.create_index("ix_bids_hand_id", "bids", ["hand_id"])

    # ------------------------------------------------------------------
    # tricks
    # ------------------------------------------------------------------
    op.create_table(
        "tricks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "hand_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("hands.id", ondelete="CASCADE", name="fk_tricks_hand"),
            nullable=False,
        ),
        sa.Column("trick_number", sa.Integer(), nullable=False),
        sa.Column(
            "led_by_player_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_tricks_led_by"),
            nullable=True,
        ),
        sa.Column(
            "won_by_player_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", name="fk_tricks_won_by"),
            nullable=True,
        ),
        # Card codes use single-letter rank (A/T/K/Q/J/9) + suit initial (H/S/D/C), e.g. "AH", "TS".
        sa.Column("north_card", sa.String(2), nullable=True),
        sa.Column("east_card", sa.String(2), nullable=True),
        sa.Column("south_card", sa.String(2), nullable=True),
        sa.Column("west_card", sa.String(2), nullable=True),
        sa.Column("trick_points", sa.Integer(), nullable=True),
    )
    op.create_index("ix_tricks_hand_id", "tricks", ["hand_id"])


def downgrade() -> None:
    op.drop_table("tricks")
    op.drop_table("bids")
    op.drop_table("hands")
    op.drop_table("games")
    op.drop_table("users")

    bind = op.get_bind()
    suit_enum.drop(bind, checkfirst=True)
    game_status_enum.drop(bind, checkfirst=True)
