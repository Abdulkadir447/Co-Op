"""
Co-op Day 1 Morning Briefing (v1) — verified intelligence, not LLM guesses.

Architecture (trust model):
    real business data
      -> deterministic calculations (this module, single source of truth)
      -> verified insight objects (each states its basis)
      -> deterministic phrasing into natural language
      -> Morning Briefing UI

v1 runs a fixed set of high-value analyses:
    revenue trend · top products · concentration · VIP customers ·
    inactive customers (with a draft follow-up action) · low stock ·
    margin/profitability (from Product.cost_price)
"""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field
from typing import Any, Optional

from sqlalchemy import select

from . import timezones as tz_mod
from .models import Business, Customer, Order, OrderItem, Product


@dataclass
class BriefingInsight:
    id: str
    kind: str  # overview | revenue | product | customer | inventory | profit
    severity: str  # info | warning | critical
    title: str
    body: str
    evidence: str
    link: str  # frontend route
    action: Optional[dict[str, Any]] = field(default=None)  # e.g. draft follow-up


def _as_date(x, tz):
    """Local calendar date of a naive-UTC timestamp (a date passes through)."""
    if isinstance(x, _dt.datetime):
        return tz_mod.utc_to_local_date(x, tz)
    return x


def _money(v: float) -> str:
    return f"${v:,.0f}" if abs(v - round(v)) < 0.05 else f"${v:,.2f}"


def _pct(v: float) -> str:
    return f"{v:+.1f}%" if v < 0 else f"{v:.1f}%"


async def build_briefing(db, business_id: int) -> dict[str, Any]:
    business = (await db.execute(
        select(Business).where(Business.id == business_id)
    )).scalar_one_or_none()
    tz = tz_mod.business_tz(business.timezone if business else None)
    today = tz_mod.local_today(tz)

    orders = (await db.execute(
        select(Order).where(Order.business_id == business_id, Order.deleted_at.is_(None))
    )).scalars().all()
    customers = (await db.execute(
        select(Customer).where(Customer.business_id == business_id, Customer.deleted_at.is_(None))
    )).scalars().all()
    products = (await db.execute(
        select(Product).where(Product.business_id == business_id, Product.deleted_at.is_(None))
    )).scalars().all()

    # Import provenance (v1 item 9): label insights as imported history
    # when the business's data came from the Intelligent Importer.
    from .models import ImportBatch
    batch_row = (await db.execute(
        select(ImportBatch)
        .where(ImportBatch.business_id == business_id)
        .order_by(ImportBatch.created_at.desc())
        .limit(1)
    )).scalars().first()
    latest_import = {
        "filename": batch_row.filename,
        "date": batch_row.created_at.date().isoformat() if batch_row.created_at else None,
        "rows": batch_row.row_count,
    } if batch_row is not None else None

    order_ids = [o.id for o in orders]
    items = (await db.execute(
        select(OrderItem).where(OrderItem.order_id.in_(order_ids))
    )).scalars().all() if order_ids else []

    cust_by_id = {c.id: c for c in customers}
    prod_by_id = {p.id: p for p in products}

    # ------------------------------------------------------------------
    # History window
    # ------------------------------------------------------------------
    dates = [_as_date(o.order_date, tz) for o in orders if o.order_date]
    first_day = min(dates) if dates else None
    last_day = max(dates) if dates else None
    span_days = (last_day - first_day).days + 1 if (first_day and last_day) else 0
    span_months = max(1, round(span_days / 30.4)) if span_days else 0

    total_revenue = sum(o.total_amount for o in orders)
    total_orders = len(orders)
    total_customers = len(customers)
    total_products = len(products)

    if not orders and not products and not customers:
        return {
            "ready": False,
            "history": {
                "first_order_date": None,
                "last_order_date": None,
                "span_months": 0,
                "orders": 0,
                "customers": 0,
                "products": 0,
                "total_revenue": 0.0,
                "imported": latest_import is not None,
                "latest_import": latest_import,
            },
            "insights": [],
        }

    # ------------------------------------------------------------------
    # Monthly revenue (last 6 calendar months, including current)
    # ------------------------------------------------------------------
    monthly: dict[_dt.date, float] = {}
    month_orders: dict[_dt.date, int] = {}
    for o in orders:
        od = _as_date(o.order_date, tz)
        if not od:
            continue
        m = _dt.date(od.year, od.month, 1)
        monthly[m] = monthly.get(m, 0.0) + o.total_amount
        month_orders[m] = month_orders.get(m, 0) + 1

    cur_month = _dt.date(today.year, today.month, 1)
    last_month = _dt.date(cur_month.year, cur_month.month, 1) - _dt.timedelta(days=1)
    last_month = _dt.date(last_month.year, last_month.month, 1)
    rev_this = monthly.get(cur_month, 0.0)
    rev_last = monthly.get(last_month, 0.0)

    # ------------------------------------------------------------------
    # Products: revenue by product, concentration, margin
    # ------------------------------------------------------------------
    prod_revenue: dict[int, float] = {}
    prod_units: dict[int, int] = {}
    margin_total = 0.0
    margin_revenue = 0.0
    items_with_cost = 0
    for it in items:
        p = prod_by_id.get(it.product_id)
        prod_revenue[it.product_id] = prod_revenue.get(it.product_id, 0.0) + it.total_price
        prod_units[it.product_id] = prod_units.get(it.product_id, 0) + it.quantity
        if p is not None and p.cost_price is not None:
            margin_total += (it.unit_price - p.cost_price) * it.quantity
            margin_revenue += it.unit_price * it.quantity
            items_with_cost += 1

    ranked = sorted(prod_revenue.items(), key=lambda kv: -kv[1])
    top_products = [
        {
            "product_id": pid,
            "name": (prod_by_id.get(pid) or Product()).name or f"Product #{pid}",
            "sku": (prod_by_id.get(pid) or Product()).sku or "",
            "revenue": round(rv, 2),
            "units": prod_units.get(pid, 0),
            "share_pct": round(rv / total_revenue * 100, 1) if total_revenue else 0.0,
            "unit_price": (prod_by_id.get(pid) or Product()).unit_price or 0.0,
        }
        for pid, rv in ranked[:5]
    ]
    concentration = (
        sum(t["revenue"] for t in top_products[:3]) / total_revenue * 100
        if total_revenue else 0.0
    )
    blended_margin = (margin_total / margin_revenue * 100) if margin_revenue else None
    cost_coverage = (items_with_cost / len(items) * 100) if items else 0.0

    # ------------------------------------------------------------------
    # Customers: VIPs + inactivity
    # ------------------------------------------------------------------
    cust_revenue: dict[int, float] = {}
    cust_last: dict[int, _dt.date] = {}
    cust_units: dict[int, dict[int, int]] = {}
    for o in orders:
        if o.customer_id is None:
            continue
        cust_revenue[o.customer_id] = cust_revenue.get(o.customer_id, 0.0) + o.total_amount
        od = _as_date(o.order_date, tz)
        if od:
            prev = cust_last.get(o.customer_id)
            if prev is None or od > prev:
                cust_last[o.customer_id] = od
    # Dict, not a scan: `next(x for x in orders ...)` per item is O(items x
    # orders) — 8,000 imported orders turned the briefing into a 16-second
    # request (scripts/stress_test.py). One index makes it linear.
    order_by_id = {o.id: o for o in orders}
    for it in items:
        o = order_by_id.get(it.order_id)
        if o is not None and o.customer_id is not None:
            cust_units.setdefault(o.customer_id, {})
            cust_units[o.customer_id][it.product_id] = (
                cust_units[o.customer_id].get(it.product_id, 0) + it.quantity
            )

    vip = sorted(cust_revenue.items(), key=lambda kv: -kv[1])[:5]
    vip_list = [
        {
            "customer_id": cid,
            "name": (cust_by_id.get(cid) or Customer()).full_name or f"Customer #{cid}",
            "email": (cust_by_id.get(cid) or Customer()).email or "",
            "total": round(rv, 2),
        }
        for cid, rv in vip
    ]
    inactive = []
    for cid, last in cust_last.items():
        days = (today - last).days
        if days >= 30:
            c = cust_by_id.get(cid)
            if c is not None:
                inactive.append((cid, days, cust_revenue.get(cid, 0.0)))
    inactive.sort(key=lambda t: -t[2])
    inactive_top = [
        {
            "customer_id": cid,
            "name": (cust_by_id.get(cid) or Customer()).full_name or f"Customer #{cid}",
            "email": (cust_by_id.get(cid) or Customer()).email or "",
            "days_since": days,
            "lifetime": round(rv, 2),
        }
        for cid, days, rv in inactive[:5]
    ]

    # ------------------------------------------------------------------
    # Inventory risk
    # ------------------------------------------------------------------
    low = sorted(
        (p for p in products if 0 < p.current_stock <= (p.reorder_level or 0)),
        key=lambda p: -p.current_stock,
    )[:5]
    out = sorted(
        (p for p in products if (p.current_stock or 0) <= 0),
        key=lambda p: -prod_units.get(p.id, 0),
    )[:5]
    low_count = sum(1 for p in products if 0 < p.current_stock <= (p.reorder_level or 0))
    out_count = sum(1 for p in products if (p.current_stock or 0) <= 0)

    # ------------------------------------------------------------------
    # Insight objects (verified, phrased deterministically)
    # ------------------------------------------------------------------
    insights: list[BriefingInsight] = []

    insights.append(BriefingInsight(
        id="overview",
        kind="overview",
        severity="info",
        title=(
            f"Your history is loaded: {total_orders} orders and {_money(total_revenue)} "
            f"across {total_customers} customers"
            if total_orders
            else (
                f"Your catalog is loaded: {total_products} products and "
                f"{total_customers} customers"
            )
        ),
        body=(
            (
                f"Based on your imported history — {span_months} "
                f"month{'s' if span_months != 1 else ''} of data "
                f"({first_day.isoformat() if first_day else '—'} to "
                f"{last_day.isoformat() if last_day else '—'}). "
                "Everything below is computed from that history; live activity "
                "you add in Co-op joins it from today."
            )
            if total_orders
            else "Import your sales history to unlock revenue and customer insights."
        ),
        evidence=f"{total_orders} orders · {total_products} products · {total_customers} customers",
        link="/",
    ))

    if rev_this and rev_last:
        growth = (rev_this - rev_last) / rev_last * 100
        insights.append(BriefingInsight(
            id="revenue-trend",
            kind="revenue",
            severity="info" if growth >= 0 else "warning",
            title=(
                f"Revenue is {_pct(growth)} this month vs last month"
            ),
            body=(
                f"{_money(rev_this)} so far this month "
                f"({month_orders.get(cur_month, 0)} orders) vs "
                f"{_money(rev_last)} last month ({month_orders.get(last_month, 0)} orders)."
            ),
            evidence=f"month-to-date: {_money(rev_this)} · last month: {_money(rev_last)}",
            link="/",
        ))

    if top_products:
        t1 = top_products[0]
        p1 = prod_by_id.get(t1["product_id"])
        stock_state = None
        if p1 is not None:
            if (p1.current_stock or 0) <= 0:
                stock_state = "currently out of stock"
            elif 0 < (p1.current_stock or 0) <= (p1.reorder_level or 0):
                stock_state = "currently low on stock"
        insights.append(BriefingInsight(
            id="top-product",
            kind="product",
            severity="warning" if (stock_state or concentration >= 60) else "info",
            title=(
                f"“{t1['name']}” drives {t1['share_pct']:.0f}% of your historic revenue"
            ),
            body=(
                f"{_money(t1['revenue'])} from {t1['units']} units sold"
                + (f" — and it is {stock_state}." if stock_state else ".")
            ),
            evidence=f"top product of {len(ranked)} products with sales",
            link=f"/products?q={t1['name'].split()[0] if t1['name'] else ''}",
        ))
        if concentration >= 60:
            insights.append(BriefingInsight(
                id="concentration",
                kind="product",
                severity="warning",
                title=f"Top 3 products make up {concentration:.0f}% of revenue",
                body=(
                    "Your revenue is concentrated in a few products. If one of "
                    "them runs out or demand shifts, a large share of your "
                    "sales is exposed."
                ),
                evidence=f"top 3 share: {concentration:.0f}%",
                link="/products",
            ))

    if vip_list and inactive_top:
        target = inactive_top[0]
        # Most frequently purchased product for the target (for the action).
        top_prod_id = None
        for pid, u in sorted(
            cust_units.get(target["customer_id"], {}).items(), key=lambda kv: -kv[1]
        ):
            top_prod_id = pid
            break
        prod = prod_by_id.get(top_prod_id) if top_prod_id else None
        insights.append(BriefingInsight(
            id="inactive-vip",
            kind="customer",
            severity="warning",
            title=(
                f"{target['name']} hasn't ordered in {target['days_since']} days"
            ),
            body=(
                (
                    f"They were worth {_money(target['lifetime'])} in lifetime orders. "
                    if target["lifetime"]
                    else ""
                )
                + f"{len(inactive)} customer{'s' if len(inactive) != 1 else ''} in your history "
                + "have gone quiet for 30+ days — a check-in now is the cheapest growth you have."
            ),
            evidence=(
                f"last order {target['days_since']} days ago · "
                f"{len(inactive)} inactive customers total"
            ),
            link="/customers",
            action=(
                {
                    "type": "draft_followup",
                    "customer": {
                        "id": target["customer_id"],
                        "full_name": target["name"],
                        "email": target["email"],
                    },
                    "product": (
                        {
                            "id": prod.id,
                            "name": prod.name,
                            "sku": prod.sku or "",
                            "unit_price": prod.unit_price,
                            "current_stock": prod.current_stock or 0,
                        }
                        if prod is not None else None
                    ),
                }
                if prod is not None else None
            ),
        ))
    elif inactive_top:
        insights.append(BriefingInsight(
            id="inactive-customers",
            kind="customer",
            severity="info",
            title=(
                f"{len(inactive_top)} customer{'s' if len(inactive_top) != 1 else ''} "
                "haven't ordered in 30+ days"
            ),
            body="A short check-in or a win-back offer is the cheapest growth available.",
            evidence=(
                f"most recent: {inactive_top[0]['name']} "
                f"({inactive_top[0]['days_since']} days)"
            ),
            link="/customers",
        ))

    if low_count or out_count:
        skus = ", ".join(p.sku for p in (out + low) if p.sku) or "—"
        insights.append(BriefingInsight(
            id="stock-risk",
            kind="inventory",
            severity="critical" if out_count else "warning",
            title=(
                f"{out_count} products out of stock and {low_count} at or below reorder level"
                if out_count and low_count
                else (
                    f"{out_count} product{'s' if out_count != 1 else ''} out of stock"
                    if out_count
                    else f"{low_count} product{'s' if low_count != 1 else ''} "
                    "at or below reorder level"
                )
            ),
            body=(
                "These items can no longer be sold (or soon won't). Restock the "
                "top sellers first."
            ),
            evidence=skus[:120],
            link="/inventory?stock=low",
        ))

    if blended_margin is not None:
        insights.append(BriefingInsight(
            id="margin",
            kind="profit",
            severity="info" if blended_margin >= 25 else "warning",
            title=(
                f"Blended margin is {blended_margin:.0f}% ({_money(margin_total)} profit)"
            ),
            body=(
                f"Compared {_money(margin_revenue)} of revenue against product cost prices "
                f"(cost data covers {cost_coverage:.0f}% of sold lines). "
                + (
                    ""
                    if blended_margin >= 25
                    else "Margins under 25% leave little room for discounts "
                    "or errors."
                )
            ),
            evidence=(
                f"profit {_money(margin_total)} on {_money(margin_revenue)} "
                "margin-relevant revenue"
            ),
            link="/products",
        ))

    severity_rank = {"critical": 0, "warning": 1, "info": 2}
    insights.sort(key=lambda i: severity_rank[i.severity])

    return {
        "ready": True,
        "history": {
            "first_order_date": first_day.isoformat() if first_day else None,
            "last_order_date": last_day.isoformat() if last_day else None,
            "span_months": span_months,
            "orders": total_orders,
            "customers": total_customers,
            "products": total_products,
            "total_revenue": round(total_revenue, 2),
            "imported": latest_import is not None,
            "latest_import": latest_import,
        },
        "insights": [
            {
                "id": i.id,
                "kind": i.kind,
                "severity": i.severity,
                "title": i.title,
                "body": i.body,
                "evidence": i.evidence,
                "link": i.link,
                "action": i.action,
            }
            for i in insights
        ],
    }
