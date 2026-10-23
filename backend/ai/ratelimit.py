"""Per-tenant rate limiting for the AI chat endpoint (hardening backlog).

A sliding-window, in-memory limiter keyed by Clerk user id (each user owns
exactly one business, so this is the per-tenant limit) — one instance per
process, which is correct for the single-instance v1 deployment (a
multi-instance deployment would share this state via Redis; out of v1
scope). The limit lives in ``config/<env>.json`` under
``ai.rate_limit {requests, window_seconds}``; ``requests <= 0`` disables
limiting (used by the testing environment so unrelated tests never trip).
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Callable

from fastapi import Depends, HTTPException

from ..clerk_auth import ClerkUser, verify_clerk_token
from ..config import load_config

_RATE_LIMIT_DETAIL = (
    "You're asking Zeno too quickly. Wait a moment, then try again."
)


class SlidingWindowRateLimiter:
    """One sliding window of hit timestamps per key.

    ``check`` raises ``HTTPException(429)`` (with a ``Retry-After`` header)
    once the window is full. The clock is injectable for tests.
    """

    def __init__(
        self,
        requests: int,
        window_seconds: float,
        now_fn: Callable[[], float] = time.monotonic,
        detail: str | None = None,
    ) -> None:
        self.requests = max(0, int(requests))
        self.window = float(window_seconds)
        self._now = now_fn
        # Non-AI sections (imports, exports) reuse this limiter with their own
        # wording — telling someone to "ask Zeno more slowly" mid-import is
        # not helpful.
        self.detail = detail or _RATE_LIMIT_DETAIL
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        if self.requests <= 0:
            return
        now = self._now()
        cutoff = now - self.window
        window = self._hits[key]
        while window and window[0] <= cutoff:
            window.popleft()
        if len(window) >= self.requests:
            retry_after = max(1, int(window[0] + self.window - now) + 1)
            raise HTTPException(
                status_code=429,
                detail=self.detail,
                headers={"Retry-After": str(retry_after)},
            )
        window.append(now)

    def reset(self) -> None:
        self._hits.clear()


_limiter: SlidingWindowRateLimiter | None = None


def get_limiter() -> SlidingWindowRateLimiter:
    """The process-wide limiter, built lazily from ``config/<env>.json``."""
    global _limiter
    if _limiter is None:
        ai_cfg = load_config().get("ai", {}) or {}
        rate_cfg = ai_cfg.get("rate_limit", {}) or {}
        _limiter = SlidingWindowRateLimiter(
            requests=int(rate_cfg.get("requests", 10)),
            window_seconds=float(rate_cfg.get("window_seconds", 60)),
        )
    return _limiter


async def enforce_ai_rate_limit(
    user: ClerkUser = Depends(verify_clerk_token),
) -> None:
    """FastAPI dependency: 429 once the caller exceeds their AI chat window.

    Keyed by Clerk user id (each user owns exactly one business, so this is
    the per-tenant limit) and resolved without a database lookup.
    """
    get_limiter().check(f"user:{user.user_id}")
