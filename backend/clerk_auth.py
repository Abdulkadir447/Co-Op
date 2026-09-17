"""
Clerk authentication for the Co-op backend.

Verifies Clerk **session tokens** (JWTs, RS256) presented by the frontend as
``Authorization: Bearer <token>``. The frontend obtains the token from
``useAuth().getToken()`` (Clerk React). No Clerk SECRET key is used or stored
here — verification is pure public-key cryptography against the instance's
published JWKS, per Clerk's session-token verification model.

Flow:
    1. Fetch (and cache) the JWKS from ``https://<FAPI>/.well-known/jwks.json``.
    2. Decode the JWT with RS256, validating signature, ``exp``/``nbf`` and
       ``iss == https://<FAPI>``.
    3. Check ``azp`` (origin the token was issued for) against an allow-list
       when the claim is present — Electron ``file://`` sessions carry no azp.

Configuration (environment):
    CLERK_FRONTEND_API   e.g. bursting-swan-43.clerk.accounts.dev
    CLERK_ALLOWED_ORIGINS  comma-separated azp allow-list (dev convenience)
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from .config import get_env

# DEVELOPMENT-ONLY default. Production MUST supply CLERK_FRONTEND_API (Task 11
# / audit H5) — otherwise tokens would be validated against the dev instance.
DEFAULT_FRONTEND_API = "bursting-swan-43.clerk.accounts.dev"
JWKS_TTL_SECONDS = 3600  # re-fetch public keys at most once per hour

_bearer_scheme = HTTPBearer(auto_error=False)

# Module-level JWKS cache: {fapi: (jwks_dict, fetched_at)}
_jwks_cache: Dict[str, tuple[dict, float]] = {}


def get_frontend_api() -> str:
    """Return the Clerk Frontend API host to validate tokens against.

    The development default is only allowed outside production; a production
    boot without CLERK_FRONTEND_API fails fast (called from app startup).
    """
    explicit = os.getenv("CLERK_FRONTEND_API")
    if explicit:
        return explicit.strip()
    if get_env() == "production":
        raise RuntimeError(
            "CLERK_FRONTEND_API must be set in production (the Clerk Frontend "
            "API host, e.g. <instance>.clerk.accounts.dev). Refusing to fall "
            "back to the development instance."
        )
    return DEFAULT_FRONTEND_API


def _allowed_origins() -> list[str]:
    raw = os.getenv("CLERK_ALLOWED_ORIGINS", "")
    return [o.strip() for o in raw.split(",") if o.strip()]


def _origin_allowed(azp: Optional[str]) -> bool:
    """Validate the azp claim. No azp (e.g. Electron file://) is accepted;
    a present azp must match the allow-list. The dev preview wildcards are
    only honoured outside production."""
    if not azp:
        return True
    if azp in _allowed_origins():
        return True
    if get_env() == "production":
        return False
    # Development sandboxes (Arena/e2b previews) use dynamic subdomains.
    return azp.endswith(".e2b.app") or azp.startswith("http://localhost")


async def fetch_jwks(frontend_api: str, force: bool = False) -> dict:
    """Return the Clerk JWKS for the instance, cached for JWKS_TTL_SECONDS."""
    now = time.monotonic()
    cached = _jwks_cache.get(frontend_api)
    if cached and not force and (now - cached[1]) < JWKS_TTL_SECONDS:
        return cached[0]

    url = f"https://{frontend_api}/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        jwks = resp.json()

    _jwks_cache[frontend_api] = (jwks, now)
    return jwks


@dataclass(frozen=True)
class ClerkUser:
    """Authenticated Co-op user, identified by their Clerk user id (``sub``).

    ``email`` is the Clerk primary-email claim when the JWT carries one
    (it normally does); it is what invitation accept uses to bind an invite
    to the right person. The unit-test seam leaves it None.
    """

    user_id: str
    session_id: Optional[str] = None
    azp: Optional[str] = None
    email: Optional[str] = None


def _auth_error(detail: str = "Could not validate credentials") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def verify_clerk_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> ClerkUser:
    """FastAPI dependency: require a valid Clerk session token.

    E2E test seam (OFFLINE 6): in NON-production, when ``COOP_TEST_AUTH_USER``
    is set, any bearer token authenticates as that fixed user. The unit-test
    suite does the equivalent via a dependency override; this lets a
    SPAWNED server process (the real-runtime E2E harness) run the real
    request path without a live Clerk instance. In production this seam is
    refused outright.
    """
    test_user = os.getenv("COOP_TEST_AUTH_USER")
    if test_user:
        if get_env() == "production":
            raise RuntimeError("COOP_TEST_AUTH_USER is forbidden in production")
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise _auth_error("Missing bearer token")
        return ClerkUser(
            user_id=test_user,
            session_id="e2e-session",
            azp=None,
            # Optional dev-only email so email-gated features (e.g. the
            # platform-admin console) are exercisable without a live Clerk.
            email=os.getenv("COOP_TEST_AUTH_EMAIL"),
        )

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _auth_error("Missing bearer token")

    token = credentials.credentials
    fapi = get_frontend_api()
    expected_issuer = f"https://{fapi}"

    try:
        jwks = await fetch_jwks(fapi)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach the authentication provider",
        )

    try:
        payload: Dict[str, Any] = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            issuer=expected_issuer,
            options={"verify_aud": False},
        )
    except JWTError:
        raise _auth_error()

    user_id = payload.get("sub")
    if not user_id:
        raise _auth_error("Token missing subject")

    azp = payload.get("azp")
    if not _origin_allowed(azp):
        raise _auth_error("Token issued for an unauthorized origin")

    return ClerkUser(
        user_id=user_id,
        session_id=payload.get("session_id") or payload.get("sid"),
        azp=azp,
        email=payload.get("email"),
    )


async def get_current_clerk_user(request: Request) -> ClerkUser:
    """Convenience wrapper when the full Request is needed downstream."""
    return request.state.clerk_user
