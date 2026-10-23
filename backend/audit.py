"""Append-only audit trail (BSD Ch1.17) — persistence + tenant-scoped reads.

Hardening backlog item: the ``audit_log`` table existed but nothing wrote to
it and it had no tenant column, so there was no way to show an owner their
own activity. This module provides the write helper (used by every mutating
endpoint and by the sync push path) and the list query. The HTTP route lives
in ``main.py`` (the codebase convention: routes in main.py, logic in domain
modules).
"""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import AuditLog
from .redact import deep_redact


async def record_audit(
    db: AsyncSession,
    business_id: int,
    table_name: str,
    record_id: Optional[int],
    action: str,
    change: Optional[dict[str, Any]] = None,
    actor: Optional[str] = None,
) -> None:
    """Append one audit row to the caller's request transaction.

    ``change`` is serialised immediately so nothing mutable leaks into the
    row. The row commits atomically with the mutation it describes — an
    audit entry can never describe a write that didn't happen.
    """
    row = AuditLog(
        business_id=business_id,
        table_name=table_name[:50],
        record_id=record_id,
        action=action[:20],
        actor=(actor or "")[:255] or None,
        # Redact anything that looks like a secret before it is persisted —
        # the audit ledger must describe the change, not leak credentials.
        change_json=json.dumps(deep_redact(change)) if change else None,
    )
    db.add(row)


async def list_entries(
    db: AsyncSession,
    business_id: int,
    limit: int = 50,
    offset: int = 0,
) -> list[AuditLog]:
    """The tenant's activity, newest first. Historical rows (pre-tenant
    attribution) have NULL business_id and are never returned."""
    stmt = (
        select(AuditLog)
        .where(AuditLog.business_id == business_id)
        .order_by(desc(AuditLog.created_at), desc(AuditLog.id))
        .limit(limit)
        .offset(offset)
    )
    return list((await db.execute(stmt)).scalars().all())
