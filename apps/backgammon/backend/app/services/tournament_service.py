"""Tournament service for managing single-elimination tournament brackets."""

import logging
import math
import random
import secrets
import string

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Tournament, TournamentEntry, TournamentMatch, Player, Table
from app.schemas import (
    TournamentCreate,
    TournamentResponse,
    TournamentEntryResponse,
    TournamentMatchResponse,
    TournamentBracketResponse,
)

logger = logging.getLogger(__name__)


def _generate_tournament_id() -> str:
    """Generate a short 8-char alphanumeric tournament ID."""
    chars = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(chars) for _ in range(8))


def _next_power_of_two(n: int) -> int:
    """Return the smallest power of 2 that is >= n."""
    return 1 << math.ceil(math.log2(max(n, 2)))


async def create_tournament(
    db: AsyncSession, data: TournamentCreate, creator_id: str
) -> Tournament:
    """Create a new tournament in 'registering' status."""
    tournament = Tournament(
        id=_generate_tournament_id(),
        name=data.name,
        max_players=data.max_players,
        match_points=data.match_points,
        status="registering",
        created_by=creator_id,
    )
    db.add(tournament)
    await db.flush()
    return tournament


async def register_player(
    db: AsyncSession, tournament_id: str, player_id: str
) -> TournamentEntry:
    """Register a player for a tournament.

    Raises ValueError if the tournament is not in 'registering' state,
    if it's already full, or if the player is already registered.
    """
    tournament = await db.get(Tournament, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.status != "registering":
        raise ValueError("Tournament is no longer accepting registrations")

    # Count current entries
    result = await db.execute(
        select(TournamentEntry).where(TournamentEntry.tournament_id == tournament_id)
    )
    entries = result.scalars().all()

    if len(entries) >= tournament.max_players:
        raise ValueError("Tournament is full")

    # Check for duplicate registration
    for entry in entries:
        if entry.player_id == player_id:
            raise ValueError("Player is already registered")

    entry = TournamentEntry(
        tournament_id=tournament_id,
        player_id=player_id,
        seed=len(entries) + 1,
        eliminated=False,
    )
    db.add(entry)
    await db.flush()
    return entry


async def start_tournament(db: AsyncSession, tournament_id: str) -> Tournament:
    """Start the tournament by generating a single-elimination bracket.

    Requires at least 2 registered players. Players are seeded in their
    registration order; BYEs are assigned to fill out the bracket to the
    next power of two.

    Raises ValueError if the tournament cannot be started.
    """
    tournament = await db.get(Tournament, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")
    if tournament.status != "registering":
        raise ValueError("Tournament has already started or is completed")

    # Load entries
    result = await db.execute(
        select(TournamentEntry)
        .where(TournamentEntry.tournament_id == tournament_id)
        .order_by(TournamentEntry.seed)
    )
    entries = result.scalars().all()

    if len(entries) < 2:
        raise ValueError("Need at least 2 players to start the tournament")

    # Determine bracket size (next power of 2)
    bracket_size = _next_power_of_two(len(entries))
    total_rounds = int(math.log2(bracket_size))

    # Shuffle entries for random seeding
    player_ids = [e.player_id for e in entries]
    random.shuffle(player_ids)

    # Pad with None (BYEs) to fill the bracket
    while len(player_ids) < bracket_size:
        player_ids.append(None)

    # Update seed order
    for i, entry in enumerate(entries):
        entry.seed = player_ids.index(entry.player_id) + 1

    # Create round 1 matches
    match_number = 1
    for i in range(0, bracket_size, 2):
        p1 = player_ids[i]
        p2 = player_ids[i + 1]

        # Determine match status
        if p1 is None and p2 is None:
            status = "bye"
            winner_id = None
        elif p1 is None:
            status = "bye"
            winner_id = p2
        elif p2 is None:
            status = "bye"
            winner_id = p1
        else:
            status = "pending"
            winner_id = None

        match = TournamentMatch(
            tournament_id=tournament_id,
            round_number=1,
            match_number=match_number,
            player1_id=p1,
            player2_id=p2,
            status=status,
            winner_id=winner_id,
        )
        db.add(match)
        match_number += 1

    # Create placeholder matches for subsequent rounds
    for round_num in range(2, total_rounds + 1):
        matches_in_round = bracket_size // (2 ** round_num)
        for mn in range(1, matches_in_round + 1):
            match = TournamentMatch(
                tournament_id=tournament_id,
                round_number=round_num,
                match_number=mn,
                status="pending",
            )
            db.add(match)

    tournament.status = "in_progress"
    await db.flush()

    # Process any BYE matches to advance players immediately
    await _advance_byes(db, tournament_id)

    return tournament


async def _advance_byes(db: AsyncSession, tournament_id: str) -> None:
    """Advance winners of BYE matches into the next round."""
    tournament = await db.get(Tournament, tournament_id)
    if not tournament:
        return

    result = await db.execute(
        select(TournamentMatch)
        .where(
            TournamentMatch.tournament_id == tournament_id,
            TournamentMatch.status == "bye",
        )
        .order_by(TournamentMatch.round_number, TournamentMatch.match_number)
    )
    bye_matches = result.scalars().all()

    for match in bye_matches:
        if match.winner_id:
            await _try_advance_winner(db, tournament_id, match)


async def process_match_completion(
    db: AsyncSession, tournament_id: str, table_id: str, winner_id: str
) -> None:
    """Record a match winner and advance them to the next round.

    Called when a tournament table's match is finished.
    """
    # Find the tournament match for this table
    result = await db.execute(
        select(TournamentMatch).where(
            TournamentMatch.tournament_id == tournament_id,
            TournamentMatch.table_id == table_id,
        )
    )
    match = result.scalars().first()
    if not match:
        return

    match.winner_id = winner_id
    match.status = "completed"
    await db.flush()

    await _try_advance_winner(db, tournament_id, match)
    await _check_tournament_completion(db, tournament_id)


async def _try_advance_winner(
    db: AsyncSession, tournament_id: str, completed_match: TournamentMatch
) -> None:
    """Place the winner of a completed/bye match into the next round's slot."""
    tournament = await db.get(Tournament, tournament_id)
    if not tournament or not completed_match.winner_id:
        return

    # Find next round match
    next_round = completed_match.round_number + 1
    # Match number in next round: ceil(current_match_number / 2)
    next_match_number = math.ceil(completed_match.match_number / 2)
    # Slot: odd match_number -> player1, even -> player2
    is_player1_slot = (completed_match.match_number % 2 == 1)

    result = await db.execute(
        select(TournamentMatch).where(
            TournamentMatch.tournament_id == tournament_id,
            TournamentMatch.round_number == next_round,
            TournamentMatch.match_number == next_match_number,
        )
    )
    next_match = result.scalars().first()

    if next_match is None:
        # This was the final round — winner is the tournament champion
        tournament.winner_id = completed_match.winner_id
        return

    # Place the winner into the appropriate slot
    if is_player1_slot:
        next_match.player1_id = completed_match.winner_id
    else:
        next_match.player2_id = completed_match.winner_id

    # If both players are now assigned and one is a BYE (None → same player twice),
    # check for instant-advance case: one player but no opponent
    if next_match.player1_id and next_match.player2_id is None:
        pass  # still waiting for the other player
    elif next_match.player1_id is None and next_match.player2_id:
        pass  # still waiting
    elif next_match.player1_id and next_match.player2_id:
        # Both players ready — match can be started (remains "pending")
        pass

    await db.flush()


async def _check_tournament_completion(db: AsyncSession, tournament_id: str) -> None:
    """Check if all matches are done and close out the tournament."""
    tournament = await db.get(Tournament, tournament_id)
    if not tournament or tournament.status == "completed":
        return

    result = await db.execute(
        select(TournamentMatch).where(
            TournamentMatch.tournament_id == tournament_id,
            TournamentMatch.status.not_in(["completed", "bye"]),
        )
    )
    pending = result.scalars().all()

    if not pending and tournament.winner_id:
        tournament.status = "completed"
        await db.flush()


async def get_bracket(db: AsyncSession, tournament_id: str) -> TournamentBracketResponse:
    """Build and return the full tournament bracket response."""
    tournament = await db.get(Tournament, tournament_id)
    if not tournament:
        raise ValueError("Tournament not found")

    # Load entries with player info
    entries_result = await db.execute(
        select(TournamentEntry)
        .where(TournamentEntry.tournament_id == tournament_id)
        .order_by(TournamentEntry.seed)
    )
    entries = entries_result.scalars().all()

    # Load all relevant player IDs
    player_ids = set()
    for e in entries:
        if e.player_id:
            player_ids.add(e.player_id)

    # Load matches
    matches_result = await db.execute(
        select(TournamentMatch)
        .where(TournamentMatch.tournament_id == tournament_id)
        .order_by(TournamentMatch.round_number, TournamentMatch.match_number)
    )
    matches = matches_result.scalars().all()

    for m in matches:
        if m.player1_id:
            player_ids.add(m.player1_id)
        if m.player2_id:
            player_ids.add(m.player2_id)
        if m.winner_id:
            player_ids.add(m.winner_id)

    if tournament.winner_id:
        player_ids.add(tournament.winner_id)
    if tournament.created_by:
        player_ids.add(tournament.created_by)

    # Batch-load players
    player_lookup: dict[str, str] = {}
    if player_ids:
        players_result = await db.execute(
            select(Player).where(Player.id.in_(player_ids))
        )
        for p in players_result.scalars().all():
            player_lookup[p.id] = p.nickname

    # Determine total rounds
    total_rounds = 0
    if matches:
        total_rounds = max(m.round_number for m in matches)

    # Build response objects
    entry_responses = [
        TournamentEntryResponse(
            id=e.id,
            player_id=e.player_id,
            player_nickname=player_lookup.get(e.player_id, "Unknown") if e.player_id else "BYE",
            seed=e.seed,
            eliminated=e.eliminated,
        )
        for e in entries
    ]

    match_responses = [
        TournamentMatchResponse(
            id=m.id,
            round_number=m.round_number,
            match_number=m.match_number,
            player1_id=m.player1_id,
            player1_nickname=player_lookup.get(m.player1_id) if m.player1_id else None,
            player2_id=m.player2_id,
            player2_nickname=player_lookup.get(m.player2_id) if m.player2_id else None,
            table_id=m.table_id,
            winner_id=m.winner_id,
            status=m.status,
        )
        for m in matches
    ]

    # Count entries
    entries_result2 = await db.execute(
        select(TournamentEntry).where(TournamentEntry.tournament_id == tournament_id)
    )
    player_count = len(entries_result2.scalars().all())

    tournament_response = TournamentResponse(
        id=tournament.id,
        name=tournament.name,
        max_players=tournament.max_players,
        match_points=tournament.match_points,
        status=tournament.status,
        created_by=tournament.created_by,
        created_at=tournament.created_at,
        winner_id=tournament.winner_id,
        winner_nickname=player_lookup.get(tournament.winner_id) if tournament.winner_id else None,
        player_count=player_count,
    )

    return TournamentBracketResponse(
        tournament=tournament_response,
        entries=entry_responses,
        matches=match_responses,
        total_rounds=total_rounds,
    )


async def list_tournaments(db: AsyncSession) -> list[TournamentResponse]:
    """List all tournaments, newest first."""
    result = await db.execute(
        select(Tournament).order_by(Tournament.created_at.desc()).limit(50)
    )
    tournaments = result.scalars().all()

    # Collect all relevant IDs for batch loading
    winner_ids = {t.winner_id for t in tournaments if t.winner_id}
    player_lookup: dict[str, str] = {}
    if winner_ids:
        players_result = await db.execute(
            select(Player).where(Player.id.in_(winner_ids))
        )
        for p in players_result.scalars().all():
            player_lookup[p.id] = p.nickname

    # Count entries per tournament
    entry_counts: dict[str, int] = {}
    for t in tournaments:
        result2 = await db.execute(
            select(TournamentEntry).where(TournamentEntry.tournament_id == t.id)
        )
        entry_counts[t.id] = len(result2.scalars().all())

    return [
        TournamentResponse(
            id=t.id,
            name=t.name,
            max_players=t.max_players,
            match_points=t.match_points,
            status=t.status,
            created_by=t.created_by,
            created_at=t.created_at,
            winner_id=t.winner_id,
            winner_nickname=player_lookup.get(t.winner_id) if t.winner_id else None,
            player_count=entry_counts.get(t.id, 0),
        )
        for t in tournaments
    ]
