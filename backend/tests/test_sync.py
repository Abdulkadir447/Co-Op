"""Offline sync push — idempotency, reference resolution, operation-based
stock. The server must apply a retried offline batch exactly once (ADR-002).
"""
from __future__ import annotations

from backend import sync
from backend.models import Customer, Order, Product, StockMovement
from sqlalchemy import func, select


def _cust(cid, name="Grace", email="g@x.com"):
    return {"entity": "customer", "client_id": cid, "operation": "create",
            "payload": {
                "full_name": name,
                "email": email,
                "phone": None,
                "company": None,
                "address": None,
            }}


def _prod(cid, name="Chair", sku="C1", price=100.0, stock=10):
    """Product CREATE op. The server ignores current_stock in a create payload
    (ADR-002 rule 5 — stock syncs as operations); use _prod_initial to pair
    the create with its 'initial' movement, as the real client does."""
    return {"entity": "product", "client_id": cid, "operation": "create",
            "payload": {"name": name, "sku": sku, "unit_price": price, "cost_price": None,
                        "current_stock": stock,
                        "reorder_level": 5,
                        "category": None,
                        "description": None,
                    }}


def _prod_initial(cid, stock, cid_suffix="-INIT"):
    """The 'initial' stock movement that pairs a product create (client
    protocol: stock is established by operations, never by the create value)."""
    if not stock:
        return []
    return [_move(cid + cid_suffix, cid, change=stock, reason="initial")]


def _move(cid, prod_cid, change, reason="correction"):
    return {"entity": "stock_movement", "client_id": cid, "operation": "create",
            "payload": {"product_client_id": prod_cid, "change": change, "reason": reason,
                        "note": None, "order_client_id": None, "applied_at": "2026-08-28T00:00:00"}}


async def _count(db, model, business_id=None):
    q = select(func.count()).select_from(model)
    if business_id is not None:
        q = q.where(model.business_id == business_id)
    return (await db.execute(q)).scalar()


async def test_create_is_idempotent_on_client_id(session_factory):
    async with session_factory() as db:
        biz_id = 999  # any tenant id; apply_push scopes by it
        ops = [_cust("CUST1"), _prod("PROD1")]
        r1 = await sync.apply_push(db, biz_id, ops)
        r2 = await sync.apply_push(db, biz_id, ops)  # retry the same batch
        assert r1["applied"] == 2
        assert r2["applied"] == 0, "a retried create must be a no-op"
        assert r2["skipped"] == 2
        # Same client_id maps to the same server id both times.
        assert r1["ids"]["CUST1"] == r2["ids"]["CUST1"]
        # Exactly one row each, not two.
        assert await _count(db, Customer, biz_id) == 1
        assert await _count(db, Product, biz_id) == 1
        await db.commit()


async def test_update_and_delete_apply(session_factory):
    async with session_factory() as db:
        biz_id = 998
        await sync.apply_push(db, biz_id, [_cust("CUST1", name="Grace")])
        upd = await sync.apply_push(db, biz_id, [
            {"entity": "customer", "client_id": "CUST1", "operation": "update",
             "payload": {
                 "full_name": "Grace H",
                 "email": None,
                 "phone": "555",
                 "company": None,
                 "address": None,
             }},
        ])
        assert upd["applied"] == 1
        row = (
            (await db.execute(select(Customer).where(Customer.business_id == biz_id)))
            .scalars()
            .first()
        )
        assert row.full_name == "Grace H"
        assert row.phone == "555"

        dele = await sync.apply_push(db, biz_id, [
            {"entity": "customer", "client_id": "CUST1", "operation": "delete", "payload": {}},
        ])
        assert dele["applied"] == 1
        row = (
            (await db.execute(select(Customer).where(Customer.business_id == biz_id)))
            .scalars()
            .first()
        )
        assert row.deleted_at is not None, "delete soft-deletes"
        await db.commit()


async def test_stock_movement_applies_change_exactly_once(session_factory):
    async with session_factory() as db:
        biz_id = 997
        await sync.apply_push(db, biz_id, [_prod("PROD1", stock=10), *_prod_initial("PROD1", 10)])
        # A -3 movement, pushed twice (retry) must apply only once.
        await sync.apply_push(db, biz_id, [_move("MOVE1", "PROD1", change=-3)])
        await sync.apply_push(db, biz_id, [_move("MOVE1", "PROD1", change=-3)])
        p = (
            (await db.execute(select(Product).where(Product.business_id == biz_id)))
            .scalars()
            .first()
        )
        assert p.current_stock == 7, "the -3 movement must apply exactly once (10 -> 7)"
        moves = (await db.execute(
            select(StockMovement).where(StockMovement.business_id == biz_id))).scalars().all()
        assert len(moves) == 2, "exactly the initial + the -3 movement, the retry adds nothing"
        await db.commit()


async def test_stock_cannot_go_negative(session_factory):
    """A movement that would drive cloud stock negative is an explicit
    CONFLICT (insufficient_stock) with the server's current stock attached —
    not a generic failure — and nothing is applied."""
    async with session_factory() as db:
        biz_id = 996
        await sync.apply_push(db, biz_id, [_prod("PROD1", stock=2), *_prod_initial("PROD1", 2)])
        r = await sync.apply_push(db, biz_id, [_move("MOVE1", "PROD1", change=-5)])
        assert r["applied"] == 0
        assert len(r["conflicts"]) == 1
        c = r["conflicts"][0]
        assert c["reason"] == "insufficient_stock"
        assert c["entity"] == "stock_movement"
        assert c["client_id"] == "MOVE1"
        assert c["local"] == {"change": -5, "reason": "correction"}
        assert c["server"]["current_stock"] == 2
        p = (
            (await db.execute(select(Product).where(Product.business_id == biz_id)))
            .scalars()
            .first()
        )
        assert p.current_stock == 2, "stock unchanged when the movement is refused"
        # Retrying the same op conflicts again (no partial, no duplicate).
        r2 = await sync.apply_push(db, biz_id, [_move("MOVE1", "PROD1", change=-5)])
        assert r2["conflicts"] and r2["conflicts"][0]["reason"] == "insufficient_stock"
        await db.commit()


async def test_order_resolves_customer_by_client_id(session_factory):
    from backend.models import Order, OrderItem

    async with session_factory() as db:
        biz_id = 995
        r = await sync.apply_push(db, biz_id, [
            _cust("CUST1"),
            _prod("PROD1"),
            {"entity": "order", "client_id": "ORD1", "operation": "create",
             "payload": {"customer_client_id": "CUST1", "status": "pending", "total_amount": 300.0,
                         "order_date": "2026-08-28T12:00:00"}},
            {"entity": "order_item", "client_id": "ORDIT1", "operation": "create",
             "payload": {"order_client_id": "ORD1", "product_client_id": "PROD1",
                         "quantity": 3, "unit_price": 100.0, "total_price": 300.0}},
        ])
        assert r["applied"] == 4, f"expected 4 applied, errors={r['errors']}"
        order = (
            (await db.execute(select(Order).where(Order.business_id == biz_id)))
            .scalars()
            .first()
        )
        assert order.client_id == "ORD1"
        item = (
            (await db.execute(select(OrderItem).where(OrderItem.business_id == biz_id)))
            .scalars()
            .first()
        )
        assert item.order_id == order.id
        assert item.product_id == (await db.execute(
            select(Product).where(Product.business_id == biz_id))).scalars().first().id
        await db.commit()


async def test_sync_push_endpoint_is_idempotent_over_http(api):
    """Full route integration: POST /sync/push applies a batch idempotently,
    including the Pydantic request model + auth + tenant scoping."""
    batch = {
        "operations": [
            {"entity": "customer", "client_id": "HTTPCUST1", "operation": "create",
             "payload": {"full_name": "Http Grace", "email": "h@x.com"}},
            {"entity": "product", "client_id": "HTTPPROD1", "operation": "create",
             "payload": {
                 "name": "Http Chair",
                 "sku": "HC1",
                 "unit_price": 50.0,
                 "current_stock": 5,
             }},
        ]
    }
    r1 = await api.client.post("/sync/push", json=batch)
    assert r1.status_code == 200, r1.text
    assert r1.json()["applied"] == 2
    # Retry the identical batch over HTTP: a no-op.
    r2 = await api.client.post("/sync/push", json=batch)
    assert r2.status_code == 200
    assert r2.json()["applied"] == 0
    assert r2.json()["skipped"] == 2
    # Same client_id -> same server id across both calls.
    assert r1.json()["ids"]["HTTPCUST1"] == r2.json()["ids"]["HTTPCUST1"]


async def test_sync_push_rejects_bad_operation(api):
    r = await api.client.post("/sync/push", json={
        "operations": [
            {"entity": "customer", "client_id": "C1", "operation": "create", "payload": {}},
            {"entity": "customer", "client_id": "C2", "operation": "nonsense", "payload": {}},
        ]
    })
    assert r.status_code == 200
    body = r.json()
    assert body["applied"] == 1
    # A nonsense op on a client_id with no server row is a not_found CONFLICT
    # (it can never apply), reported structurally alongside the applied op.
    assert body["conflicts"] and body["conflicts"][0]["reason"] == "not_found"
    assert body["failed"] == []


async def test_unknown_reference_is_reported_not_fatal(session_factory):
    """A reference the server can't resolve is a not_found CONFLICT (structured,
    non-fatal) — not an error, and not something a retry can fix."""
    async with session_factory() as db:
        biz_id = 994
        r = await sync.apply_push(db, biz_id, [
            {"entity": "order", "client_id": "ORD1", "operation": "create",
             "payload": {"customer_client_id": "DOES_NOT_EXIST", "status": "pending",
                         "total_amount": 1.0, "order_date": None}},
        ])
        assert r["applied"] == 0
        assert r["failed"] == []
        assert len(r["conflicts"]) == 1
        c = r["conflicts"][0]
        assert c["reason"] == "not_found"
        assert "customer" in c["error"] and "DOES_NOT_EXIST" in c["error"]
        assert c["local"]["customer_client_id"] == "DOES_NOT_EXIST"
        assert c["local"]["customer_server_id"] is None
        await db.commit()


async def test_sync_pull_returns_full_mirror(api):
    """GET /sync/pull returns the full mirror (business + all entities), each
    record carrying id + client_id (null for live-created rows) + a cursor."""
    p = (await api.client.post("/products", json={
        "sku": "P-1", "name": "Chair", "unit_price": 100.0, "current_stock": 10,
    })).json()
    c = (await api.client.post("/customers", json={
        "full_name": "Grace", "email": "g@x.com",
    })).json()
    o = (await api.client.post("/orders", json={
        "customer_id": c["id"],
        "items": [{"product_id": p["id"], "quantity": 2, "unit_price": 100.0}],
    })).json()

    r = await api.client.get("/sync/pull")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cursor"]
    assert body["business"]["id"] is not None
    assert body["counts"]["products"] == 1
    assert body["counts"]["customers"] == 1
    assert body["counts"]["orders"] == 1
    assert body["counts"]["order_items"] == 1
    assert body["counts"]["stock_movements"] >= 1  # order creation deducts stock
    prod = body["products"][0]
    assert prod["id"] == p["id"]
    assert prod["client_id"] is None  # created live, not offline
    assert prod["sku"] == "P-1"
    order = body["orders"][0]
    assert order["id"] == o["id"]
    assert order["customer_id"] == c["id"]
    assert order["status"] == "pending"


async def test_sync_pull_delta_filters_by_since(api):
    """GET /sync/pull?since=... returns only records updated after the cursor.

    Uses far-past / far-future cursors so the test is deterministic (no
    wall-clock precision dependence)."""
    await api.client.post("/products", json={
        "sku": "P-1", "name": "Chair", "unit_price": 100.0, "current_stock": 10,
    })
    await api.client.post("/customers", json={
        "full_name": "Grace", "email": "g@x.com",
    })

    # Full pull (no since) returns everything.
    full = (await api.client.get("/sync/pull")).json()
    assert full["cursor"]
    assert full["counts"]["products"] == 1
    assert full["counts"]["customers"] == 1

    # Delta with a far-past cursor returns everything (all records are newer).
    past = (await api.client.get("/sync/pull", params={"since": "2000-01-01T00:00:00"})).json()
    assert past["counts"]["products"] == 1
    assert past["counts"]["customers"] == 1

    # Delta with a far-future cursor returns nothing (no records that new).
    future = (await api.client.get("/sync/pull", params={"since": "2999-01-01T00:00:00"})).json()
    assert future["counts"]["products"] == 0
    assert future["counts"]["customers"] == 0

# ---------------------------------------------------------------------------
# Order status changes over sync (offline status changes, v1 boundary)
# ---------------------------------------------------------------------------

def _order(cid, cust_cid, total=200.0):
    return {"entity": "order", "client_id": cid, "operation": "create",
            "payload": {"customer_client_id": cust_cid, "status": "pending",
                        "total_amount": total, "order_date": "2026-08-28T12:00:00"}}


async def test_order_status_update_applies_transition(session_factory):
    """An offline status change syncs as an order 'update' op: the transition
    is validated against the shared machine, and a retried batch is a no-op
    (no double apply, no double stock restore)."""
    from backend.models import Order

    async with session_factory() as db:
        biz_id = 997
        r = await sync.apply_push(db, biz_id, [
            _cust("CUST1"),
            _prod("PROD1", stock=10),
            *_prod_initial("PROD1", 10),
            _order("ORD1", "CUST1"),
            # Cancellation: the order update + its stock restore (operation, rule 5).
            {"entity": "order", "client_id": "ORD1", "operation": "update",
             "payload": {"status": "cancelled"}},
            _move("MOVE-CANCEL", "PROD1", change=2, reason="order_cancelled"),
        ])
        assert r["applied"] == 6, f"expected 6 applied, errors={r['errors']}"

        order = (
            (await db.execute(select(Order).where(Order.business_id == biz_id)))
            .scalars()
            .first()
        )
        assert order.status.value == "cancelled"

        prod = (
            (await db.execute(select(Product).where(Product.business_id == biz_id)))
            .scalars()
            .first()
        )
        assert prod.current_stock == 12  # 10 + restore of 2, applied once

        # Retry the ENTIRE batch (crash + reconnect): nothing re-applies.
        r2 = await sync.apply_push(db, biz_id, [
            _cust("CUST1"), _prod("PROD1", stock=10), _order("ORD1", "CUST1"),
            {"entity": "order", "client_id": "ORD1", "operation": "update",
             "payload": {"status": "cancelled"}},
            _move("MOVE-CANCEL", "PROD1", change=2, reason="order_cancelled"),
        ])
        assert r2["applied"] == 0, f"retried batch must be a no-op, got {r2}"
        assert r2["errors"] == []
        await db.refresh(prod)
        assert prod.current_stock == 12, "the restore must not apply twice"
        await db.commit()


async def test_order_update_invalid_transition_is_rejected(session_factory):
    """pending -> delivered is not a legal transition: the op is a structured
    CONFLICT (invalid_transition) with both the local and the server status
    attached, and the order is untouched. A stale update on an order the
    server doesn't know is a not_found conflict."""
    from backend.models import Order

    async with session_factory() as db:
        biz_id = 998
        r = await sync.apply_push(db, biz_id, [
            _cust("CUST1"),
            {"entity": "order", "client_id": "ORD1", "operation": "update",
             "payload": {"status": "delivered"}},
        ])
        # The update op conflicts (order has no row on the server yet).
        assert any(c["client_id"] == "ORD1" and c["reason"] == "not_found" for c in r["conflicts"])

        # Now create the order and try the same illegal jump: an
        # invalid_transition conflict, and the order stays 'pending'.
        r2 = await sync.apply_push(db, biz_id, [
            _order("ORD1", "CUST1"),
            {"entity": "order", "client_id": "ORD1", "operation": "update",
             "payload": {"status": "delivered"}},
        ])
        c = next(x for x in r2["conflicts"] if x["client_id"] == "ORD1")
        assert c["reason"] == "invalid_transition"
        assert c["local"] == {"status": "delivered"}
        assert c["server"]["status"] == "pending"
        order = (
            (await db.execute(select(Order).where(Order.business_id == biz_id)))
            .scalars()
            .first()
        )
        assert order.status.value == "pending"
        await db.commit()

# ---------------------------------------------------------------------------
# OFFLINE 4 — conflict handling: structured conflict outcomes
# ---------------------------------------------------------------------------


def _email_conflict_entry(r, client_id):
    return next(c for c in r["conflicts"] if c["client_id"] == client_id)


async def test_customer_email_conflict_on_create(session_factory):
    """Two different client_ids, the same email -> the second is a structured
    email_conflict with BOTH versions attached (local attempted + server
    current). The first customer is untouched."""
    async with session_factory() as db:
        biz_id = 901
        r = await sync.apply_push(db, biz_id, [
            _cust("CUST-A", email="dup@x.com"),
            _cust("CUST-B", email="dup@x.com"),
        ])
        assert r["applied"] == 1
        assert len(r["conflicts"]) == 1
        c = _email_conflict_entry(r, "CUST-B")
        assert c["reason"] == "email_conflict"
        assert c["entity"] == "customer"
        assert c["local"]["email"] == "dup@x.com"
        assert c["server"]["client_id"] == "CUST-A", "the conflicting cloud row is exposed"
        assert c["server"]["email"] == "dup@x.com"
        assert c["operation_id"] is None  # not supplied -> null, shape intact
        # Only CUST-A exists.
        rows = (
            (await db.execute(select(Customer).where(Customer.business_id == biz_id)))
            .scalars()
            .all()
        )
        assert [r.client_id for r in rows] == ["CUST-A"]
        await db.commit()


async def test_customer_email_conflict_on_update(session_factory):
    """An update that would take another customer's email conflicts instead of
    silently overwriting the cloud's unique email."""
    async with session_factory() as db:
        biz_id = 902
        await sync.apply_push(db, biz_id, [_cust("CUST-A", email="taken@x.com")])
        r = await sync.apply_push(db, biz_id, [
            _cust("CUST-B", email="free@x.com"),
            {"entity": "customer", "client_id": "CUST-B", "operation": "update",
             "payload": {"email": "taken@x.com"}},
        ])
        assert r["applied"] == 1  # the create applied
        c = _email_conflict_entry(r, "CUST-B")
        assert c["reason"] == "email_conflict"
        assert c["server"]["client_id"] == "CUST-A"
        b = (
            (await db.execute(select(Customer).where(Customer.client_id == "CUST-B")))
            .scalars()
            .first()
        )
        assert b.email == "free@x.com", "the losing email is never written"
        await db.commit()


async def test_customer_same_name_is_not_identity(session_factory):
    """UNSAFE rule: an exact NAME match is NOT a merge. Same name + different
    email creates a DISTINCT customer (no conflict, no auto-merge)."""
    async with session_factory() as db:
        biz_id = 903
        r = await sync.apply_push(db, biz_id, [
            _cust("CUST-A", name="Grace", email="grace@x.com"),
            _cust("CUST-B", name="Grace", email="grace2@x.com"),
        ])
        assert r["applied"] == 2, "same name, different email -> two customers"
        assert r["conflicts"] == []
        rows = (
            (await db.execute(select(Customer).where(Customer.business_id == biz_id)))
            .scalars()
            .all()
        )
        assert {r.client_id for r in rows} == {"CUST-A", "CUST-B"}
        await db.commit()


async def test_product_sku_conflict(session_factory):
    """Same SKU under a different client_id -> sku_conflict, structured, with
    the owning product exposed. Never silently replaces the server SKU."""
    async with session_factory() as db:
        biz_id = 904
        r = await sync.apply_push(db, biz_id, [
            _prod("PROD-A", sku="C1"),
            _prod("PROD-B", sku="C1"),
        ])
        assert r["applied"] == 1
        c = _email_conflict_entry(r, "PROD-B")
        assert c["reason"] == "sku_conflict"
        assert c["entity"] == "product"
        assert c["server"]["client_id"] == "PROD-A"
        assert c["local"]["sku"] == "C1"
        # Update path: an existing product trying to take another's SKU.
        r2 = await sync.apply_push(db, biz_id, [
            {"entity": "product", "client_id": "PROD-B2", "operation": "create",
             "payload": {"name": "Other", "sku": "C2", "unit_price": 5.0, "current_stock": 0}},
            {"entity": "product", "client_id": "PROD-B2", "operation": "update",
             "payload": {"sku": "C1"}},
        ])
        c2 = _email_conflict_entry(r2, "PROD-B2")
        assert c2["reason"] == "sku_conflict"
        b2 = (
            (await db.execute(select(Product).where(Product.client_id == "PROD-B2")))
            .scalars()
            .first()
        )
        assert b2.sku == "C2", "the conflicting SKU is never written"
        await db.commit()


async def test_missing_client_id_target_is_not_found(session_factory):
    """Update/delete targeting a client_id with no server row -> not_found
    conflict (retrying can never fix it)."""
    async with session_factory() as db:
        biz_id = 905
        r = await sync.apply_push(db, biz_id, [
            {"entity": "customer", "client_id": "GHOST", "operation": "update",
             "payload": {"full_name": "Nobody"}},
            {"entity": "product", "client_id": "GHOSTP", "operation": "delete"},
        ])
        assert r["applied"] == 0
        assert {c["client_id"]: c["reason"] for c in r["conflicts"]} == {
            "GHOST": "not_found", "GHOSTP": "not_found",
        }
        assert r["failed"] == []
        await db.commit()


async def test_duplicate_order_push_remains_idempotent(session_factory):
    """The v1 idempotency contract is unchanged: a duplicate batch is all
    skipped (no conflicts, no failures), no duplicate rows, no stock effects
    doubled."""
    from backend.models import StockMovement

    async with session_factory() as db:
        biz_id = 906
        batch = [
            _cust("CUST1"),
            _prod("PROD1", stock=10),
            *_prod_initial("PROD1", 10),
            _order("ORD1", "CUST1"),
            {"entity": "order_item", "client_id": "ORDIT1", "operation": "create",
             "payload": {"order_client_id": "ORD1", "product_client_id": "PROD1",
                         "quantity": 2, "unit_price": 100.0, "total_price": 200.0}},
            _move("MOVE1", "PROD1", change=-2, reason="order"),
        ]
        r1 = await sync.apply_push(db, biz_id, batch)
        assert r1["applied"] == 6 and r1["skipped"] == 0
        r2 = await sync.apply_push(db, biz_id, batch)  # crash + retry
        assert r2["applied"] == 0
        assert r2["skipped"] == 6
        assert r2["conflicts"] == [] and r2["failed"] == []
        assert r2["ids"]["ORD1"] == r1["ids"]["ORD1"], "stable client_id -> server id map"
        n_orders = await _count(db, Order, biz_id)
        n_moves = await _count(db, StockMovement, biz_id)
        assert n_orders == 1 and n_moves == 2  # initial + order deduction, each once
        prod = (
            (await db.execute(select(Product).where(Product.business_id == biz_id)))
            .scalars()
            .first()
        )
        assert prod.current_stock == 8, "10 - 2, applied exactly once"
        await db.commit()


async def test_conflict_response_shape_and_operation_id(session_factory):
    """The response distinguishes applied / skipped / conflicts / failed, and
    a conflict entry carries everything OFFLINE 5 needs: operation_id,
    entity, client_id, reason, local values, server values."""
    async with session_factory() as db:
        biz_id = 907
        await sync.apply_push(db, biz_id, [_cust("CUST-A", email="s@x.com")])
        r = await sync.apply_push(db, biz_id, [
            _cust("CUST-B", email="s@x.com"),
            _cust("CUST-C", email="ok@x.com"),
        ])
        body = r
        assert body["applied"] == 1
        assert body["skipped"] == 0
        assert body["failed"] == []
        assert body["errors"] == body["failed"], "errors stays a back-compat alias"
        c = _email_conflict_entry(body, "CUST-B")
        assert set(c.keys()) == {
            "operation_id",
            "entity",
            "client_id",
            "reason",
            "error",
            "local",
            "server",
        }
        assert c["operation_id"] is None

        # With operation_id supplied, it is echoed back verbatim.
        r2 = await sync.apply_push(db, biz_id, [
            {"entity": "customer", "client_id": "CUST-B", "operation": "create",
             "operation_id": "q77", "payload": {"full_name": "B", "email": "s@x.com"}},
        ])
        assert r2["conflicts"][0]["operation_id"] == "q77"
        await db.commit()


async def test_conflict_is_not_applied_on_retry(session_factory):
    """A conflicting create retried (same batch, later cycle) keeps
    conflicting — it is NEVER applied on retry, and the cloud row is never
    touched. Retries only make sense for 'failed' (transient) ops."""
    async with session_factory() as db:
        biz_id = 908
        await sync.apply_push(db, biz_id, [_cust("CUST-A", email="lock@x.com")])
        for _ in range(3):
            r = await sync.apply_push(db, biz_id, [_cust("CUST-B", email="lock@x.com")])
            assert r["applied"] == 0
            assert len(r["conflicts"]) == 1 and r["conflicts"][0]["reason"] == "email_conflict"
        rows = (
            (await db.execute(select(Customer).where(Customer.business_id == biz_id)))
            .scalars()
            .all()
        )
        assert [r.client_id for r in rows] == ["CUST-A"], "the conflicting create never lands"
        await db.commit()


async def test_conflict_check_is_tenant_isolated(session_factory):
    """The email/SKU uniqueness check is per-business (matching the partial
    unique indexes): the same email in ANOTHER business is not a conflict."""
    async with session_factory() as db:
        r = await sync.apply_push(db, 909, [_cust("CUST-A", email="shared@x.com")])
        assert r["applied"] == 1
        r2 = await sync.apply_push(db, 910, [_cust("CUST-B", email="shared@x.com")])
        assert r2["applied"] == 1, "a different business may use the same email"
        assert r2["conflicts"] == []
        await db.commit()


# ---------------------------------------------------------------------------
# Tenant isolation of the sync path (audit finding: _resolve_client_id was
# unscoped, so a client_id from another tenant resolved — and every caller
# below trusted it).
# ---------------------------------------------------------------------------

async def test_a_client_id_from_another_tenant_does_not_resolve(session_factory):
    """Tenant A's client_id must be invisible to tenant B's push.

    Before the fix the lookup was global, so B's `update` found A's row, then
    loaded and overwrote it while B's own scoping checks passed.
    """
    async with session_factory() as db:
        a, b = 801, 802
        await sync.apply_push(db, a, [_cust("SHARED-CID", name="Alice", email="a@x.com")])
        before = (
            await db.execute(select(Customer).where(Customer.business_id == a))
        ).scalars().first()

        r = await sync.apply_push(db, b, [
            {"entity": "customer", "client_id": "SHARED-CID", "operation": "update",
             "payload": {"full_name": "Mallory"}},
        ])
        assert r["applied"] == 0
        assert r["conflicts"] and r["conflicts"][0]["reason"] == "not_found"

        await db.refresh(before)
        assert before.full_name == "Alice", "the other tenant's row is untouched"
        assert await _count(db, Customer, b) == 0
        await db.commit()


async def test_a_cross_tenant_reference_does_not_resolve(session_factory):
    """An order cannot point at another tenant's customer by client_id."""
    async with session_factory() as db:
        a, b = 803, 804
        await sync.apply_push(db, a, [_cust("CUST-A", email="a@x.com")])
        r = await sync.apply_push(db, b, [
            {"entity": "order", "client_id": "ORD-B", "operation": "create",
             "payload": {"customer_client_id": "CUST-A", "status": "pending",
                         "total_amount": 10, "order_date": "2026-08-01T00:00:00"}},
        ])
        assert r["applied"] == 0
        assert r["conflicts"][0]["reason"] == "not_found"
        assert await _count(db, Order, b) == 0
        await db.commit()


async def test_an_offline_customer_without_an_email_still_renders(api, session_factory):
    """The placeholder must be an address the response schema accepts.

    `@coop.local` is a reserved name and pydantic's EmailStr rejects it, so a
    customer synced without an email made GET /customers fail validation for
    the whole tenant.
    """
    me = (await api.client.get("/auth/me")).json()
    async with session_factory() as db:
        r = await sync.apply_push(db, me["business_id"], [
            {"entity": "customer", "client_id": "NOEMAIL1", "operation": "create",
             "payload": {"full_name": "Walk-in"}},
        ])
        assert r["applied"] == 1, r
        await db.commit()

    listing = await api.client.get("/customers")
    assert listing.status_code == 200, listing.text
    assert listing.json()["items"][0]["email"].endswith("@customers.example.com")


async def test_an_invalid_email_becomes_a_conflict_not_a_poisoned_row(session_factory):
    async with session_factory() as db:
        biz = 805
        r = await sync.apply_push(db, biz, [_cust("BADMAIL", email="not-an-email")])
        assert r["applied"] == 0
        assert r["conflicts"][0]["reason"] == "invalid_payload"
        assert await _count(db, Customer, biz) == 0, "the bad row never lands"

        # An update is refused the same way, and leaves the good value intact.
        await sync.apply_push(db, biz, [_cust("GOODMAIL", email="ok@x.com")])
        r2 = await sync.apply_push(db, biz, [
            {"entity": "customer", "client_id": "GOODMAIL", "operation": "update",
             "payload": {"email": "still-not-an-email"}},
        ])
        assert r2["conflicts"][0]["reason"] == "invalid_payload"
        row = (
            await db.execute(select(Customer).where(Customer.client_id == "GOODMAIL"))
        ).scalars().first()
        await db.refresh(row)
        assert row.email == "ok@x.com"
        await db.commit()


async def test_a_malformed_number_fails_one_op_not_the_batch(session_factory):
    """`int("abc")` used to raise past the handler and 500 the whole push."""
    async with session_factory() as db:
        biz = 806
        r = await sync.apply_push(db, biz, [
            _cust("C1", email="c1@x.com"),
            _prod("P1"),
            _move("M1", "P1", change="abc"),
        ])
        assert await _count(db, Customer, biz) == 1, "the good op still applied"
        assert await _count(db, Product, biz) == 1
        assert r["conflicts"] and r["conflicts"][0]["reason"] == "invalid_payload"
        assert "number" in r["conflicts"][0]["error"]
        await db.commit()
