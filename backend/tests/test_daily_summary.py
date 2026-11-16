"""Daily Business Summary — verified numbers, honest empty states, idempotency.

All figures must come from deterministic calculations (reporting engine +
briefing engine); none from the LLM.
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import select

from backend import branches as branches_mod
from backend.models import Business, Customer, Order, OrderItem, OrderStatus, Product
from backend.notifications import build_daily_summary

TODAY = dt.date.today()


def _dt(days_ago: int) -> dt.datetime:
    return dt.datetime.combine(TODAY - dt.timedelta(days=days_ago), dt.time(12))


async def _seed(
    session_factory,
    *,
    products=None,
    customers=None,
    orders=None,
    business_name="Test Co",
):
    """orders: list of (customer_idx, product_idx, qty, unit_price, days_ago)."""
    async with session_factory() as db:
        b = Business(name=business_name, owner_id="u-ds")
        db.add(b)
        await db.flush()
        br = (await branches_mod.default_branch(db, b.id)).id
        prods = [
            Product(
                business_id=b.id,
                name=p[0], sku=p[1], unit_price=p[2],
                cost_price=p[3] if len(p) > 3 else None,
                current_stock=p[4] if len(p) > 4 else 10,
                reorder_level=p[5] if len(p) > 5 else 5,
            )
            for p in (products or [])
        ]
        custs = [Customer(business_id=b.id, full_name=c[0], email=c[1]) for c in (customers or [])]
        db.add_all(prods + custs)
        await db.flush()
        for ci, pi, qty, price, days_ago in (orders or []):
            o = Order(
                business_id=b.id, branch_id=br, customer_id=custs[ci].id,
                status=OrderStatus.delivered,
                total_amount=qty * price, order_date=_dt(days_ago),
            )
            db.add(o)
            await db.flush()
            db.add(OrderItem(
                business_id=b.id, branch_id=br, order_id=o.id, product_id=prods[pi].id,
                quantity=qty, unit_price=price, total_price=qty * price,
            ))
        await db.commit()
        return b.id


async def _summary(session_factory, bid):
    async with session_factory() as db:
        b = (await db.execute(select(Business).where(Business.id == bid))).scalars().first()
        return await build_daily_summary(db, b)


# ---------------------------------------------------------------------------
# No-data business
# ---------------------------------------------------------------------------

async def test_no_data_business(session_factory):
    bid = await _seed(session_factory)
    s = await _summary(session_factory, bid)
    assert s.has_data is False
    assert s.notable is False
    assert s.empty_message is not None and "first orders" in s.empty_message
    assert s.today.revenue == 0 and s.today.orders == 0
    assert s.inventory.low_count == 0 and s.inventory.out_count == 0
    assert s.customers.new_today == 0
    assert s.insights == []


# ---------------------------------------------------------------------------
# Normal business day
# ---------------------------------------------------------------------------

async def test_normal_business_day(session_factory):
    bid = await _seed(
        session_factory,
        products=[("Chair", "C1", 100, 40, 20, 5), ("Desk", "D1", 200, 90, 20, 5)],
        customers=[("Alice", "a@x.com"), ("Bob", "b@x.com")],
        orders=[(0, 0, 2, 100, 0), (1, 1, 1, 200, 0)],
    )
    s = await _summary(session_factory, bid)
    assert s.has_data is True
    assert s.today.revenue == 400.0
    assert s.today.orders == 2
    assert s.notable is True
    assert s.empty_message is None


# ---------------------------------------------------------------------------
# Low / out of stock conditions
# ---------------------------------------------------------------------------

async def test_low_stock_condition(session_factory):
    # Chair: stock 2 <= reorder 5 (low); Desk: stock 0 (out).
    bid = await _seed(session_factory, products=[
        ("Chair", "C1", 100, 40, 2, 5),
        ("Desk", "D1", 200, 90, 0, 2),
        ("Lamp", "L1", 30, 10, 50, 5),
    ])
    s = await _summary(session_factory, bid)
    assert s.inventory.low_count == 1
    assert s.inventory.out_count == 1
    assert [i.name for i in s.inventory.low_items] == ["Chair"]
    assert [i.name for i in s.inventory.out_items] == ["Desk"]
    assert s.notable is True  # stock alerts are notable


async def test_healthy_stock_no_inventory_alerts(session_factory):
    bid = await _seed(session_factory, products=[
        ("Chair", "C1", 100, 40, 50, 5),
    ])
    s = await _summary(session_factory, bid)
    assert s.inventory.low_count == 0
    assert s.inventory.out_count == 0
    assert s.inventory.low_items == [] and s.inventory.out_items == []


# ---------------------------------------------------------------------------
# Revenue change
# ---------------------------------------------------------------------------

async def test_revenue_change_vs_yesterday(session_factory):
    bid = await _seed(
        session_factory,
        products=[("Chair", "C1", 100, 40, 50, 5)],
        customers=[("Alice", "a@x.com")],
        orders=[(0, 0, 1, 100, 0), (0, 0, 1, 100, 1)],  # today 100, yesterday 100 -> 0%
    )
    s = await _summary(session_factory, bid)
    assert s.comparison.vs_yesterday.revenue == 100.0
    assert s.comparison.vs_yesterday.change_percent == 0.0
    assert s.notable_change is None  # 0% is not a notable swing


async def test_notable_revenue_swing(session_factory):
    # today 400 vs yesterday 100 -> +300% => notable, direction up.
    bid = await _seed(
        session_factory,
        products=[("Chair", "C1", 100, 40, 50, 5)],
        customers=[("Alice", "a@x.com")],
        orders=[(0, 0, 4, 100, 0), (0, 0, 1, 100, 1)],
    )
    s = await _summary(session_factory, bid)
    assert s.comparison.vs_yesterday.change_percent == 300.0
    assert s.notable_change is not None
    assert s.notable_change.direction == "up"
    assert s.notable_change.period == "yesterday"
    assert "300%" in s.notable_change.message


async def test_revenue_drop_is_notable_down(session_factory):
    # today 100 vs yesterday 400 -> -75% => notable, direction down.
    bid = await _seed(
        session_factory,
        products=[("Chair", "C1", 100, 40, 50, 5)],
        customers=[("Alice", "a@x.com")],
        orders=[(0, 0, 1, 100, 0), (0, 0, 4, 100, 1)],
    )
    s = await _summary(session_factory, bid)
    assert s.comparison.vs_yesterday.change_percent == -75.0
    assert s.notable_change is not None
    assert s.notable_change.direction == "down"


async def test_no_yesterday_gives_null_change(session_factory):
    bid = await _seed(
        session_factory,
        products=[("Chair", "C1", 100, 40, 50, 5)],
        customers=[("Alice", "a@x.com")],
        orders=[(0, 0, 1, 100, 0)],  # only today; yesterday empty
    )
    s = await _summary(session_factory, bid)
    assert s.comparison.vs_yesterday.revenue == 0.0
    assert s.comparison.vs_yesterday.change_percent is None  # no baseline -> honest null
    assert s.notable_change is None


# ---------------------------------------------------------------------------
# Customer activity
# ---------------------------------------------------------------------------

async def test_new_customer_today(session_factory):
    bid = await _seed(session_factory, customers=[("Alice", "a@x.com")])
    s = await _summary(session_factory, bid)
    assert s.customers.new_today == 1
    assert s.customers.new_names == ["Alice"]
    assert s.notable is True


async def test_old_customer_not_counted(session_factory):
    bid = await _seed(session_factory, customers=[("Alice", "a@x.com")])
    # Age the customer so it is not "new today".
    async with session_factory() as db:
        from sqlalchemy import update as sa_update
        await db.execute(
            sa_update(Customer).where(Customer.business_id == bid)
            .values(created_at=_dt(3))
        )
        await db.commit()
    s = await _summary(session_factory, bid)
    assert s.customers.new_today == 0


# ---------------------------------------------------------------------------
# Truthful empty / no-notable-events state
# ---------------------------------------------------------------------------

async def test_quiet_day_with_data_is_honest(session_factory):
    """Data exists (healthy catalog, established customer) but nothing
    happened today and there's no sales history to warn about: the summary
    must say so truthfully, not invent activity.

    (No orders on purpose — any sales history would legitimately trigger
    briefing insights such as revenue concentration.)
    """
    bid = await _seed(
        session_factory,
        products=[("Chair", "C1", 100, 40, 50, 5)],
        customers=[("Alice", "a@x.com")],
    )
    async with session_factory() as db:
        from sqlalchemy import update as sa_update
        await db.execute(
            sa_update(Customer).where(Customer.business_id == bid)
            .values(created_at=_dt(3))
        )
        await db.commit()
    s = await _summary(session_factory, bid)
    assert s.has_data is True
    assert s.notable is False
    assert s.empty_message is not None and "Nothing notable today" in s.empty_message
    assert s.today.orders == 0
    assert s.notable_change is None


# ---------------------------------------------------------------------------
# Determinism / idempotency
# ---------------------------------------------------------------------------

async def test_repeated_same_day_requests_are_identical(session_factory):
    bid = await _seed(
        session_factory,
        products=[("Chair", "C1", 100, 40, 2, 5)],
        customers=[("Alice", "a@x.com")],
        orders=[(0, 0, 2, 100, 0)],
    )
    s1 = (await _summary(session_factory, bid)).model_dump()
    s2 = (await _summary(session_factory, bid)).model_dump()
    s1.pop("generated_at")
    s2.pop("generated_at")
    assert s1 == s2  # no records created; nothing to duplicate


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

async def test_daily_summary_endpoint(api):
    # No data yet: the endpoint still returns a verified, honest summary.
    r = await api.client.get("/notifications/daily-summary")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["date"] == TODAY.isoformat()
    assert body["has_data"] is False
    assert body["notable"] is False
    assert body["empty_message"]
    assert body["today"] == {"revenue": 0, "orders": 0}
    assert body["insights"] == []
    assert "business" in body and body["business"]["currency"] == "NGN"
