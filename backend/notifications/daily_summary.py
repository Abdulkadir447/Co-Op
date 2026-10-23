"""Daily Business Summary (PRD v1 daily notification).

Architecture — reuse, don't re-implement:

    Business data
        ↓
    Existing reporting/briefing calculations
        ↓
    Verified DailySummary object (this module)
        ↓
    In-app notification presentation (frontend)

No second calculation path exists:
  * revenue / orders / comparisons  -> reports.service._scoped_lines
  * notable insights                -> briefing.build_briefing (verified)
  * low / out-of-stock              -> the shared stock definitions
  * new customers today             -> one direct, trivial query

The LLM is NOT involved in producing this summary. It is computed on demand
and is stateless: requesting it multiple times the same day yields the same
underlying summary (no records are created, so nothing can duplicate). No
scheduler or background worker is needed for v1.
"""
from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlalchemy import select

from .. import briefing as briefing_mod
from .. import timezones as tz_mod
from ..models import Business, Customer, Product
from ..reports.service import ReportFilters, _pct, _scoped_lines
from .schemas import (
    DailySummary,
    DailySummaryBusiness,
    DailySummaryComparison,
    DailySummaryCustomers,
    DailySummaryInsight,
    DailySummaryInventory,
    DailySummaryLowItem,
    DailySummaryMonthToDate,
    DailySummaryNotableChange,
    DailySummaryOutItem,
    DailySummaryToday,
    DailySummaryVsYesterday,
)

# A swing at/above this magnitude is "notable" (deterministic, honest).
NOTABLE_SWING_PCT = 20.0

_SEVERITY_RANK = {"critical": 0, "warning": 1, "info": 2}


async def _window_revenue_orders(
    db, business_id: int, start: dt.date, end: dt.date, tz
) -> tuple[float, int]:
    """(revenue, distinct order count) over [start, end] — reporting engine."""
    f = ReportFilters.from_query(from_str=start.isoformat(), to_str=end.isoformat())
    orders, rows = await _scoped_lines(db, business_id, f, start, end, tz)
    revenue = sum(r[7] or 0 for r in rows)
    return revenue, len(orders)


def _month_to_date_points(
    today: dt.date,
) -> tuple[tuple[dt.date, dt.date], Optional[tuple[dt.date, dt.date]]]:
    """Current month-to-date window, plus the same-length previous-month
    window (None when today is the 1st — the previous window is zero-length)."""
    cur_start = today.replace(day=1)
    if today.day == 1:
        return (cur_start, today), None
    last_month_day = cur_start - dt.timedelta(days=1)
    prev_start = last_month_day.replace(day=1)
    prev_end = last_month_day.replace(day=today.day)
    return (cur_start, today), (prev_start, prev_end)


async def build_daily_summary(db, business: Business) -> DailySummary:
    tz = tz_mod.business_tz(business.timezone)
    today = tz_mod.local_today(tz)
    currency = business.currency or "USD"

    # --- Today -------------------------------------------------------------
    today_rev, today_orders = await _window_revenue_orders(db, business.id, today, today, tz)

    # --- Yesterday ---------------------------------------------------------
    yesterday = today - dt.timedelta(days=1)
    yest_rev, yest_orders = await _window_revenue_orders(db, business.id, yesterday, yesterday, tz)
    vs_yesterday = DailySummaryVsYesterday(
        revenue=round(yest_rev, 2),
        orders=yest_orders,
        change_percent=_pct(today_rev, yest_rev) if yest_rev else None,
    )

    # --- Month-to-date vs same point last month ----------------------------
    (cur_start, cur_end), prev_window = _month_to_date_points(today)
    mtd_rev, mtd_orders = await _window_revenue_orders(db, business.id, cur_start, cur_end, tz)
    prev_mtd_rev: Optional[float] = None
    mtd_change: Optional[float] = None
    if prev_window:
        prev_mtd_rev, _ = await _window_revenue_orders(
            db, business.id, prev_window[0], prev_window[1], tz
        )
        mtd_change = _pct(mtd_rev, prev_mtd_rev) if prev_mtd_rev else None
    month_to_date = DailySummaryMonthToDate(
        revenue=round(mtd_rev, 2),
        orders=mtd_orders,
        previous_period_revenue=round(prev_mtd_rev, 2) if prev_mtd_rev is not None else None,
        change_percent=mtd_change,
    )

    # --- Notable sales change (day-over-day first, then month-to-date) -----
    notable_change: Optional[DailySummaryNotableChange] = None
    if (
        vs_yesterday.change_percent is not None
        and abs(vs_yesterday.change_percent) >= NOTABLE_SWING_PCT
    ):
        direction = "up" if vs_yesterday.change_percent > 0 else "down"
        notable_change = DailySummaryNotableChange(
            direction=direction,
            period="yesterday",
            message=(
                f"Revenue is {'up' if direction == 'up' else 'down'} "
                f"{abs(vs_yesterday.change_percent):.0f}% versus yesterday."
            ),
        )
    elif mtd_change is not None and abs(mtd_change) >= NOTABLE_SWING_PCT:
        direction = "up" if mtd_change > 0 else "down"
        notable_change = DailySummaryNotableChange(
            direction=direction,
            period="month_to_date",
            message=(
                f"Revenue is {'up' if direction == 'up' else 'down'} "
                f"{abs(mtd_change):.0f}% versus the same point last month."
            ),
        )

    # --- Inventory risk (shared stock definitions) -------------------------
    products = (await db.execute(
        select(Product).where(Product.business_id == business.id, Product.deleted_at.is_(None))
    )).scalars().all()
    low = [p for p in products if 0 < (p.current_stock or 0) <= (p.reorder_level or 0)]
    out = [p for p in products if (p.current_stock or 0) <= 0]
    low_items = [
        DailySummaryLowItem(
            name=p.name,
            sku=p.sku or "",
            stock=p.current_stock or 0,
            reorder_level=p.reorder_level or 0,
        )
        for p in sorted(low, key=lambda p: (p.current_stock or 0))[:5]
    ]
    out_items = [DailySummaryOutItem(name=p.name, sku=p.sku or "") for p in out[:5]]

    # --- Customer activity (new today) -------------------------------------
    start_today = tz_mod.local_midnight_utc(today, tz)
    end_today = tz_mod.local_midnight_utc(today + dt.timedelta(days=1), tz)
    new_customers = (await db.execute(
        select(Customer).where(
            Customer.business_id == business.id,
            Customer.deleted_at.is_(None),
            Customer.created_at >= start_today,
            Customer.created_at < end_today,
        )
    )).scalars().all()

    # --- Verified insights from the briefing engine ------------------------
    brief = await briefing_mod.build_briefing(db, business.id)
    insights = [
        DailySummaryInsight(
            severity=i.get("severity", "info"),
            title=i.get("title", ""),
            evidence=i.get("evidence", ""),
            link=i.get("link", "/"),
        )
        for i in brief.get("insights", [])
    ]
    insights.sort(key=lambda i: _SEVERITY_RANK.get(i.severity, 3))
    insights = insights[:3]

    # --- Notable? ----------------------------------------------------------
    has_data = today_orders > 0 or mtd_orders > 0 or len(products) > 0 or len(new_customers) > 0
    notable = (
        today_orders > 0
        or notable_change is not None
        or len(low_items) > 0
        or len(out_items) > 0
        or len(new_customers) > 0
        or any(i.severity in ("warning", "critical") for i in insights)
    )

    if not has_data:
        empty_message = (
            "Once you import or record your first orders, your daily summary "
            "appears here."
        )
    elif not notable:
        empty_message = (
            "Nothing notable today — no sales, no stock alerts, and the briefing has no warnings. "
            "A quiet day is a data point too."
        )
    else:
        empty_message = None

    return DailySummary(
        date=today.isoformat(),
        generated_at=dt.datetime.now().isoformat(timespec="seconds"),
        business=DailySummaryBusiness(name=business.name or "Your business", currency=currency),
        has_data=has_data,
        notable=notable,
        empty_message=empty_message,
        today=DailySummaryToday(revenue=round(today_rev, 2), orders=today_orders),
        comparison=DailySummaryComparison(vs_yesterday=vs_yesterday, month_to_date=month_to_date),
        notable_change=notable_change,
        inventory=DailySummaryInventory(
            low_count=len(low),
            out_count=len(out),
            low_items=low_items,
            out_items=out_items,
        ),
        customers=DailySummaryCustomers(
            new_today=len(new_customers),
            new_names=[c.full_name for c in new_customers][:5],
        ),
        insights=insights,
    )
