"""Back-compat re-export. `ErrorCode` now lives in `app.engine.errors`."""
from app.engine.errors import ErrorCode, GameRuleError

__all__ = ["ErrorCode", "GameRuleError"]
