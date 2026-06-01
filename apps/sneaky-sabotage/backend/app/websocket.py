"""WebSocket connection manager and game message handler."""

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import async_session
from app.game_engine import (
    advance_to_solving,
    calculate_scores,
    cast_vote,
    check_all_votes_in,
    finish_game,
    finish_round,
    get_current_round,
    get_game_with_players,
    saboteur_guess_insider,
    start_round,
    submit_answer,
    time_expired,
)
from app.models import Game, Player, PlayerRole, Role, Round, RoundStatus, Vote
from app.puzzle_loader import get_puzzle

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections grouped by game_id."""

    def __init__(self):
        # game_id -> {player_id -> WebSocket}
        self.connections: dict[str, dict[str, WebSocket]] = {}
        self._timers: dict[str, asyncio.Task] = {}
        # Track which players have acknowledged their role
        self._ready_players: dict[str, set[str]] = {}
        # Track answer proposals awaiting team vote
        self._proposals: dict[str, dict] = {}
        # Track proposal votes
        self._proposal_votes: dict[str, dict[str, bool]] = {}

    def connect(self, game_id: str, player_id: str, ws: WebSocket):
        if game_id not in self.connections:
            self.connections[game_id] = {}
        self.connections[game_id][player_id] = ws

    def disconnect(self, game_id: str, player_id: str):
        if game_id in self.connections:
            self.connections[game_id].pop(player_id, None)
            if not self.connections[game_id]:
                del self.connections[game_id]

    async def send_to_player(self, game_id: str, player_id: str, message: dict):
        ws = self.connections.get(game_id, {}).get(player_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                logger.debug("Failed to send to player %s", player_id)

    async def broadcast(self, game_id: str, message: dict, exclude: str | None = None):
        for pid, ws in self.connections.get(game_id, {}).items():
            if pid == exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                continue

    def connection_count(self) -> int:
        return sum(len(conns) for conns in self.connections.values())

    async def close_all(self):
        for game_id, conns in list(self.connections.items()):
            for pid, ws in list(conns.items()):
                try:
                    await ws.close()
                except Exception:
                    pass
        self.connections.clear()


manager = ConnectionManager()


async def _send_game_state(db: AsyncSession, game_id: str):
    """Send current game state to all connected players."""
    game = await get_game_with_players(db, game_id)
    if not game:
        return

    players_info = [
        {
            "id": p.id,
            "name": p.name,
            "is_host": p.is_host,
            "total_score": p.total_score,
            "connected": p.connected,
        }
        for p in game.players
    ]

    state = {
        "type": "game_state",
        "game_id": game.id,
        "status": game.status,
        "current_round": game.current_round,
        "max_rounds": game.max_rounds,
        "timer_seconds": game.timer_seconds,
        "players": players_info,
    }

    # Add round-specific info
    rnd = await get_current_round(db, game_id)
    if rnd:
        state["round_status"] = rnd.status
        state["round_number"] = rnd.round_number
        if rnd.timer_started_at:
            elapsed = (datetime.now(timezone.utc) - rnd.timer_started_at).total_seconds()
            state["timer_remaining"] = max(0, game.timer_seconds - elapsed)

    await manager.broadcast(game_id, state)


async def _send_role_to_player(
    db: AsyncSession, game_id: str, player_id: str, rnd: Round
):
    """Send private role info to a specific player."""
    role_rec = next(
        (pr for pr in rnd.player_roles if pr.player_id == player_id), None
    )
    if not role_rec:
        return

    puzzle = get_puzzle(rnd.puzzle_id)
    msg: dict = {
        "type": "role_assigned",
        "role": role_rec.role,
        "round_number": rnd.round_number,
    }
    # Saboteur and Insider see the hint
    if role_rec.role in (Role.SABOTEUR.value, Role.INSIDER.value) and puzzle:
        msg["hint"] = puzzle.hint

    await manager.send_to_player(game_id, player_id, msg)


async def _start_timer(game_id: str, round_id: int, seconds: int):
    """Background task that counts down and triggers time expiration."""
    timer_key = f"{game_id}_{round_id}"

    async def _countdown():
        try:
            # Send periodic timer updates
            remaining = seconds
            while remaining > 0:
                await asyncio.sleep(1)
                remaining -= 1
                if remaining % 5 == 0 or remaining <= 10:
                    await manager.broadcast(game_id, {
                        "type": "timer_update",
                        "remaining": remaining,
                    })

            # Time's up
            async with async_session() as db:
                await time_expired(db, round_id)
                await db.commit()

            await manager.broadcast(game_id, {"type": "time_expired"})

            # Move to voting
            async with async_session() as db:
                rnd = await db.get(Round, round_id)
                if rnd and rnd.status == RoundStatus.VOTING.value:
                    await manager.broadcast(game_id, {
                        "type": "voting_phase",
                        "message": "Time's up! Vote for who you think is the Saboteur.",
                    })
        except asyncio.CancelledError:
            pass

    task = asyncio.create_task(_countdown())
    manager._timers[timer_key] = task


def _cancel_timer(game_id: str, round_id: int):
    timer_key = f"{game_id}_{round_id}"
    task = manager._timers.pop(timer_key, None)
    if task:
        task.cancel()


async def handle_message(
    game_id: str, player_id: str, data: dict, db: AsyncSession
):
    """Process an incoming WebSocket message."""
    msg_type = data.get("type", "")

    if msg_type == "start_game":
        await _handle_start_game(game_id, player_id, db)

    elif msg_type == "ready":
        await _handle_ready(game_id, player_id, db)

    elif msg_type == "propose_answer":
        await _handle_propose_answer(game_id, player_id, data, db)

    elif msg_type == "vote_answer":
        await _handle_vote_answer(game_id, player_id, data, db)

    elif msg_type == "vote_saboteur":
        await _handle_vote_saboteur(game_id, player_id, data, db)

    elif msg_type == "saboteur_guess":
        await _handle_saboteur_guess(game_id, player_id, data, db)

    elif msg_type == "next_round":
        await _handle_next_round(game_id, player_id, db)

    elif msg_type == "chat":
        await _handle_chat(game_id, player_id, data, db)

    elif msg_type == "update_settings":
        await _handle_update_settings(game_id, player_id, data, db)

    elif msg_type == "kick_player":
        await _handle_kick_player(game_id, player_id, data, db)

    else:
        await manager.send_to_player(game_id, player_id, {
            "type": "error",
            "message": f"Unknown message type: {msg_type}",
        })


async def _handle_start_game(game_id: str, player_id: str, db: AsyncSession):
    """Host starts the game."""
    game = await get_game_with_players(db, game_id)
    if not game:
        return

    player = next((p for p in game.players if p.id == player_id), None)
    if not player or not player.is_host:
        await manager.send_to_player(game_id, player_id, {
            "type": "error",
            "message": "Only the host can start the game",
        })
        return

    connected = [p for p in game.players if p.connected]
    if len(connected) < 3:
        await manager.send_to_player(game_id, player_id, {
            "type": "error",
            "message": "Need at least 3 players to start",
        })
        return

    rnd = await start_round(db, game_id)
    await db.commit()

    # Reload round with relationships
    rnd = await get_current_round(db, game_id)
    manager._ready_players[game_id] = set()

    await _send_game_state(db, game_id)

    # Send private role to each player
    for pid in manager.connections.get(game_id, {}):
        await _send_role_to_player(db, game_id, pid, rnd)


async def _handle_ready(game_id: str, player_id: str, db: AsyncSession):
    """Player acknowledges their role."""
    if game_id not in manager._ready_players:
        manager._ready_players[game_id] = set()
    manager._ready_players[game_id].add(player_id)

    game = await get_game_with_players(db, game_id)
    connected_ids = {p.id for p in game.players if p.connected}
    ready = manager._ready_players.get(game_id, set())

    await manager.broadcast(game_id, {
        "type": "player_ready",
        "player_id": player_id,
        "ready_count": len(ready & connected_ids),
        "total_count": len(connected_ids),
    })

    # All players ready — start solving phase
    if connected_ids.issubset(ready):
        rnd = await get_current_round(db, game_id)
        if rnd and rnd.status == RoundStatus.ROLE_REVEAL.value:
            rnd = await advance_to_solving(db, rnd.id)
            await db.commit()

            puzzle = get_puzzle(rnd.puzzle_id)
            await manager.broadcast(game_id, {
                "type": "puzzle_start",
                "puzzle": puzzle.to_player_dict() if puzzle else {},
                "timer_seconds": game.timer_seconds,
            })

            await _start_timer(game_id, rnd.id, game.timer_seconds)


async def _handle_propose_answer(
    game_id: str, player_id: str, data: dict, db: AsyncSession
):
    """Player proposes an answer for team vote."""
    answer = data.get("answer", "").strip()
    if not answer:
        return

    game = await get_game_with_players(db, game_id)
    player = next((p for p in game.players if p.id == player_id), None)
    if not player:
        return

    proposal_key = game_id
    manager._proposals[proposal_key] = {
        "player_id": player_id,
        "player_name": player.name,
        "answer": answer,
    }
    manager._proposal_votes[proposal_key] = {player_id: True}

    connected = [p for p in game.players if p.connected]
    await manager.broadcast(game_id, {
        "type": "answer_proposed",
        "player_name": player.name,
        "answer": answer,
        "votes_for": 1,
        "votes_against": 0,
        "votes_needed": len(connected) // 2 + 1,
    })


async def _handle_vote_answer(
    game_id: str, player_id: str, data: dict, db: AsyncSession
):
    """Player votes on a proposed answer."""
    approve = data.get("approve", False)
    proposal_key = game_id

    if proposal_key not in manager._proposals:
        return

    manager._proposal_votes.setdefault(proposal_key, {})[player_id] = approve

    game = await get_game_with_players(db, game_id)
    connected = [p for p in game.players if p.connected]
    votes = manager._proposal_votes[proposal_key]
    votes_for = sum(1 for v in votes.values() if v)
    votes_against = sum(1 for v in votes.values() if not v)
    needed = len(connected) // 2 + 1

    await manager.broadcast(game_id, {
        "type": "answer_vote_update",
        "votes_for": votes_for,
        "votes_against": votes_against,
        "votes_needed": needed,
        "total_voted": len(votes),
        "total_players": len(connected),
    })

    # Check if majority reached
    if votes_for >= needed:
        answer = manager._proposals[proposal_key]["answer"]
        rnd = await get_current_round(db, game_id)
        if rnd and rnd.status == RoundStatus.SOLVING.value:
            _cancel_timer(game_id, rnd.id)
            is_correct = await submit_answer(db, rnd.id, answer)
            await db.commit()

            await manager.broadcast(game_id, {
                "type": "answer_result",
                "answer": answer,
                "is_correct": is_correct,
            })

            # Brief pause then move to voting phase
            await asyncio.sleep(2)
            await manager.broadcast(game_id, {
                "type": "voting_phase",
                "message": "Vote for who you think is the Saboteur!",
            })

        del manager._proposals[proposal_key]
        del manager._proposal_votes[proposal_key]

    elif votes_against > len(connected) - needed:
        # Majority rejected
        proposer_name = manager._proposals[proposal_key]["player_name"]
        await manager.broadcast(game_id, {
            "type": "answer_rejected",
            "message": f"{proposer_name}'s answer was rejected. Keep solving!",
        })
        del manager._proposals[proposal_key]
        del manager._proposal_votes[proposal_key]


async def _handle_vote_saboteur(
    game_id: str, player_id: str, data: dict, db: AsyncSession
):
    """Player votes for who they think is the saboteur."""
    accused_id = data.get("accused_id", "")
    if not accused_id:
        return

    rnd = await get_current_round(db, game_id)
    if not rnd or rnd.status != RoundStatus.VOTING.value:
        return

    try:
        await cast_vote(db, rnd.id, player_id, accused_id)
        await db.commit()
    except ValueError as e:
        await manager.send_to_player(game_id, player_id, {
            "type": "error",
            "message": str(e),
        })
        return

    game = await get_game_with_players(db, game_id)
    connected = [p for p in game.players if p.connected]

    # Reload round with votes
    rnd = await get_current_round(db, game_id)
    player_votes = [v for v in rnd.votes if not v.is_saboteur_guess]

    await manager.broadcast(game_id, {
        "type": "vote_cast",
        "votes_in": len(player_votes),
        "votes_needed": len(connected),
    })

    # Check if all votes are in
    if len(player_votes) >= len(connected):
        # Find saboteur
        saboteur_role = next(
            (pr for pr in rnd.player_roles if pr.role == Role.SABOTEUR.value), None
        )
        insider_role = next(
            (pr for pr in rnd.player_roles if pr.role == Role.INSIDER.value), None
        )

        if saboteur_role:
            rnd.status = RoundStatus.SABOTEUR_GUESS.value
            await db.commit()

            # Reveal votes to everyone
            name_map = {p.id: p.name for p in game.players}
            vote_results = [
                {"voter": name_map.get(v.voter_id, ""), "accused": name_map.get(v.accused_id, "")}
                for v in player_votes
            ]

            saboteur_name = name_map.get(saboteur_role.player_id, "")
            has_insider = insider_role is not None

            await manager.broadcast(game_id, {
                "type": "votes_revealed",
                "votes": vote_results,
                "saboteur": {"id": saboteur_role.player_id, "name": saboteur_name},
                "has_insider": has_insider,
            })

            # Tell saboteur to guess insider
            if has_insider:
                await manager.send_to_player(game_id, saboteur_role.player_id, {
                    "type": "guess_insider",
                    "message": "You're the Saboteur! Guess who the Insider is for bonus points.",
                })
            else:
                # No insider to guess — skip to scoring
                await _finalize_round(game_id, rnd.id, db)
        else:
            # No saboteur in play this round (card was discarded)
            await _finalize_round(game_id, rnd.id, db)


async def _handle_saboteur_guess(
    game_id: str, player_id: str, data: dict, db: AsyncSession
):
    """Saboteur guesses who the insider is."""
    guessed_id = data.get("guessed_id", "")
    if not guessed_id:
        return

    rnd = await get_current_round(db, game_id)
    if not rnd or rnd.status != RoundStatus.SABOTEUR_GUESS.value:
        return

    await saboteur_guess_insider(db, rnd.id, player_id, guessed_id)
    await db.commit()

    await _finalize_round(game_id, rnd.id, db)


async def _finalize_round(game_id: str, round_id: int, db: AsyncSession):
    """Calculate scores and send results."""
    results = await calculate_scores(db, round_id)
    await db.commit()

    await manager.broadcast(game_id, {
        "type": "round_results",
        **results,
    })


async def _handle_next_round(game_id: str, player_id: str, db: AsyncSession):
    """Host advances to the next round or ends the game."""
    game = await get_game_with_players(db, game_id)
    if not game:
        return

    player = next((p for p in game.players if p.id == player_id), None)
    if not player or not player.is_host:
        await manager.send_to_player(game_id, player_id, {
            "type": "error",
            "message": "Only the host can advance the round",
        })
        return

    rnd = await get_current_round(db, game_id)
    if rnd:
        await finish_round(db, rnd.id)
        await db.commit()

    if game.current_round >= game.max_rounds:
        final = await finish_game(db, game_id)
        await db.commit()
        await manager.broadcast(game_id, {
            "type": "game_over",
            **final,
        })
    else:
        new_rnd = await start_round(db, game_id)
        await db.commit()

        # Reload with relationships
        new_rnd = await get_current_round(db, game_id)
        manager._ready_players[game_id] = set()

        await _send_game_state(db, game_id)

        for pid in manager.connections.get(game_id, {}):
            await _send_role_to_player(db, game_id, pid, new_rnd)


async def _handle_chat(game_id: str, player_id: str, data: dict, db: AsyncSession):
    """Broadcast a chat message."""
    message = data.get("message", "").strip()
    if not message or len(message) > 500:
        return

    game = await get_game_with_players(db, game_id)
    player = next((p for p in game.players if p.id == player_id), None)
    if not player:
        return

    await manager.broadcast(game_id, {
        "type": "chat",
        "player_id": player_id,
        "player_name": player.name,
        "message": message,
    })


async def _handle_update_settings(
    game_id: str, player_id: str, data: dict, db: AsyncSession
):
    """Host updates game settings (timer, max rounds) while in lobby."""
    game = await get_game_with_players(db, game_id)
    if not game or game.status != "lobby":
        return
    player = next((p for p in game.players if p.id == player_id), None)
    if not player or not player.is_host:
        return

    if "timer_seconds" in data:
        ts = data["timer_seconds"]
        if ts in (180, 300, 420, 600):
            game.timer_seconds = ts
    if "max_rounds" in data:
        mr = data["max_rounds"]
        if 1 <= mr <= 8:
            game.max_rounds = mr

    await db.commit()
    await _send_game_state(db, game_id)


async def _handle_kick_player(
    game_id: str, player_id: str, data: dict, db: AsyncSession
):
    """Host kicks a player from the lobby."""
    game = await get_game_with_players(db, game_id)
    if not game or game.status != "lobby":
        return
    player = next((p for p in game.players if p.id == player_id), None)
    if not player or not player.is_host:
        return

    kick_id = data.get("player_id", "")
    if kick_id == player_id:
        return

    target = next((p for p in game.players if p.id == kick_id), None)
    if target:
        # Notify the kicked player
        await manager.send_to_player(game_id, kick_id, {
            "type": "kicked",
            "message": "You have been removed from the game.",
        })
        # Close their connection
        ws = manager.connections.get(game_id, {}).get(kick_id)
        if ws:
            try:
                await ws.close()
            except Exception:
                pass
            manager.disconnect(game_id, kick_id)
        await db.delete(target)
        await db.commit()
        await _send_game_state(db, game_id)


async def websocket_endpoint(websocket: WebSocket, game_id: str, player_id: str):
    """Main WebSocket endpoint for game communication."""
    token = websocket.query_params.get("token", "")

    await websocket.accept()

    # Validate player and token
    async with async_session() as db:
        player = await db.get(Player, player_id)
        if not player or player.game_id != game_id or player.session_token != token:
            await websocket.send_json({"type": "error", "message": "Invalid session"})
            await websocket.close()
            return

        player.connected = True
        await db.commit()

        manager.connect(game_id, player_id, websocket)

        await manager.broadcast(game_id, {
            "type": "player_joined",
            "player_id": player_id,
            "player_name": player.name,
        }, exclude=player_id)

        # Send current state to the joining player
        await _send_game_state(db, game_id)

        # If mid-round, send their role
        rnd = await get_current_round(db, game_id)
        if rnd and rnd.status in (RoundStatus.ROLE_REVEAL.value, RoundStatus.SOLVING.value):
            await _send_role_to_player(db, game_id, player_id, rnd)
            if rnd.status == RoundStatus.SOLVING.value:
                puzzle = get_puzzle(rnd.puzzle_id)
                if puzzle:
                    game = await db.get(Game, game_id)
                    await manager.send_to_player(game_id, player_id, {
                        "type": "puzzle_start",
                        "puzzle": puzzle.to_player_dict(),
                        "timer_seconds": game.timer_seconds if game else 300,
                    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            async with async_session() as db:
                await handle_message(game_id, player_id, data, db)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket error for game=%s player=%s", game_id, player_id)
    finally:
        manager.disconnect(game_id, player_id)
        async with async_session() as db:
            player = await db.get(Player, player_id)
            if player:
                player.connected = False
                await db.commit()
            await manager.broadcast(game_id, {
                "type": "player_left",
                "player_id": player_id,
            })
