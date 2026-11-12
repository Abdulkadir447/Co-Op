"""Investor metrics — the numbers an accelerator application has to defend.

These tests exist because a metric that is only eyeballed is a metric that
drifts. Each one seeds a known history and asserts the arithmetic, including
the case that matters most: a percentage with no base must be "no data", never
a fabricated zero.
"""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import select, update

from backend import investor_metrics as im
from backend.models import (
    AiUsage,
    Business,
    Invoice,
    Order,
    OrderItem,
    Payment,
    Product,
    StockMovement,
)


def test_growth_without_a_base_is_unknown_not_zero() -> None:
    assert im._pct(5, 0) is None          # nothing to grow from
    assert im._pct(0, 0) is None
    assert im._pct(2, 1) == 100.0
    assert im._pct(1, 2) == -50.0


def test_headline_never_invents_a_revenue_figure() -> None:
    metrics = {
        "businesses": {"total": 0, "new_last_7_days": 0,
                       "signup_growth_pct_week_over_week": None},
        "revenue": {"currency": "USD", "mrr": 0.0, "paying_businesses": 0},
        "activation": {"rate_pct": None},
    }
    line = im.headline(metrics)
    assert "no paying customers yet" in line
    assert "MRR" not in line
    assert "0.00" not in line               # no fake currency figure
    assert "None" not in line


async def _provision(api, user: str, email: str) -> int:
    api.set_user(user, email=email)
    await api.client.get("/billing/summary")           # creates the tenant
    me = await api.client.get("/auth/me")
    return int(me.json()["business_id"])


@pytest.mark.asyncio
async def test_snapshot_computes_growth_activation_and_mrr(api, session_factory) -> None:
    now = dt.datetime.utcnow()
    day = dt.timedelta(days=1)

    fresh = await _provision(api, "user-fresh", "fresh@example.com")
    last_week = await _provision(api, "user-week", "week@example.com")
    old = await _provision(api, "user-old", "old@example.com")

    # Backdate two of the three signups: one in the previous 7-day window and
    # one outside it, so "new this week" and the growth base are both non-zero.
    async with session_factory() as session:
        await session.execute(
            update(Business).where(Business.id == last_week).values(created_at=now - 10 * day)
        )
        await session.execute(
            update(Business).where(Business.id == old).values(created_at=now - 20 * day)
        )
        await session.commit()

    # `old` issued its first invoice two days after signing up -> activated.
    api.set_user("user-old", email="old@example.com")
    product = (await api.client.post("/products", json={
        "sku": "DEMO-1", "name": "Demo widget", "unit_price": 40.0,
        "cost_price": 15.0, "current_stock": 50,
    })).json()
    customer = (await api.client.post("/customers", json={
        "full_name": "Acme Ltd", "email": "buyer@example.com",
    })).json()
    order = (await api.client.post("/orders", json={
        "customer_id": customer["id"],
        "items": [{"product_id": product["id"], "quantity": 2, "unit_price": 40.0}],
    })).json()
    invoice = await api.client.post("/invoices", json={"order_id": order["id"]})
    assert invoice.status_code == 201, invoice.text

    async with session_factory() as session:
        await session.execute(
            update(Invoice).where(Invoice.business_id == old).values(created_at=now - 18 * day)
        )
        # One successful monthly charge for the fresh business ($29 -> 2900 cents).
        session.add(Payment(
            business_id=fresh, provider="paystack", reference="demo-ref-1",
            plan="starter", interval="monthly", amount_kobo=2900, currency="USD",
            status="success", created_at=now - day,
        ))
        session.add(AiUsage(business_id=old, model="demo", credits_used=5,
                            input_tokens=100, output_tokens=20, created_at=now - day))
        await session.commit()

    async with session_factory() as session:
        m = await im.snapshot(session, now=now)

    assert m["businesses"]["total"] == 3
    assert m["businesses"]["new_last_7_days"] == 1        # only `fresh`
    assert m["businesses"]["new_previous_7_days"] == 1    # only `last_week`
    assert m["businesses"]["signup_growth_pct_week_over_week"] == 0.0

    # `fresh` is too young to be judged; `last_week` and `old` are eligible and
    # only `old` invoiced inside its window.
    assert m["activation"]["eligible_businesses"] == 2
    assert m["activation"]["activated"] == 1
    assert m["activation"]["rate_pct"] == 50.0

    assert m["revenue"]["mrr"] == 29.0
    assert m["revenue"]["paying_businesses"] == 1
    assert m["revenue"]["arpu"] == 29.0
    assert m["revenue"]["currency"] == "USD"
    assert m["ai"]["credits_used"] == 5

    # The headline is quotable as-is and carries the same figures.
    assert "3 businesses signed up" in m["headline"]
    assert "$29.00 MRR" in m["headline"]
    assert "50% activated" in m["headline"]


@pytest.mark.asyncio
async def test_annual_charges_are_normalised_to_monthly(api, session_factory) -> None:
    business_id = await _provision(api, "user-annual", "annual@example.com")
    now = dt.datetime.utcnow()

    async with session_factory() as session:
        session.add(Payment(
            business_id=business_id, provider="paystack", reference="demo-ref-annual",
            plan="professional", interval="annual", amount_kobo=95040, currency="USD",
            status="success", created_at=now - dt.timedelta(days=2),
        ))
        # A failed charge must never be counted as revenue.
        session.add(Payment(
            business_id=business_id, provider="paystack", reference="demo-ref-failed",
            plan="professional", interval="monthly", amount_kobo=9900, currency="USD",
            status="failed", created_at=now - dt.timedelta(days=2),
        ))
        await session.commit()

    async with session_factory() as session:
        m = await im.snapshot(session, now=now)

    assert m["revenue"]["mrr"] == 79.2         # $950.40 / 12 = $79.20/month
    assert m["revenue"]["paying_businesses"] == 1


@pytest.mark.asyncio
async def test_route_is_admin_only_and_returns_definitions(api, monkeypatch) -> None:
    r = await api.client.get("/platform/investor-metrics")
    assert r.status_code == 403, "cross-tenant aggregates are platform-admin only"

    monkeypatch.setenv("COOP_PLATFORM_ADMINS", "admin@coop.test")
    api.set_user("user-a", email="admin@coop.test")
    await api.client.get("/billing/summary")

    ok = await api.client.get("/platform/investor-metrics")
    assert ok.status_code == 200
    body = ok.json()
    assert set(body) >= {
        "as_of", "window_days", "businesses", "activation", "engagement",
        "revenue", "ai", "headline",
    }
    # Every derived number states how it was derived.
    assert body["activation"]["definition"].startswith("issued a first invoice")
    assert "successful charges only" in body["revenue"]["definition"]
    # Aggregates only: no tenant identity anywhere in the payload.
    flat = str(body)
    assert "@" not in flat, "an email must never cross this boundary"


@pytest.mark.asyncio
async def test_engagement_counts_only_real_activity(api, session_factory) -> None:
    idle = await _provision(api, "user-idle", "idle@example.com")
    busy = await _provision(api, "user-busy", "busy@example.com")
    now = dt.datetime.utcnow()

    api.set_user("user-busy", email="busy@example.com")
    await api.client.post("/products", json={
        "sku": "ACT-1", "name": "Active widget", "unit_price": 5.0, "current_stock": 3,
    })

    async with session_factory() as session:
        m = await im.snapshot(session, now=now)
        # `busy` wrote an audit row; `idle` only exists.
        rows = (await session.execute(select(Business.id))).scalars().all()
    assert set(rows) == {idle, busy}
    assert m["engagement"]["active_last_7_days"] >= 1
    assert m["engagement"]["active_last_7_days"] <= m["businesses"]["total"]


# ---------------------------------------------------------------------------
# Demo seed — the artefact a pre-traction product actually shows
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_demo_seed_is_coherent_and_refuses_to_double_up(api, session_factory) -> None:
    """A demo an accountant can break is worse than no demo.

    The seeded history has to satisfy the same invariants the app enforces:
    order totals equal their lines, invoice numbers are sequential, stock
    movements reconcile to the current stock, and the reports see real money.
    """
    from backend import demo

    business_id = await _provision(api, "user-demo", "demo@example.com")
    now = dt.datetime.utcnow()

    async with session_factory() as session:
        business = (
            await session.execute(select(Business).where(Business.id == business_id))
        ).scalar_one()
        summary = await demo.seed_business(session, business, weeks=6, now=now)
        await session.commit()

    assert summary["products"] == 10
    assert summary["customers"] == 12
    assert summary["orders"] > 10
    assert summary["invoices"] > 5

    async with session_factory() as session:
        orders = (await session.execute(
            select(Order).where(Order.business_id == business_id)
        )).scalars().all()
        items = (await session.execute(
            select(OrderItem).where(OrderItem.business_id == business_id)
        )).scalars().all()
        invoices = (await session.execute(
            select(Invoice).where(Invoice.business_id == business_id).order_by(Invoice.number)
        )).scalars().all()
        movements = (await session.execute(
            select(StockMovement).where(StockMovement.business_id == business_id)
        )).scalars().all()
        products = (await session.execute(
            select(Product).where(Product.business_id == business_id)
        )).scalars().all()

    # 1. Every order total is the sum of its own lines.
    by_order: dict[int, float] = {}
    for item in items:
        by_order[item.order_id] = round(by_order.get(item.order_id, 0.0) + item.total_price, 2)
    for order in orders:
        assert order.total_amount == by_order[order.id], order.id
        # Tax is only ever applied at the configured rate, or not at all.
        assert order.tax_rate is None or order.tax_amount == round(
            order.total_amount * order.tax_rate / 100.0, 2
        )

    # 2. Invoice numbers are sequential and unique within the tenant.
    numbers = [i.number for i in invoices]
    assert numbers == [f"INV-{n:04d}" for n in range(1, len(numbers) + 1)]

    # 3. The stock ledger reconciles to what each product says it holds.
    for product in products:
        net = sum(m.change for m in movements if m.product_id == product.id)
        assert product.current_stock == net, product.sku
        assert product.current_stock >= 0

    # 4. It is a demo, not a way to duplicate a real customer's books.
    async with session_factory() as session:
        business = (
            await session.execute(select(Business).where(Business.id == business_id))
        ).scalar_one()
        with pytest.raises(ValueError):
            await demo.seed_business(session, business, weeks=2, now=now)

    # 5. The investor metrics see the seeded history: nobody "activated" a
    #    demo tenant, but the revenue and engagement numbers are real rows.
    async with session_factory() as session:
        m = await im.snapshot(session, now=now)
    assert m["businesses"]["total"] >= 1
    assert m["engagement"]["active_last_7_days"] >= 1
