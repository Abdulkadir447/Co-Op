"""Investor metrics — the numbers an application form asks for, computed once.

Every accelerator application asks the same five questions: how many customers,
how much revenue, how fast is it growing, are they still using it, and does a
paying customer pay for itself. A founder who answers those from memory gets
them wrong; a founder who answers them from a query can defend every digit in
an interview.

So this module computes them from the ledgers Co-op already keeps, with no new
instrumentation and no analytics vendor:

    signups      businesses.created_at
    activation   first invoices.created_at for a business, vs its signup date
    engagement   a business that wrote something this week (audit_log, ai_usage)
    revenue      payments with status='success', annualised to a monthly figure
    AI cost      ai_usage credits and tokens per business

Everything here is **cross-tenant and aggregate**: it is mounted behind
``require_platform_admin`` and returns counts only — never a business name, an
email or a row from a customer. The per-tenant routes stay the only way to read
another business's data, and they are tenant-scoped.

Definitions are returned with the numbers on purpose. A metric whose definition
is not written down is a metric somebody will accuse you of inventing, and the
first rule of this codebase is that a number is never asserted without a basis.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import AiUsage, AuditLog, Business, Invoice, Payment

# A business counts as "active" in a week if it wrote an audit row (any
# mutation) or ran an AI turn. Both are append-only and neither is client
# supplied, so neither can be inflated from the browser.
ACTIVE_TABLES = (AuditLog, AiUsage)


def _pct(new: int, old: int) -> Optional[float]:
    """Percent change, or None when there is no base to grow from.

    Returning None rather than 0 is deliberate: "0% growth" and "no previous
    week to compare with" are different facts, and a founder should never quote
    the second as the first.
    """
    if old == 0:
        return None
    return round((new - old) / old * 100.0, 1)


def _rate(numerator: int, denominator: int) -> Optional[float]:
    if denominator == 0:
        return None
    return round(numerator / denominator * 100.0, 1)


async def _active_ids(
    db: AsyncSession, start: dt.datetime, end: Optional[dt.datetime] = None
) -> set[int]:
    """Business ids that wrote at least one activity row in [start, end)."""
    found: set[int] = set()
    for model in ACTIVE_TABLES:
        stmt = select(model.business_id).where(model.created_at >= start)
        if end is not None:
            stmt = stmt.where(model.created_at < end)
        rows = (await db.execute(stmt.distinct())).scalars().all()
        found.update(int(b) for b in rows if b is not None)
    return found


async def snapshot(
    db: AsyncSession,
    *,
    now: Optional[dt.datetime] = None,
    window_days: int = 28,
    activation_days: int = 7,
) -> dict[str, Any]:
    """One consistent read of the five numbers, as of ``now``."""
    now = now or dt.datetime.utcnow()
    day = dt.timedelta(days=1)
    week_ago = now - 7 * day
    two_weeks_ago = now - 14 * day
    window_start = now - window_days * day
    prev_window_start = window_start - window_days * day

    # --- signups -----------------------------------------------------------
    rows = (
        await db.execute(
            select(Business.id, Business.created_at).where(Business.deleted_at.is_(None))
        )
    ).all()
    businesses = [(int(bid), created) for bid, created in rows if created is not None]
    total_businesses = len(businesses)
    new_7 = sum(1 for _, d in businesses if d >= week_ago)
    new_prev_7 = sum(1 for _, d in businesses if two_weeks_ago <= d < week_ago)

    # --- activation: first invoice inside the activation window ------------
    first_invoice = dict(
        (
            await db.execute(
                select(Invoice.business_id, func.min(Invoice.created_at)).group_by(
                    Invoice.business_id
                )
            )
        ).all()
    )
    # Only businesses old enough to have had the full window can fail it; one
    # that signed up yesterday must not count against the rate.
    eligible = [(bid, d) for bid, d in businesses if d <= now - activation_days * day]
    activated = sum(
        1
        for bid, signed_up in eligible
        if first_invoice.get(bid) is not None
        and first_invoice[bid] <= signed_up + activation_days * day
    )

    # --- engagement --------------------------------------------------------
    active_this_week = await _active_ids(db, week_ago)
    active_last_week = await _active_ids(db, two_weeks_ago, week_ago)
    retained = len(active_this_week & active_last_week)

    # --- revenue -----------------------------------------------------------
    paid = (
        await db.execute(
            select(
                Payment.business_id,
                Payment.amount_kobo,
                Payment.interval,
                Payment.currency,
                Payment.created_at,
            ).where(Payment.status == "success", Payment.created_at >= prev_window_start)
        )
    ).all()

    def monthly(amount: Optional[int], interval: str) -> float:
        """Normalise one charge to a monthly figure in major units."""
        if not amount:
            return 0.0
        value = amount / 100.0
        return round(value / 12.0, 2) if interval == "annual" else round(value, 2)

    window_payments = [p for p in paid if p.created_at and p.created_at >= window_start]
    prev_payments = [p for p in paid if p.created_at and p.created_at < window_start]
    mrr = round(sum(monthly(p.amount_kobo, p.interval) for p in window_payments), 2)
    prev_mrr = round(sum(monthly(p.amount_kobo, p.interval) for p in prev_payments), 2)
    paying = {p.business_id for p in window_payments}
    currencies = sorted({(p.currency or "USD") for p in window_payments}) or ["USD"]

    # --- AI usage ----------------------------------------------------------
    ai_row = (
        await db.execute(
            select(
                func.coalesce(func.sum(AiUsage.credits_used), 0),
                func.count(AiUsage.id),
            ).where(AiUsage.created_at >= window_start)
        )
    ).one()
    credits_used, ai_requests = int(ai_row[0] or 0), int(ai_row[1] or 0)

    result: dict[str, Any] = {
        "as_of": now.isoformat() + "Z",
        "window_days": window_days,
        "businesses": {
            "total": total_businesses,
            "new_last_7_days": new_7,
            "new_previous_7_days": new_prev_7,
            "signup_growth_pct_week_over_week": _pct(new_7, new_prev_7),
        },
        "activation": {
            "eligible_businesses": len(eligible),
            "activated": activated,
            "rate_pct": _rate(activated, len(eligible)),
            "definition": (
                f"issued a first invoice within {activation_days} days of signing up; "
                "businesses younger than that window are excluded"
            ),
        },
        "engagement": {
            "active_last_7_days": len(active_this_week),
            "active_previous_7_days": len(active_last_week),
            "week_over_week_retention_pct": _rate(retained, len(active_last_week)),
            "definition": "wrote an audit row or ran an AI turn in the period",
        },
        "revenue": {
            "currency": currencies[0] if len(currencies) == 1 else currencies,
            "mrr": mrr,
            "previous_window_mrr": prev_mrr,
            "mrr_growth_pct": _pct(int(mrr), int(prev_mrr)) if prev_mrr else None,
            "paying_businesses": len(paying),
            "arpu": round(mrr / len(paying), 2) if paying else None,
            "definition": (
                "successful charges only (a browser return never counts); annual "
                "charges are divided by 12"
            ),
        },
        "ai": {
            "credits_used": credits_used,
            "requests": ai_requests,
            "credits_per_paying_business": (
                round(credits_used / len(paying), 1) if paying else None
            ),
            "definition": "sum of the ai_usage ledger written after each answered turn",
        },
    }
    result["headline"] = headline(result)
    return result


def headline(metrics: dict[str, Any]) -> str:
    """One defensible sentence for an application's traction field.

    Deliberately dry. An accelerator reader discounts adjectives, so this
    string carries numbers and a period and nothing else. When a number does not
    exist yet it says "no data" rather than zero, because inventing a zero is
    the same lie as inventing a million.
    """
    biz = metrics["businesses"]
    rev = metrics["revenue"]
    growth = biz["signup_growth_pct_week_over_week"]
    parts = [
        f"{biz['total']} business{'es' if biz['total'] != 1 else ''} signed up",
        f"{biz['new_last_7_days']} in the last 7 days"
        + (f" ({growth:+.1f}% vs the previous 7)" if growth is not None else ""),
    ]
    if rev["paying_businesses"]:
        symbol = {"USD": "$", "EUR": "\u20ac", "GBP": "\u00a3"}.get(str(rev["currency"]))
        money = f"{symbol}{rev['mrr']:,.2f}" if symbol else f"{rev['currency']} {rev['mrr']:,.2f}"
        parts.append(f"{rev['paying_businesses']} paying, {money} MRR")
    else:
        parts.append("no paying customers yet")
    activation = metrics["activation"]["rate_pct"]
    if activation is not None:
        parts.append(f"{activation:.0f}% activated (first invoice)")
    return "; ".join(parts) + "."
