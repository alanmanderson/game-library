"""Tests for the bot player feature."""

import asyncio

import pytest

from app.services.bot_service import BOT_PLAYER_ID, ensure_bot_player, is_bot_player
from app.services.game_service import game_manager
from tests.conftest import (
    auth_headers,
    create_test_player,
    create_test_table,
)


class TestBotService:
    """Unit tests for bot_service functions."""

    async def test_is_bot_player(self):
        assert is_bot_player(BOT_PLAYER_ID) is True
        assert is_bot_player("some-other-id") is False

    async def test_ensure_bot_player_creates(self, db_session):
        bot = await ensure_bot_player(db_session)
        assert bot.id == BOT_PLAYER_ID
        assert bot.nickname == "Bot"
        assert bot.is_guest is True
        assert bot.auth_provider == "bot"

    async def test_ensure_bot_player_idempotent(self, db_session):
        bot1 = await ensure_bot_player(db_session)
        await db_session.flush()
        bot2 = await ensure_bot_player(db_session)
        assert bot1.id == bot2.id


class TestInviteBotEndpoint:
    """Tests for the POST /api/tables/{table_id}/invite-bot endpoint."""

    async def test_invite_bot_success(self, client):
        """Inviting bot to a waiting table starts the game."""
        auth = await create_test_player(client, "Alice")
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = await create_test_table(client, token, player_id)
        assert table["status"] == "waiting"

        resp = await client.post(
            f"/api/tables/{table['id']}/invite-bot",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "playing"

        # One of the players should be the bot
        players = [data.get("white_player"), data.get("black_player")]
        player_ids = [p["id"] for p in players if p]
        assert BOT_PLAYER_ID in player_ids
        assert player_id in player_ids

    async def test_invite_bot_nonexistent_table(self, client):
        """Inviting bot to a nonexistent table returns 400."""
        auth = await create_test_player(client, "Alice")
        resp = await client.post(
            "/api/tables/NOEXIST/invite-bot",
            json={},
            headers=auth_headers(auth["token"]),
        )
        assert resp.status_code == 400

    async def test_invite_bot_already_playing(self, client):
        """Inviting bot to a table that's already playing returns 400."""
        auth = await create_test_player(client, "Alice")
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = await create_test_table(client, token, player_id)

        # First invite succeeds
        resp = await client.post(
            f"/api/tables/{table['id']}/invite-bot",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200

        # Second invite fails
        resp = await client.post(
            f"/api/tables/{table['id']}/invite-bot",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

    async def test_invite_bot_unauthenticated(self, client):
        """Inviting bot without auth returns 401."""
        resp = await client.post("/api/tables/XXXXXX/invite-bot", json={})
        assert resp.status_code == 401

    async def test_invite_bot_creates_engine(self, client):
        """Inviting bot creates a game engine with correct player colors."""
        auth = await create_test_player(client, "Alice")
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = await create_test_table(client, token, player_id)
        table_id = table["id"]

        resp = await client.post(
            f"/api/tables/{table_id}/invite-bot",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200

        engine = game_manager.get_engine(table_id)
        assert engine is not None

        # Both players should have colors
        human_color = game_manager.get_player_color(table_id, player_id)
        bot_color = game_manager.get_player_color(table_id, BOT_PLAYER_ID)
        assert human_color is not None
        assert bot_color is not None
        assert human_color != bot_color


class TestBotGameplay:
    """Test that the bot logic correctly makes moves."""

    async def test_bot_makes_random_moves(self, client, db_session):
        """The bot should roll, make random moves, and end its turn."""
        from app.services.bot_service import get_bot_color, ensure_bot_player
        from app.game_engine import Color, GameStatus

        auth = await create_test_player(client, "Alice")
        token = auth["token"]
        player_id = auth["player"]["id"]

        table = await create_test_table(client, token, player_id)
        table_id = table["id"]

        # Create bot player in test DB and join
        await ensure_bot_player(db_session)
        await db_session.commit()

        resp = await client.post(
            f"/api/tables/{table_id}/invite-bot",
            json={},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200

        engine = game_manager.get_engine(table_id)
        assert engine is not None

        bot_color = get_bot_color(table_id)
        human_color = game_manager.get_player_color(table_id, player_id)
        assert bot_color is not None
        assert human_color is not None

        # If it's the human's turn first (from opening roll), simulate
        # a full turn so it becomes the bot's turn
        if engine.state.current_turn == human_color:
            # Human rolls if needed
            if engine.state.status == GameStatus.ROLLING:
                await game_manager.roll_dice(db_session, table_id, player_id)

            # Make all possible moves for human
            while engine.state.current_turn == human_color and engine.state.status == GameStatus.MOVING:
                moves = engine.get_valid_moves()
                if not moves:
                    await game_manager.end_turn(db_session, table_id, player_id)
                    break
                move = moves[0]
                await game_manager.make_move(db_session, table_id, player_id, move.from_point, move.to_point)
            await db_session.commit()

        # Now it should be the bot's turn
        assert engine.state.current_turn == bot_color

        # Simulate what the bot does: roll dice (if needed), make random moves
        if engine.state.status == GameStatus.ROLLING:
            await game_manager.roll_dice(db_session, table_id, BOT_PLAYER_ID)

        # Make all moves for the bot
        import random
        while engine.state.current_turn == bot_color and engine.state.status == GameStatus.MOVING:
            moves = engine.get_valid_moves()
            if not moves:
                await game_manager.end_turn(db_session, table_id, BOT_PLAYER_ID)
                break
            move = random.choice(moves)
            await game_manager.make_move(db_session, table_id, BOT_PLAYER_ID, move.from_point, move.to_point)

        await db_session.commit()

        # After bot's turn, it should be the human's turn again (unless game ended)
        if engine.state.status != GameStatus.FINISHED:
            assert engine.state.current_turn == human_color


class TestStatsSkipBot:
    """Verify that stats are not tracked for bot games."""

    async def test_stats_not_updated_for_bot_game(self, db_session):
        """update_stats should be a no-op when one player is the bot."""
        from app.services.stats_service import update_stats
        from app.game_engine import WinType

        await ensure_bot_player(db_session)

        # This should not create any PlayerStats records
        await update_stats(
            db_session,
            white_player_id="some-human",
            black_player_id=BOT_PLAYER_ID,
            winner_id="some-human",
            win_type=WinType.NORMAL,
        )
        await db_session.flush()

        from sqlalchemy import select
        from app.models import PlayerStats
        result = await db_session.execute(select(PlayerStats))
        stats = result.scalars().all()
        assert len(stats) == 0
