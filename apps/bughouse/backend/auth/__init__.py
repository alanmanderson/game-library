"""Authentication package for Bughouse Chess."""

from auth.routes import router as auth_router
from auth.dependencies import get_optional_user

__all__ = ["auth_router", "get_optional_user"]
