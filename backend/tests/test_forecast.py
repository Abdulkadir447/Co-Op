"""AI Platform — deterministic revenue forecast (PRD Phase 3 deliverable).

No LLM involved: the forecast is a transparent least-squares trend over
the business's verified order data. Tests seed fixed-dated orders (relative
to "today" so they are wall-clock independent) and assert EXACT numbers,
determinism, the honest insufficient-data states, and tenant isolation.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import select

from backend import branches as branches_mod
from backend.models import Business, Order, OrderItem, OrderStatus


def _month(d: dt.date) -> dt.date:
    return dt.date(d.year, d.month, 1)


def _months_ago(n: int) -> dt.date:
    """First day of the month n months before the current month."""
    cur = _month(dt.date.today())
    idx = cur.year * 12 + (cur.month - 1) - n
    return dt.date(idx // 12, idx % 12 + 1, 1)


def _next_month_key() -> str:
    idx = dt.date.today().year * 12 + dt.date.today().month  # month after current
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


async def _seed_base(api, session_factory) -> tuple[int, int, int]:
    """One business (via the API, as the fixture user), plus product + customer.

    Returns (business_id, product_id, customer_id).
    """
    p = (
        await api.client.post(
            "/products",
            json={
                "sku": "FC-1",
                "name": "Chair",
                "unit_price": 100.0,
                "current_stock": 100,
            },
        )
    ).json()
    c = (
        await api.client.post(
            "/customers",
            json={
                "full_name": "Forecast Co",
                "email": "fc@example.com",
            },
        )
    ).json()
    async with session_factory() as db:
        biz = (
            (await db.execute(select(Business).where(Business.owner_id == "user-a")))
            .scalars()
            .first()
        )
        return biz.id, p["id"], c["id"]


async def _seed_orders(
    session_factory,
    business_id: int,
    customer_id: int,
    product_id: int,
    specs: list[tuple[dt.date, float, str]],
):
    """specs: (order_date, total, status) — one order per entry."""
    async with session_factory() as db:
        br = (await branches_mod.default_branch(db, business_id)).id
        for od, total, status in specs:
            o = Order(
                business_id=business_id,
                branch_id=br,
                customer_id=customer_id,
                order_date=dt.datetime.combine(od, dt.time(12, 0)),
                status=OrderStatus(status),
                total_amount=total,
            )
            db.add(o)
            await db.flush()
            qty = max(1, round(total / 100.0))
            db.add(
                OrderItem(
                    business_id=business_id,
                    branch_id=br,
                    order_id=o.id,
                    product_id=product_id,
                    quantity=qty,
                    unit_price=round(total / qty, 4),
                    total_price=total,
                )
            )
        await db.commit()


# ---------------------------------------------------------------------------
# Honest states: no data / not enough history
# ---------------------------------------------------------------------------


async def test_forecast_no_sales_history(api, session_factory):
    r = await api.client.get("/ai/forecast")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["available"] is False
    assert body["reason"] == "no_sales_history"
    assert body["forecast"] is None
    assert body["completed_months"] == 0
    assert body["required_months"] == 3


async def test_forecast_insufficient_history(api, session_factory):
    """A business whose first order landed two months ago has only two
    completed months — not enough to trend, and it must say so honestly."""
    bid, pid, cid = await _seed_base(api, session_factory)
    m2 = _months_ago(2)
    m1 = _months_ago(1)
    await _seed_orders(
        session_factory,
        bid,
        cid,
        pid,
        [
            (m2, 1000.0, "pending"),
            (m1, 2000.0, "pending"),
        ],
    )

    r = await api.client.get("/ai/forecast")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["available"] is False
    assert body["reason"] == "insufficient_history"
    assert body["completed_months"] == 2
    assert body["required_months"] == 3
    assert body["forecast"] is None
    # The series still shows what exists (chart-friendly, nothing invented).
    keys = [m["key"] for m in body["months"]]
    assert keys[0] == m2.strftime("%Y-%m")  # truncated at first order month
    assert any(m["in_progress"] for m in body["months"])


# ---------------------------------------------------------------------------
# The calculation: exact, transparent, deterministic
# ---------------------------------------------------------------------------


async def test_forecast_linear_trend_is_exact(api, session_factory):
    """1000/2000/3000/4000 over four completed months -> a perfect line
    (slope 1000) -> next month exactly 5000, band ±15% (residuals are 0)."""
    bid, pid, cid = await _seed_base(api, session_factory)
    await _seed_orders(
        session_factory,
        bid,
        cid,
        pid,
        [
            (_months_ago(4) + dt.timedelta(days=3), 1000.0, "pending"),
            (_months_ago(3) + dt.timedelta(days=10), 2000.0, "delivered"),
            (_months_ago(2) + dt.timedelta(days=7), 3000.0, "pending"),
            (_months_ago(1) + dt.timedelta(days=20), 4000.0, "delivered"),
        ],
    )

    r = await api.client.get("/ai/forecast")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["available"] is True
    assert body["reason"] is None

    fc = body["forecast"]
    assert fc["period"] == _next_month_key()
    assert fc["estimated"] == 5000.0
    assert fc["low"] == 4250.0  # 5000 - 15% (residual std is 0)
    assert fc["high"] == 5750.0
    assert fc["trend_percent"] == 25.0  # vs the last completed month (4000)
    assert fc["completed_months_used"] == 4

    # The monthly series: four completed + the in-progress current month.
    months = body["months"]
    assert len(months) == 5
    assert [m["revenue"] for m in months[:-1]] == [1000.0, 2000.0, 3000.0, 4000.0]
    assert months[-1]["in_progress"] is True
    assert "least-squares" in body["method"].lower()


async def test_forecast_downtrend_and_zero_clamp(api, session_factory):
    """A falling trend must never forecast negative revenue."""
    bid, pid, cid = await _seed_base(api, session_factory)
    await _seed_orders(
        session_factory,
        bid,
        cid,
        pid,
        [
            (_months_ago(4) + dt.timedelta(days=2), 4000.0, "pending"),
            (_months_ago(3) + dt.timedelta(days=2), 3000.0, "pending"),
            (_months_ago(2) + dt.timedelta(days=2), 2000.0, "pending"),
            (_months_ago(1) + dt.timedelta(days=2), 1000.0, "pending"),
        ],
    )

    r = await api.client.get("/ai/forecast")
    body = r.json()
    assert body["available"] is True
    fc = body["forecast"]
    # 4000/3000/2000/1000 (n=4) -> slope -1000, raw line hits 0 next month.
    assert fc["estimated"] == 0.0
    assert fc["low"] == 0.0
    assert fc["high"] == fc["estimated"]  # residual std 0 and 15% of 0
    assert fc["trend_percent"] == -100.0  # vs the last completed month (1000)


async def test_forecast_excludes_cancelled_and_is_deterministic(api, session_factory):
    """Cancelled orders never enter the trend; same data -> same numbers."""
    bid, pid, cid = await _seed_base(api, session_factory)
    await _seed_orders(
        session_factory,
        bid,
        cid,
        pid,
        [
            (_months_ago(4) + dt.timedelta(days=3), 1000.0, "pending"),
            (_months_ago(3) + dt.timedelta(days=10), 2000.0, "pending"),
            (_months_ago(2) + dt.timedelta(days=7), 3000.0, "pending"),
            (_months_ago(1) + dt.timedelta(days=20), 4000.0, "pending"),
            # A huge cancelled order in the trend window must not move the line.
            (_months_ago(3) + dt.timedelta(days=11), 999999.0, "cancelled"),
        ],
    )

    r1 = (await api.client.get("/ai/forecast")).json()
    r2 = (await api.client.get("/ai/forecast")).json()
    assert r1 == r2  # fully deterministic
    assert r1["forecast"]["estimated"] == 5000.0  # unchanged by the cancelled order


async def test_forecast_series_starts_at_first_order(api, session_factory):
    """No zero-padding before the business's first sale — the series is
    truncated at the first order month (a young business trends on its own
    history, not on invented zeros)."""
    bid, pid, cid = await _seed_base(api, session_factory)
    first = _months_ago(3)
    await _seed_orders(
        session_factory,
        bid,
        cid,
        pid,
        [
            (first + dt.timedelta(days=5), 1000.0, "pending"),
            (_months_ago(2) + dt.timedelta(days=5), 1200.0, "pending"),
            (_months_ago(1) + dt.timedelta(days=5), 1400.0, "pending"),
        ],
    )

    body = (await api.client.get("/ai/forecast")).json()
    assert body["available"] is True
    keys = [m["key"] for m in body["months"]]
    assert keys[0] == first.strftime("%Y-%m")
    assert len(keys) == 4  # 3 completed + in-progress current month
    # 1000/1200/1400 -> slope 200 -> next = 1600.
    assert body["forecast"]["estimated"] == 1600.0


# ---------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------


async def test_forecast_is_tenant_scoped(api, session_factory):
    bid, pid, cid = await _seed_base(api, session_factory)
    await _seed_orders(
        session_factory,
        bid,
        cid,
        pid,
        [
            (_months_ago(3) + dt.timedelta(days=5), 1000.0, "pending"),
            (_months_ago(2) + dt.timedelta(days=5), 1200.0, "pending"),
            (_months_ago(1) + dt.timedelta(days=5), 1400.0, "pending"),
        ],
    )
    assert (await api.client.get("/ai/forecast")).json()["available"] is True

    api.set_user("user-b")  # a different owner's business
    r = await api.client.get("/ai/forecast")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["available"] is False
    assert body["reason"] == "no_sales_history"
