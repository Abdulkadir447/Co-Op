"""Security baseline guard — headers, and the events that make refusals visible.

These are cheap assertions protecting things that regress silently:

  * a header removed during a refactor costs nothing to notice here and a lot
    to notice in production;
  * an authz refusal that stops emitting an event turns every escalation
    attempt back into an invisible 403.

The nginx half of the header set (CSP for the app shell, HSTS) cannot be
asserted from Python — it is served by the container, not FastAPI — so it is
covered in docs/SECURITY_AUDIT.md and by the curl check in §7 there.
"""
from __future__ import annotations

import pytest

from backend import security_events, team
from backend.ai.ratelimit import SlidingWindowRateLimiter


async def test_api_responses_carry_the_header_baseline(api) -> None:
    r = await api.client.get("/healthcheck")
    assert r.status_code == 200
    h = r.headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "no-referrer"
    assert "camera=()" in h["permissions-policy"]
    assert h["cross-origin-opener-policy"] == "same-origin"
    assert h["cross-origin-resource-policy"] == "same-origin"
    # The API is never a document, so it may forbid everything.
    assert "default-src 'none'" in h["content-security-policy"]


async def test_authenticated_json_is_never_cacheable(api) -> None:
    """One owner's numbers must not replay to the next person on a machine."""
    r = await api.client.get("/auth/me")
    cache = r.headers.get("cache-control", "")
    assert "no-store" in cache
    assert "private" in cache


def test_authz_denial_emits_a_security_event(monkeypatch) -> None:
    events: list[tuple[str, dict]] = []

    def capture(kind, **details):
        events.append((kind, details))

    monkeypatch.setattr(security_events, "security_event", capture)

    with pytest.raises(Exception) as exc:
        # A viewer trying to create an order is the classic escalation attempt.
        team.assert_can_write("viewer", "POST", "/orders")

    assert exc.value.status_code == 403
    assert events, "a 403 with no event is an escalation attempt nobody can see"
    kind, details = events[0]
    assert kind == "authz_denied"
    assert details["role"] == "viewer"
    assert details["method"] == "POST"
    assert details["route"] == "/orders"


def test_allowed_writes_emit_nothing(monkeypatch) -> None:
    events: list[str] = []
    monkeypatch.setattr(security_events, "security_event", lambda k, **d: events.append(k))
    team.assert_can_write("owner", "POST", "/orders")
    assert events == [], "an allowed write is not a security event (log noise)"


def test_rate_limit_trip_emits_a_security_event(monkeypatch) -> None:
    events: list[tuple[str, dict]] = []
    monkeypatch.setattr(security_events, "security_event", lambda k, **d: events.append((k, d)))

    clock = [1000.0]
    limiter = SlidingWindowRateLimiter(requests=2, window_seconds=60, now_fn=lambda: clock[0])
    limiter.check("user-a")
    limiter.check("user-a")
    with pytest.raises(Exception) as exc:
        limiter.check("user-a")
    assert exc.value.status_code == 429

    assert events and events[0][0] == "rate_limit_tripped"
    # The raw user id must not travel to an alert webhook.
    assert "user-a" not in str(events[0][1])
