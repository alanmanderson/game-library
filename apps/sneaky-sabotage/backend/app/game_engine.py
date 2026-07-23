"""Core game logic for Sneaky Sabotage.

Manages state transitions, role assignment, scoring, and voting for a single game.
All state is kept in the database — this module provides pure logic functions.
"""

import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Game,
    GameStatus,
    Player,
    PlayerRole,
    Role,
    Round,
    RoundStatus,
    Vote,
)
from app.puzzle_loader import get_puzzle, pick_puzzle


def generate_game_id() -> str:
    """Generate a 6-character uppercase alphanumeric game code."""
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I/O/0/1 for readability
    return "".join(random.choices(chars, k=6))


def generate_session_token() -> str:
    return uuid.uuid4().hex


async def create_game(
    db: AsyncSession,
    player_name: str,
    timer_seconds: int = 300,
    max_rounds: int = 4,
) -> tuple[Game, Player]:
    """Create a new game and add the host player."""
    game_id = generate_game_id()
    game = Game(
        id=game_id,
        status=GameStatus.LOBBY.value,
        timer_seconds=timer_seconds,
        max_rounds=max_rounds,
    )
    db.add(game)

    player = Player(
        id=str(uuid.uuid4()),
        game_id=game_id,
        name=player_name,
        is_host=True,
        session_token=generate_session_token(),
    )
    db.add(player)
    await db.flush()
    return game, player


async def join_game(
    db: AsyncSession,
    game_id: str,
    player_name: str,
) -> Player:
    """Add a player to an existing game in lobby status."""
    game = await db.get(Game, game_id)
    if not game:
        raise ValueError("Game not found")
    if game.status != GameStatus.LOBBY.value:
        raise ValueError("Game already started")

    player = Player(
        id=str(uuid.uuid4()),
        game_id=game_id,
        name=player_name,
        is_host=False,
        session_token=generate_session_token(),
    )
    db.add(player)
    await db.flush()
    return player


async def get_game_with_players(db: AsyncSession, game_id: str) -> Game | None:
    result = await db.execute(
        select(Game)
        .where(Game.id == game_id)
        .options(selectinload(Game.players))
    )
    return result.scalar_one_or_none()


async def get_current_round(db: AsyncSession, game_id: str) -> Round | None:
    game = await db.get(Game, game_id)
    if not game or game.current_round == 0:
        return None
    result = await db.execute(
        select(Round)
        .where(Round.game_id == game_id, Round.round_number == game.current_round)
        .options(
            selectinload(Round.player_roles),
            selectinload(Round.votes),
        )
    )
    return result.scalar_one_or_none()


def _assign_roles(player_ids: list[str]) -> dict[str, Role]:
    """Assign roles with one extra card discarded (like the physical game).

    Creates a deck of: enough Agent cards + 1 Saboteur + 1 Insider.
    Shuffles and deals, leaving one card undealt. This means any role
    might be the discarded one — there's no guarantee a Saboteur or
    Insider is actually in play each round.
    """
    n = len(player_ids)
    # Build the role deck: n+1 cards (one will be discarded)
    deck: list[Role] = []
    deck.append(Role.SABOTEUR)
    if n >= 4:
        deck.append(Role.INSIDER)
    # Fill remaining with agents
    while len(deck) < n + 1:
        deck.append(Role.AGENT)

    random.shuffle(deck)
    # Deal n cards, discard the last one
    assignments = {}
    for i, pid in enumerate(player_ids):
        assignments[pid] = deck[i]
    return assignments


async def start_round(db: AsyncSession, game_id: str) -> Round:
    """Start a new round: pick puzzle, assign roles."""
    game = await get_game_with_players(db, game_id)
    if not game:
        raise ValueError("Game not found")

    player_ids = [p.id for p in game.players if p.connected]
    if len(player_ids) < 3:
        raise ValueError("Need at least 3 connected players")

    # Find previously used puzzle IDs
    prev_rounds = await db.execute(
        select(Round.puzzle_id).where(Round.game_id == game_id)
    )
    used_puzzle_ids = [r[0] for r in prev_rounds.all()]

    puzzle = pick_puzzle(exclude_ids=used_puzzle_ids)
    game.current_round += 1
    game.status = GameStatus.PLAYING.value

    rnd = Round(
        game_id=game_id,
        round_number=game.current_round,
        puzzle_id=puzzle.id,
        status=RoundStatus.ROLE_REVEAL.value,
    )
    db.add(rnd)
    await db.flush()

    # Assign roles
    role_map = _assign_roles(player_ids)
    for pid, role in role_map.items():
        pr = PlayerRole(round_id=rnd.id, player_id=pid, role=role.value)
        db.add(pr)
    await db.flush()

    return rnd


async def advance_to_solving(db: AsyncSession, round_id: int) -> Round:
    """Move from role_reveal to solving phase (start timer)."""
    rnd = await db.get(Round, round_id)
    if not rnd or rnd.status != RoundStatus.ROLE_REVEAL.value:
        raise ValueError("Round not in role_reveal status")
    rnd.status = RoundStatus.SOLVING.value
    rnd.timer_started_at = datetime.now(timezone.utc)
    await db.flush()
    return rnd


async def submit_answer(db: AsyncSession, round_id: int, answer: str) -> bool:
    """Submit the team's answer. Returns True if correct."""
    rnd = await db.get(Round, round_id)
    if not rnd or rnd.status != RoundStatus.SOLVING.value:
        raise ValueError("Round not in solving status")

    puzzle = get_puzzle(rnd.puzzle_id)
    if not puzzle:
        raise ValueError("Puzzle not found")

    is_correct = answer.upper().strip() == puzzle.answer
    rnd.answer_submitted = answer.strip()
    rnd.is_correct = is_correct
    rnd.status = RoundStatus.VOTING.value
    await db.flush()
    return is_correct


async def time_expired(db: AsyncSession, round_id: int) -> None:
    """Handle timer expiration — move to voting with no answer."""
    rnd = await db.get(Round, round_id)
    if not rnd or rnd.status != RoundStatus.SOLVING.value:
        return
    rnd.is_correct = False
    rnd.status = RoundStatus.VOTING.value
    await db.flush()


async def cast_vote(
    db: AsyncSession,
    round_id: int,
    voter_id: str,
    accused_id: str,
) -> Vote:
    """Cast a vote for who the voter thinks is the Saboteur."""
    # Check for existing vote
    existing = await db.execute(
        select(Vote).where(
            Vote.round_id == round_id,
            Vote.voter_id == voter_id,
            Vote.is_saboteur_guess == False,  # noqa: E712
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Already voted")

    vote = Vote(
        round_id=round_id,
        voter_id=voter_id,
        accused_id=accused_id,
        is_saboteur_guess=False,
    )
    db.add(vote)
    await db.flush()
    return vote


async def saboteur_guess_insider(
    db: AsyncSession,
    round_id: int,
    saboteur_id: str,
    guessed_id: str,
) -> Vote:
    """The saboteur guesses who the insider is."""
    vote = Vote(
        round_id=round_id,
        voter_id=saboteur_id,
        accused_id=guessed_id,
        is_saboteur_guess=True,
    )
    db.add(vote)
    await db.flush()
    return vote


async def check_all_votes_in(db: AsyncSession, round_id: int) -> bool:
    """Check if all connected players have voted."""
    rnd = await db.execute(
        select(Round)
        .where(Round.id == round_id)
        .options(selectinload(Round.votes))
    )
    rnd = rnd.scalar_one_or_none()
    if not rnd:
        return False

    game = await get_game_with_players(db, rnd.game_id)
    connected_ids = {p.id for p in game.players if p.connected}

    player_votes = {v.voter_id for v in rnd.votes if not v.is_saboteur_guess}
    return connected_ids.issubset(player_votes)


async def calculate_scores(db: AsyncSession, round_id: int) -> dict:
    """Calculate scores for a completed round. Returns a dict of results."""
    result = await db.execute(
        select(Round)
        .where(Round.id == round_id)
        .options(
            selectinload(Round.player_roles),
            selectinload(Round.votes),
        )
    )
    rnd = result.scalar_one_or_none()
    if not rnd:
        raise ValueError("Round not found")

    game = await get_game_with_players(db, rnd.game_id)

    # Build role map
    role_map: dict[str, str] = {}
    saboteur_id: str | None = None
    insider_id: str | None = None
    for pr in rnd.player_roles:
        role_map[pr.player_id] = pr.role
        if pr.role == Role.SABOTEUR.value:
            saboteur_id = pr.player_id
        elif pr.role == Role.INSIDER.value:
            insider_id = pr.player_id

    scores: dict[str, int] = {p.id: 0 for p in game.players}
    events: list[dict] = []

    # Puzzle scoring
    if rnd.is_correct:
        # Correct answer: agents and insider get +10
        for pid, role in role_map.items():
            if role in (Role.AGENT.value, Role.INSIDER.value):
                scores[pid] += 10
        events.append({"type": "puzzle_correct", "points": 10})
    else:
        # Incorrect/no answer: saboteur gets +10
        if saboteur_id:
            scores[saboteur_id] += 10
        events.append({"type": "puzzle_incorrect", "points": 10})

    # Saboteur identification voting
    player_votes = [v for v in rnd.votes if not v.is_saboteur_guess]
    vote_counts: dict[str, int] = {}
    for v in player_votes:
        if v.accused_id:
            vote_counts[v.accused_id] = vote_counts.get(v.accused_id, 0) + 1

    for v in player_votes:
        if v.accused_id == saboteur_id:
            scores[v.voter_id] += 3
        elif saboteur_id:
            scores[saboteur_id] += 2

    correct_identifiers = [v.voter_id for v in player_votes if v.accused_id == saboteur_id]
    wrong_identifiers = [v.voter_id for v in player_votes if v.accused_id != saboteur_id]
    events.append({
        "type": "saboteur_votes",
        "correct": correct_identifiers,
        "wrong": wrong_identifiers,
    })

    # Saboteur guessing insider
    sab_guess = next((v for v in rnd.votes if v.is_saboteur_guess), None)
    if sab_guess and insider_id:
        if sab_guess.accused_id == insider_id:
            scores[saboteur_id] += 5
            scores[insider_id] -= 5
            events.append({"type": "insider_found", "correct": True})
        else:
            events.append({"type": "insider_found", "correct": False})

    # Apply scores to player totals
    for player in game.players:
        if player.id in scores:
            player.total_score += scores[player.id]

    rnd.status = RoundStatus.RESULTS.value
    await db.flush()

    # Build player name map
    name_map = {p.id: p.name for p in game.players}

    return {
        "round_number": rnd.round_number,
        "puzzle_correct": rnd.is_correct,
        "answer_submitted": rnd.answer_submitted,
        "correct_answer": get_puzzle(rnd.puzzle_id).answer if get_puzzle(rnd.puzzle_id) else None,
        "saboteur": {"id": saboteur_id, "name": name_map.get(saboteur_id, "")} if saboteur_id else None,
        "insider": {"id": insider_id, "name": name_map.get(insider_id, "")} if insider_id else None,
        "scores": {pid: {"name": name_map.get(pid, ""), "round_score": s, "total_score": next((p.total_score for p in game.players if p.id == pid), 0)} for pid, s in scores.items()},
        "vote_counts": {name_map.get(pid, pid): count for pid, count in vote_counts.items()},
        "events": events,
        "roles": {name_map.get(pid, pid): role for pid, role in role_map.items()},
    }


async def finish_round(db: AsyncSession, round_id: int) -> None:
    """Mark a round as complete."""
    rnd = await db.get(Round, round_id)
    if rnd:
        rnd.status = RoundStatus.COMPLETE.value
        await db.flush()


async def finish_game(db: AsyncSession, game_id: str) -> dict:
    """End the game and return final standings."""
    game = await get_game_with_players(db, game_id)
    if not game:
        raise ValueError("Game not found")
    game.status = GameStatus.FINISHED.value
    await db.flush()

    standings = sorted(
        [{"id": p.id, "name": p.name, "score": p.total_score} for p in game.players],
        key=lambda x: x["score"],
        reverse=True,
    )
    return {"standings": standings, "game_id": game_id}
