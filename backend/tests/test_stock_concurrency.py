"""H1 — centralized, version-guarded stock mutations.

Covers: no overselling on order creation, exactly-once restore on cancel and
delete, the optimistic-lock conflict path, and (Postgres only) a true
concurrent-order test proving no oversell under parallel requests.
"""
from __future__ import annotations

import os

import pytest
from fastapi import HTTPException

from backend.main import _change_stock
from backend.models import Business, Product, StockMovementReason

PRODUCT = {
    "sku": "SKU-001",
    "name": "Widget",
    "unit_price": 10.0,
    "current_stock": 5,
    "reorder_level": 1,
}
CUSTOMER = {"full_name": "Ada", "email": "ada@example.com"}


async def _make_product(api, stock=5):
    r = await api.client.post("/products", json={**PRODUCT, "current_stock": stock})
    assert r.status_code == 201, r.text
    return r.json()


async def _make_customer(api):
    r = await api.client.post("/customers", json=CUSTOMER)
    assert r.status_code == 201, r.text
    return r.json()


def _order(customer_id, product_id, quantity, unit_price=10.0):
    return {
        "customer_id": customer_id,
        "items": [
            {"product_id": product_id, "quantity": quantity, "unit_price": unit_price}
        ],
    }


async def _stock(api, product_id):
    r = await api.client.get(f"/products/{product_id}")
    return r.json()["current_stock"], r.json()["version"]


async def test_adjust_stock_bumps_version_and_writes_ledger(api):
    product = await _make_product(api)
    pid = product["id"]
    assert product["version"] == 1

    adj = await api.client.post(
        f"/products/{pid}/adjust", json={"change": 2, "reason": "purchase"}
    )
    assert adj.status_code == 200, adj.text
    assert adj.json()["current_stock"] == 7
    assert adj.json()["version"] == 2

    movements = await api.client.get(f"/products/{pid}/movements")
    assert movements.json()["total"] == 2  # initial + purchase


async def test_adjust_below_zero_conflicts(api):
    product = await _make_product(api)
    adj = await api.client.post(
        f"/products/{product['id']}/adjust", json={"change": -10, "reason": "sale"}
    )
    assert adj.status_code == 409


async def test_order_creation_cannot_oversell(api):
    product = await _make_product(api)
    customer = await _make_customer(api)

    first = await api.client.post("/orders", json=_order(customer["id"], product["id"], 3))
    assert first.status_code == 201, first.text
    stock, _ = await _stock(api, product["id"])
    assert stock == 2

    second = await api.client.post("/orders", json=_order(customer["id"], product["id"], 3))
    assert second.status_code == 409
    stock, _ = await _stock(api, product["id"])
    assert stock == 2  # unchanged


async def test_cancel_restores_stock_exactly_once(api):
    product = await _make_product(api)
    customer = await _make_customer(api)
    order = await api.client.post("/orders", json=_order(customer["id"], product["id"], 3))
    assert order.status_code == 201

    cancelled = await api.client.put(
        f"/orders/{order.json()['id']}/status", json={"status": "cancelled"}
    )
    assert cancelled.status_code == 200
    stock, _ = await _stock(api, product["id"])
    assert stock == 5

    # Cancelled is terminal: a second cancel is rejected, no double restore.
    again = await api.client.put(
        f"/orders/{order.json()['id']}/status", json={"status": "cancelled"}
    )
    assert again.status_code == 409
    stock, _ = await _stock(api, product["id"])
    assert stock == 5


async def test_delete_restores_but_cancelled_delete_does_not_double_restore(api):
    product = await _make_product(api)
    customer = await _make_customer(api)

    # Delete an active order -> stock restored.
    order1 = await api.client.post("/orders", json=_order(customer["id"], product["id"], 3))
    stock, _ = await _stock(api, product["id"])
    assert stock == 2
    deleted = await api.client.delete(f"/orders/{order1.json()['id']}")
    assert deleted.status_code == 204
    stock, _ = await _stock(api, product["id"])
    assert stock == 5

    # Cancel an order (restores), then delete it -> no second restore.
    order2 = await api.client.post("/orders", json=_order(customer["id"], product["id"], 3))
    stock, _ = await _stock(api, product["id"])
    assert stock == 2
    await api.client.put(f"/orders/{order2.json()['id']}/status", json={"status": "cancelled"})
    stock, _ = await _stock(api, product["id"])
    assert stock == 5
    deleted2 = await api.client.delete(f"/orders/{order2.json()['id']}")
    assert deleted2.status_code == 204
    stock, _ = await _stock(api, product["id"])
    assert stock == 5


async def test_change_stock_stale_version_conflicts(engine, session_factory):
    """Deterministic proof of the optimistic-lock guard (runs everywhere)."""
    async with session_factory() as db:
        business = Business(name="B", owner_id="user-a", currency="USD")
        db.add(business)
        await db.flush()
        from backend import branches as branches_mod

        br = (await branches_mod.default_branch(db, business.id)).id
        product = Product(
            business_id=business.id, sku="X-1", name="X", unit_price=1.0, current_stock=10
        )
        db.add(product)
        await db.flush()

        # A fresh change succeeds and bumps the version.
        await _change_stock(
            db, business.id, br, product, -2, StockMovementReason.order, "user-a"
        )
        assert product.current_stock == 8
        assert product.version == 2

        # Simulate a caller holding a stale version -> 409.
        product.version = 1
        with pytest.raises(HTTPException) as exc_info:
            await _change_stock(
                db, business.id, br, product, -2, StockMovementReason.order, "user-a"
            )
        assert exc_info.value.status_code == 409


@pytest.mark.skipif(
    os.getenv("TEST_DATABASE_URL") is None,
    reason="true concurrency requires Postgres (set TEST_DATABASE_URL)",
)
async def test_concurrent_orders_do_not_oversell(api):
    """Two parallel orders race for the last units; exactly one may win."""
    import asyncio

    product = await _make_product(api, stock=3)
    customer = await _make_customer(api)

    async def attempt():
        return await api.client.post(
            "/orders", json=_order(customer["id"], product["id"], 3)
        )

    r1, r2 = await asyncio.gather(attempt(), attempt())
    statuses = sorted([r1.status_code, r2.status_code])
    assert statuses == [201, 409], (r1.status_code, r2.status_code, r1.text, r2.text)

    stock, _ = await _stock(api, product["id"])
    assert stock == 0
