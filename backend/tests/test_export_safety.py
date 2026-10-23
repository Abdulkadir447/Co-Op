"""
Export safety: a cell that starts with = + - @ must never reach a spreadsheet
as a formula (docs/SECURITY_AUDIT.md, finding 1 — CSV formula injection).

The names below are the payloads that matter: a DDE command, a hyperlink
phish, an @-function and a phone number that starts with +. Records are created
through the normal API, then exported through the normal endpoints, so this
covers the real path rather than the renderer in isolation.
"""
from __future__ import annotations

import csv
import io

from backend.csvsafe import is_defused

import openpyxl

DDE = "=cmd|'/c calc'!A1"
PHISH = '=HYPERLINK("http://evil.example","click me")'
AT_FN = "@SUM(A1:A9)"
PLUS_PHONE = "+234 803 111 2233"


async def _seed_products(api) -> None:
    for i, name in enumerate((DDE, PHISH, AT_FN, PLUS_PHONE, "Yam tuber (large)")):
        r = await api.client.post(
            "/products",
            json={
                "sku": f"SAFE-{i:03d}",
                "name": name,
                "unit_price": 1000 + i,
                "cost_price": 500,
                "current_stock": 10,
                "reorder_level": 2,
            },
        )
        assert r.status_code == 201, r.text


async def _seed_sales(api) -> None:
    """One sale per payload product, so every name reaches the report."""
    customer = await api.client.post(
        "/customers",
        json={"full_name": DDE, "email": "victim@example.com"},
    )
    assert customer.status_code == 201, customer.text
    listed = await api.client.get("/products", params={"limit": 50})
    for product in listed.json()["items"]:
        r = await api.client.post(
            "/orders",
            json={
                "customer_id": customer.json()["id"],
                "order_date": "2026-09-01",
                "items": [
                    {
                        "product_id": product["id"],
                        "quantity": 2,
                        "unit_price": product["unit_price"],
                    }
                ],
            },
        )
        assert r.status_code in (200, 201), r.text


async def test_csv_export_escapes_formula_cells(api):
    await _seed_products(api)
    await _seed_sales(api)

    r = await api.client.get("/reports/sales/export", params={"format": "csv"})
    assert r.status_code == 200, r.text
    rows = list(csv.reader(io.StringIO(r.content.decode("utf-8"))))
    cells = [c for row in rows for c in row]

    # every payload reached the export, escaped as text
    for payload in (DDE, PHISH, AT_FN, PLUS_PHONE):
        assert f"'{payload}" in cells, f"{payload} is not escaped in the export"

    # and no cell in the file could execute
    live = [c for c in cells if not is_defused(c)]
    assert live == [], f"cells a spreadsheet would execute: {live[:3]}"


async def test_xlsx_export_contains_no_formula_cells(api):
    await _seed_products(api)
    await _seed_sales(api)

    r = await api.client.get("/reports/sales/export", params={"format": "xlsx"})
    assert r.status_code == 200, r.text

    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    cells = [
        (ws.title, c.coordinate, c.value)
        for ws in wb.worksheets
        for row in ws.iter_rows()
        for c in row
        if c.value is not None
    ]
    formulas = [t for t in cells if not is_defused(t[2])]
    assert formulas == [], f"cells a spreadsheet would execute: {formulas[:3]}"
    values = [str(t[2]) for t in cells]
    assert f"'{DDE}" in values, "the DDE payload is missing from the workbook"


async def test_negative_numbers_stay_numeric(api):
    """Escaping must not turn a stock adjustment into text."""
    from backend.csvsafe import csv_safe

    assert csv_safe("-120") == "-120"
    assert csv_safe(-5) == -5
    assert csv_safe(0) == 0
    assert csv_safe(DDE) == f"'{DDE}"
    assert csv_safe("") == ""
    assert csv_safe(None) is None


async def test_invoice_csv_export_escapes_customer_names(api):
    product = await api.client.post(
        "/products",
        json={"sku": "INV-SAFE-1", "name": "Yam", "unit_price": 500, "current_stock": 10},
    )
    customer = await api.client.post(
        "/customers", json={"full_name": PHISH, "email": "victim@example.com"}
    )
    order = await api.client.post(
        "/orders",
        json={
            "customer_id": customer.json()["id"],
            "order_date": "2026-09-01",
            "items": [{"product_id": product.json()["id"], "quantity": 1, "unit_price": 500}],
        },
    )
    assert order.status_code in (200, 201), order.text

    invoice = await api.client.post("/invoices", json={"order_id": order.json()["id"]})
    assert invoice.status_code == 201, invoice.text

    r = await api.client.get("/invoices/export", params={"format": "csv"})
    assert r.status_code == 200, r.text
    rows = list(csv.reader(io.StringIO(r.content.decode("utf-8"))))
    cells = [c for row in rows for c in row]
    assert f"'{PHISH}" in cells, "customer name is not escaped in the invoice export"
    live = [c for c in cells if not is_defused(c)]
    assert live == [], f"cells a spreadsheet would execute: {live[:3]}"
