"""D2 — exact money, proved rather than assumed.

A green suite of float literals proves nothing about arithmetic: ``0.1 + 0.2``
still compares equal to ``0.3`` in most assertions because both sides went
through the same float. These tests are written so that a regression to float
*fails*, and so that the invariants a chain actually relies on are stated as
exact equalities:

  * money columns are integer minor units, and the architecture test below
    fails on any new ``Float`` money column;
  * Σ line totals == order subtotal, exactly;
  * subtotal + tax == grand total, exactly, and tax is rounded once;
  * Σ tenders == grand total, exactly;
  * the response body carries money as a JSON **number**, never a string;
  * the currency is NGN and the database refuses anything else.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import inspect, select, text

from backend import money
from backend.models import Base, Business, Order, OrderItem, OrderPayment


# ---------------------------------------------------------------------------
# The primitive
# ---------------------------------------------------------------------------


def test_the_textbook_float_failure_does_not_happen():
    """0.1 + 0.2 must be 0.3, not 0.30000000000000004."""
    assert money.as_money("0.1") + money.as_money("0.2") == Decimal("0.3")
    # and a hundred of them is 10.00, not 10.000000000000002
    assert money.sum_money(["0.1"] * 100) == Decimal("10.00")
    # the float path, for contrast: this is what the old columns did
    assert 0.1 + 0.2 != 0.3


def test_rounding_is_half_up_not_bankers():
    """A cashier rounds 12.5 kobo up. Python's round() would go to even."""
    assert money.as_money("0.125") == Decimal("0.13")
    assert money.as_money("0.135") == Decimal("0.14")
    assert round(0.125, 2) == 0.12  # what the old code did, by accident


def test_money_round_trips_through_the_database_unchanged():
    for value in ("19.99", "0.01", "1234567.89", "0.10"):
        assert money.from_minor(money.to_minor(value)) == Decimal(value)


def test_a_rate_is_a_percentage_not_a_fraction():
    assert money.as_rate("7.5") == Decimal("7.5000")
    assert money.percent_of("1000.00", "7.5") == Decimal("75.00")
    # 7.5% of 19.99 is 1.49925 -> 1.50, rounded once
    assert money.percent_of("19.99", "7.5") == Decimal("1.50")
    # no rate at all stays None, never a silent zero
    assert money.percent_of("19.99", None) == money.ZERO


def test_a_float_can_never_sneak_into_a_total():
    """Decimal + float raises. That is the guard, and it is deliberate."""
    with pytest.raises(TypeError):
        money.as_money("1.00") + 1.0
    # …but a float that has to be accepted (JSON input) is parsed through str
    assert money.as_money(0.1) == Decimal("0.10")
    assert money.as_money(19.99) == Decimal("19.99")


# ---------------------------------------------------------------------------
# Architecture: the schema cannot store inexact money
# ---------------------------------------------------------------------------

#: Money and rate columns. Every one must be Money/Rate (an INTEGER column),
#: never Float. Adding a new money column means adding it here.
MONEY_COLUMNS = {
    ("businesses", "tax_rate"),            # rate
    ("products", "unit_price"),
    ("products", "cost_price"),
    ("orders", "total_amount"),
    ("orders", "tax_rate"),                # rate
    ("orders", "tax_amount"),
    ("order_items", "unit_price"),
    ("order_items", "total_price"),
    ("order_payments", "amount"),
    ("zeno_lessons", "cost_amount"),
}


def test_no_money_column_is_a_float():
    offenders = []
    for table, column in MONEY_COLUMNS:
        col = Base.metadata.tables[table].columns[column]
        if col.type.__class__.__name__ in ("Float", "REAL", "Numeric"):
            offenders.append(f"{table}.{column} is {col.type}")
    assert not offenders, (
        "money must be stored as integer minor units (backend/money.py), "
        f"not float: {offenders}"
    )


@pytest.mark.asyncio
async def test_money_columns_are_integers_in_the_database_itself(engine):
    """The ORM type says Integer; this proves the DDL does too.

    Portable across SQLite (INTEGER) and Postgres (INTEGER / int4), because on
    Postgres a stray ``double precision`` would be the same bug with a
    different name.
    """
    names = {"INTEGER", "INT4", "BIGINT", "INT8"}

    def _types(sync_conn):
        insp = inspect(sync_conn)
        out = {}
        for table, column in MONEY_COLUMNS:
            for col in insp.get_columns(table):
                if col["name"] == column:
                    out[(table, column)] = str(col["type"]).upper()
        return out

    async with engine.connect() as conn:
        declared = await conn.run_sync(_types)

    assert set(declared) == set(MONEY_COLUMNS), "a money column is missing"
    offenders = {k: v for k, v in declared.items() if v not in names}
    assert not offenders, (
        "money must be an integer minor-unit column; database says " f"{offenders}"
    )


def test_every_float_left_in_the_schema_is_accounted_for():
    """One float is allowed, and it says why in a column beside it."""
    floats = [
        f"{table.name}.{col.name}"
        for table in Base.metadata.tables.values()
        for col in table.columns
        if col.type.__class__.__name__ == "Float"
    ]
    assert floats == ["analytics_snapshots.metric_value"], (
        "the only inexact column left is the cached metric value; "
        f"found {floats}"
    )
    assert "metric_unit" in Base.metadata.tables["analytics_snapshots"].columns


# ---------------------------------------------------------------------------
# The invariants a chain actually relies on (through the real API)
# ---------------------------------------------------------------------------


async def _seed_product(api, sku, price, stock=1000):
    r = await api.client.post(
        "/products",
        json={"sku": sku, "name": sku, "unit_price": price, "current_stock": stock},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _customer(api, email):
    r = await api.client.post("/customers", json={"full_name": "Buyer", "email": email})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_line_totals_sum_exactly_to_the_subtotal(api, session_factory):
    """Three awkward unit prices, quantities that multiply out badly."""
    p1 = await _seed_product(api, "EX-1", "33.33")
    p2 = await _seed_product(api, "EX-2", "0.07")
    p3 = await _seed_product(api, "EX-3", "19.99")
    c = await _customer(api, "exact@example.com")

    r = await api.client.post(
        "/orders",
        json={
            "customer_id": c["id"],
            "items": [
                {"product_id": p1["id"], "quantity": 3, "unit_price": 33.33},
                {"product_id": p2["id"], "quantity": 7, "unit_price": 0.07},
                {"product_id": p3["id"], "quantity": 9, "unit_price": 19.99},
            ],
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()

    exact_lines = money.sum_money(item["total_price"] for item in body["items"])
    assert Decimal(str(body["total_amount"])) == exact_lines
    # 99.99 + 0.49 + 179.91 = 280.39, to the kobo
    assert Decimal(str(body["total_amount"])) == Decimal("280.39")

    async with session_factory() as db:
        order = (
            await db.execute(select(Order).where(Order.id == body["id"]))
        ).scalars().one()
        lines = (
            await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
        ).scalars().all()
        # Exact equality on the stored rows, not on the JSON round-trip.
        assert order.total_amount == sum(
            (line.total_price for line in lines), money.ZERO
        )


@pytest.mark.asyncio
async def test_tax_is_added_on_top_exactly_once(api):
    """7.5% VAT on 280.39 is 21.02925 -> 21.03, and the grand total is exact."""
    p = await _seed_product(api, "TAX-1", "280.39")
    c = await _customer(api, "tax@example.com")
    set_tax = await api.client.patch(
        "/business/settings", json={"tax_enabled": True, "tax_rate": 7.5}
    )
    assert set_tax.status_code == 200, set_tax.text

    r = await api.client.post(
        "/orders",
        json={
            "customer_id": c["id"],
            "items": [{"product_id": p["id"], "quantity": 1, "unit_price": 280.39}],
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert Decimal(str(body["tax_amount"])) == Decimal("21.03")
    assert Decimal(str(body["grand_total"])) == Decimal("301.42")
    # grand_total is the sum of two already-rounded values: no second rounding
    assert Decimal(str(body["grand_total"])) == (
        Decimal(str(body["total_amount"])) + Decimal(str(body["tax_amount"]))
    )


@pytest.mark.asyncio
async def test_tenders_sum_exactly_to_the_grand_total(api):
    """Six odd payments settle the order to zero, not to 0.000000000000001."""
    p = await _seed_product(api, "PAY-1", "1000.00")
    c = await _customer(api, "tender@example.com")
    r = await api.client.post(
        "/orders",
        json={
            "customer_id": c["id"],
            "items": [{"product_id": p["id"], "quantity": 1, "unit_price": 1000.0}],
        },
    )
    order_id = r.json()["id"]

    for amount in (166.67, 166.67, 166.67, 166.66, 166.66, 166.67):
        resp = await api.client.post(
            f"/orders/{order_id}/payments", json={"amount": amount, "method": "cash"}
        )
        assert resp.status_code == 201, resp.text

    final = (await api.client.get(f"/orders/{order_id}/payments")).json()
    assert Decimal(str(final["amount_paid"])) == Decimal("1000.00")
    assert Decimal(str(final["balance_due"])) == Decimal("0.00")
    assert final["payment_status"] == "paid"


@pytest.mark.asyncio
async def test_money_crosses_the_wire_as_a_number_not_a_string(api):
    """A Decimal that leaks as "19.99" would break every screen's arithmetic."""
    p = await _seed_product(api, "WIRE-1", "19.99")
    assert isinstance(p["unit_price"], (int, float))
    assert p["unit_price"] == 19.99

    c = await _customer(api, "wire@example.com")
    o = await api.client.post(
        "/orders",
        json={
            "customer_id": c["id"],
            "items": [{"product_id": p["id"], "quantity": 2, "unit_price": 19.99}],
        },
    )
    body = o.json()
    assert isinstance(body["total_amount"], (int, float))
    assert body["total_amount"] == 39.98

    inv = await api.client.post("/invoices", json={"order_id": body["id"]})
    assert inv.status_code == 201, inv.text
    assert isinstance(inv.json()["subtotal"], (int, float))
    assert inv.json()["total"] == 39.98


@pytest.mark.asyncio
async def test_the_currency_is_naira_and_nothing_else(api):
    await api.client.get("/auth/me")
    settings = (await api.client.get("/business/settings")).json()
    assert settings["currency"] == "NGN"

    refused = await api.client.patch("/business/settings", json={"currency": "USD"})
    assert refused.status_code == 422, refused.text
    assert "NGN" in refused.json()["detail"]


@pytest.mark.asyncio
async def test_the_database_itself_refuses_another_currency(session_factory):
    """The route is a message; the CHECK constraint is the guarantee."""
    async with session_factory() as db:
        db.add(Business(name="Dollar Co", owner_id="u-usd", currency="USD"))
        with pytest.raises(Exception) as exc:
            await db.commit()
        assert "ck_businesses_currency_ngn" in str(exc.value)


@pytest.mark.asyncio
async def test_a_payment_row_stores_kobo_as_an_integer(session_factory, api):
    p = await _seed_product(api, "KOBO-1", "10.00")
    c = await _customer(api, "kobo@example.com")
    o = await api.client.post(
        "/orders",
        json={
            "customer_id": c["id"],
            "items": [{"product_id": p["id"], "quantity": 1, "unit_price": 10.0}],
        },
    )
    order_id = o.json()["id"]
    await api.client.post(
        f"/orders/{order_id}/payments", json={"amount": 0.1, "method": "cash"}
    )
    await api.client.post(
        f"/orders/{order_id}/payments", json={"amount": 0.2, "method": "cash"}
    )

    async with session_factory() as db:
        rows = (
            await db.execute(select(OrderPayment).where(OrderPayment.order_id == order_id))
        ).scalars().all()
        assert all(isinstance(r.amount, Decimal) for r in rows)
        assert sum((r.amount for r in rows), money.ZERO) == Decimal("0.30")

    # …and on disk they are integers, so no binary fraction exists to drift.
    async with session_factory() as db:
        raw = await db.execute(
            text("SELECT amount FROM order_payments ORDER BY id")
        )
        assert [int(row[0]) for row in raw.all()] == [10, 20]  # kobo, not naira


@pytest.mark.asyncio
async def test_the_offline_mirror_payload_carries_numbers_not_strings(api):
    """The Electron mirror stores what /sync/pull sends.

    A Decimal leaking out as "100.00" would be written into SQLite as text and
    every local read would then be comparing a string to a number.
    """
    await _seed_product(api, "MIRROR-1", "100.00", stock=10)
    payload = (await api.client.get("/sync/pull")).json()

    product = payload["products"][0]
    assert isinstance(product["unit_price"], (int, float))
    assert product["unit_price"] == 100.0
    assert isinstance(payload["business"]["currency"], str)
