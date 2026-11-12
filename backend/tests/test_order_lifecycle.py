"""Order lifecycle — legal/illegal status transitions end to end."""
from __future__ import annotations

PRODUCT = {"sku": "SKU-002", "name": "Gadget", "unit_price": 5.0, "current_stock": 10}
CUSTOMER = {"full_name": "Grace", "email": "grace@example.com"}


async def _create_order(api):
    p = await api.client.post("/products", json=PRODUCT)
    c = await api.client.post("/customers", json=CUSTOMER)
    o = await api.client.post(
        "/orders",
        json={
            "customer_id": c.json()["id"],
            "items": [{"product_id": p.json()["id"], "quantity": 1, "unit_price": 5.0}],
        },
    )
    return o.json()["id"]


async def _status(api, order_id):
    return await api.client.get(f"/orders/{order_id}")


async def test_pending_to_delivered_and_terminal(api):
    oid = await _create_order(api)

    assert (await _status(api, oid)).json()["status"] == "pending"

    # pending -> delivered directly is illegal (must go through confirm/ship).
    assert (
        await api.client.put(f"/orders/{oid}/status", json={"status": "delivered"})
    ).status_code == 409

    assert (
        await api.client.put(f"/orders/{oid}/status", json={"status": "confirmed"})
    ).status_code == 200
    assert (
        await api.client.put(f"/orders/{oid}/status", json={"status": "shipped"})
    ).status_code == 200
    assert (
        await api.client.put(f"/orders/{oid}/status", json={"status": "delivered"})
    ).status_code == 200

    # delivered is terminal.
    assert (
        await api.client.put(f"/orders/{oid}/status", json={"status": "cancelled"})
    ).status_code == 409
    assert (
        await api.client.put(f"/orders/{oid}/status", json={"status": "shipped"})
    ).status_code == 409


async def test_shipped_cannot_be_cancelled(api):
    oid = await _create_order(api)
    await api.client.put(f"/orders/{oid}/status", json={"status": "confirmed"})
    await api.client.put(f"/orders/{oid}/status", json={"status": "shipped"})
    assert (
        await api.client.put(f"/orders/{oid}/status", json={"status": "cancelled"})
    ).status_code == 409


async def test_top_products_ignores_cancelled_and_deleted_orders(api):
    """The dashboard's "top products" must not keep counting orders that were
    cancelled or deleted — stock decisions are made from that number."""
    # Enough stock for 2 + 4 + 6 units, so the test is about the dashboard
    # aggregate and not about the stock guard.
    stocky = dict(PRODUCT, current_stock=50)
    p = (await api.client.post("/products", json=stocky)).json()
    c = (await api.client.post("/customers", json=CUSTOMER)).json()

    async def order(qty):
        o = await api.client.post(
            "/orders",
            json={
                "customer_id": c["id"],
                "items": [{"product_id": p["id"], "quantity": qty, "unit_price": 5.0}],
            },
        )
        assert o.status_code == 201, o.text
        return o.json()["id"]

    kept = await order(2)
    cancelled = await order(4)
    deleted = await order(6)

    await api.client.put(f"/orders/{cancelled}/status", json={"status": "cancelled"})
    assert (await api.client.delete(f"/orders/{deleted}")).status_code == 204

    rows = (await api.client.get("/dashboard/top-products")).json()
    assert rows and rows[0]["product_id"] == p["id"]
    assert float(rows[0]["total_quantity"]) == 2.0, rows
    assert float(rows[0]["total_revenue"]) == 10.0, rows
    assert kept  # the only order that should count
