"""Reporting Service (Reports phase, Pass 1) — one verified engine.

Producers:
    GET /reports/{key}              -> Reports UI
    GET /reports/{key}/export       -> CSV / XLSX / PDF (same data)
    POST /ai/chat (report context)  -> Co-op explains the same numbers

Every report is deterministic aggregation over the business's live,
tenant-scoped rows. No LLM touches these numbers; no second implementation
exists (the screen, the export and the AI all read THIS data).
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any, Optional

from sqlalchemy import select

from .. import timezones as tz_mod
from ..models import Business, Customer, Order, OrderItem, Product
from .filters import ReportFilters, fmt_full_date, fmt_short_date


# ---------------------------------------------------------------------------
# Report data structures (JSON-serializable via to_dict)
# ---------------------------------------------------------------------------

@dataclass
class Kpi:
    key: str
    label: str
    value: Any
    format: str = "number"  # number | money | percent
    previous: Optional[float] = None
    change_percent: Optional[float] = None
    good_when: str = "up"  # up | down | neutral (arrow colouring)


@dataclass
class ReportChart:
    kind: str  # line | bar | donut
    labels: list
    series: list  # [{"name": str, "data": [numbers]}]
    money: bool = False


@dataclass
class ReportTable:
    title: str
    columns: list
    rows: list
    numeric_cols: list = field(default_factory=list)


@dataclass
class ReportData:
    key: str
    title: str
    period_label: str
    compare: str
    filters: dict
    kpis: list
    chart: ReportChart
    tables: list
    notes: list = field(default_factory=list)
    generated_at: str = field(
        default_factory=lambda: dt.datetime.now().isoformat(timespec="seconds")
    )

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "title": self.title,
            "period_label": self.period_label,
            "compare": self.compare,
            "filters": self.filters,
            "generated_at": self.generated_at,
            "kpis": [
                {
                    "key": k.key, "label": k.label, "value": k.value, "format": k.format,
                    "previous": k.previous, "change_percent": k.change_percent,
                    "good_when": k.good_when,
                }
                for k in self.kpis
            ],
            "chart": {"kind": self.chart.kind, "labels": self.chart.labels,
                      "series": self.chart.series, "money": self.chart.money},
            "tables": [
                {
                    "title": t.title,
                    "columns": t.columns,
                    "rows": t.rows,
                    "numeric_cols": t.numeric_cols,
                }
                for t in self.tables
            ],
            "notes": self.notes,
        }


def _round(v: Optional[float], nd: int = 2) -> Optional[float]:
    return None if v is None else round(v, nd)


def _pct(cur: Optional[float], prev: Optional[float]) -> Optional[float]:
    """Relative % change; None when previous is missing/zero."""
    if cur is None or prev in (None, 0):
        return None
    return round((cur - prev) / abs(prev) * 100, 1)


def _as_date(x, tz) -> Optional[dt.date]:
    """Local calendar date of a naive-UTC timestamp (a date passes through).

    Bucketing by the business's local day keeps a near-midnight sale on the
    right day for non-UTC tenants; tz=UTC reproduces the old behaviour.
    """
    if isinstance(x, dt.datetime):
        return tz_mod.utc_to_local_date(x, tz)
    return x


# ---------------------------------------------------------------------------
# Shared line-level scope (the single place order/item rows are filtered)
# ---------------------------------------------------------------------------

async def _scoped_lines(db, business_id: int, f: ReportFilters, start: dt.date, end: dt.date, tz):
    """Return (orders, line_rows) for the window [start, end].

    line_rows: (order_id, customer_id, product_id, product_name, category,
                qty, unit_price, line_total, cost_price)
    Product/category filters are LINE-level: a report on "Electronics" is the
    money that Electronics lines actually made, and 'Orders' counts the
    distinct orders that contain such lines.
    """
    q = (
        select(
            Order.id, Order.customer_id, OrderItem.product_id,
            Product.name, Product.category, OrderItem.quantity,
            OrderItem.unit_price, OrderItem.total_price, Product.cost_price,
        )
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(
            Order.business_id == business_id,
            Order.deleted_at.is_(None),
            Order.status != "cancelled",
            Order.order_date >= tz_mod.local_midnight_utc(start, tz),
            Order.order_date < tz_mod.local_midnight_utc(end + dt.timedelta(days=1), tz),
        )
    )
    if f.product_id:
        q = q.where(OrderItem.product_id == f.product_id)
    if f.category:
        q = q.where(Product.category == f.category)
    if f.customer_id:
        q = q.where(Order.customer_id == f.customer_id)

    rows = (await db.execute(q)).all()
    order_ids = {r[0] for r in rows}
    orders = []
    if order_ids:
        orders = (await db.execute(
            select(Order).where(Order.id.in_(order_ids))
        )).scalars().all()
    return orders, rows


def _bucketize(dates: list[dt.date]) -> tuple[str, list[dt.date]]:
    """Daily buckets for spans up to 62 days, monthly after."""
    if not dates:
        return "day", []
    span = (max(dates) - min(dates)).days
    if span <= 62:
        return "day", dates
    months: list[dt.date] = sorted({dt.date(d.year, d.month, 1) for d in dates})
    return "month", months


def _bucket_key(d: dt.date, mode: str) -> dt.date:
    return d if mode == "day" else dt.date(d.year, d.month, 1)


def _fmt_bucket(d: dt.date, mode: str) -> str:
    if mode == "day":
        return fmt_short_date(d)  # portable "Sep 2" (see fmt_short_date)
    return d.strftime("%b %Y")


# ---------------------------------------------------------------------------
# Sales report
# ---------------------------------------------------------------------------

async def sales_report(db, business_id: int, f: ReportFilters, tz) -> ReportData:
    orders, rows = await _scoped_lines(db, business_id, f, f.from_date, f.to_date, tz)
    revenue = sum(r[7] or 0 for r in rows)
    units = sum(r[5] or 0 for r in rows)
    n_orders = len(orders)
    aov = revenue / n_orders if n_orders else None

    kpis = [
        Kpi("revenue", "Revenue", _round(revenue), "money"),
        Kpi("orders", "Orders", n_orders, "number"),
        Kpi("units", "Units sold", units, "number"),
        Kpi("aov", "Average order value", _round(aov), "money"),
    ]

    notes: list[str] = []
    prev_kpis: dict[str, float] = {}
    prev_series: dict[dt.date, float] = {}
    if f.compare != "none":
        prev = f.previous_range()
        if prev:
            p_orders, p_rows = await _scoped_lines(db, business_id, f, prev[0], prev[1], tz)
            p_revenue = sum(r[7] or 0 for r in p_rows)
            p_units = sum(r[5] or 0 for r in p_rows)
            p_n = len(p_orders)
            prev_kpis = {
                "revenue": _round(p_revenue) or 0,
                "orders": p_n,
                "units": p_units,
                "aov": _round(p_revenue / p_n) if p_n else None,
            }
            mode, _ = _bucketize([_as_date(o.order_date, tz) for o in p_orders if o.order_date])
            for o in p_orders:
                od = _as_date(o.order_date, tz)
                if od:
                    prev_series[_bucket_key(od, mode)] = prev_series.get(
                        _bucket_key(od, mode), 0
                    ) + (o.total_amount or 0)

    for k in kpis:
        if k.previous is None and k.key in prev_kpis:
            k.previous = prev_kpis[k.key]
        if k.key != "units":
            k.change_percent = _pct(k.value, k.previous)
    kpis[0].change_percent = (
        _pct(revenue, prev_kpis.get("revenue")) if f.compare != "none" else None
    )

    # Chart: revenue over time (+ comparison overlay).
    order_dates = [_as_date(o.order_date, tz) for o in orders if o.order_date]
    mode, _ = _bucketize(order_dates)
    cur_series: dict[dt.date, float] = {}
    for o in orders:
        od = _as_date(o.order_date, tz)
        if od:
                    cur_series[_bucket_key(od, mode)] = cur_series.get(
                        _bucket_key(od, mode), 0
                    ) + (o.total_amount or 0)
    if f.compare != "none" and prev:
        # Align the previous series onto the CURRENT axis by ordinal position:
        # oldest bucket of the previous window sits under the oldest bucket of
        # the current window.
        aligned: dict[dt.date, float] = {}
        cur_keys = sorted(cur_series)
        prev_keys = sorted(prev_series)
        for i, pk in enumerate(prev_keys):
            if i < len(cur_keys):
                aligned[cur_keys[i]] = prev_series[pk]
        series = [
            {
                "name": "Current period",
                "data": [_round(cur_series.get(k, 0)) for k in sorted(cur_series)],
            },
            {"name": f"Previous ({_compare_label(f, prev)})", "data": [
                _round(aligned.get(k, 0)) for k in sorted(cur_series)
            ]},
        ]
    else:
        # Data follows the SAME sorted-key order as the labels (dict order is
        # insertion order and would misalign values against the axis).
        series = [
            {
                "name": "Revenue",
                "data": [_round(cur_series.get(k, 0)) for k in sorted(cur_series)],
            }
        ]

    # Tables: top products / by category / top customers (line-level).
    by_product: dict[tuple, dict] = {}
    by_category: dict[str, dict] = {}
    by_customer: dict[int, dict] = {}
    for r in rows:
        pid, pname, cat, qty, _price, total, _ = (
            r[2],
            r[3],
            r[4] or "Uncategorized",
            r[5],
            r[6],
            r[7],
            r[8],
        )
        pk = (pid, pname)
        d = by_product.setdefault(pk, {"units": 0, "revenue": 0.0})
        d["units"] += qty or 0
        d["revenue"] += total or 0
        c = by_category.setdefault(cat, {"units": 0, "revenue": 0.0})
        c["units"] += qty or 0
        c["revenue"] += total or 0
        cu = by_customer.setdefault(r[1], {"orders": set(), "revenue": 0.0})
        cu["orders"].add(r[0])
        cu["revenue"] += total or 0

    prod_rows = sorted(
        ({"name": n, "units": d["units"], "revenue": _round(d["revenue"]),
          "share": _round(d["revenue"] / revenue * 100, 1) if revenue else 0}
         for (i, n), d in by_product.items()),
        key=lambda x: -x["revenue"],
    )[:10]
    cat_rows = sorted(
        ({"category": c, "units": d["units"], "revenue": _round(d["revenue"]),
          "share": _round(d["revenue"] / revenue * 100, 1) if revenue else 0}
         for c, d in by_category.items()),
        key=lambda x: -x["revenue"],
    )
    cust_names = {
        c.id: c.full_name
        for c in (await db.execute(
            select(Customer).where(Customer.business_id == business_id,
                                   Customer.deleted_at.is_(None)))).scalars()
    }
    cust_rows = sorted(
        ({"name": cust_names.get(cid, f"Customer #{cid}"), "orders": len(d["orders"]),
          "revenue": _round(d["revenue"])}
         for cid, d in by_customer.items()),
        key=lambda x: -x["revenue"],
    )[:10]

    if not rows and n_orders == 0:
        notes.append("No sales in this period (or matching these filters).")

    return ReportData(
        key="sales",
        title="Sales Report",
        period_label=f.period_label,
        compare=f.compare,
        filters=f.to_query_dict(),
        kpis=kpis,
        chart=ReportChart(
            "line", [_fmt_bucket(k, mode) for k in sorted(cur_series)], series, money=True
        ),
        tables=[
            ReportTable("Top products", ["Product", "Units", "Revenue", "Share"],
                        [
                            [r["name"], r["units"], r["revenue"], f"{r['share']}%"]
                            for r in prod_rows
                        ],
                        [1, 2, 3]
                    ),
            ReportTable("Sales by category", ["Category", "Units", "Revenue", "Share"],
                        [
                            [r["category"], r["units"], r["revenue"], f"{r['share']}%"]
                            for r in cat_rows
                        ],
                        [1, 2, 3]
                    ),
            ReportTable("Top customers", ["Customer", "Orders", "Revenue"],
                        [[r["name"], r["orders"], r["revenue"]] for r in cust_rows], [1, 2]),
        ],
        notes=notes,
    )


def _compare_label(f: ReportFilters, prev: tuple[dt.date, dt.date]) -> str:
    names = {
        "previous_period": "previous period",
        "previous_month": "previous month",
        "previous_year": "previous year",
    }
    return names.get(f.compare, "previous")


# ---------------------------------------------------------------------------
# Profit & Loss (gross) report
# ---------------------------------------------------------------------------

async def profit_loss_report(db, business_id: int, f: ReportFilters, tz) -> ReportData:
    orders, rows = await _scoped_lines(db, business_id, f, f.from_date, f.to_date, tz)
    revenue = sum(r[7] or 0 for r in rows)
    cogs = sum((r[8] or 0) * (r[5] or 0) for r in rows if r[8] is not None)
    cost_covered_value = sum((r[6] or 0) * (r[5] or 0) for r in rows if r[8] is not None)
    gross = revenue - cogs
    margin = (gross / revenue * 100) if revenue else None
    coverage = (cost_covered_value / revenue * 100) if revenue else 0.0

    notes: list[str] = [
        "Gross P&L — Co-op does not track operating expenses yet, so this is "
        "revenue minus cost of goods, not a full accounting statement."
    ]
    if rows and coverage < 99.9:
        notes.append(
            f"Cost data covers {coverage:.0f}% of sold-line value; products without "
            "a cost price are excluded from COGS."
        )

    kpis = [
        Kpi("revenue", "Revenue", _round(revenue), "money"),
        Kpi("cogs", "COGS", _round(cogs), "money", good_when="down"),
        Kpi("gross_profit", "Gross profit", _round(gross), "money"),
        Kpi(
            "gross_margin",
            "Gross margin",
            _round(margin, 1) if margin is not None else 0,
            "percent",
        ),
    ]
    if f.compare != "none":
        prev = f.previous_range()
        if prev:
            p_orders, p_rows = await _scoped_lines(db, business_id, f, prev[0], prev[1], tz)
            p_revenue = sum(r[7] or 0 for r in p_rows)
            p_cogs = sum((r[8] or 0) * (r[5] or 0) for r in p_rows if r[8] is not None)
            p_gross = p_revenue - p_cogs
            p_margin = (p_gross / p_revenue * 100) if p_revenue else None
            kpis[0].previous = _round(p_revenue)
            kpis[0].change_percent = _pct(revenue, p_revenue)
            kpis[1].previous = _round(p_cogs)
            kpis[1].change_percent = _pct(cogs, p_cogs) if cogs or p_cogs else None
            kpis[2].previous = _round(p_gross)
            kpis[2].change_percent = _pct(gross, p_gross)
            kpis[3].previous = _round(p_margin, 1) if p_margin is not None else None
            # Margin delta is expressed in percentage POINTS.
            if margin is not None and p_margin is not None:
                kpis[3].change_percent = round(margin - p_margin, 1)

    # Chart: revenue vs gross profit over time.
    order_dates = [_as_date(o.order_date, tz) for o in orders if o.order_date]
    mode, _ = _bucketize(order_dates)
    rev_series: dict[dt.date, float] = {}
    gp_series: dict[dt.date, float] = {}
    order_items = {r[0]: [] for r in rows}
    for r in rows:
        order_items[r[0]].append(r)
    for o in orders:
        od = _as_date(o.order_date, tz)
        if not od:
            continue
        k = _bucket_key(od, mode)
        rev_series[k] = rev_series.get(k, 0) + (o.total_amount or 0)
        gp = sum((r[7] or 0) - ((r[8] or 0) * (r[5] or 0)) for r in order_items.get(o.id, []))
        gp_series[k] = gp_series.get(k, 0) + gp

    tables = []
    by_product: dict[tuple, dict] = {}
    for r in rows:
        d = by_product.setdefault((r[2], r[3]), {
            "units": 0, "revenue": 0.0, "cogs": 0.0, "has_cost": False})
        d["units"] += r[5] or 0
        d["revenue"] += r[7] or 0
        if r[8] is not None:
            d["cogs"] += (r[8] or 0) * (r[5] or 0)
            d["has_cost"] = True
    prof = sorted(
        ({"name": n, "units": d["units"], "revenue": _round(d["revenue"]),
          "cogs": _round(d["cogs"]), "profit": _round(d["revenue"] - d["cogs"]),
          "margin": (
              _round((d["revenue"] - d["cogs"]) / d["revenue"] * 100, 1)
              if d["revenue"]
              else None
          )}
         for (_i, n), d in by_product.items()),
        key=lambda x: -x["profit"],
    )
    tables.append(ReportTable(
        "Most profitable products",
        ["Product", "Units", "Revenue", "COGS", "Gross profit", "Margin"],
        [[p["name"], p["units"], p["revenue"], p["cogs"], p["profit"],
          f"{p['margin']}%" if p["margin"] is not None else "—"] for p in prof[:10]],
        [1, 2, 3, 4, 5]))
    lowest = [p for p in prof if p["margin"] is not None]
    lowest.sort(key=lambda x: x["margin"])
    tables.append(ReportTable(
        "Lowest-margin products", ["Product", "Units", "Revenue", "COGS", "Gross profit", "Margin"],
        [
            [p["name"], p["units"], p["revenue"], p["cogs"], p["profit"], f"{p['margin']}%"]
            for p in lowest[:5]
        ],
        [1, 2, 3, 4, 5]))

    return ReportData(
        key="profit-loss",
        title="Profit & Loss (Gross)",
        period_label=f.period_label,
        compare=f.compare,
        filters=f.to_query_dict(),
        kpis=kpis,
        chart=ReportChart("bar", [_fmt_bucket(k, mode) for k in sorted(rev_series)],
                          # Data follows the SAME sorted-key order as the labels.
                          [
                              {
                                  "name": "Revenue",
                                  "data": [
                                      _round(rev_series.get(k, 0)) for k in sorted(rev_series)
                                  ],
                              },
                              {
                                  "name": "Gross profit",
                                  "data": [
                                      _round(gp_series.get(k, 0)) for k in sorted(rev_series)
                                  ],
                              },
                          ],
                          money=True),
        tables=tables,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Inventory report (point-in-time + movement within the period)
# ---------------------------------------------------------------------------

async def inventory_report(db, business_id: int, f: ReportFilters, tz) -> ReportData:
    products = (await db.execute(
        select(Product).where(Product.business_id == business_id, Product.deleted_at.is_(None))
    )).scalars().all()
    if f.category:
        products = [p for p in products if p.category == f.category]
    if f.product_id:
        products = [p for p in products if p.id == f.product_id]

    def value(p: Product) -> float:
        return (p.current_stock or 0) * (p.cost_price or p.unit_price or 0)

    total_value = sum(value(p) for p in products)
    units_on_hand = sum(p.current_stock or 0 for p in products)
    low = [p for p in products if 0 < (p.current_stock or 0) <= (p.reorder_level or 0)]
    out = [p for p in products if (p.current_stock or 0) <= 0]

    kpis = [
        Kpi("value", "Inventory value", _round(total_value), "money"),
        Kpi("units", "Units on hand", units_on_hand, "number"),
        Kpi("low", "Low stock", len(low), "number", good_when="down"),
        Kpi("out", "Out of stock", len(out), "number", good_when="down"),
    ]

    notes: list[str] = []
    if out:
        notes.append(
            f"{len(out)} product{'s' if len(out) != 1 else ''} out of stock — "
            "these generate no revenue until restocked."
        )
    if low:
        notes.append(f"{len(low)} product{'s' if len(low) != 1 else ''} at or below reorder level.")

    # Chart: inventory value by category.
    by_cat: dict[str, float] = {}
    for p in products:
        by_cat[p.category or "Uncategorized"] = (
            by_cat.get(p.category or "Uncategorized", 0) + value(p)
        )
    cats = sorted(by_cat, key=lambda c: -by_cat[c])

    # Table 1: stock risk (out first, then low).
    risk = sorted(
        out + low,
        key=lambda p: (0 if (p.current_stock or 0) <= 0 else 1, p.current_stock or 0),
    )
    # Table 2: top inventory value.
    top_value = sorted(products, key=value, reverse=True)[:10]
    # Table 3: movement within the period (from the immutable stock ledger).
    from ..models import StockMovement
    movements = (await db.execute(
        select(StockMovement).where(
            StockMovement.business_id == business_id,
            StockMovement.product_id.in_([p.id for p in products]) if products else False,
            StockMovement.created_at >= tz_mod.local_midnight_utc(f.from_date, tz),
            StockMovement.created_at
            < tz_mod.local_midnight_utc(f.to_date + dt.timedelta(days=1), tz),
        )
    )).scalars().all() if products else []
    prod_names = {p.id: p.name for p in products}
    mv: dict[str, dict] = {}
    for m in movements:
        name = prod_names.get(m.product_id, f"Product #{m.product_id}")
        d = mv.setdefault(name, {"in": 0, "out": 0})
        d["in" if (m.change or 0) > 0 else "out"] += abs(m.change or 0)
    mv_rows = sorted(mv.items(), key=lambda kv: -(kv[1]["in"] + kv[1]["out"]))[:10]

    # Slow/fast movers: units sold in the period vs stock on hand.
    orders, rows = await _scoped_lines(db, business_id, f, f.from_date, f.to_date, tz)
    sold: dict[str, int] = {}
    for r in rows:
        sold[r[3]] = sold.get(r[3], 0) + (r[5] or 0)
    movers = sorted(
        ((p.name, sold.get(p.name, 0), p.current_stock or 0) for p in products),
        key=lambda t: -t[1],
    )
    fast = [m for m in movers if m[1] > 0][:5]
    slow = [m for m in sorted(movers, key=lambda t: (t[1], -t[2])) if m[1] == 0 and m[2] > 0][:5]

    return ReportData(
        key="inventory",
        title="Inventory Report",
        period_label=f.period_label,
        compare=f.compare,
        filters=f.to_query_dict(),
        kpis=kpis,
        chart=ReportChart(
            "donut",
            cats,
            [{"name": "Value", "data": [_round(by_cat.get(c, 0)) for c in cats]}],
            money=True,
        ),
        tables=[
            ReportTable("Stock risk", ["Product", "SKU", "On hand", "Reorder level", "Value"],
                        [
                            [
                                p.name,
                                p.sku or "—",
                                p.current_stock,
                                p.reorder_level or 0,
                                _round(value(p)),
                            ]
                            for p in risk[:15]
                        ],
                        [2, 3, 4]),
            ReportTable("Top inventory value", ["Product", "Units", "Unit cost", "Value"],
                        [
                            [
                                p.name,
                                p.current_stock or 0,
                                _round(p.cost_price or p.unit_price),
                                _round(value(p)),
                            ]
                            for p in top_value
                        ],
                        [1, 2, 3]),
            ReportTable(f"Stock movement ({f.period_label})", ["Product", "In", "Out", "Net"],
                        [
                            [n, d["in"], d["out"], d["in"] - d["out"]]
                            for n, d in mv_rows
                        ],
                        [1, 2, 3]
                    ),
            ReportTable("Fast movers (period)", ["Product", "Units sold", "On hand"],
                        [[n, s, h] for n, s, h in fast], [1, 2]),
            ReportTable("Slow movers (no sales in period)", ["Product", "Units sold", "On hand"],
                        [[n, s, h] for n, s, h in slow], [1, 2]),
        ],
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Customers report
# ---------------------------------------------------------------------------

async def customers_report(db, business_id: int, f: ReportFilters, tz) -> ReportData:
    customers = (await db.execute(
        select(Customer).where(Customer.business_id == business_id, Customer.deleted_at.is_(None))
    )).scalars().all()
    cust_by_id = {c.id: c for c in customers}

    start = tz_mod.local_midnight_utc(f.from_date, tz)
    end = tz_mod.local_midnight_utc(f.to_date + dt.timedelta(days=1), tz)
    period_orders = (await db.execute(
        select(Order).where(
            Order.business_id == business_id, Order.deleted_at.is_(None),
            Order.status != "cancelled", Order.order_date >= start, Order.order_date < end,
        )
    )).scalars().all()

    total_customers = len(customers)
    new_in_period = [c for c in customers
                     if c.created_at and f.from_date <= _as_date(c.created_at, tz) <= f.to_date]

    orders_by_cust: dict[int, list] = {}
    for o in period_orders:
        if o.customer_id:
            orders_by_cust.setdefault(o.customer_id, []).append(o)
    repeat = [cid for cid, os_ in orders_by_cust.items() if len(os_) >= 2]
    period_revenue_by_cust: dict[int, float] = {}
    for o in period_orders:
        if o.customer_id:
            period_revenue_by_cust[o.customer_id] = (
                period_revenue_by_cust.get(o.customer_id, 0) + (o.total_amount or 0)
            )
    n_active = len(period_revenue_by_cust)
    period_revenue = sum(period_revenue_by_cust.values())
    rev_per_cust = period_revenue / n_active if n_active else None

    # Lifetime revenue (all-time, for top customers + inactivity ranking).
    all_orders = (await db.execute(
        select(Order).where(Order.business_id == business_id, Order.deleted_at.is_(None),
                            Order.status != "cancelled")
    )).scalars().all()
    lifetime: dict[int, float] = {}
    last_order: dict[int, dt.date] = {}
    for o in all_orders:
        if not o.customer_id:
            continue
        lifetime[o.customer_id] = lifetime.get(o.customer_id, 0) + (o.total_amount or 0)
        od = _as_date(o.order_date, tz)
        if od:
            prev = last_order.get(o.customer_id)
            if prev is None or od > prev:
                last_order[o.customer_id] = od

    today = tz_mod.local_today(tz)
    inactive = [
        (cid, (today - last_order[cid]).days, lifetime.get(cid, 0.0))
        for cid in last_order
        if (today - last_order[cid]).days >= 30
    ]
    inactive.sort(key=lambda t: -t[2])

    kpis = [
        Kpi("total", "Total customers", total_customers, "number"),
        Kpi("new", "New in period", len(new_in_period), "number"),
        Kpi("repeat", "Repeat customers", len(repeat), "number"),
        Kpi("rev_per_cust", "Revenue per active customer", _round(rev_per_cust), "money"),
    ]

    notes: list[str] = []
    if inactive:
        notes.append(
            f"{len(inactive)} customer{'s' if len(inactive) != 1 else ''} haven't "
            "ordered in 30+ days — the top ones are listed below."
        )

    # Chart: new customers over time (creation dates within the period).
    new_dates = [_as_date(c.created_at, tz) for c in new_in_period if c.created_at]
    mode, _ = _bucketize(new_dates)
    new_series: dict[dt.date, int] = {}
    for d in new_dates:
        k = _bucket_key(d, mode)
        new_series[k] = new_series.get(k, 0) + 1

    top = sorted(
        (cust_by_id[cid] for cid in period_revenue_by_cust if cid in cust_by_id),
        key=lambda c: -period_revenue_by_cust[c.id],
    )[:10]
    top_rows = [
        [c.full_name, len(orders_by_cust.get(c.id, [])), _round(period_revenue_by_cust[c.id]),
         _round(lifetime.get(c.id, 0)),
         fmt_full_date(last_order[c.id]) if c.id in last_order else "—"]
        for c in top
    ]
    inactive_rows = [
        [cust_by_id[cid].full_name if cid in cust_by_id else f"Customer #{cid}",
         days, _round(ltv)]
        for cid, days, ltv in inactive[:10]
    ]
    new_rows = sorted(
        (c for c in new_in_period),
        key=lambda c: _as_date(c.created_at, tz) or today,
    )[:10]
    new_rows = [[c.full_name, fmt_full_date(_as_date(c.created_at, tz) or today),
                 _round(period_revenue_by_cust.get(c.id, 0))] for c in new_rows]

    return ReportData(
        key="customers",
        title="Customers Report",
        period_label=f.period_label,
        compare=f.compare,
        filters=f.to_query_dict(),
        kpis=kpis,
        chart=ReportChart("bar", [_fmt_bucket(k, mode) for k in sorted(new_series)],
                          [
                              {
                                  "name": "New customers",
                                  "data": [
                                      new_series.get(k, 0) for k in sorted(new_series)
                                  ],
                              }
                          ]),
        tables=[
            ReportTable(
                "Top customers (period)",
                ["Customer", "Orders", "Revenue (period)", "Lifetime revenue", "Last order"],
                        top_rows, [1, 2, 3]),
            ReportTable("Inactive 30+ days", ["Customer", "Days since order", "Lifetime revenue"],
                        inactive_rows, [1, 2]),
            ReportTable("New in period", ["Customer", "First seen", "Revenue (period)"],
                        new_rows, [2]),
        ],
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

REPORT_BUILDERS = {
    "sales": sales_report,
    "profit-loss": profit_loss_report,
    "inventory": inventory_report,
    "customers": customers_report,
}

REPORT_TITLES = {
    "sales": "Sales",
    "profit-loss": "Profit & Loss",
    "inventory": "Inventory",
    "customers": "Customers",
}


async def build_report(db, business_id: int, key: str, f: ReportFilters) -> ReportData:
    builder = REPORT_BUILDERS.get(key)
    if builder is None:
        raise KeyError(key)
    # Bucket by the business's local day (UTC when unset) so near-midnight
    # sales land on the right day for non-UTC tenants.
    business = (await db.execute(
        select(Business).where(Business.id == business_id)
    )).scalar_one_or_none()
    tz = tz_mod.business_tz(business.timezone if business else None)
    return await builder(db, business_id, f, tz)
