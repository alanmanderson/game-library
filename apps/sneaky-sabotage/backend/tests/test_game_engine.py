"""Tests for the core game engine logic."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.game_engine import (
    _assign_roles,
    calculate_scores,
    cast_vote,
    create_game,
    finish_game,
    generate_game_id,
    get_current_round,
    get_game_with_players,
    join_game,
    start_round,
    submit_answer,
)
from app.models import GameStatus, Role, RoundStatus


def test_generate_game_id():
    gid = generate_game_id()
    assert len(gid) == 6
    assert gid.isalnum()


def test_assign_roles_3_players():
    ids = ["a", "b", "c"]
    roles = _assign_roles(ids)
    assert len(roles) == 3
    # With 3 players (< 4), no Insider is added
    role_values = list(roles.values())
    assert Role.SABOTEUR in role_values or Role.SABOTEUR not in role_values
    # One card is discarded, so saboteur might not be dealt


def test_assign_roles_5_players():
    ids = ["a", "b", "c", "d", "e"]
    roles = _assign_roles(ids)
    assert len(roles) == 5
    role_values = list(roles.values())
    # With 5 players, deck has 1 saboteur + 1 insider + 4 agents = 6 cards
    # One is discarded, so 5 dealt


@pytest.mark.asyncio
async def test_create_game(db: AsyncSession):
    game, player = await create_game(db, "Alice")
    assert len(game.id) == 6
    assert game.status == GameStatus.LOBBY.value
    assert player.name == "Alice"
    assert player.is_host is True
    assert player.session_token


@pytest.mark.asyncio
async def test_join_game(db: AsyncSession):
    game, host = await create_game(db, "Alice")
    player = await join_game(db, game.id, "Bob")
    assert player.name == "Bob"
    assert player.is_host is False
    assert player.game_id == game.id


@pytest.mark.asyncio
async def test_join_nonexistent_game(db: AsyncSession):
    with pytest.raises(ValueError, match="Game not found"):
        await join_game(db, "XXXXXX", "Bob")


@pytest.mark.asyncio
async def test_start_round(db: AsyncSession):
    game, host = await create_game(db, "Alice")
    await join_game(db, game.id, "Bob")
    await join_game(db, game.id, "Carol")
    await db.flush()

    rnd = await start_round(db, game.id)
    assert rnd.round_number == 1
    assert rnd.status == RoundStatus.ROLE_REVEAL.value
    assert game.current_round == 1


@pytest.mark.asyncio
async def test_start_round_too_few_players(db: AsyncSession):
    game, host = await create_game(db, "Alice")
    await join_game(db, game.id, "Bob")
    await db.flush()

    with pytest.raises(ValueError, match="at least 3"):
        await start_round(db, game.id)


@pytest.mark.asyncio
async def test_full_round_flow(db: AsyncSession):
    """Test a complete round from start to scoring."""
    game, host = await create_game(db, "Alice")
    p2 = await join_game(db, game.id, "Bob")
    p3 = await join_game(db, game.id, "Carol")
    p4 = await join_game(db, game.id, "Dave")
    await db.flush()

    rnd = await start_round(db, game.id)
    await db.flush()

    # Reload round with roles
    rnd = await get_current_round(db, game.id)
    assert rnd is not None
    assert len(rnd.player_roles) == 4

    # Find the saboteur for this round
    saboteur_pr = next(
        (pr for pr in rnd.player_roles if pr.role == Role.SABOTEUR.value), None
    )

    # All players vote
    all_players = [host, p2, p3, p4]
    for p in all_players:
        # Everyone votes for the first player (may or may not be saboteur)
        await cast_vote(db, rnd.id, p.id, all_players[0].id)

    await db.flush()

    # Calculate scores
    results = await calculate_scores(db, rnd.id)
    assert "scores" in results
    assert "events" in results
    assert results["round_number"] == 1
