"""D1 — the location dimension and the machine identity.

These tests pin the four decisions that are expensive to change later:

  * every tenant has a ``MAIN`` branch, so no code has a single-shop special
    case;
  * a branch id from another tenant is a 404, never a silent fallback (a
    fallback files Shop 4's sale under Shop 1);
  * a sale's documents and money follow the *sale's* branch, not the caller's
    — head office taking a payment still books it to the shop that sold;
  * an offline write is attributed to (staff member, device), and a device can
    only post for the branch it was enrolled at.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from backend.models import AuditLog, Device, Invoice, Order, OrderItem, OrderPayment, StockMovement


async def _owner(api, user_id="user-d1", email="d1@example.com"):
    api.set_user(user_id, email=email)
    me = (await api.client.get("/auth/me")).json()
    return me["business_id"]


async def _make_branch(api, code, name=None):
    r = await api.client.post("/branches", json={"code": code, "name": name or code})
    assert r.status_code == 201, r.text
    return r.json()


async def _order_in(api, branch_id, sku="D1-1", price=100.0, qty=2):
    headers = {"X-Branch-Id": str(branch_id)}
    p = await api.client.post(
        "/products",
        json={"sku": sku, "name": sku, "unit_price": price, "current_stock": 50},
    )
    assert p.status_code == 201, p.text
    c = await api.client.post(
        "/customers", json={"full_name": "Buyer", "email": f"{sku}@example.com"}
    )
    assert c.status_code == 201, c.text
    o = await api.client.post(
        "/orders",
        headers=headers,
        json={
            "customer_id": c.json()["id"],
            "items": [
                {"product_id": p.json()["id"], "quantity": qty, "unit_price": price}
            ],
        },
    )
    assert o.status_code == 201, o.text
    return o.json()["id"], p.json()["id"]


# ---------------------------------------------------------------------------
# Branches
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_new_business_gets_a_main_branch(api):
    await _owner(api)
    rows = (await api.client.get("/branches")).json()
    assert [r["code"] for r in rows] == ["MAIN"]
    assert rows[0]["is_default"] is True


@pytest.mark.asyncio
async def test_a_second_branch_can_be_added_and_the_main_one_stays_default(api):
    await _owner(api)
    lek = await _make_branch(api, "lek", "Lekki")
    assert lek["code"] == "LEK"  # said out loud, so stored uppercase

    rows = (await api.client.get("/branches")).json()
    assert [r["code"] for r in rows] == ["MAIN", "LEK"]
    assert [r["is_default"] for r in rows] == [True, False]


@pytest.mark.asyncio
async def test_duplicate_branch_code_is_a_conflict(api):
    await _owner(api)
    await _make_branch(api, "LEK")
    again = await api.client.post("/branches", json={"code": "lek", "name": "Lekki 2"})
    assert again.status_code == 409, again.text


@pytest.mark.asyncio
async def test_a_non_owner_cannot_create_a_branch(api, session_factory):
    await _owner(api)
    invite = await api.client.post(
        "/team/invites", json={"email": "staff@example.com", "role": "sales"}
    )
    assert invite.status_code == 201, invite.text

    api.set_user("user-staff", email="staff@example.com")
    await api.client.post("/team/invites/accept", json={"token": invite.json()["token"]})

    r = await api.client.post("/branches", json={"code": "ABJ", "name": "Abuja"})
    assert r.status_code == 403, r.text
    # …but a staff member can see the branches they work across.
    assert (await api.client.get("/branches")).status_code == 200


@pytest.mark.asyncio
async def test_another_tenants_branch_id_is_a_404_not_a_fallback(api):
    b1 = await _owner(api, "user-one", "one@example.com")
    assert b1
    other = await _make_branch(api, "OTHER")

    # A second tenant with its own MAIN branch.
    await _owner(api, "user-two", "two@example.com")
    mine = (await api.client.get("/branches")).json()[0]
    assert mine["id"] != other["id"]

    r = await api.client.get("/branches", headers={"X-Branch-Id": str(other["id"])})
    assert r.status_code == 404, r.text

    bad = await api.client.get("/branches", headers={"X-Branch-Id": "not-an-int"})
    assert bad.status_code == 400, bad.text


# ---------------------------------------------------------------------------
# The dimension on the row
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_sale_is_stamped_with_the_branch_it_was_rung_up_in(api, session_factory):
    await _owner(api)
    lek = await _make_branch(api, "LEK")
    order_id, product_id = await _order_in(api, lek["id"], sku="LEK-1")

    async with session_factory() as db:
        order = (await db.execute(select(Order).where(Order.id == order_id))).scalars().one()
        item = (
            await db.execute(select(OrderItem).where(OrderItem.order_id == order_id))
        ).scalars().one()
        movement = (
            await db.execute(select(StockMovement).where(StockMovement.order_id == order_id))
        ).scalars().one()
        assert order.branch_id == lek["id"]
        assert item.branch_id == lek["id"]
        assert movement.branch_id == lek["id"]
        assert movement.product_id == product_id


@pytest.mark.asyncio
async def test_documents_and_money_follow_the_sale_not_the_caller(api, session_factory):
    """Head office takes the payment; the shop that sold keeps the books."""
    await _owner(api)
    lek = await _make_branch(api, "LEK")
    order_id, _ = await _order_in(api, lek["id"], sku="LEK-2")

    # The invoice is raised from head office (MAIN, the default branch)…
    inv = await api.client.post("/invoices", json={"order_id": order_id})
    assert inv.status_code == 201, inv.text

    # …and the customer pays at head office, too.
    pay = await api.client.post(
        f"/orders/{order_id}/payments", json={"amount": 50.0, "method": "cash"}
    )
    assert pay.status_code == 201, pay.text

    async with session_factory() as db:
        invoice = (
            await db.execute(select(Invoice).where(Invoice.order_id == order_id))
        ).scalars().one()
        payment = (
            await db.execute(select(OrderPayment).where(OrderPayment.order_id == order_id))
        ).scalars().one()
        assert invoice.branch_id == lek["id"]
        assert payment.branch_id == lek["id"]


# ---------------------------------------------------------------------------
# Devices and offline attribution
# ---------------------------------------------------------------------------


async def _enrol(api, key="dev-aaaaaaaa-1111", name="Till 1", branch_id=None):
    body = {"device_key": key, "name": name}
    if branch_id is not None:
        body["branch_id"] = branch_id
    r = await api.client.post("/devices", json=body)
    return r


@pytest.mark.asyncio
async def test_a_device_enrols_at_the_callers_branch(api):
    await _owner(api)
    main = (await api.client.get("/branches")).json()[0]

    r = await _enrol(api)
    assert r.status_code == 201, r.text
    assert r.json()["branch_id"] == main["id"]
    assert r.json()["has_public_key"] is False

    listed = (await api.client.get("/devices")).json()
    assert [d["device_key"] for d in listed] == ["dev-aaaaaaaa-1111"]


@pytest.mark.asyncio
async def test_the_same_device_key_cannot_enrol_twice(api):
    await _owner(api)
    assert (await _enrol(api)).status_code == 201
    assert (await _enrol(api)).status_code == 409


@pytest.mark.asyncio
async def test_enrolling_at_a_foreign_branch_is_a_404(api):
    await _owner(api, "user-one", "one@example.com")
    other = await _make_branch(api, "OTHER")

    await _owner(api, "user-two", "two@example.com")
    r = await _enrol(api, branch_id=other["id"])
    assert r.status_code == 404, r.text


@pytest.mark.asyncio
async def test_a_revoked_device_cannot_push(api):
    await _owner(api)
    device = (await _enrol(api)).json()

    revoke = await api.client.post(f"/devices/{device['id']}/revoke")
    assert revoke.status_code == 200, revoke.text
    assert revoke.json()["revoked_at"] is not None

    push = await api.client.post(
        "/sync/push",
        headers={"X-Device-Id": device["device_key"]},
        json={"operations": []},
    )
    assert push.status_code == 403, push.text


@pytest.mark.asyncio
async def test_an_unknown_device_cannot_push(api):
    await _owner(api)
    push = await api.client.post(
        "/sync/push",
        headers={"X-Device-Id": "never-enrolled"},
        json={"operations": []},
    )
    assert push.status_code == 404, push.text


@pytest.mark.asyncio
async def test_a_device_cannot_push_for_another_branch(api):
    await _owner(api)
    lek = await _make_branch(api, "LEK")
    device = (await _enrol(api)).json()  # enrolled at MAIN

    push = await api.client.post(
        "/sync/push",
        headers={"X-Device-Id": device["device_key"], "X-Branch-Id": str(lek["id"])},
        json={"operations": []},
    )
    assert push.status_code == 409, push.text


@pytest.mark.asyncio
async def test_an_offline_sale_is_attributed_to_the_device_and_the_person(api, session_factory):
    """Not "offline-sync": the audit row names the machine and the staff member."""
    await _owner(api)
    lek = await _make_branch(api, "LEK")
    device = (await _enrol(api, branch_id=lek["id"])).json()

    r = await api.client.post(
        "/sync/push",
        headers={"X-Device-Id": device["device_key"], "X-Branch-Id": str(lek["id"])},
        json={
            "operations": [
                {
                    "entity": "customer",
                    "client_id": "CUST-D1-1",
                    "operation": "create",
                    "payload": {
                        "full_name": "Offline Buyer",
                        "email": "offline@example.com",
                        "phone": None,
                        "company": None,
                        "address": None,
                    },
                }
            ]
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["applied"] == 1

    async with session_factory() as db:
        row = (
            await db.execute(
                select(AuditLog)
                .where(AuditLog.table_name == "customer")
                .order_by(AuditLog.id.desc())
            )
        ).scalars().first()
        assert row is not None
        assert row.device_id == device["id"]
        assert row.actor == "user-d1"

        dev = (await db.execute(select(Device).where(Device.id == device["id"]))).scalars().one()
        assert dev.last_seen_at is not None
