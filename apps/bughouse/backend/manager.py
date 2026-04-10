"""
Game Room Manager for Bughouse Chess.

Manages active games, player sessions, seat assignments, spectators,
and WebSocket connections.
"""

import secrets
import string
import time
from typing import Optional, Union

from fastapi import WebSocket

from engine import BughouseGame, Seat, SEAT_TEAM, SEAT_BOARD_COLOR, Team
from models import (
    GameStatus,
    SeatName,
    PlayerInfo,
    GameInfoResponse,
    GameListItem,
)


# Mapping between SeatName enum and Seat int enum
SEAT_NAME_TO_INT = {
    SeatName.BOARD_A_WHITE: Seat.BOARD_A_WHITE,
    SeatName.BOARD_A_BLACK: Seat.BOARD_A_BLACK,
    SeatName.BOARD_B_WHITE: Seat.BOARD_B_WHITE,
    SeatName.BOARD_B_BLACK: Seat.BOARD_B_BLACK,
}

SEAT_INT_TO_NAME = {v: k for k, v in SEAT_NAME_TO_INT.items()}

MAX_SPECTATORS = 50


def _generate_game_id() -> str:
    """Generate a short 6-character uppercase game code."""
    chars = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(chars) for _ in range(6))


def _generate_token() -> str:
    """Generate a secure player/spectator token."""
    return secrets.token_urlsafe(24)


class PlayerSession:
    """Tracks a player in a game."""

    def __init__(self, token: str, name: str, seat: Seat, user_id: Optional[str] = None, is_bot: bool = False):
        self.token = token
        self.name = name
        self.seat = seat
        self.user_id = user_id
        self.is_bot = is_bot
        self.connected = False
        self.websocket: Optional[WebSocket] = None

    def to_info(self) -> PlayerInfo:
        return PlayerInfo(
            seat=SEAT_INT_TO_NAME[self.seat],
            name=self.name,
            connected=self.connected,
        )


class SpectatorSession:
    """Tracks a spectator in a game."""

    def __init__(self, token: str, name: Optional[str] = None):
        self.token = token
        self.name = name
        self.connected = False
        self.websocket: Optional[WebSocket] = None


class GameRoom:
    """
    A game room holding the BughouseGame engine, player sessions,
    spectator sessions, and game lifecycle state.
    """

    def __init__(self, game_id: str):
        self.game_id = game_id
        self.engine = BughouseGame(game_id=game_id)
        self.status = GameStatus.WAITING
        self.created_at = time.time()
        self.started_at: Optional[float] = None
        # Set when status changes to FINISHED (must be set externally or via
        # a helper, since status transitions happen in main.py).
        self.finished_at: Optional[float] = None

        # Seat -> PlayerSession (up to 4)
        self.players: dict[Seat, PlayerSession] = {}
        # Token -> PlayerSession for quick lookup
        self.player_tokens: dict[str, PlayerSession] = {}

        # Spectators
        self.spectators: list[SpectatorSession] = []
        self.spectator_tokens: dict[str, SpectatorSession] = {}

    @property
    def player_count(self) -> int:
        return len(self.players)

    @property
    def is_full(self) -> bool:
        return self.player_count >= 4

    @property
    def spectator_count(self) -> int:
        return len(self.spectators)

    def get_available_seats(self) -> list[Seat]:
        """Return list of unoccupied seats."""
        all_seats = [
            Seat.BOARD_A_WHITE,
            Seat.BOARD_A_BLACK,
            Seat.BOARD_B_WHITE,
            Seat.BOARD_B_BLACK,
        ]
        return [s for s in all_seats if s not in self.players]

    def _add_player_session(
        self,
        name: str,
        preferred_seat: Optional[SeatName] = None,
        user_id: Optional[str] = None,
        is_bot: bool = False,
    ) -> PlayerSession:
        """
        Internal method that handles seat assignment, token generation,
        session creation, and auto-start. Used by both add_player and add_bot.

        Raises ValueError if the game is full, finished, or preferred seat is taken.
        """
        if self.is_full:
            raise ValueError("Game is full.")

        if self.status == GameStatus.FINISHED:
            raise ValueError("Game is finished.")

        available = self.get_available_seats()

        if preferred_seat is not None:
            seat = SEAT_NAME_TO_INT[preferred_seat]
            if seat not in available:
                raise ValueError(
                    f"Seat {preferred_seat.value} is already taken."
                )
        else:
            seat = available[0]

        token = _generate_token()
        session = PlayerSession(token=token, name=name, seat=seat, user_id=user_id, is_bot=is_bot)
        self.players[seat] = session
        self.player_tokens[token] = session

        # Start game when all 4 seats are filled
        if self.is_full and self.status == GameStatus.WAITING:
            self.status = GameStatus.IN_PROGRESS
            self.started_at = time.time()
            self.engine.started_at = self.started_at

        return session

    def add_player(
        self, name: str, preferred_seat: Optional[SeatName] = None, user_id: Optional[str] = None
    ) -> PlayerSession:
        """
        Add a player to the game. Assigns a seat (preferred or first available).

        Raises ValueError if the game is full or preferred seat is taken.
        """
        return self._add_player_session(
            name=name, preferred_seat=preferred_seat, user_id=user_id, is_bot=False
        )

    def add_bot(self, preferred_seat: Optional[SeatName] = None) -> PlayerSession:
        """Add a bot player to the game. Returns the bot's PlayerSession."""
        # Determine seat to generate the bot name, then delegate to shared method.
        available = self.get_available_seats()
        if preferred_seat is not None:
            seat = SEAT_NAME_TO_INT[preferred_seat]
            # Validation (full/finished/taken) is handled by _add_player_session,
            # but we need the seat int here to build the name.
            if seat not in available and not self.is_full:
                # Let _add_player_session raise the proper error
                pass
            target_seat = seat
        else:
            if not available:
                # Let _add_player_session raise "Game is full."
                return self._add_player_session(
                    name="Bot", preferred_seat=preferred_seat, is_bot=True
                )
            target_seat = available[0]

        seat_label = SEAT_INT_TO_NAME[target_seat].value.replace("board_", "").replace("_", "-").upper()
        bot_name = f"Bot ({seat_label})"

        return self._add_player_session(
            name=bot_name, preferred_seat=preferred_seat, is_bot=True
        )

    def remove_player(self, token: str) -> Optional[PlayerSession]:
        """Remove a player by token. Returns the session or None."""
        session = self.player_tokens.pop(token, None)
        if session:
            self.players.pop(session.seat, None)
        return session

    def add_spectator(self, name: Optional[str] = None) -> SpectatorSession:
        """Add a spectator. Returns the spectator session.

        Raises ValueError if the spectator limit (MAX_SPECTATORS) is reached.
        """
        if self.spectator_count >= MAX_SPECTATORS:
            raise ValueError(
                f"Spectator limit reached ({MAX_SPECTATORS})."
            )
        token = _generate_token()
        session = SpectatorSession(token=token, name=name)
        self.spectators.append(session)
        self.spectator_tokens[token] = session
        return session

    def remove_spectator(self, token: str) -> Optional[SpectatorSession]:
        """Remove a spectator by token."""
        session = self.spectator_tokens.pop(token, None)
        if session:
            self.spectators = [s for s in self.spectators if s.token != token]
        return session

    def get_player_by_token(self, token: str) -> Optional[PlayerSession]:
        return self.player_tokens.get(token)

    def get_spectator_by_token(self, token: str) -> Optional[SpectatorSession]:
        return self.spectator_tokens.get(token)

    def get_session_by_token(self, token: str) -> Optional[Union[PlayerSession, SpectatorSession]]:
        """Look up any session (player or spectator) by token."""
        player = self.get_player_by_token(token)
        if player:
            return player
        return self.get_spectator_by_token(token)

    def get_player_infos(self) -> list[PlayerInfo]:
        """Return PlayerInfo list for all seated players."""
        return [session.to_info() for session in self.players.values()]

    def get_connected_websockets(self) -> list[WebSocket]:
        """Return all connected WebSocket objects (players + spectators)."""
        sockets = []
        for session in self.players.values():
            if session.connected and session.websocket is not None:
                sockets.append(session.websocket)
        for session in self.spectators:
            if session.connected and session.websocket is not None:
                sockets.append(session.websocket)
        return sockets

    def get_player_websockets(self) -> list[tuple[PlayerSession, WebSocket]]:
        """Return connected player sessions with their WebSockets."""
        result = []
        for session in self.players.values():
            if session.connected and session.websocket is not None:
                result.append((session, session.websocket))
        return result

    def to_info(self) -> GameInfoResponse:
        return GameInfoResponse(
            game_id=self.game_id,
            status=self.status,
            players=self.get_player_infos(),
            spectator_count=self.spectator_count,
            created_at=self.created_at,
        )

    def to_list_item(self) -> GameListItem:
        return GameListItem(
            game_id=self.game_id,
            status=self.status,
            player_count=self.player_count,
            players=self.get_player_infos(),
            created_at=self.created_at,
        )


class GameManager:
    """
    Singleton manager for all active game rooms.
    """

    def __init__(self):
        self.games: dict[str, GameRoom] = {}

    def create_game(
        self, player_name: str, preferred_seat: Optional[SeatName] = None, user_id: Optional[str] = None
    ) -> tuple[GameRoom, PlayerSession]:
        """
        Create a new game room and add the first player.
        Returns (game_room, player_session).
        """
        # Generate a unique game ID
        game_id = _generate_game_id()
        while game_id in self.games:
            game_id = _generate_game_id()

        room = GameRoom(game_id=game_id)
        session = room.add_player(player_name, preferred_seat, user_id=user_id)
        self.games[game_id] = room
        return room, session

    def get_game(self, game_id: str) -> Optional[GameRoom]:
        return self.games.get(game_id.upper())

    def join_game(
        self,
        game_id: str,
        player_name: str,
        preferred_seat: Optional[SeatName] = None,
        user_id: Optional[str] = None,
    ) -> tuple[GameRoom, PlayerSession]:
        """
        Join an existing game.
        Returns (game_room, player_session).
        Raises ValueError if game not found, full, or seat taken.
        """
        room = self.get_game(game_id)
        if room is None:
            raise ValueError(f"Game {game_id} not found.")

        session = room.add_player(player_name, preferred_seat, user_id=user_id)
        return room, session

    def watch_game(
        self, game_id: str, spectator_name: Optional[str] = None
    ) -> tuple[GameRoom, SpectatorSession]:
        """
        Join a game as spectator.
        Raises ValueError if game not found.
        """
        room = self.get_game(game_id)
        if room is None:
            raise ValueError(f"Game {game_id} not found.")

        session = room.add_spectator(spectator_name)
        return room, session

    def list_waiting_games(self) -> list[GameListItem]:
        """Return games that are still waiting for players."""
        return [
            room.to_list_item()
            for room in self.games.values()
            if room.status == GameStatus.WAITING
        ]

    def cleanup_old_games(self, max_age_seconds: float = 3600):
        """Remove stale games older than max_age_seconds.

        - FINISHED games: cleaned up based on ``finished_at`` timestamp.
        - WAITING games: cleaned up based on ``created_at`` timestamp.
        - IN_PROGRESS games: left alone.
        """
        now = time.time()
        to_remove = []
        for gid, room in self.games.items():
            if (
                room.status == GameStatus.FINISHED
                and room.finished_at is not None
                and (now - room.finished_at) > max_age_seconds
            ):
                to_remove.append(gid)
            elif (
                room.status == GameStatus.WAITING
                and (now - room.created_at) > max_age_seconds
            ):
                to_remove.append(gid)
        for gid in to_remove:
            del self.games[gid]
