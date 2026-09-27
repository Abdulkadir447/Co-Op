"""Support — owner-raised issue reports (the in-app "Report an issue" page).

The mirror image of :mod:`backend.feedback`: feedback is something Co-op *asks
for* on a three-week cadence, an issue report is something the owner raises the
moment something is wrong. Reports are stored tenant-scoped so the owner can
see what they have already sent, and emailed to the support inbox so a problem
reaches the team even if nobody follows up in app.

There is no cadence, no prompt and no compulsory answer here — submitting is
always allowed, as often as needed. ``status`` is team-side triage bookkeeping
(``new`` -> ``triaged`` -> ``resolved``); the owner only ever creates rows.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select

from .models import Business, IssueReport
from .schemas import ISSUE_CATEGORIES, ISSUE_SEVERITIES, IssueReportIn


class InvalidIssueReport(ValueError):
    """``category`` / ``severity`` is not one of the allowed values."""


async def record_issue_report(
    db,
    business: Business,
    user_id: Optional[str],
    req: IssueReportIn,
) -> IssueReport:
    """Persist one issue report against the caller's business."""
    category = (req.category or "other").strip().lower() or "other"
    severity = (req.severity or "normal").strip().lower() or "normal"
    if category not in ISSUE_CATEGORIES:
        raise InvalidIssueReport(
            f"category must be one of: {', '.join(sorted(ISSUE_CATEGORIES))}"
        )
    if severity not in ISSUE_SEVERITIES:
        raise InvalidIssueReport(
            f"severity must be one of: {', '.join(sorted(ISSUE_SEVERITIES))}"
        )

    row = IssueReport(
        business_id=business.id,
        submitted_by=user_id,
        category=category,
        severity=severity,
        subject=req.subject.strip(),
        description=req.description.strip(),
        contact_email=(req.contact_email or None),
        app_version=(req.app_version or None),
        platform=(req.platform or None),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_issue_reports(db, business: Business, limit: int = 100) -> list[dict[str, Any]]:
    """The business's own reports, newest first (owner-only at the route)."""
    rows = (
        await db.execute(
            select(IssueReport)
            .where(IssueReport.business_id == business.id)
            .order_by(IssueReport.created_at.desc(), IssueReport.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [
        {
            "id": r.id,
            "category": r.category,
            "severity": r.severity,
            "subject": r.subject,
            "description": r.description,
            "contact_email": r.contact_email,
            "app_version": r.app_version,
            "platform": r.platform,
            "status": r.status,
            "submitted_by": r.submitted_by,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
