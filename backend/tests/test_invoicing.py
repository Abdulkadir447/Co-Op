"""Invoicing — one saved invoice per order, numbered per business.

Covers the invariants the module claims: sequential per-business numbering,
one invoice per order, tenant isolation, the draft -> sent -> void lifecycle
(with void terminal), the list envelope + filters, and CSV export of exactly
the rows the list shows. Amounts are never duplicated — they come from the
order, so the tests assert against the order total.
"""
from __future__ import annotations


async def _seed_order(api, *, name="Grace", email="grace@example.com", sku="GAD-1"):
    p = (await api.client.post("/products", json={
        "sku": sku, "name": "Gadget", "unit_price": 10.0, "current_stock": 10,
    })).json()
    c = (await api.client.post("/customers", json={
        "full_name": name, "email": email,
    })).json()
    o = (await api.client.post("/orders", json={
        "customer_id": c["id"],
        "items": [{"product_id": p["id"], "quantity": 2, "unit_price": 10.0}],
    })).json()
    return {"product": p, "customer": c, "order": o}


async def _make_invoice(api, order_id, **extra):
    r = await api.client.post("/invoices", json={"order_id": order_id, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def test_create_invoice_numbers_and_prices_from_the_order(api):
    seed = await _seed_order(api)
    body = await _make_invoice(api, seed["order"]["id"])

    assert body["number"] == "INV-0001"
    assert body["status"] == "draft"
    assert body["total"] == 20.0, body
    assert body["customer"]["full_name"] == "Grace"
    assert body["order"]["id"] == seed["order"]["id"]
    assert body["issue_date"] is not None


async def test_numbers_are_sequential_per_business(api):
    first = await _seed_order(api, email="a@example.com", sku="A-1")
    second = await _seed_order(api, name="Sam", email="b@example.com", sku="B-1")

    a = await _make_invoice(api, first["order"]["id"])
    b = await _make_invoice(api, second["order"]["id"])
    assert (a["number"], b["number"]) == ("INV-0001", "INV-0002")


async def test_an_order_can_only_be_invoiced_once(api):
    seed = await _seed_order(api)
    await _make_invoice(api, seed["order"]["id"])
    again = await api.client.post("/invoices", json={"order_id": seed["order"]["id"]})
    assert again.status_code == 409, again.text
    assert again.json()["detail"]["error"] == "already_invoiced"


async def test_invoicing_an_unknown_order_is_404(api):
    await _seed_order(api)
    r = await api.client.post("/invoices", json={"order_id": 999999})
    assert r.status_code == 404, r.text
    assert r.json()["detail"]["error"] == "order_not_found"


async def test_a_due_date_before_the_issue_date_is_refused(api):
    seed = await _seed_order(api)
    r = await api.client.post("/invoices", json={
        "order_id": seed["order"]["id"], "issue_date": "2026-05-10", "due_date": "2026-05-01",
    })
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["error"] == "invalid_dates"


async def test_invoices_are_tenant_scoped(api):
    seed = await _seed_order(api)
    body = await _make_invoice(api, seed["order"]["id"])

    api.set_user("user-b")
    other = await api.client.get("/invoices")
    assert other.json()["total"] == 0, other.text
    stolen = await api.client.get(f"/invoices/{body['id']}")
    assert stolen.status_code == 404, stolen.text
    patched = await api.client.patch(f"/invoices/{body['id']}", json={"status": "void"})
    assert patched.status_code == 404, patched.text


async def test_list_envelope_search_and_status_filter(api):
    a = await _seed_order(api, name="Grace", email="grace@example.com", sku="A-1")
    b = await _seed_order(api, name="Sam", email="sam@example.com", sku="B-1")
    inv_a = await _make_invoice(api, a["order"]["id"])
    await _make_invoice(api, b["order"]["id"])

    listing = (await api.client.get("/invoices")).json()
    assert listing["total"] == 2 and listing["page"] == 1 and listing["limit"] == 10
    assert [i["number"] for i in listing["items"]] == ["INV-0002", "INV-0001"], "newest first"

    found = (await api.client.get("/invoices", params={"search": "grace"})).json()
    assert found["total"] == 1 and found["items"][0]["id"] == inv_a["id"]

    by_number = (await api.client.get("/invoices", params={"search": "INV-0002"})).json()
    assert by_number["total"] == 1

    await api.client.patch(f"/invoices/{inv_a['id']}", json={"status": "sent"})
    sent = (await api.client.get("/invoices", params={"status": "sent"})).json()
    assert sent["total"] == 1 and sent["items"][0]["number"] == "INV-0001"
    assert (await api.client.get("/invoices", params={"status": "void"})).json()["total"] == 0


async def test_an_unknown_status_filter_is_a_clear_422(api):
    await _seed_order(api)
    r = await api.client.get("/invoices", params={"status": "paid"})
    assert r.status_code == 422, r.text


async def test_lifecycle_draft_to_sent_to_void_and_void_is_terminal(api):
    seed = await _seed_order(api)
    body = await _make_invoice(api, seed["order"]["id"])
    assert body["status"] == "draft"

    sent = await api.client.patch(f"/invoices/{body['id']}", json={"status": "sent"})
    assert sent.status_code == 200 and sent.json()["status"] == "sent", sent.text

    voided = await api.client.patch(f"/invoices/{body['id']}", json={"status": "void"})
    assert voided.status_code == 200 and voided.json()["status"] == "void", voided.text

    after = await api.client.patch(f"/invoices/{body['id']}", json={"notes": "too late"})
    assert after.status_code == 422, after.text
    assert after.json()["detail"]["error"] == "voided"


async def test_notes_and_dates_round_trip(api):
    seed = await _seed_order(api)
    body = await _make_invoice(api, seed["order"]["id"])
    r = await api.client.patch(f"/invoices/{body['id']}", json={
        "notes": "Pay within 14 days", "issue_date": "2026-05-01", "due_date": "2026-05-15",
    })
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["notes"] == "Pay within 14 days"
    assert updated["issue_date"].startswith("2026-05-01")
    assert updated["due_date"].startswith("2026-05-15")


async def test_csv_export_is_exactly_the_filtered_rows(api):
    a = await _seed_order(api, name="Grace", email="grace@example.com", sku="A-1")
    b = await _seed_order(api, name="Sam", email="sam@example.com", sku="B-1")
    await _make_invoice(api, a["order"]["id"])
    await _make_invoice(api, b["order"]["id"])

    r = await api.client.get("/invoices/export", params={"search": "grace"})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    text = r.text
    assert "Invoice number" in text
    assert "INV-0001" in text and "INV-0002" not in text

    bad = await api.client.get("/invoices/export", params={"format": "xlsx"})
    assert bad.status_code == 422, bad.text


async def test_invoice_writes_are_audited(api):
    seed = await _seed_order(api)
    body = await _make_invoice(api, seed["order"]["id"])
    await api.client.patch(f"/invoices/{body['id']}", json={"status": "sent"})

    rows = (await api.client.get("/audit")).json()
    entries = rows["entries"] if isinstance(rows, dict) else rows
    actions = [(e["table_name"], e["action"]) for e in entries]
    assert ("invoices", "create") in actions, actions[:5]
    assert ("invoices", "update") in actions, actions[:5]


async def test_an_accountant_may_raise_an_invoice(api):
    # Seed as the owner, so the order lives in the business the team joins.
    api.set_user("owner-a", email="owner@example.com")
    seed = await _seed_order(api)
    invite = (await api.client.post(
        "/team/invites", json={"email": "books@example.com", "role": "accountant"}
    )).json()

    api.set_user("accountant-a", email="books@example.com")
    assert (await api.client.post(
        "/team/invites/accept", json={"token": invite["token"]}
    )).status_code == 200

    r = await api.client.post("/invoices", json={"order_id": seed["order"]["id"]})
    assert r.status_code == 201, r.text
    # A viewer may read the list but not raise paperwork.
    api.set_user("owner-a", email="owner@example.com")
    invite2 = (await api.client.post(
        "/team/invites", json={"email": "look@example.com", "role": "viewer"}
    )).json()
    api.set_user("viewer-a", email="look@example.com")
    await api.client.post("/team/invites/accept", json={"token": invite2["token"]})
    assert (await api.client.get("/invoices")).status_code == 200
    denied = await api.client.post("/invoices", json={"order_id": seed["order"]["id"]})
    assert denied.status_code == 403, denied.text
