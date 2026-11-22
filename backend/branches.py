"""Branches — the location dimension every stock and money row hangs off.

Co-op started as a single-shop product: one business, one stock number, no
concept of "which shop". A chain cannot be built on that, because every report
then answers "what does the company hold" when the question is "what does
*Branch 4* hold", and one query that forgets the filter silently reports
consolidated stock as if it were one shop.

D1 makes the branch a **dimension on the row**, not a filter applied at read
time:

  * every business owns at least one branch (auto-provisioned, code ``MAIN``);
  * every transactional row carries ``branch_id``;
  * the caller's branch is resolved once, at the same choke point that already
    resolves the tenant and the role.

Two rules keep this honest:

1. **Single-branch tenants are not special-cased.** The SMB product gets a
   ``MAIN`` branch row like everyone else, so there is one code path and no
   "if the business has one branch" branch in the code.
2. **A branch id from another tenant is a 404, not a fallback.** Falling back to
   the default branch would silently file a chain's Branch 4 sale under Branch 1
   — a correct-looking response with the wrong answer inside it.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Branch

DEFAULT_BRANCH_CODE = "MAIN"
DEFAULT_BRANCH_NAME = "Main Branch"


async def default_branch(db: AsyncSession, business_id: int) -> Branch:
    """The business's default branch, created on first use.

    Every business has one from the moment it first touches a business
    endpoint, so no code below this line has to handle "a tenant with no
    branch" — that state is made unreachable rather than defended against.
    """
    row = (
        await db.execute(
            select(Branch)
            .where(
                Branch.business_id == business_id,
                Branch.deleted_at.is_(None),
            )
            .order_by(Branch.is_default.desc(), Branch.id)
            .limit(1)
        )
    ).scalars().first()
    if row is not None:
        return row

    row = Branch(
        business_id=business_id,
        code=DEFAULT_BRANCH_CODE,
        name=DEFAULT_BRANCH_NAME,
        is_default=True,
        created_by=None,
    )
    db.add(row)
    await db.flush()
    return row


async def resolve_branch(
    db: AsyncSession,
    business_id: int,
    requested_id: Optional[int],
) -> Branch:
    """The branch this request acts on.

    ``requested_id`` comes from the client (``X-Branch-Id``). It is honoured
    only when it belongs to THIS business; anything else raises, because a
    silent fallback is how a sale ends up in the wrong shop's ledger.
    """
    if requested_id is None:
        return await default_branch(db, business_id)

    row = (
        await db.execute(
            select(Branch).where(
                Branch.id == requested_id,
                Branch.business_id == business_id,
                Branch.deleted_at.is_(None),
            )
        )
    ).scalars().first()
    if row is None:
        raise BranchNotInTenant(requested_id)
    return row


class BranchNotInTenant(LookupError):
    """The requested branch does not exist in the caller's business."""

    def __init__(self, branch_id: int):
        super().__init__(f"Branch {branch_id} does not exist in this business")
        self.branch_id = branch_id
