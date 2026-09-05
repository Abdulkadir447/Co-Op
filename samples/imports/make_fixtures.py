"""
Regenerate the Co-op import sample files.

    /home/user/.venv/bin/python samples/imports/make_fixtures.py

Every file in this folder is produced by this script except README.md, so the
samples can never drift from what the importer actually accepts. The expected
outcome of each file is asserted by backend/tests/test_import_fixtures.py,
which runs the real parse -> detect -> suggest -> validate -> commit pipeline.

Data is deliberately a Kano staples wholesaler: Naira prices, +234 numbers,
dates inside the last six months (so Reports and the Day 1 Briefing have
something to say after an import).
"""
from __future__ import annotations

import csv
import pathlib

HERE = pathlib.Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Products — canonical Co-op headers (what /imports/schema asks for)
# ---------------------------------------------------------------------------
PRODUCTS_CLEAN = [
    ["name", "sku", "description", "category", "unit_price", "cost_price",
     "current_stock", "reorder_level"],
    ["Yam tuber (large)", "YAM-LRG-001", "Fresh large tuber, Bena variety", "Tubers & Roots", 4500, 3200, 120, 30],
    ["Cassava flour (10kg)", "CAS-FLR-010", "Sifted, dry-milled", "Tubers & Roots", 6800, 5100, 64, 20],
    ["Garri (yellow, 50kg)", "GAR-YEL-050", "Ijebu yellow garri", "Tubers & Roots", 32500, 27000, 18, 8],
    ["Rice (parboiled, 50kg)", "RIC-PAR-050", "Nigerian parboiled long grain", "Grains", 87500, 79000, 25, 10],
    ["Maize grain (100kg)", "MZ-GRN-100", "Dried white maize", "Grains", 58000, 50000, 12, 6],
    ["Millet (50kg)", "MIL-050", "Cleaned pearl millet", "Grains", 41000, 35000, 9, 5],
    ["Cowpea (50kg)", "BEAN-OLA-050", "Oloyin honey beans", "Legumes", 96000, 88000, 7, 5],
    ["Groundnut oil (25L)", "GNO-025", "Cold-pressed", "Oils", 74500, 66000, 14, 6],
    ["Palm oil (25L)", "PO-025", "Unrefined red palm oil", "Oils", 62000, 54000, 11, 6],
    ["Tomato paste (400g tin)", "TOM-PST-400", "Triple concentrate", "Pantry", 1850, 1400, 240, 60],
    ["Sugar (50kg)", "SUG-050", "Refined white, Dangote", "Pantry", 68000, 61000, 16, 8],
    ["Detergent soap (carton)", "SOAP-BAR-CTN", "24 bars per carton", "Household", 15500, 12500, 30, 12],
]

# ---------------------------------------------------------------------------
# Customers — canonical headers
# ---------------------------------------------------------------------------
CUSTOMERS_CLEAN = [
    ["full_name", "email", "phone", "company", "address"],
    ["Amina Yusuf", "amina.yusuf@example.com", "+234 803 111 2233", "Kano City Foods Ltd", "12 Ahmadu Bello Way, Kano"],
    ["Musa Ibrahim", "musa.ibrahim@example.com", "+234 802 445 6677", "Sahara Stores", "4 Zoo Road, Kano"],
    ["Fatima Sani", "fatima.sani@example.com", "+234 806 222 3344", "Sani Provision", "88 Independence Road, Kano"],
    ["Chinedu Okafor", "chinedu.okafor@example.com", "+234 805 333 4455", "Okafor Trading", "21 Sabon Gari Market, Kano"],
    ["Bello Abdullahi", "bello.abdullahi@example.com", "+234 809 444 5566", "", "7 Gwale Quarter, Kano"],
    ["Zainab Mohammed", "zainab.mohammed@example.com", "+234 813 555 6677", "Zee Mart", "30 Fagge Layout, Kano"],
    ["Sani Garba", "sani.garba@example.com", "+234 816 666 7788", "Garba & Sons", "5 Naibawa Road, Kano"],
    ["Hauwa Aliyu", "hauwa.aliyu@example.com", "+234 810 777 8899", "", "14 Ungogo Road, Kano"],
    ["Emeka Nwosu", "emeka.nwosu@example.com", "+234 703 888 9900", "Nwosu Wholesale", "9 Kurmi Market, Kano"],
    ["Maryam Lawan", "maryam.lawan@example.com", "+234 706 999 0011", "Lawan Retail", "2 Bompai Industrial Area, Kano"],
]

# ---------------------------------------------------------------------------
# Orders — one row per ORDER LINE, canonical headers.
#
# `order_id` is an idempotency key, not a grouping key: a reference the
# importer has already seen (in the file or in a previous import) skips that
# row rather than merging it into an existing order. So every line carries its
# own reference (SO-1042-L1, SO-1042-L2 …) and each line becomes one historic
# order with one line item.
# ---------------------------------------------------------------------------
ORDERS_CLEAN = [
    ["order_date", "customer_name", "customer_email", "customer_phone", "product_name",
     "product_sku", "quantity", "unit_price", "total", "order_id"],
    ["2026-04-03", "Amina Yusuf", "amina.yusuf@example.com", "+234 803 111 2233", "Rice (parboiled, 50kg)", "RIC-PAR-050", 4, 87500, 350000, "SO-1042-L1"],
    ["2026-04-03", "Amina Yusuf", "amina.yusuf@example.com", "+234 803 111 2233", "Sugar (50kg)", "SUG-050", 2, 68000, 136000, "SO-1042-L2"],
    ["2026-04-11", "Musa Ibrahim", "musa.ibrahim@example.com", "+234 802 445 6677", "Yam tuber (large)", "YAM-LRG-001", 30, 4500, 135000, "SO-1043-L1"],
    ["2026-04-19", "Fatima Sani", "fatima.sani@example.com", "+234 806 222 3344", "Palm oil (25L)", "PO-025", 6, 62000, 372000, "SO-1044-L1"],
    ["2026-05-02", "Chinedu Okafor", "chinedu.okafor@example.com", "+234 805 333 4455", "Cowpea (50kg)", "BEAN-OLA-050", 3, 96000, 288000, "SO-1045-L1"],
    ["2026-05-02", "Chinedu Okafor", "chinedu.okafor@example.com", "+234 805 333 4455", "Maize grain (100kg)", "MZ-GRN-100", 2, 58000, 116000, "SO-1045-L2"],
    ["2026-05-17", "Zainab Mohammed", "zainab.mohammed@example.com", "+234 813 555 6677", "Tomato paste (400g tin)", "TOM-PST-400", 48, 1850, 88800, "SO-1046-L1"],
    ["2026-05-28", "Sani Garba", "sani.garba@example.com", "+234 816 666 7788", "Garri (yellow, 50kg)", "GAR-YEL-050", 5, 32500, 162500, "SO-1047-L1"],
    ["2026-06-06", "Hauwa Aliyu", "hauwa.aliyu@example.com", "+234 810 777 8899", "Groundnut oil (25L)", "GNO-025", 3, 74500, 223500, "SO-1048-L1"],
    ["2026-06-14", "Emeka Nwosu", "emeka.nwosu@example.com", "+234 703 888 9900", "Rice (parboiled, 50kg)", "RIC-PAR-050", 6, 87500, 525000, "SO-1049-L1"],
    ["2026-06-25", "Maryam Lawan", "maryam.lawan@example.com", "+234 706 999 0011", "Detergent soap (carton)", "SOAP-BAR-CTN", 4, 15500, 62000, "SO-1050-L1"],
    ["2026-07-08", "Amina Yusuf", "amina.yusuf@example.com", "+234 803 111 2233", "Cassava flour (10kg)", "CAS-FLR-010", 10, 6800, 68000, "SO-1051-L1"],
    ["2026-07-21", "Bello Abdullahi", "bello.abdullahi@example.com", "+234 809 444 5566", "Millet (50kg)", "MIL-050", 4, 41000, 164000, "SO-1052-L1"],
    ["2026-08-05", "Musa Ibrahim", "musa.ibrahim@example.com", "+234 802 445 6677", "Yam tuber (large)", "YAM-LRG-001", 25, 4500, 112500, "SO-1053-L1"],
    ["2026-08-16", "Fatima Sani", "fatima.sani@example.com", "+234 806 222 3344", "Sugar (50kg)", "SUG-050", 3, 68000, 204000, "SO-1054-L1"],
    ["2026-08-27", "Chinedu Okafor", "chinedu.okafor@example.com", "+234 805 333 4455", "Palm oil (25L)", "PO-025", 5, 62000, 310000, "SO-1055-L1"],
    ["2026-09-02", "Zainab Mohammed", "zainab.mohammed@example.com", "+234 813 555 6677", "Tomato paste (400g tin)", "TOM-PST-400", 60, 1850, 111000, "SO-1056-L1"],
    ["2026-09-02", "Zainab Mohammed", "zainab.mohammed@example.com", "+234 813 555 6677", "Rice (parboiled, 50kg)", "RIC-PAR-050", 2, 87500, 175000, "SO-1056-L2"],
]

# ---------------------------------------------------------------------------
# The same catalogue as a real-world export: semicolon-delimited, alias
# headers, Naira signs and thousands separators. Exercises the delimiter
# sniffer, the alias mapper and the money parser.
# ---------------------------------------------------------------------------
PRODUCTS_MESSY = [
    ["Item Name", "Item Code", "Details", "Product Category", "Selling Price",
     "Cost Price", "Qty On Hand", "Reorder Point"],
    ["Yam tuber (large)", "YAM-LRG-001", "Fresh large tuber", "Tubers & Roots", "₦4,500.00", "₦3,200.00", "120", "30"],
    ["Cassava flour (10kg)", "CAS-FLR-010", "Sifted", "Tubers & Roots", "₦6,800.00", "₦5,100.00", "64", "20"],
    ["Garri (yellow, 50kg)", "GAR-YEL-050", "Ijebu yellow", "Tubers & Roots", "₦32,500.00", "₦27,000.00", "18", "8"],
    ["Rice (parboiled, 50kg)", "RIC-PAR-050", "Long grain", "Grains", "₦87,500.00", "₦79,000.00", "25", "10"],
    ["Maize grain (100kg)", "MZ-GRN-100", "Dried white", "Grains", "₦58,000.00", "₦50,000.00", "12", "6"],
    ["Cowpea (50kg)", "BEAN-OLA-050", "Honey beans", "Legumes", "₦96,000.00", "₦88,000.00", "7", "5"],
    ["Palm oil (25L)", "PO-025", "Unrefined", "Oils", "₦62,000.00", "₦54,000.00", "11", "6"],
    ["Sugar (50kg)", "SUG-050", "Refined white", "Pantry", "₦68,000.00", "₦61,000.00", "16", "8"],
]

# ---------------------------------------------------------------------------
# Customers the way a storefront export looks. Two rows have no email at all —
# the importer is allowed to generate a placeholder address for those.
# ---------------------------------------------------------------------------
CUSTOMERS_STOREFRONT = [
    ["Customer Name", "Email Address", "Phone Number", "Company", "Shipping Address"],
    ["Amina Yusuf", "amina.yusuf@example.com", "+234 803 111 2233", "Kano City Foods Ltd", "12 Ahmadu Bello Way, Kano"],
    ["Musa Ibrahim", "musa.ibrahim@example.com", "+234 802 445 6677", "Sahara Stores", "4 Zoo Road, Kano"],
    ["Fatima Sani", "fatima.sani@example.com", "+234 806 222 3344", "Sani Provision", "88 Independence Road, Kano"],
    ["Ibrahim Danladi", "", "+234 802 121 2121", "", "6 Dawakin Kudu Road, Kano"],
    ["Grace Adamu", "", "+234 813 343 4343", "Adamu Retail", "17 Tarauni, Kano"],
    ["Yusuf Bala", "yusuf.bala@example.com", "+234 806 565 6565", "Bala Enterprises", "23 Challawa, Kano"],
    ["Ngozi Eze", "ngozi.eze@example.com", "+234 809 787 8787", "Eze Foods", "31 Kofar Mata, Kano"],
    ["Halima Shehu", "halima.shehu@example.com", "+234 703 909 0909", "", "8 Gwale, Kano"],
]

# ---------------------------------------------------------------------------
# Sales history the way an accounting package exports it: TAB-delimited,
# invoice references, US-style dates, no email column at all (so customer
# matching has to fall back to name).
# ---------------------------------------------------------------------------
ORDERS_ACCOUNTING = [
    ["Invoice #", "Date", "Customer", "Item", "Qty", "Rate", "Amount"],
    ["INV-2041", "04/03/2026", "Amina Yusuf", "Rice (parboiled, 50kg)", 4, 87500, 350000],
    ["INV-2042", "04/11/2026", "Musa Ibrahim", "Yam tuber (large)", 30, 4500, 135000],
    ["INV-2043", "04/19/2026", "Fatima Sani", "Palm oil (25L)", 6, 62000, 372000],
    ["INV-2044", "05/02/2026", "Chinedu Okafor", "Cowpea (50kg)", 3, 96000, 288000],
    ["INV-2045", "05/17/2026", "Zainab Mohammed", "Tomato paste (400g tin)", 48, 1850, 88800],
    ["INV-2046", "05/28/2026", "Sani Garba", "Garri (yellow, 50kg)", 5, 32500, 162500],
    ["INV-2047", "06/06/2026", "Hauwa Aliyu", "Groundnut oil (25L)", 3, 74500, 223500],
    ["INV-2048", "06/14/2026", "Emeka Nwosu", "Rice (parboiled, 50kg)", 6, 87500, 525000],
    ["INV-2049", "06/25/2026", "Maryam Lawan", "Detergent soap (carton)", 4, 15500, 62000],
    ["INV-2050", "07/08/2026", "Amina Yusuf", "Cassava flour (10kg)", 10, 6800, 68000],
    ["INV-2051", "07/21/2026", "Bello Abdullahi", "Millet (50kg)", 4, 41000, 164000],
    ["INV-2052", "08/05/2026", "Musa Ibrahim", "Yam tuber (large)", 25, 4500, 112500],
]

# ---------------------------------------------------------------------------
# Deliberately broken files — the validation report has to name every problem
# row instead of failing the whole import.
# ---------------------------------------------------------------------------
PRODUCTS_WITH_ERRORS = [
    ["name", "sku", "description", "category", "unit_price", "cost_price", "current_stock", "reorder_level"],
    ["Yam tuber (large)", "YAM-LRG-001", "Fresh", "Tubers & Roots", "4500", "3200", "120", "30"],
    ["Cassava flour (10kg)", "CAS-FLR-010", "Sifted", "Tubers & Roots", "6800", "5100", "64", "20"],
    ["Garri (yellow, 50kg)", "GAR-YEL-050", "Ijebu", "Tubers & Roots", "32500", "27000", "18", "8"],
    ["Rice (parboiled, 50kg)", "RIC-PAR-050", "Long grain", "Grains", "87500", "79000", "25", "10"],
    ["Maize grain (100kg)", "MZ-GRN-100", "Dried", "Grains", "58000", "50000", "12", "6"],
    ["Cowpea (50kg)", "BEAN-OLA-050", "Honey beans", "Legumes", "96000", "88000", "7", "5"],
    # broken rows
    ["", "NO-NAME-001", "No product name on this row", "Pantry", "2500", "1800", "10", "5"],
    ["Mystery oil (25L)", "OIL-MYS-001", "Price is not a number", "Oils", "N/A", "", "9", "4"],
    ["Sugar (50kg)", "SUG-050", "Selling price is required but blank", "Pantry", "", "61000", "16", "8"],
    ["Palm oil (25L)", "PO-025", "Stock column is text", "Oils", "62000", "54000", "eleven", "6"],
    ["Yam tuber (large)", "YAM-LRG-001", "Same SKU as row 2 — duplicate inside the file", "Tubers & Roots", "4500", "3200", "40", "30"],
]

ORDERS_WITH_ERRORS = [
    ["order_date", "customer_name", "customer_email", "customer_phone", "product_name",
     "product_sku", "quantity", "unit_price", "total", "order_id"],
    ["2026-04-03", "Amina Yusuf", "amina.yusuf@example.com", "+234 803 111 2233", "Rice (parboiled, 50kg)", "RIC-PAR-050", 4, 87500, 350000, "SO-9001-L1"],
    ["2026-04-11", "Musa Ibrahim", "musa.ibrahim@example.com", "+234 802 445 6677", "Yam tuber (large)", "YAM-LRG-001", 30, 4500, 135000, "SO-9002-L1"],
    ["2026-04-19", "Fatima Sani", "fatima.sani@example.com", "+234 806 222 3344", "Palm oil (25L)", "PO-025", 6, 62000, 372000, "SO-9003-L1"],
    # broken rows
    ["31/31/2026", "Sani Garba", "sani.garba@example.com", "+234 816 666 7788", "Garri (yellow, 50kg)", "GAR-YEL-050", 5, 32500, 162500, "SO-9004-L1"],
    ["2026-05-02", "Chinedu Okafor", "chinedu.okafor@example.com", "+234 805 333 4455", "Cowpea (50kg)", "BEAN-OLA-050", 0, 96000, 0, "SO-9005-L1"],
    ["2026-05-17", "Zainab Mohammed", "zainab.mohammed@example.com", "+234 813 555 6677", "", "TOM-PST-400", 48, 1850, 88800, "SO-9006-L1"],
    ["2026-06-06", "Hauwa Aliyu", "hauwa.aliyu@example.com", "+234 810 777 8899", "Groundnut oil (25L)", "GNO-025", 3, "free", 0, "SO-9007-L1"],
    ["2026-06-14", "Nobody In The Database", "ghost@example.com", "+234 700 000 0000", "Rice (parboiled, 50kg)", "RIC-PAR-050", 2, 87500, 175000, "SO-9008-L1"],
]

# ---------------------------------------------------------------------------
# A spreadsheet export, so the .xlsx path is covered too.
# ---------------------------------------------------------------------------
PRODUCTS_XLSX = [
    ["Name", "SKU", "Price", "Cost", "Stock"],
    ["Yam tuber (large)", "YAM-LRG-001", 4500, 3200, 120],
    ["Cassava flour (10kg)", "CAS-FLR-010", 6800, 5100, 64],
    ["Garri (yellow, 50kg)", "GAR-YEL-050", 32500, 27000, 18],
    ["Rice (parboiled, 50kg)", "RIC-PAR-050", 87500, 79000, 25],
    ["Millet (50kg)", "MIL-050", 41000, 35000, 9],
    ["Tomato paste (400g tin)", "TOM-PST-400", 1850, 1400, 240],
]


def write_csv(name: str, rows: list[list], delimiter: str = ",") -> None:
    path = HERE / name
    with path.open("w", newline="", encoding="utf-8") as fh:
        csv.writer(fh, delimiter=delimiter, quoting=csv.QUOTE_MINIMAL).writerows(rows)
    print(f"  {name}  ({len(rows) - 1} rows, {'delimiter=' + repr(delimiter)})")


def write_xlsx(name: str, rows: list[list]) -> None:
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Products"
    for row in rows:
        ws.append(row)
    wb.save(HERE / name)
    print(f"  {name}  ({len(rows) - 1} rows, xlsx)")


def write_large(products: int, orders: int) -> None:
    """Stress files for import performance — generated on demand, not committed.

        python samples/imports/make_fixtures.py --rows 5000

    Writes products-large.csv (N rows) and orders-large.csv (4N lines), each
    well under the 5 MB upload cap.
    """
    import random

    rng = random.Random(20260905)  # same file every run, so timing is comparable
    names = ["Yam tuber", "Cassava flour", "Garri", "Rice 50kg", "Maize 100kg",
             "Millet 50kg", "Cowpea 50kg", "Groundnut oil 25L", "Palm oil 25L",
             "Tomato paste 400g", "Sugar 50kg", "Detergent carton"]
    people = ["Amina Yusuf", "Musa Ibrahim", "Fatima Sani", "Chinedu Okafor",
              "Bello Abdullahi", "Zainab Mohammed", "Sani Garba", "Hauwa Aliyu"]

    rows = [["name", "sku", "description", "category", "unit_price", "cost_price",
             "current_stock", "reorder_level"]]
    for i in range(products):
        base = names[i % len(names)]
        rows.append([f"{base} #{i:05d}", f"SKU-{i:05d}", f"Bulk line {i}",
                     "Bulk", rng.randint(800, 95000), rng.randint(600, 80000),
                     rng.randint(0, 400), rng.randint(5, 40)])
    write_csv("products-large.csv", rows)

    orows = [["order_date", "customer_name", "customer_email", "customer_phone",
              "product_name", "product_sku", "quantity", "unit_price", "total", "order_id"]]
    for i in range(orders):
        sku = f"SKU-{i % products:05d}"
        name = f"{names[i % len(names)]} #{i % products:05d}"
        who = people[i % len(people)]
        qty = rng.randint(1, 60)
        price = rng.randint(800, 95000)
        day = 1 + (i % 28)
        month = 4 + (i // 28) % 6
        orows.append([f"2026-{month:02d}-{day:02d}", who, "", "+234 800 000 0000",
                      name, sku, qty, price, qty * price, f"L-{i:06d}-L1"])
    write_csv("orders-large.csv", orows)


def main(argv: list[str]) -> None:
    if "--rows" in argv:
        n = int(argv[argv.index("--rows") + 1])
        print(f"writing stress files ({n} products, {n * 4} order lines) to", HERE)
        write_large(n, n * 4)
        return

    print("writing import samples to", HERE)
    write_csv("products-clean.csv", PRODUCTS_CLEAN)
    write_csv("customers-clean.csv", CUSTOMERS_CLEAN)
    write_csv("orders-clean.csv", ORDERS_CLEAN)
    write_csv("products-messy-export.csv", PRODUCTS_MESSY, delimiter=";")
    write_csv("customers-storefront-export.csv", CUSTOMERS_STOREFRONT)
    write_csv("orders-accounting-export.csv", ORDERS_ACCOUNTING, delimiter="\t")
    write_csv("products-with-errors.csv", PRODUCTS_WITH_ERRORS)
    write_csv("orders-with-errors.csv", ORDERS_WITH_ERRORS)
    write_xlsx("products.xlsx", PRODUCTS_XLSX)


if __name__ == "__main__":
    import sys

    main(sys.argv[1:])
