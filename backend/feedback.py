"""Feedback — the periodic, in-app "how are we doing?" prompt.

Cadence rules (product decision):

* The prompt is anchored to the start of the *paid relationship*: the trial
  start if the business trialled, otherwise the first successful Paystack
  charge. A business that never trialled and never paid is never prompted.
* The first prompt lands ``INTERVAL_DAYS`` (21 days / three weeks) after that
  anchor — comfortably after a 10-day trial has ended — and is **compulsory**.
* Later prompts repeat every ``INTERVAL_DAYS`` and may be **skipped**.

Both a submission and a skip write a :class:`~backend.models.Feedback` row
(``kind`` = ``submitted`` | ``dismissed``). The prompt is "due" only when the
current three-week window has no row yet, so a skip silences it until the next
window rather than nagging on every page load.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from sqlalchemy import select

from .models import Business, Feedback, Payment


# Three weeks between prompts; the first prompt is one interval after anchor.
INTERVAL_DAYS = 21


def _now() -> dt.datetime:
    """Naive UTC — matches the server_default ``func.now()`` on the columns."""
    return dt.datetime.utcnow()


async def _anchor(db, business: Business) -> Optional[dt.datetime]:
    """When the paid relationship began: trial start, else first paid charge."""
    from .billing import get_or_create_subscription

    sub = await get_or_create_subscription(db, business)
    if sub.trial_started_at is not None:
        return sub.trial_started_at

    first_paid = (
        await db.execute(
            select(Payment)
            .where(
                Payment.business_id == business.id,
                Payment.status == "success",
                Payment.paid_at.is_not(None),
            )
            .order_by(Payment.paid_at.asc())
            .limit(1)
        )
    ).scalars().first()
    if first_paid is not None and first_paid.paid_at is not None:
        return first_paid.paid_at

    return None


async def feedback_status(db, business: Business) -> dict[str, Any]:
    """Whether a prompt is due, and whether it is the compulsory first one."""
    anchor = await _anchor(db, business)
    if anchor is None:
        # Never trialled and never paid — no feedback relationship yet.
        return {
            "due": False,
            "required": False,
            "due_at": None,
            "interval_days": INTERVAL_DAYS,
            "submitted_before": False,
        }

    now = _now()
    first_due = anchor + dt.timedelta(days=INTERVAL_DAYS)
    if now < first_due:
        return {
            "due": False,
            "required": False,
            "due_at": first_due.isoformat(),
            "interval_days": INTERVAL_DAYS,
            "submitted_before": False,
        }

    rows = (
        await db.execute(
            select(Feedback).where(Feedback.business_id == business.id)
        )
    ).scalars().all()
    submitted_before = any(r.kind == "submitted" for r in rows)
    last_activity = max((r.created_at for r in rows if r.created_at), default=None)

    # Index of the current three-week window (1 = first prompt window).
    elapsed_days = (now - anchor).days
    window_index = max(1, elapsed_days // INTERVAL_DAYS)
    window_start = anchor + dt.timedelta(days=INTERVAL_DAYS * window_index)

    due = last_activity is None or last_activity < window_start
    return {
        "due": due,
        # The very first prompt is compulsory; every later one is skippable.
        "required": not submitted_before,
        "due_at": window_start.isoformat(),
        "interval_days": INTERVAL_DAYS,
        "submitted_before": submitted_before,
    }


async def record_feedback(
    db,
    business: Business,
    user_id: Optional[str],
    *,
    kind: str = "submitted",
    rating: Optional[int] = None,
    overall: Optional[str] = None,
    likes: Optional[str] = None,
    issues: Optional[str] = None,
    improvements: Optional[str] = None,
) -> Feedback:
    """Persist a submission (or a dismiss) for the current window."""
    row = Feedback(
        business_id=business.id,
        submitted_by=user_id,
        kind=kind,
        rating=rating,
        overall=(overall or None),
        likes=(likes or None),
        issues=(issues or None),
        improvements=(improvements or None),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_feedback(db, business: Business, limit: int = 100) -> list[dict[str, Any]]:
    """The business's feedback history (newest first), owner-only at the route.

    Submissions only — dismissals are cadence bookkeeping, not responses.
    """
    rows = (
        await db.execute(
            select(Feedback)
            .where(
                Feedback.business_id == business.id,
                Feedback.kind == "submitted",
            )
            .order_by(Feedback.created_at.desc(), Feedback.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [
        {
            "id": r.id,
            "rating": r.rating,
            "overall": r.overall,
            "likes": r.likes,
            "issues": r.issues,
            "improvements": r.improvements,
            "submitted_by": r.submitted_by,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
