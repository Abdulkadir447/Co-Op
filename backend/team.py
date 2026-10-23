"""Team model — memberships, roles, invitations (TRD Ch17 §17.7).

v1 ships a single role (Business Owner). The team model here is the
foundation the owner can already use to grant access ahead of multi-seat
sales: the five future roles from §17.7 are defined and enforced at the
backend, and the client mirrors the same matrix.

Role semantics (owner is implicit — ``businesses.owner_id``):
  owner      full access, incl. team management + billing
  manager    business operations (settings/imports/sync) — no team, no billing
  sales      customers + orders write; everything else read
  inventory  products + stock write; everything else read
  accountant read-only everywhere, plus report exports
  viewer     read-only everywhere

Enforcement is a choke point in ``get_current_business`` (every business
endpoint depends on it): mutations are checked against WRITE_MATRIX by
request path; team-management endpoints additionally require the owner.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from .clerk_auth import ClerkUser, verify_clerk_token

TEAM_ROLES = ("manager", "sales", "inventory", "accountant", "viewer")
ROLE_LABELS = {
    "owner": "Business Owner",
    "manager": "Manager",
    "sales": "Sales Staff",
    "inventory": "Inventory Staff",
    "accountant": "Accountant",
    "viewer": "Read-only Viewer",
}

# Path prefix -> roles allowed to write there. Anything not listed is
# readable by every role and writable only by owner/manager (the conservative
# default for future surfaces).
WRITE_MATRIX: dict[str, tuple[str, ...]] = {
    # Sales domain: customers + orders.
    "/customers": ("owner", "manager", "sales"),
    "/orders": ("owner", "manager", "sales"),
    # Inventory domain: products + stock.
    "/products": ("owner", "manager", "inventory"),
    "/inventory": ("owner", "manager", "inventory"),
    # Imports touch every domain; any operational role may run them.
    "/imports": ("owner", "manager", "sales", "inventory"),
    # Invoicing: sales raises the paperwork, the accountant maintains it.
    "/invoices": ("owner", "manager", "sales", "accountant"),
    # Sync is an operational, not an administrative surface.
    "/sync": ("owner", "manager"),
}

# Endpoints that stay owner-only even for managers.
OWNER_ONLY_PREFIXES = (
    "/billing",
    "/team",
    "/audit",
    "/backups",
    "/business/settings",
)

# Any authenticated member may use these regardless of role.
ROLE_AGNOSTIC_PREFIXES = (
    "/ai/",
    "/ai",
    "/onboarding",
    "/reports/meta",
    "/dashboard",
)


def role_can_write(role: str, path: str) -> bool:
    if role == "owner":
        return True
    if role == "manager":
        return not path.startswith(OWNER_ONLY_PREFIXES)
    allowed = WRITE_MATRIX.get(path, None)
    if allowed is None:
        return False
    return role in allowed


def _path_prefix(path: str) -> str:
    """First two segments (/customers/1 -> /customers)."""
    parts = [p for p in path.split("/") if p]
    return "/" + parts[0] if parts else path


def assert_can_write(role: str, method: str, path: str) -> None:
    """403 unless the role may perform this mutation on this path.

    Called from get_current_business — the single choke point every business
    endpoint already passes through. Reads are always allowed; writes are
    checked against WRITE_MATRIX (owner/manager by default on unlisted
    surfaces); AI/onboarding/dashboard/report-meta are role-agnostic.
    """
    if method in ("GET", "HEAD", "OPTIONS"):
        return
    if any(path.startswith(p) for p in ROLE_AGNOSTIC_PREFIXES):
        return
    if not role_can_write(role, _path_prefix(path)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role {role!r} cannot perform this action",
        )


async def get_current_role(
    request: Request,
    user: ClerkUser = Depends(verify_clerk_token),
) -> str:
    """The caller's role for the tenant resolved by get_current_business.

    get_current_business runs first (FastAPI resolves the shared dependency
    chain in order) and stores the role on request.state; this dependency
    just surfaces it for endpoints that need an explicit check.
    """
    return getattr(request.state, "team_role", "owner")


async def require_owner(
    request: Request,
    role: str = Depends(get_current_role),
) -> str:
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the business owner can manage the team",
        )
    return role


async def require_manager(
    request: Request,
    role: str = Depends(get_current_role),
) -> str:
    if role not in ("owner", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner or manager access required",
        )
    return role
