"""Business Context Builder (Pass 1) — verified facts, nothing else.

The model NEVER queries the database. This module reads the business's real
data and produces a compact, structured context of VERIFIED facts. The LLM
is then instructed (prompts.py) that every number it states must come from
this context — it explains, it does not invent.

The deterministic insight engine (briefing.py) is reused directly: its
insights are verified and already carry their evidence, so the LLM gets the
same ground truth the rest of Co-op uses — a single source of truth.
"""
from __future__ import annotations

import datetime as _dt
from typing import Any, Optional

from sqlalchemy import func, select

from .. import briefing as briefing_mod
from .. import timezones as tz_mod
from ..models import Business, Customer, Order, OrderItem, Product


def _as_date(x, tz) -> Optional[_dt.date]:
    if isinstance(x, _dt.datetime):
        return tz_mod.utc_to_local_date(x, tz)
    return x


async def build_context(
    db, business_id: int, business_name: str = "", currency: str = "USD"
) -> dict[str, Any]:
    """Assemble the verified context for one business. Read-only."""
    business = (await db.execute(
        select(Business).where(Business.id == business_id)
    )).scalar_one_or_none()
    tz = tz_mod.business_tz(business.timezone if business else None)
    today = tz_mod.local_today(tz)
    first_this = today.replace(day=1)
    first_next = (
        _dt.date(today.year + 1, 1, 1)
        if today.month == 12
        else _dt.date(today.year, today.month + 1, 1)
    )
    first_last = (
        _dt.date(today.year, today.month - 1, 1)
        if today.month > 1
        else _dt.date(today.year - 1, 12, 1)
    )
    last_30 = today - _dt.timedelta(days=29)

    bid = business_id
    order_scope = [
        Order.business_id == bid,
        Order.deleted_at.is_(None),
        Order.status != "cancelled",
    ]

    # --- Revenue: this month / last month / trailing 30 days ----------------
    async def _rev(a: _dt.date, b: _dt.date) -> tuple[float, int]:
        row = (await db.execute(
            select(func.coalesce(func.sum(Order.total_amount), 0.0), func.count(Order.id))
            .where(*order_scope,
                   Order.order_date >= _dt.datetime.combine(a, _dt.time.min),
                   Order.order_date < _dt.datetime.combine(b, _dt.time.min))
        )).one()
        return (row[0], row[1])

    this_rev, this_orders = await _rev(first_this, first_next)
    last_rev, last_orders = await _rev(first_last, first_this)
    d30_rev, d30_orders = await _rev(last_30, first_next)
    prev30_rev, prev30_orders = await _rev(last_30 - _dt.timedelta(days=30), last_30)

    def _pct(cur: float, prev: float) -> Optional[float]:
        return round((cur - prev) / prev * 100, 1) if prev else None

    # --- Top products (trailing 30 days) ------------------------------------
    top_rows = (await db.execute(
        select(
            Product.id, Product.name,
            func.sum(OrderItem.quantity).label("units"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("revenue"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(*order_scope, Order.order_date >= _dt.datetime.combine(last_30, _dt.time.min))
        .group_by(Product.id, Product.name)
        .order_by(func.sum(OrderItem.quantity * OrderItem.unit_price).desc())
        .limit(5)
    )).all()
    top_products = [
        {"name": r.name, "units": r.units or 0, "revenue": round(r.revenue or 0, 2)}
        for r in top_rows
    ]

    # --- Inventory risk ------------------------------------------------------
    products = (await db.execute(
        select(Product).where(Product.business_id == bid, Product.deleted_at.is_(None))
    )).scalars().all()
    inv_value = sum((p.current_stock or 0) * (p.cost_price or p.unit_price or 0) for p in products)
    low = sorted(
        (p for p in products if 0 < (p.current_stock or 0) <= (p.reorder_level or 0)),
        key=lambda p: p.current_stock or 0,
    )[:5]
    out = sorted(
        (p for p in products if (p.current_stock or 0) <= 0),
        key=lambda p: -p.reorder_level,
    )[:5]

    # --- Customers -----------------------------------------------------------
    customers = (await db.execute(
        select(Customer).where(Customer.business_id == bid, Customer.deleted_at.is_(None))
    )).scalars().all()
    cust_new = sum(
        1 for c in customers if c.created_at and _as_date(c.created_at, tz) >= first_this
    )

    # Inactive: ordered before, nothing in 30+ days, ranked by lifetime value.
    cust_last: dict[int, _dt.date] = {}
    cust_ltv: dict[int, float] = {}
    for o in (await db.execute(select(Order).where(*order_scope))).scalars():
        if o.customer_id is None or not o.order_date:
            continue
        od = _as_date(o.order_date, tz)
        if od is None:
            continue
        prev = cust_last.get(o.customer_id)
        if prev is None or od > prev:
            cust_last[o.customer_id] = od
        cust_ltv[o.customer_id] = cust_ltv.get(o.customer_id, 0.0) + (o.total_amount or 0)
    cust_by_id = {c.id: c for c in customers}
    inactive = []
    for cid, last in cust_last.items():
        days = (today - last).days
        if days >= 30:
            c = cust_by_id.get(cid)
            if c is not None:
                inactive.append({"name": c.full_name, "days_since_order": days,
                                 "lifetime_value": round(cust_ltv.get(cid, 0.0), 2)})
    inactive.sort(key=lambda r: -r["lifetime_value"])
    inactive = inactive[:5]

    # --- Margin (trailing 30 days) -------------------------------------------
    margin_row = (await db.execute(
        select(
            func.coalesce(
                func.sum(
                    (OrderItem.unit_price - func.coalesce(Product.cost_price, 0.0))
                    * OrderItem.quantity
                ),
                0.0,
            ),
            func.coalesce(func.sum(OrderItem.unit_price * OrderItem.quantity), 0.0),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(*order_scope, Order.order_date >= _dt.datetime.combine(last_30, _dt.time.min))
    )).one()
    blended_margin = round(margin_row[0] / margin_row[1] * 100, 1) if margin_row[1] else None

    # --- Recent orders --------------------------------------------------------
    recent_rows = (await db.execute(
        select(Order, Customer.full_name)
        .join(Customer, Customer.id == Order.customer_id)
        .where(*order_scope)
        .order_by(Order.order_date.desc(), Order.id.desc())
        .limit(10)
    )).all()
    recent_orders = [
        {"date": _as_date(o.order_date, tz).isoformat() if o.order_date else None,
         "customer": name, "total": round(o.total_amount or 0, 2), "status": o.status}
        for o, name in recent_rows
    ]

    # --- Deterministic insight engine (verified, single source of truth) -----
    briefing = await briefing_mod.build_briefing(db, business_id)
    insights = [
        {"severity": i["severity"], "title": i["title"], "body": i["body"],
         "evidence": i["evidence"], "link": i["link"]}
        for i in briefing.get("insights", [])
    ]

    history = briefing.get("history", {})

    return {
        "business": {"name": business_name or "Your business", "currency": currency or "USD"},
        "as_of": today.isoformat(),
        "periods": {
            "this_month": {"revenue": round(this_rev, 2), "orders": this_orders},
            "last_month": {"revenue": round(last_rev, 2), "orders": last_orders},
            "last_30_days": {"revenue": round(d30_rev, 2), "orders": d30_orders},
            "previous_30_days": {"revenue": round(prev30_rev, 2), "orders": prev30_orders},
        },
        "change_percent": {
            "month_vs_last_month": _pct(this_rev, last_rev),
            "last_30d_vs_previous_30d": _pct(d30_rev, prev30_rev),
        },
        "top_products_30d": top_products,
        "inventory": {
            "products": len(products),
            "total_value": round(inv_value, 2),
            "low_stock": [
                {
                    "name": p.name,
                    "sku": p.sku,
                    "stock": p.current_stock,
                    "reorder_level": p.reorder_level,
                }
                for p in low
            ],
            "out_of_stock": [{"name": p.name, "sku": p.sku} for p in out],
        },
        "customers": {
            "total": len(customers),
            "new_this_month": cust_new,
            "inactive_30d_plus": inactive,
        },
        "margin_30d": {"blended_percent": blended_margin, "profit": round(margin_row[0], 2)},
        "recent_orders": recent_orders,
        "history": {
            "span_months": history.get("span_months"),
            "total_revenue": history.get("total_revenue"),
            "first_order_date": history.get("first_order_date"),
            "last_order_date": history.get("last_order_date"),
            "imported": history.get("imported"),
        },
        "verified_insights": insights,
    }
