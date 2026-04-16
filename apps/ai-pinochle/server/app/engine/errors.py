"""Engine-layer error types.

`ErrorCode` lives here (rather than in `websocket/`) so pure reducers can
reference it without importing from the I/O layer. The WS `_send_error`
helper re-exports it from `websocket/errors.py` for historical callers.
"""
from enum import StrEnum


class ErrorCode(StrEnum):
    # Generic
    UNKNOWN_ACTION = "UNKNOWN_ACTION"
    INVALID_JSON = "INVALID_JSON"
    SERVER_ERROR = "SERVER_ERROR"
    GAME_NOT_FOUND = "GAME_NOT_FOUND"
    NOT_SEATED = "NOT_SEATED"
    STATE_CONFLICT = "STATE_CONFLICT"

    # Phase errors
    WRONG_PHASE = "WRONG_PHASE"
    GAME_ALREADY_STARTED = "GAME_ALREADY_STARTED"

    # Seating
    INVALID_SEAT = "INVALID_SEAT"

    # Lobby / start
    NOT_GAME_CREATOR = "NOT_GAME_CREATOR"
    SEATS_NOT_FULL = "SEATS_NOT_FULL"

    # Bidding
    NOT_YOUR_TURN = "NOT_YOUR_TURN"
    INVALID_BID = "INVALID_BID"
    BID_TOO_LOW = "BID_TOO_LOW"
    BID_TOO_HIGH = "BID_TOO_HIGH"
    DEALER_MUST_BID = "DEALER_MUST_BID"

    # Trump
    NOT_BID_WINNER = "NOT_BID_WINNER"
    INVALID_SUIT = "INVALID_SUIT"

    # Passing
    NOT_BIDDING_TEAM = "NOT_BIDDING_TEAM"
    ALREADY_PASSED = "ALREADY_PASSED"
    INVALID_PASS_CARDS = "INVALID_PASS_CARDS"
    CARD_NOT_IN_HAND = "CARD_NOT_IN_HAND"

    # Meld / hand result acks
    ALREADY_ACKNOWLEDGED = "ALREADY_ACKNOWLEDGED"

    # Trick play
    INVALID_CARD = "INVALID_CARD"
    ILLEGAL_PLAY = "ILLEGAL_PLAY"

    # Rematch
    REMATCH_NOT_AVAILABLE = "REMATCH_NOT_AVAILABLE"
    ALREADY_REQUESTED_REMATCH = "ALREADY_REQUESTED_REMATCH"

    # Seat swap / kick
    NO_PENDING_SWAP = "NO_PENDING_SWAP"
    SWAP_NOT_FOR_YOU = "SWAP_NOT_FOR_YOU"
    CANNOT_KICK_SELF = "CANNOT_KICK_SELF"


class GameRuleError(Exception):
    """Raised by pure reducers when an action violates a game rule.

    The WebSocket adapter catches this and emits an `ERROR` event with the
    same `code` + `message` contract the clients already speak.
    """

    def __init__(self, code: ErrorCode, message: str):
        super().__init__(message)
        self.code = code
        self.message = message
