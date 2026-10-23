"""
Per-tenant rate limits for the expensive, non-AI endpoints.

`/ai/chat` already had one (backend/ai/ratelimit.py). The other two endpoints
that cost real work — committing an import and rendering a report export — were
unbounded, so a client could loop them and hold the database hostage. Same
sliding-window mechanism, same per-Clerk-user key, but configured separately
so tuning one does not change the other:

    "rate_limits": {
      "imports": {"requests": 20, "window_seconds": 300},
      "exports": {"requests": 30, "window_seconds": 60}
    }

``requests <= 0`` disables a section (the testing environment does this so
unrelated tests never trip a limit). One process-wide limiter per section, as
with the AI limiter: correct for the single-instance v1 deployment, and a
multi-instance deployment would move this to Redis.
"""
from __future__ import annotations

from fastapi import Depends


from .ai.ratelimit import SlidingWindowRateLimiter
from .clerk_auth import ClerkUser, verify_clerk_token
from .config import load_config

DEFAULTS: dict[str, dict[str, float]] = {
    # A bulk import is a deliberate act; 20 per 5 minutes is generous and
    # still stops a loop from rewriting the catalogue all day.
    "imports": {"requests": 20, "window_seconds": 300},
    # Exports are cheap individually but unbounded in a loop.
    "exports": {"requests": 30, "window_seconds": 60},
}

_MESSAGES = {
    "imports": "Too many imports. Wait a few minutes and try again.",
    "exports": "Too many exports. Wait a moment and try again.",
}

_limiters: dict[str, SlidingWindowRateLimiter] = {}


def limiter_for(section: str) -> SlidingWindowRateLimiter:
    """The process-wide limiter for one section, built lazily from config."""
    if section not in _limiters:
        cfg = (load_config().get("rate_limits", {}) or {}).get(section, {}) or {}
        fallback = DEFAULTS.get(section, {"requests": 0, "window_seconds": 60})
        _limiters[section] = SlidingWindowRateLimiter(
            requests=int(cfg.get("requests", fallback["requests"])),
            window_seconds=float(cfg.get("window_seconds", fallback["window_seconds"])),
            detail=_MESSAGES.get(section),
        )
    return _limiters[section]


def reset() -> None:
    """Drop the cached limiters (tests that change config between cases)."""
    _limiters.clear()


def _dependency(section: str):
    async def enforce(user: ClerkUser = Depends(verify_clerk_token)) -> None:
        limiter_for(section).check(f"user:{user.user_id}")

    enforce.__name__ = f"enforce_{section}_rate_limit"
    return enforce


enforce_import_rate_limit = _dependency("imports")
enforce_export_rate_limit = _dependency("exports")


__all__ = [
    "DEFAULTS",
    "enforce_export_rate_limit",
    "enforce_import_rate_limit",
    "limiter_for",
    "reset",
]
