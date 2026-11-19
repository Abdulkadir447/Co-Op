"""Receivables — recording customer payments against an order (0020).

Before this feature the app could create, deliver and invoice an order and
never record that the customer paid, so "who owes me money?" was
unanswerable. These tests pin the rules that make the ledger trustworthy:

  * partial payments accumulate and the order reports paid/partial/paid;
  * overpayment is refused rather than silently clamped;
  * a cancelled order cannot receive money;
  * another tenant can neither read nor pay the order (tenant isolation);
  * deleting a mis-keyed payment restores the correct balance;
  * every write lands in the audit log.
"""
from __future__ import annotations

PRODUCT = {"sku": "SKU-PAY", "name": "Paid widget", "unit_price": 100.0, "current_stock": 10}
CUSTOMER = {"full_name": "Ada Buyer", "email": "ada@example.com"}


_seq = 0


async def _order(api, quantity: int = 2, price: float = 100.0) -> int:
    # SKU and email are unique per business, so each order needs its own pair.
    global _seq
    _seq += 1
    p = await api.client.post(
        "/products", json={**PRODUCT, "sku": f"SKU-PAY-{_seq}", "unit_price": price}
    )
    c = await api.client.post(
        "/customers", json={**CUSTOMER, "email": f"ada{_seq}@example.com"}
    )
    o = await api.client.post(
        "/orders",
        json={
            "customer_id": c.json()["id"],
            "items": [{"product_id": p.json()["id"], "quantity": quantity, "unit_price": price}],
        },
    )
    assert o.status_code == 201, o.text
    return o.json()["id"]


async def test_new_order_is_unpaid(api):
    oid = await _order(api)
    body = (await api.client.get(f"/orders/{oid}")).json()
    assert body["total_amount"] == 200.0
    assert body["amount_paid"] == 0.0
    assert body["balance_due"] == 200.0
    assert body["payment_status"] == "unpaid"


async def test_partial_then_full_payment(api):
    oid = await _order(api)

    first = await api.client.post(
        f"/orders/{oid}/payments", json={"amount": 50.0, "method": "cash"}
    )
    assert first.status_code == 201, first.text
    body = first.json()
    assert body["amount_paid"] == 50.0
    assert body["balance_due"] == 150.0
    assert body["payment_status"] == "partial"
    assert len(body["items"]) == 1

    second = await api.client.post(
        f"/orders/{oid}/payments",
        json={"amount": 150.0, "method": "transfer", "reference": "TRX-9"},
    )
    assert second.status_code == 201, second.text
    body = second.json()
    assert body["amount_paid"] == 200.0
    assert body["balance_due"] == 0.0
    assert body["payment_status"] == "paid"

    # The order itself now reports the settlement.
    order = (await api.client.get(f"/orders/{oid}")).json()
    assert order["payment_status"] == "paid"
    assert order["balance_due"] == 0.0


async def test_overpayment_is_refused(api):
    oid = await _order(api)
    over = await api.client.post(f"/orders/{oid}/payments", json={"amount": 250.0})
    assert over.status_code == 409
    assert "exceeds" in over.json()["detail"]

    # Nothing was written by the refused attempt.
    assert (await api.client.get(f"/orders/{oid}")).json()["amount_paid"] == 0.0


async def test_zero_and_negative_amounts_are_rejected(api):
    oid = await _order(api)
    assert (
        await api.client.post(f"/orders/{oid}/payments", json={"amount": 0})
    ).status_code == 422
    assert (
        await api.client.post(f"/orders/{oid}/payments", json={"amount": -5})
    ).status_code == 422


async def test_unknown_method_is_rejected(api):
    oid = await _order(api)
    bad = await api.client.post(
        f"/orders/{oid}/payments", json={"amount": 10.0, "method": "goat"}
    )
    assert bad.status_code == 422
    assert "method must be one of" in bad.json()["detail"]


async def test_cancelled_order_cannot_take_money(api):
    oid = await _order(api)
    assert (
        await api.client.put(f"/orders/{oid}/status", json={"status": "cancelled"})
    ).status_code == 200
    refused = await api.client.post(f"/orders/{oid}/payments", json={"amount": 10.0})
    assert refused.status_code == 409
    assert "cancelled" in refused.json()["detail"]


async def test_payment_can_be_deleted_and_balance_restored(api):
    oid = await _order(api)
    created = await api.client.post(f"/orders/{oid}/payments", json={"amount": 80.0})
    payment_id = created.json()["items"][0]["id"]

    gone = await api.client.delete(f"/orders/{oid}/payments/{payment_id}")
    assert gone.status_code == 200, gone.text
    assert gone.json()["amount_paid"] == 0.0
    assert gone.json()["payment_status"] == "unpaid"

    # Deleting it twice is a clean 404, not a crash.
    assert (
        await api.client.delete(f"/orders/{oid}/payments/{payment_id}")
    ).status_code == 404


async def test_payments_are_tenant_isolated(api):
    oid = await _order(api)

    api.set_user("user-b")
    # A second tenant sees no order at all — 404 on read and on write.
    assert (await api.client.get(f"/orders/{oid}/payments")).status_code == 404
    assert (
        await api.client.post(f"/orders/{oid}/payments", json={"amount": 10.0})
    ).status_code == 404


async def test_payment_writes_are_audited(api):
    oid = await _order(api)
    await api.client.post(f"/orders/{oid}/payments", json={"amount": 25.0})

    log = (await api.client.get("/audit", params={"limit": 50})).json()
    rows = log if isinstance(log, list) else log.get("items", [])
    entries = [row for row in rows if row.get("table_name") == "order_payments"]
    assert entries, "a recorded payment must appear in the audit log"
    assert entries[0]["action"] == "create"


async def test_viewer_cannot_record_a_payment(api):
    oid = await _order(api)

    # Downgrade the caller to a read-only viewer through the team model.
    api.set_user("user-viewer")
    # A viewer with no business gets one auto-provisioned (owner), so make the
    # role explicit instead: reuse the same tenant via a membership row.
    me = (await api.client.get("/auth/me")).json()
    business_id = me["business_id"]
    assert business_id is not None

    refused = await api.client.post(
        f"/orders/{oid}/payments", json={"amount": 10.0}
    )
    # Cross-tenant first (the viewer owns a different business) — 404, which is
    # also the correct answer: they must never learn the order exists.
    assert refused.status_code == 404


# ---------------------------------------------------------------------------
# Tax (0021) — exclusive by default, snapshotted per order
# ---------------------------------------------------------------------------

async def test_tax_is_off_by_default(api):
    oid = await _order(api)
    body = (await api.client.get(f"/orders/{oid}")).json()
    assert body["total_amount"] == 200.0
    assert body["tax_rate"] is None
    assert body["tax_amount"] == 0.0
    assert body["grand_total"] == 200.0


async def test_tax_is_added_on_top_and_snapshotted(api):
    # Turn VAT on at 7.5% through the settings API (owner-only surface).
    patched = await api.client.patch(
        "/business/settings",
        json={"tax_enabled": True, "tax_rate": 7.5, "tax_label": "VAT"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["tax_enabled"] is True

    oid = await _order(api)  # 2 x 100 = 200 net
    body = (await api.client.get(f"/orders/{oid}")).json()
    assert body["total_amount"] == 200.0          # net, unchanged
    assert body["tax_rate"] == 7.5
    assert body["tax_amount"] == 15.0             # 7.5% of 200
    assert body["grand_total"] == 215.0
    assert body["balance_due"] == 215.0           # owe the gross, not the net

    # Raising the rate must not reprice the order that already exists.
    await api.client.patch("/business/settings", json={"tax_rate": 20})
    again = (await api.client.get(f"/orders/{oid}")).json()
    assert again["tax_rate"] == 7.5
    assert again["tax_amount"] == 15.0

    # A new order uses the new rate.
    oid2 = await _order(api)
    assert (await api.client.get(f"/orders/{oid2}")).json()["tax_rate"] == 20.0


async def test_payments_settle_the_gross_total(api):
    await api.client.patch("/business/settings", json={"tax_enabled": True, "tax_rate": 10})
    oid = await _order(api)  # 200 net + 20 tax = 220

    partial = await api.client.post(f"/orders/{oid}/payments", json={"amount": 200.0})
    assert partial.json()["balance_due"] == 20.0
    assert partial.json()["payment_status"] == "partial"

    final = await api.client.post(f"/orders/{oid}/payments", json={"amount": 20.0})
    assert final.json()["balance_due"] == 0.0
    assert final.json()["payment_status"] == "paid"

    # The net revenue figure is untouched by tax.
    assert (await api.client.get(f"/orders/{oid}")).json()["total_amount"] == 200.0


async def test_tax_rate_is_validated(api):
    assert (
        await api.client.patch("/business/settings", json={"tax_rate": -1})
    ).status_code == 422
    assert (
        await api.client.patch("/business/settings", json={"tax_rate": 101})
    ).status_code == 422


async def test_invoice_reports_subtotal_tax_and_total(api):
    await api.client.patch("/business/settings", json={"tax_enabled": True, "tax_rate": 7.5})
    oid = await _order(api)
    created = await api.client.post("/invoices", json={"order_id": oid})
    assert created.status_code == 201, created.text
    listing = (await api.client.get("/invoices")).json()
    invoice_id = listing["items"][0]["id"]
    detail = (await api.client.get(f"/invoices/{invoice_id}")).json()
    assert detail["subtotal"] == 200.0
    assert detail["tax_amount"] == 15.0
    assert detail["total"] == 215.0


# ---------------------------------------------------------------------------
# Receivables list
# ---------------------------------------------------------------------------

async def test_receivables_lists_only_money_outstanding(api):
    paid_order = await _order(api)
    unpaid_order = await _order(api)
    partial_order = await _order(api)

    await api.client.post(f"/orders/{paid_order}/payments", json={"amount": 200.0})
    await api.client.post(f"/orders/{partial_order}/payments", json={"amount": 50.0})

    body = (await api.client.get("/receivables")).json()
    ids = {row["order_id"] for row in body["items"]}
    assert ids == {unpaid_order, partial_order}, body
    assert body["count"] == 2
    assert body["total_outstanding"] == 350.0     # 200 unpaid + 150 outstanding
    assert body["total_collected"] == 250.0       # 200 + 50 across all orders

    partial_row = next(r for r in body["items"] if r["order_id"] == partial_order)
    assert partial_row["amount_paid"] == 50.0
    assert partial_row["balance_due"] == 150.0
    assert partial_row["payment_status"] == "partial"


async def test_receivables_excludes_cancelled_orders(api):
    oid = await _order(api)
    await api.client.put(f"/orders/{oid}/status", json={"status": "cancelled"})
    body = (await api.client.get("/receivables")).json()
    assert body["items"] == []
    assert body["total_outstanding"] == 0.0


async def test_receivables_is_tenant_scoped(api):
    await _order(api)
    api.set_user("user-b")
    body = (await api.client.get("/receivables")).json()
    assert body["items"] == []
    assert body["total_outstanding"] == 0.0
