"""Revenue forecasting (AI Platform phase — "Forecasting" deliverable).

Co-op's trust model applies to forecasts too: this is a TRANSPARENT trend
calculation over the business's real, verified order data — never a
black-box machine-learning prediction, and the UI always labels it as an
estimate (types.ts: "forecast — an estimate, never presented as an ML
prediction").

Method (deterministic, no third-party dependencies):
  * Series: monthly revenue from non-cancelled orders, over the last 12
    calendar months (current month included, marked in-progress). The
    series is TRUNCATED at the business's first order month — a business
    cannot have history before its first sale, and padding with zeros
    would corrupt the trend for young businesses.
  * Fit: ordinary least squares over the COMPLETED months only.
  * Estimate: the trend line evaluated at the next calendar month,
    clamped at zero (revenue cannot be negative).
  * Range: estimate ± max(residual std, 15% of estimate) — a plain,
    defensible spread, deliberately NOT labelled a confidence interval.
  * Fewer than 3 completed months of history -> ``available: false`` with
    an honest reason (the UI shows "not enough history yet").

Read-only; the same data on the same day always yields the same numbers.
"""

from __future__ import annotations

import datetime as _dt
import math
from typing import Any, Optional

from sqlalchemy import func, select

from .. import timezones as tz_mod
from ..models import Business, Order

MIN_COMPLETED_MONTHS = 3
WINDOW_MONTHS = 12  # completed months considered (plus the in-progress current one)


def _month_start(d: _dt.date) -> _dt.date:
    return _dt.date(d.year, d.month, 1)


def _add_months(d: _dt.date, n: int) -> _dt.date:
    """Shift a month-anchored date by n months (day preserved)."""
    idx = d.year * 12 + (d.month - 1) + n
    return _dt.date(idx // 12, idx % 12 + 1, min(d.day, 28) if d.day > 28 else d.day)


def _as_date(x, tz) -> Optional[_dt.date]:
    """Local calendar date of a naive-UTC timestamp (a date passes through)."""
    if isinstance(x, _dt.datetime):
        return tz_mod.utc_to_local_date(x, tz)
    return x


def _least_squares(ys: list[float]) -> tuple[float, float, float]:
    """OLS fit of y = intercept + slope*x for x = 0..n-1.

    Returns (slope, intercept, residual_std). Degenerate inputs (n < 2,
    or zero variance in x — impossible here) fall back to a flat line.
    """
    n = len(ys)
    if n == 0:
        return 0.0, 0.0, 0.0
    mean_y = sum(ys) / n
    if n < 2:
        return 0.0, mean_y, 0.0
    mean_x = (n - 1) / 2
    sxx = sum((i - mean_x) ** 2 for i in range(n))
    sxy = sum((i - mean_x) * (y - mean_y) for i, y in enumerate(ys))
    slope = sxy / sxx if sxx else 0.0
    intercept = mean_y - slope * mean_x
    resid = [y - (intercept + slope * i) for i, y in enumerate(ys)]
    residual_std = math.sqrt(sum(r * r for r in resid) / n)
    return slope, intercept, residual_std


async def build_forecast(db, business_id: int, currency: str = "USD") -> dict[str, Any]:
    """Build the verified revenue forecast for one business. Read-only."""
    business = (await db.execute(
        select(Business).where(Business.id == business_id)
    )).scalar_one_or_none()
    tz = tz_mod.business_tz(business.timezone if business else None)
    today = tz_mod.local_today(tz)
    cur = _month_start(today)
    window_start = _add_months(cur, -(WINDOW_MONTHS - 1))

    scope = [
        Order.business_id == business_id,
        Order.deleted_at.is_(None),
        Order.status != "cancelled",
    ]

    def _series(start: _dt.date) -> list[dict[str, Any]]:
        out = []
        d = start
        while d <= cur:
            out.append(
                {
                    "key": d.strftime("%Y-%m"),
                    "label": d.strftime("%b"),
                    "revenue": 0.0,
                    "orders": 0,
                    "in_progress": d == cur,
                }
            )
            d = _add_months(d, 1)
        return out

    def _unavailable(reason: str, months: list[dict[str, Any]], completed: int) -> dict[str, Any]:
        return {
            "available": False,
            "reason": reason,
            "currency": currency,
            "as_of": today.isoformat(),
            "method": None,
            "months": months,
            "completed_months": completed,
            "required_months": MIN_COMPLETED_MONTHS,
            "forecast": None,
        }

    # First order EVER (not just in the window) — the series starts there.
    first_day = (await db.execute(select(func.min(Order.order_date)).where(*scope))).scalar()
    if first_day is None:
        return _unavailable("no_sales_history", _series(window_start), 0)

    series_start = max(window_start, _month_start(_as_date(first_day, tz)))
    months = _series(series_start)
    next_after_cur = _add_months(cur, 1)

    rows = (
        await db.execute(
            select(Order.order_date, Order.total_amount).where(
                *scope,
                Order.order_date >= _dt.datetime.combine(series_start, _dt.time.min),
                Order.order_date < _dt.datetime.combine(next_after_cur, _dt.time.min),
            )
        )
    ).all()

    bucket = {m["key"]: m for m in months}
    for order_date, total in rows:
        od = _as_date(order_date, tz)
        if od is None:
            continue
        m = bucket.get(od.strftime("%Y-%m"))
        if m is None:
            continue
        m["revenue"] += float(total or 0.0)
        m["orders"] += 1
    for m in months:
        m["revenue"] = round(m["revenue"], 2)

    completed = [m for m in months if not m["in_progress"]]
    if len(completed) < MIN_COMPLETED_MONTHS:
        return _unavailable("insufficient_history", months, len(completed))

    # --- Trend fit over completed months -----------------------------------
    ys = [m["revenue"] for m in completed]
    slope, intercept, residual_std = _least_squares(ys)
    estimate = max(0.0, intercept + slope * len(ys))

    # Range: at least 15% of the estimate so a "perfect trend" still shows
    # an honest band, plus whatever the residuals actually spread.
    half = max(residual_std, 0.15 * estimate)
    low = max(0.0, estimate - half)
    high = estimate + half

    last_rev = completed[-1]["revenue"]
    trend_percent = round((estimate - last_rev) / last_rev * 100, 1) if last_rev > 0 else None

    next_m = _add_months(cur, 1)
    return {
        "available": True,
        "reason": None,
        "currency": currency,
        "as_of": today.isoformat(),
        "method": (
            "Least-squares trend over your completed months — a transparent "
            "calculation, not a machine-learning prediction."
        ),
        "months": months,
        "completed_months": len(completed),
        "required_months": MIN_COMPLETED_MONTHS,
        "forecast": {
            "period": next_m.strftime("%Y-%m"),
            "period_label": next_m.strftime("%b %Y"),
            "estimated": round(estimate, 2),
            "low": round(low, 2),
            "high": round(high, 2),
            "trend_percent": trend_percent,
            "completed_months_used": len(completed),
        },
    }
