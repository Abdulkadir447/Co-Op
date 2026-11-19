"""Phase B — tenant isolation.

No list/get/create/update/delete operation may cross business boundaries.
Two Clerk identities (`user-a`, `user-b`) each auto-provision their own
Business; every record created by one must be invisible/immutable to the other.
"""
from __future__ import annotations

PRODUCT = {"sku": "SKU-001", "name": "Widget", "unit_price": 10.0, "current_stock": 5}
CUSTOMER = {"full_name": "Ada", "email": "ada@example.com"}


async def _seed_tenant_a(api):
    api.set_user("user-a")
    p = await api.client.post("/products", json=PRODUCT)
    c = await api.client.post("/customers", json=CUSTOMER)
    o = await api.client.post(
        "/orders",
        json={
            "customer_id": c.json()["id"],
            "items": [
                {"product_id": p.json()["id"], "quantity": 2, "unit_price": 10.0}
            ],
        },
    )
    return p.json()["id"], c.json()["id"], o.json()["id"]


async def test_products_are_isolated(api):
    pid, _, _ = await _seed_tenant_a(api)

    api.set_user("user-b")
    assert (await api.client.get("/products")).json()["items"] == []
    assert (await api.client.get("/products")).json()["total"] == 0
    assert (await api.client.get(f"/products/{pid}")).status_code == 404
    assert (await api.client.put(f"/products/{pid}", json={"name": "hijack"})).status_code == 404
    assert (await api.client.delete(f"/products/{pid}")).status_code == 404
    assert (
        await api.client.post(f"/products/{pid}/adjust", json={"change": 1, "reason": "purchase"})
    ).status_code == 404
    assert (await api.client.get(f"/products/{pid}/movements")).status_code == 404


async def test_customers_are_isolated(api):
    _, cid, _ = await _seed_tenant_a(api)

    api.set_user("user-b")
    assert (await api.client.get("/customers")).json()["items"] == []
    assert (await api.client.get(f"/customers/{cid}")).status_code == 404
    assert (
        await api.client.put(f"/customers/{cid}", json={"full_name": "hijack"})
    ).status_code == 404
    assert (await api.client.delete(f"/customers/{cid}")).status_code == 404


async def test_orders_are_isolated(api):
    _, _, oid = await _seed_tenant_a(api)

    api.set_user("user-b")
    assert (await api.client.get("/orders")).json()["items"] == []
    assert (await api.client.get(f"/orders/{oid}")).status_code == 404
    assert (
        await api.client.put(f"/orders/{oid}/status", json={"status": "confirmed"})
    ).status_code == 404
    assert (await api.client.delete(f"/orders/{oid}")).status_code == 404


async def test_settings_are_isolated(api):
    api.set_user("user-a")
    await api.client.patch("/business/settings", json={"name": "Acme A", "currency": "NGN"})

    api.set_user("user-b")
    settings = await api.client.get("/business/settings")
    assert settings.json()["name"] == "My Business"  # user-b's own fresh tenant
    assert settings.json()["currency"] == "NGN"

    # user-b cannot see user-a's inventory either.
    summary = await api.client.get("/inventory/summary")
    assert summary.json()["products_count"] == 0
