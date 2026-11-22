"""Backup & Restore (PRD Phase 4 "Backup system"): export snapshot,
restore-into-empty rule, validation, tenant isolation."""

from __future__ import annotations

import pytest

from backend import backups as backups_mod


async def _seed_business(api) -> dict:
    """One product, one customer, one order (two lines) + ledger movements."""
    p1 = (
        await api.client.post(
            "/products",
            json={
                "name": "Widget",
                "sku": "SKU-1",
                "unit_price": 10.0,
                "cost_price": 4.0,
                "current_stock": 10,
                "reorder_level": 2,
            },
        )
    ).json()
    p2 = (
        await api.client.post(
            "/products",
            json={
                "name": "Gadget",
                "sku": "SKU-2",
                "unit_price": 25.0,
                "cost_price": 12.0,
                "current_stock": 4,
                "reorder_level": 1,
            },
        )
    ).json()
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
                "items": [
                    {"product_id": p1["id"], "quantity": 2, "unit_price": 10.0},
                    {"product_id": p2["id"], "quantity": 1, "unit_price": 25.0},
                ],
            },
        )
    ).json()
    return {"p1": p1, "p2": p2, "c": c, "o": o}


@pytest.mark.asyncio
async def test_export_snapshots_everything(api):
    await _seed_business(api)
    resp = await api.client.get("/backups/export")
    assert resp.status_code == 200
    assert "coop-backup-" in resp.headers["content-disposition"]

    envelope = resp.json()
    assert envelope["app"] == "coop"
    assert envelope["encrypted"] is True
    # The wire format is an encrypted envelope — no plaintext business data.
    assert "entities" not in envelope and "ciphertext" in envelope
    payload = backups_mod.decrypt_backup(envelope)
    assert payload["version"] == 1
    entities = payload["entities"]
    assert len(entities["products"]) == 2
    assert len(entities["customers"]) == 1
    assert len(entities["orders"]) == 1
    assert len(entities["order_items"]) == 2
    assert len(entities["stock_movements"]) == 4  # 2 initial + 2 order deductions


@pytest.mark.asyncio
async def test_restore_into_empty_business_rebuilds_data(api):
    await _seed_business(api)
    backup = (await api.client.get("/backups/export")).json()

    api.set_user("user-b")  # fresh, empty tenant
    resp = await api.client.post("/backups/restore", json=backup)
    assert resp.status_code == 200
    assert resp.json()["restored"] == {
        "products": 2,
        "customers": 1,
        "orders": 1,
        "order_items": 2,
        "stock_movements": 4,
        # 0020: the payment ledger travels with the data (empty here — the
        # seed raises orders without recording payments).
        "order_payments": 0,
    }

    products = (await api.client.get("/products")).json()["items"]
    assert {p["sku"] for p in products} == {"SKU-1", "SKU-2"}

    customers = (await api.client.get("/customers")).json()["items"]
    assert customers[0]["email"] == "jane@example.com"

    orders = (await api.client.get("/orders")).json()["items"]
    assert len(orders) == 1
    order = (await api.client.get(f"/orders/{orders[0]['id']}")).json()
    assert len(order["items"]) == 2
    assert order["customer"]["full_name"] == "Jane"

    # The ledger travelled with the data, re-pointed at the new product ids.
    pid = next(p["id"] for p in products if p["sku"] == "SKU-1")
    movements = (await api.client.get(f"/products/{pid}/movements")).json()["items"]
    assert len(movements) == 2
    assert movements[0]["reason"] in {"initial", "order"}


@pytest.mark.asyncio
async def test_restore_refuses_a_non_empty_business(api):
    await _seed_business(api)
    backup = (await api.client.get("/backups/export")).json()
    resp = await api.client.post("/backups/restore", json=backup)
    assert resp.status_code == 409
    assert "empty" in resp.json()["detail"]
    # Nothing was clobbered.
    products = (await api.client.get("/products")).json()["items"]
    assert len(products) == 2


@pytest.mark.asyncio
async def test_invalid_backups_are_rejected(api):
    bad = [
        {"app": "other", "version": 1, "entities": {}},
        {"app": "coop", "version": 99, "entities": {}},
        {"app": "coop", "version": 1, "entities": {"aliens": []}},
        {"app": "coop", "version": 1, "entities": {"products": "not-a-list"}},
        {"app": "coop", "version": 1, "entities": {}},  # empty entities
    ]
    for payload in bad:
        resp = await api.client.post("/backups/restore", json=payload)
        assert resp.status_code == 400, payload
    # A non-object body is rejected by the schema layer (422), not the module.
    resp = await api.client.post("/backups/restore", json="not even an object")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_restore_rejects_invalid_status_and_reason(api):
    backup = {
        "app": "coop",
        "version": 1,
        "entities": {
            "products": [],
            "customers": [{"id": 1, "full_name": "Jane", "email": "jane@x.com"}],
            "orders": [
                {"id": 1, "customer_id": 1, "status": "teleported", "total_amount": 10.0}
            ],
            "order_items": [],
            "stock_movements": [
                {"id": 1, "product_id": 1, "change": 1, "reason": "magic"}
            ],
        },
    }
    resp = await api.client.post("/backups/restore", json=backup)
    assert resp.status_code == 400
    assert "status" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_export_is_tenant_scoped(api):
    await _seed_business(api)
    api.set_user("user-b")
    envelope = (await api.client.get("/backups/export")).json()
    entities = backups_mod.decrypt_backup(envelope)["entities"]
    assert all(len(entities[k]) == 0 for k in entities)


@pytest.mark.asyncio
async def test_restore_writes_an_audit_row(api):
    await _seed_business(api)
    backup = (await api.client.get("/backups/export")).json()
    api.set_user("user-b")
    await api.client.post("/backups/restore", json=backup)
    rows = (await api.client.get("/audit")).json()
    assert rows[0]["action"] == "restore"
    assert rows[0]["table_name"] == "businesses"


def test_encrypt_decrypt_round_trip_is_lossless():
    inner = {"app": "coop", "version": 1, "entities": {"products": [{"name": "Widget"}]}}
    env = backups_mod.encrypt_backup(inner)
    assert env["encrypted"] is True
    assert "entities" not in env and "ciphertext" in env
    # the plaintext never appears in the envelope
    assert "Widget" not in env["ciphertext"]
    assert backups_mod.decrypt_backup(env) == inner


def test_decrypt_accepts_a_legacy_plaintext_backup():
    legacy = {"app": "coop", "version": 1, "entities": {}}
    # a pre-encryption file has no "encrypted" flag and passes through untouched
    assert backups_mod.decrypt_backup(legacy) == legacy


def test_decrypt_rejects_the_wrong_key(monkeypatch):
    inner = {"app": "coop", "version": 1, "entities": {}}
    env = backups_mod.encrypt_backup(inner)
    monkeypatch.setenv("BACKUP_ENCRYPTION_KEY", "a-completely-different-key")
    with pytest.raises(backups_mod.BackupValidationError):
        backups_mod.decrypt_backup(env)


@pytest.mark.asyncio
async def test_export_hides_plaintext_and_tampered_ciphertext_is_rejected(api):
    await _seed_business(api)
    envelope = (await api.client.get("/backups/export")).json()
    raw_text = str(envelope)
    # seeded names/values must not be readable in the downloaded file
    assert "Widget" not in raw_text and "SKU-1" not in raw_text

    bad = dict(envelope)
    ct = bad["ciphertext"]
    bad["ciphertext"] = ("A" if ct[0] != "A" else "B") + ct[1:]
    api.set_user("user-b")
    resp = await api.client.post("/backups/restore", json=bad)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_export_refuses_without_a_key_in_production(api, monkeypatch):
    """The dev fallback key is in the source tree, so "encrypted" with it is
    encrypted for nobody. In production a missing key is a refusal."""
    monkeypatch.setenv("COOP_ENV", "production")
    monkeypatch.delenv("BACKUP_ENCRYPTION_KEY", raising=False)
    monkeypatch.delenv("SECRET", raising=False)

    resp = await api.client.get("/backups/export")
    assert resp.status_code == 503
    assert "BACKUP_ENCRYPTION_KEY" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_export_still_works_when_the_key_is_set(api, monkeypatch):
    monkeypatch.setenv("COOP_ENV", "production")
    monkeypatch.setenv("BACKUP_ENCRYPTION_KEY", "a-real-deployment-key")
    resp = await api.client.get("/backups/export")
    assert resp.status_code == 200
    assert resp.json()["encrypted"] is True


@pytest.mark.asyncio
async def test_a_non_numeric_value_in_a_backup_is_a_400(api):
    """`float("abc")` used to escape as an unhandled ValueError -> 500."""
    backup = {
        "app": "coop",
        "version": 1,
        "entities": {
            "products": [
                {"sku": "P1", "name": "Widget", "unit_price": "abc", "current_stock": 0}
            ]
        },
    }
    resp = await api.client.post("/backups/restore", json=backup)
    assert resp.status_code == 400, resp.text
    assert "number" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_restore_recomputes_stock_from_the_ledger(api):
    """`current_stock` in the file is not trusted: the movements are the truth,
    so a backup whose two disagree restores a reconciling product."""
    backup = {
        "app": "coop",
        "version": 1,
        "entities": {
            "products": [
                {"id": 1, "sku": "SKU-1", "name": "Widget", "unit_price": 10.0,
                 "current_stock": 999},  # wrong on purpose
            ],
            "stock_movements": [
                {"product_id": 1, "change": 7, "reason": "initial"},
                {"product_id": 1, "change": -2, "reason": "sale"},
            ],
        },
    }
    resp = await api.client.post("/backups/restore", json=backup)
    assert resp.status_code == 200, resp.text

    products = (await api.client.get("/products")).json()["items"]
    assert products[0]["current_stock"] == 5, "7 - 2, not the 999 in the file"
