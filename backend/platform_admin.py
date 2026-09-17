"""Platform (product-owner) admin gate.

This is DISTINCT from the token-gated ``/admin/*`` licence routes:

  * ``/admin/*``  — the Co-op team minting licence keys from a script, gated by
    a shared secret in ``X-Admin-Token`` (no user session involved).
  * ``/platform/*`` — the in-app product-owner console (this module's gate),
    authenticated by the normal Clerk session and limited to a small allow-list
    of platform-admin emails.

The allow-list resolves from ``COOP_PLATFORM_ADMINS`` (comma-separated) when
set, otherwise from ``platform.admin_emails`` in the active config. Emails are
matched case-insensitively. An empty/absent list means nobody is a platform
admin, so the console is closed by default rather than open.
"""
from __future__ import annotations

from .config import load_config, secret


def admin_emails() -> set[str]:
    """The platform-admin allow-list (lower-cased, de-duplicated)."""
    raw = secret("COOP_PLATFORM_ADMINS")
    if raw is not None:
        emails = raw.split(",")
    else:
        cfg = (load_config().get("platform", {}) or {}).get("admin_emails", [])
        emails = list(cfg) if isinstance(cfg, list) else []
    return {e.strip().lower() for e in emails if e and e.strip()}


def is_platform_admin(email: str | None) -> bool:
    """True when ``email`` is on the platform-admin allow-list."""
    if not email:
        return False
    return email.strip().lower() in admin_emails()
