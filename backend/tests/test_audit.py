"""Audit trail tests (hardening backlog): every mutation is recorded and the
read view is tenant-scoped. The sync push path records offline-originated
ops with actor="offline-sync"."""

from __future__ import annotations

import pytest


async def _create_product(api, sku: str = "SKU-1") -> dict:
    resp = await api.client.post(
        "/products",
        json={
            "name": "Widget",
            "sku": sku,
            "unit_price": 10.0,
            "cost_price": 5.0,
            "current_stock": 5,
            "reorder_level": 2,
        },
    )
    assert resp.status_code == 201
    return resp.json()


async def _audit(api, **params):
    resp = await api.client.get("/audit", params=params)
    assert resp.status_code == 200
    return resp.json()


@pytest.mark.asyncio
async def test_mutations_write_audit_rows(api):
    await _create_product(api)
    rows = await _audit(api)
    assert len(rows) == 1
    row = rows[0]
    assert row["table_name"] == "products"
    assert row["action"] == "create"
    assert row["record_id"] is not None
    assert row["actor"] == "user-a"
    assert '"sku"' in (row["change"] or "")


@pytest.mark.asyncio
async def test_audit_is_tenant_scoped(api):
    await _create_product(api)

    # A different tenant sees nothing of user-a's activity.
    api.set_user("user-b")
    rows = await _audit(api)
    assert rows == []


@pytest.mark.asyncio
async def test_audit_covers_crud_and_status_and_settings(api):
    p = await _create_product(api)
    await api.client.put(f"/products/{p['id']}", json={"name": "Widget 2"})
    await api.client.post(
        "/customers", json={"full_name": "Jane", "email": "jane@example.com"}
    )
    await api.client.patch("/business/settings", json={"name": "Acme Ltd"})

    rows = await _audit(api, limit=50)
    actions = [r["action"] for r in rows]
    assert actions.count("create") == 2  # product + customer
    assert "update" in actions  # product rename + settings
    tables = {r["table_name"] for r in rows}
    assert {"products", "customers", "businesses"} <= tables


@pytest.mark.asyncio
async def test_order_create_and_status_are_recorded(api):
    p = await _create_product(api)
    c = (
        await api.client.post(
            "/customers", json={"full_name": "Jane", "email": "jane@example.com"}
        )
    ).json()
    o = (
        await api.client.post(
            "/orders",
            json={
                "customer_id": c["id"],
                "items": [{"product_id": p["id"], "quantity": 2, "unit_price": 10.0}],
            },
        )
    ).json()
    await api.client.put(f"/orders/{o['id']}/status", json={"status": "confirmed"})

    rows = await _audit(api, limit=50)
    order_actions = [r for r in rows if r["table_name"] == "orders"]
    assert [r["action"] for r in order_actions] == ["status", "create"]


@pytest.mark.asyncio
async def test_sync_push_records_offline_ops(api):
    body = {
        "operations": [
            {
                "entity": "product",
                "client_id": "01J0SYNC000000000000000001",
                "operation": "create",
                "payload": {"name": "Offline Lamp", "sku": "OFF-1", "unit_price": 20.0},
            }
        ]
    }
    resp = await api.client.post("/sync/push", json=body)
    assert resp.status_code == 200
    assert resp.json()["applied"] == 1

    rows = await _audit(api)
    assert len(rows) == 1
    assert rows[0]["table_name"] == "product"
    assert rows[0]["action"] == "create"
    # D1: the audit row names who pushed it, not a placeholder. Without an
    # enrolled device the machine half of (actor, device) is empty, which is
    # honest — but the person is always known.
    assert rows[0]["actor"] == "user-a"
    assert "01J0SYNC" in (rows[0]["change"] or "")


@pytest.mark.asyncio
async def test_audit_pagination_respects_limit(api):
    for i in range(3):
        await _create_product(api, sku=f"SKU-{i}")
    rows = await _audit(api, limit=2)
    assert len(rows) == 2
