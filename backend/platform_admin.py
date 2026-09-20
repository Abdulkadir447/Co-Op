"""Platform (product-owner) admin gate.

This is DISTINCT from the token-gated ``/admin/*`` licence routes:

  * ``/admin/*``  — the Co-op team minting licence keys from a script, gated by
    a shared secret in ``X-Admin-Token`` (no user session involved).
  * ``/platform/*`` — the in-app product-owner console (this module's gate),
    authenticated by the normal Clerk session and limited to a small allow-list.

The allow-list resolves from ``COOP_PLATFORM_ADMINS`` (comma-separated) when
set, otherwise from ``platform.admin_emails`` in the active config. It may
contain **emails** (matched case-insensitively) and/or **Clerk user ids**
(matched exactly). User ids are the robust choice: Clerk's default session
token carries ``sub`` (the user id) but NOT an email claim, so an email-only
list silently matches nobody until the instance adds an email claim. An
empty/absent list means nobody is a platform admin — the console is closed by
default rather than open.
"""
from __future__ import annotations

from .config import load_config, secret


def admin_identifiers() -> set[str]:
    """The allow-listed admin identifiers (emails and/or Clerk user ids)."""
    raw = secret("COOP_PLATFORM_ADMINS")
    if raw is not None:
        items = raw.split(",")
    else:
        cfg = (load_config().get("platform", {}) or {}).get("admin_emails", [])
        items = list(cfg) if isinstance(cfg, list) else []
    return {e.strip() for e in items if e and e.strip()}


def is_platform_admin(email: str | None = None, user_id: str | None = None) -> bool:
    """True when the caller's email OR Clerk user id is on the allow-list."""
    identifiers = admin_identifiers()
    if not identifiers:
        return False
    if email and email.strip().lower() in {i.lower() for i in identifiers}:
        return True
    if user_id and user_id.strip() in identifiers:
        return True
    return False
