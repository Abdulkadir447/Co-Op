"""The unauthenticated surface, pinned.

Tenant scoping is tested domain by domain, but the complement was not: *which
routes answer without a token at all*. A single route added without
``Depends(get_current_business)`` would be readable by anyone, and every other
test in this suite would still pass — the `api` fixture injects a user, so the
missing dependency is invisible to them.

This test enumerates the real router with **no** auth override and asserts that
every path either requires authentication or is on an explicit allow-list. It
fails on a new public route, which is the point: making something public should
be a decision recorded here, not an accident.
"""

from __future__ import annotations

import pytest
from fastapi.routing import APIRoute

from backend.main import app
from backend.clerk_auth import verify_clerk_token

# Public by design. Each one has to be able to justify itself in a sentence.
PUBLIC = {
    "/": "service banner, no data",
    "/healthcheck": "liveness for the platform and the CI smoke test",
    "/billing/payment-config": (
        "provider/plan/price catalogue so the pre-login pricing page can show a "
        "buy button; contains no tenant data and no secret"
    ),
}

# Reachable without a Clerk session, but gated by something else:
#   · /webhooks/paystack — HMAC-SHA512 over the raw body, else 401
#   · /admin/*           — shared secret in X-Admin-Token; with no token
#                          configured the routes answer 503 (closed), never 200
EXTERNALLY_GATED = ("/webhooks/paystack", "/admin/")


def _routes() -> list[APIRoute]:
    return [r for r in app.routes if isinstance(r, APIRoute)]


def _concrete(path: str) -> str:
    """Substitute path params so the request reaches validation, not a 404."""
    for part in [p for p in path.split("/") if p.startswith("{")]:
        path = path.replace(part, "1")
    return path


@pytest.mark.asyncio
async def test_only_the_allow_list_answers_without_a_token(api) -> None:
    accepted = set()
    checked = 0
    # Drop the fake identity: this is the unauthenticated view of the app.
    app.dependency_overrides.pop(verify_clerk_token, None)
    try:
        for route in _routes():
            path = _concrete(route.path)
            for method in sorted(route.methods):
                checked += 1
                resp = await api.client.request(method, path)
                if resp.status_code in (401, 403):
                    continue          # correctly refused
                if path in PUBLIC:
                    assert resp.status_code < 500, f"{method} {path} -> {resp.status_code}"
                    continue
                if path.startswith(EXTERNALLY_GATED) or path == "/webhooks/paystack":
                    assert resp.status_code != 200, (
                        f"{method} {path} answered 200 without its own gate"
                    )
                    continue
                accepted.add(f"{method} {path} -> {resp.status_code}")
    finally:
        api.set_user("user-a")      # restore for any later test in the session

    assert checked >= 90, (
        f"only {checked} route/method pairs were exercised — did the router change?"
    )
    assert not accepted, (
        "these routes answered without a token and are not on the public "
        f"allow-list: {sorted(accepted)}"
    )


@pytest.mark.asyncio
async def test_a_business_route_refuses_an_anonymous_caller(api) -> None:
    """One concrete example, so the failure is legible when the sweep breaks."""
    app.dependency_overrides.pop(verify_clerk_token, None)
    try:
        for path in ("/orders", "/customers", "/invoices", "/business/settings",
                     "/ai/history", "/team", "/backups/export"):
            resp = await api.client.get(path)
            assert resp.status_code == 401, f"{path} -> {resp.status_code}"
    finally:
        api.set_user("user-a")
