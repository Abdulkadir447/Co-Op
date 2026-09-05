"""
Co-op Intelligent Importer (v1) — flat-file ingestion + schema mapping.

Trust model (same philosophy as Zeno actions):
    upload -> parse/validate -> SUGGESTED mapping (with confidence)
           -> USER reviews/edits mapping in the UI
           -> server executes the import -> reported result

The mapper is a deterministic, alias + sample-analysis engine in v1.
`suggest_mapping` is the single seam: replacing its internals with an LLM
call (same input/output contract) is how a true "AI mapper" lands in v2
without touching the UI or the import executor.

Supported: CSV (any of , ; tab delimiters, UTF-8/UTF-8-BOM) and XLSX
(first worksheet only, clean tables only — no formulas/merged cells).
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Callable, Optional

# ---------------------------------------------------------------------------
# Field / dataset definitions — the import schema (single source of truth).
# ---------------------------------------------------------------------------

Parser = Callable[[str], Any]


def _parse_int(v: str) -> int:
    s = re.sub(r"[^\d\-]", "", v.strip())
    if s in ("", "-"):
        raise ValueError("expected a whole number")
    return int(s)


def _parse_money(v: str) -> float:
    s = re.sub(r"[^\d\.\-]", "", v.strip())
    if s in ("", "-", "-."):
        raise ValueError("expected a number")
    return float(s)


def _parse_date(v: str) -> str:
    """Parse a broad set of common export date formats -> ISO yyyy-mm-dd."""
    s = v.strip()
    if not s:
        raise ValueError("empty date")
    formats = [
        "%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%m-%d-%Y",
        "%Y.%m.%d", "%d.%m.%Y", "%B %d, %Y", "%b %d, %Y", "%d %B %Y", "%d %b %Y",
        "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%d/%m/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%Y-%m-%dT%H:%M:%S",
    ]
    # Disambiguate dd/mm vs mm/dd: if first part > 12 it must be the day.
    for fmt in formats:
        try:
            import datetime as _dt
            d = _dt.datetime.strptime(s, fmt).date()
            return d.isoformat()
        except ValueError:
            continue
    # ISO with time suffix already handled; try fromisoformat as a last resort
    try:
        import datetime as _dt
        return _dt.date.fromisoformat(s[:10]).isoformat()
    except ValueError:
        pass
    raise ValueError(f"unrecognised date format: {v[:30]!r}")


def _passthrough(v: str) -> str:
    s = v.strip()
    if not s:
        raise ValueError("empty value")
    return s


def _optional(v: str) -> Optional[str]:
    s = v.strip()
    return s or None


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Placeholder address for a customer whose old system had no email column.
# It must be a syntactically valid, deliverable-looking domain: `.local` and
# `.invalid` are IANA special-use names, and the API's EmailStr responses
# reject them — which used to make /customers return 500 after such an import.
PLACEHOLDER_EMAIL_DOMAIN = "imported.coop"


@dataclass(frozen=True)
class FieldSpec:
    key: str
    label: str
    required: bool
    aliases: tuple[str, ...]
    parser: Parser
    kind: str  # text | email | money | int | date
    # When True and the column is absent, a placeholder may be generated.
    generatable: bool = False


@dataclass(frozen=True)
class DatasetSpec:
    key: str
    label: str
    description: str
    fields: dict[str, FieldSpec]


PRODUCTS = DatasetSpec(
    key="products",
    label="Products",
    description="Your product catalog (name, prices, stock).",
    fields={
        "name": FieldSpec("name", "Product name", True,
                          ("name", "product", "product_name", "item", "item_name",
                           "product_title", "title", "product_description"), _passthrough, "text"),
        "sku": FieldSpec("sku", "SKU / code", False,
                         ("sku", "sku_code", "code", "product_code", "item_code", "upc",
                          "gtin", "ean", "item_number", "stock_code"), _passthrough, "text"),
        "description": FieldSpec("description", "Description", False,
                                 ("description", "details", "notes", "product_description",
                                  "long_description", "blurb"), _optional, "text"),
        "category": FieldSpec("category", "Category", False,
                              ("category", "product_category", "type", "class", "group",
                               "collection"), _optional, "text"),
        "unit_price": FieldSpec("unit_price", "Selling price", True,
                                ("unit_price", "price", "selling_price", "sale_price",
                                 "price_usd",
                                 "retail_price",
                                 "mrp",
                                 "price_each",
                                 ), _parse_money, "money"),
        "cost_price": FieldSpec("cost_price", "Cost price", False,
                                ("cost_price", "cost", "unit_cost", "cost_usd", "purchase_price",
                                 "cogs", "landed_cost", "buying_price"), _parse_money, "money"),
        "current_stock": FieldSpec("current_stock", "Current stock", False,
                                   ("current_stock", "stock", "stock_qty", "quantity", "qty",
                                    "stock_quantity", "on_hand", "available", "units", "inventory"),
                                   _parse_int, "int"),
        "reorder_level": FieldSpec("reorder_level", "Reorder level", False,
                                   ("reorder_level", "reorder_point", "min_stock", "min_quantity",
                                    "reorder_qty",
                                    "reorder",
                                    "threshold",
                                    "min_level",
                                    ), _parse_int, "int"),
    },
)

CUSTOMERS = DatasetSpec(
    key="customers",
    label="Customers",
    description="Your customer list (names, contacts, companies).",
    fields={
        "full_name": FieldSpec("full_name", "Full name", True,
                               ("name", "full_name", "customer", "customer_name", "client",
                                "client_name", "buyer", "buyer_name", "contact",
                                "contact_name", "account", "account_name", "customer_full_name"),
                               _passthrough, "text"),
        "email": FieldSpec("email", "Email", False,
                           ("email", "email_address", "customer_email", "buyer_email",
                            "client_email", "email_addr", "mail"), _optional, "email",
                           generatable=True),
        "phone": FieldSpec("phone", "Phone", False,
                           ("phone", "phone_number", "mobile", "telephone", "phone_no",
                            "cell", "contact_number", "tel"), _optional, "text"),
        "company": FieldSpec("company", "Company", False,
                             ("company", "company_name", "organisation", "organization",
                                "business", "firm", "org"), _optional, "text"),
        "address": FieldSpec("address", "Address", False,
                             ("address", "full_address", "mailing_address", "street",
                              "address_line_1", "shipping_address"), _optional, "text"),
    },
)

ORDERS = DatasetSpec(
    key="orders",
    label="Orders (sales history)",
    description="Historic sales rows — one row per order line.",
    fields={
        "order_date": FieldSpec("order_date", "Order date", True,
                                ("date", "order_date", "sale_date", "transaction_date",
                                 "purchase_date", "invoice_date", "order_day", "day",
                                 "order_time", "date_of_sale"), _parse_date, "date"),
        "customer_name": FieldSpec("customer_name", "Customer name", True,
                                   ("customer", "customer_name", "buyer", "buyer_name",
                                    "client", "client_name", "contact", "account",
                                    "account_name", "customer_full_name"), _passthrough, "text"),
        "customer_email": FieldSpec("customer_email", "Customer email", False,
                                    ("customer_email", "buyer_email", "email", "client_email",
                                     "customer_email_address",
                                     "email_address",
                                     ), _optional, "email"),
        "customer_phone": FieldSpec("customer_phone", "Customer phone", False,
                                    ("customer_phone", "phone", "phone_number", "mobile",
                                     "buyer_phone", "client_phone", "contact_phone", "telephone",
                                     "tel", "cell"), _optional, "text"),
        "product_name": FieldSpec("product_name", "Product name", True,
                                  ("product", "product_name", "item", "item_name",
                                   "product_title", "product_description", "item_description"),
                                  _passthrough, "text"),
        "product_sku": FieldSpec("product_sku", "Product SKU", False,
                                 ("sku", "sku_code", "product_sku", "item_code", "product_code",
                                  "upc", "gtin"), _optional, "text"),
        "quantity": FieldSpec("quantity", "Quantity", True,
                              ("quantity", "qty", "units", "units_sold", "quantity_sold",
                               "items", "count"), _parse_int, "int"),
        "unit_price": FieldSpec("unit_price", "Selling price", False,
                                ("unit_price", "price", "selling_price", "sale_price",
                                 "price_each", "rate", "price_usd"), _parse_money, "money"),
        "total": FieldSpec("total", "Line total (reference only)", False,
                           ("total", "total_amount", "amount", "total_price", "order_total",
                            "subtotal", "line_total"), _parse_money, "money"),
        "order_id": FieldSpec("order_id", "Order reference (from your old system)", False,
                              ("order_id", "order_no", "order_number", "invoice_no",
                               "invoice_number", "transaction_id", "reference", "ref",
                               "sales_order"), _optional, "text"),
    },
)

DATASETS: dict[str, DatasetSpec] = {
    PRODUCTS.key: PRODUCTS,
    CUSTOMERS.key: CUSTOMERS,
    ORDERS.key: ORDERS,
}


# ---------------------------------------------------------------------------
# File parsing
# ---------------------------------------------------------------------------

@dataclass
class ParsedFile:
    filename: str
    fmt: str  # csv | xlsx
    headers: list[str]
    rows: list[list[str]]  # all data rows as strings
    error: Optional[str] = None


def parse_file(filename: str, data: bytes) -> ParsedFile:
    lower = filename.lower()
    try:
        if lower.endswith(".csv") or lower.endswith(".txt"):
            parsed = _parse_csv(data)
        elif lower.endswith(".xlsx"):
            parsed = _parse_xlsx(data)
        else:
            return ParsedFile(
                filename,
                "unknown",
                [],
                [],
                error="Unsupported file type. Use .csv or .xlsx.",
            )
        parsed.filename = filename  # provenance: keep the real file name
        return parsed
    except Exception as e:  # noqa: BLE001 — report any parse failure to the user
        return ParsedFile(filename, "unknown", [], [], error=f"Could not read the file: {e}")


def _parse_csv(data: bytes) -> ParsedFile:
    # Strip BOM, decode, sniff delimiter.
    text = data.decode("utf-8-sig", errors="replace")
    sample = text[:64 * 1024]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        delimiter = dialect.delimiter
    except csv.Error:
        # Heuristic fallback on the header line.
        header_line = sample.splitlines()[0] if sample else ""
        delimiter = max({",", ";", "\t"}, key=header_line.count, default=",")

    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = [r for r in reader if any(c.strip() for c in r)]
    if not rows:
        return ParsedFile("file", "csv", [], [], error="The file appears to be empty.")
    headers = [_clean_header(h) for h in rows[0]]
    body = [[(c if c is not None else "") for c in r] for r in rows[1:]]
    # Pad/trim rows to header width.
    width = len(headers)
    body = [(r + [""] * width)[:width] for r in body]
    return ParsedFile("file", "csv", headers, body)


def _parse_xlsx(data: bytes) -> ParsedFile:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb.worksheets[0]  # v1: first worksheet only
    rows = [[("" if c is None else str(c)) for c in row] for row in ws.iter_rows(values_only=True)]
    wb.close()
    rows = [r for r in rows if any(c.strip() for c in r)]
    if not rows:
        return ParsedFile("file", "xlsx", [], [], error="The first worksheet appears to be empty.")
    headers = [_clean_header(h) for h in rows[0]]
    width = len(headers)
    body = [(r + [""] * width)[:width] for r in rows[1:]]
    return ParsedFile("file", "xlsx", headers, body)


def _clean_header(h: Any) -> str:
    s = str(h or "").strip()
    return re.sub(r"\s+", " ", s)


# ---------------------------------------------------------------------------
# Sample-based column analysis
# ---------------------------------------------------------------------------

def _column_values(parsed: ParsedFile, idx: int, limit: int = 40) -> list[str]:
    return [r[idx] for r in parsed.rows[:limit] if idx < len(r) and r[idx].strip()]


def _looks_like(values: list[str], pred: Callable[[str], bool], threshold: float) -> bool:
    if not values:
        return False
    hits = sum(1 for v in values if pred(v))
    return hits / len(values) >= threshold


def _is_email(v: str) -> bool:
    return bool(EMAIL_RE.match(v.strip()))


def _is_money(v: str) -> bool:
    s = v.strip()
    if not s:
        return False
    if re.search(r"[$€£]\s?\d", s):
        return True
    return bool(re.fullmatch(r"-?\d{1,6}(\.\d{1,2})?", s.replace(",", "")))


def _is_intish(v: str) -> bool:
    s = v.strip().replace(",", "")
    return bool(re.fullmatch(r"-?\d{1,5}", s))


def _is_dateish(v: str) -> bool:
    try:
        _parse_date(v)
        return True
    except ValueError:
        return False


def _is_nameish(v: str) -> bool:
    s = v.strip()
    return (
        2 <= len(s) <= 60
        and not EMAIL_RE.match(s)
        and not _is_money(s)
        and re.search(r"[A-Za-z]", s)
    )


# ---------------------------------------------------------------------------
# Dataset detection
# ---------------------------------------------------------------------------

def _norm(s: str) -> str:
    return re.sub(r"[\s_\-]+", " ", s.strip().lower())


def _norm_name(s: str) -> str:
    """Exact-name key: collapse whitespace, casefold. ('John  SMITH' ~ 'john smith')."""
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def _norm_phone(s: str) -> str:
    """Exact-phone key: digits only; compare the last 10 so '+234 803 ...'
    and '234803...' match while shorter/other numbers do not."""
    digits = re.sub(r"\D", "", s or "")
    return digits[-10:] if len(digits) >= 10 else digits


# ---------------------------------------------------------------------------
# Customer resolution for order imports — safe matching, no guessing
# ---------------------------------------------------------------------------
#
# Resolution priority (highest first):
#   1. Exact email            (unique per tenant — never ambiguous)
#   2. Exact phone            (normalized to digits)
#   3. Exact normalized name
#   4. Create placeholder     (only when no identifying column matched at all)
#
# When 2+ existing customers match by name or phone, the row is REJECTED with
# an explanation instead of guessing — the user disambiguates by adding an
# email or phone column to the file.

@dataclass
class CustomerIndexes:
    by_email: dict  # email (lower) -> Customer   (unique per tenant)
    by_phone: dict  # normalized phone -> list[Customer]
    by_name: dict   # normalized name  -> list[Customer]


def build_customer_indexes(cust_rows) -> CustomerIndexes:
    by_email: dict = {}
    by_phone: dict = {}
    by_name: dict = {}
    for c in cust_rows:
        if c.email:
            by_email.setdefault(c.email.strip().lower(), c)
        if c.phone:
            ph = _norm_phone(c.phone)
            if ph:
                by_phone.setdefault(ph, []).append(c)
        if c.full_name:
            by_name.setdefault(_norm_name(c.full_name), []).append(c)
    return CustomerIndexes(by_email=by_email, by_phone=by_phone, by_name=by_name)


def resolve_customer(idx: CustomerIndexes, rec: dict[str, Any]) -> tuple:
    """Resolve an order row's customer without guessing.

    Returns ``(customer, status)`` where status is one of:
      ``matched``          — customer set
      ``unknown_email``    — an email was given but no customer has it
      ``ambiguous_phone``  — 2+ customers share that phone number
      ``ambiguous_name``   — 2+ customers share that (normalized) name
      ``create``           — nothing identifying matched; caller may create
                             a placeholder customer
    """
    email = (rec.get("cust_email") or "").strip().lower()
    if email:
        c = idx.by_email.get(email)
        if c is not None:
            return c, "matched"
        return None, "unknown_email"

    if rec.get("cust_phone"):
        cands = idx.by_phone.get(_norm_phone(rec["cust_phone"]), [])
        if len(cands) == 1:
            return cands[0], "matched"
        if len(cands) > 1:
            return None, "ambiguous_phone"
        # Phone given but nobody has it — fall through to name matching.

    name = (rec.get("cust_name") or "").strip()
    if name:
        cands = idx.by_name.get(_norm_name(name), [])
        if len(cands) == 1:
            return cands[0], "matched"
        if len(cands) > 1:
            return None, "ambiguous_name"

    return None, "create"


def detect_dataset(parsed: ParsedFile) -> tuple[Optional[str], float]:
    """Score each dataset against headers (alias hits) and sample shapes."""
    best_key: Optional[str] = None
    best_score = 0.0
    for ds in DATASETS.values():
        score = 0.0
        for idx, h in enumerate(parsed.headers):
            nh = _norm(h)
            if not nh:
                continue
            for spec in ds.fields.values():
                for alias in spec.aliases:
                    na = _norm(alias)
                    if nh == na:
                        score += 3.0
                        break
                    if len(na) >= 4 and (na in nh or nh in na):
                        score += 1.5
                        break
        # Sample-shape bonuses (orders files usually have a date + number mix).
        if ds.key == "orders" and parsed.rows:
            bonus = 0.0
            for idx, h in enumerate(parsed.headers):
                vals = _column_values(parsed, idx)
                if _looks_like(vals, _is_dateish, 0.6):
                    bonus += 1.0
                if _looks_like(vals, _is_money, 0.6):
                    bonus += 0.5
            score += bonus
        if score > best_score:
            best_score = score
            best_key = ds.key
    if best_score < 3.0:
        return None, 0.0
    return best_key, min(best_score / 12.0, 1.0)


# ---------------------------------------------------------------------------
# Mapping engine — the v1 deterministic mapper (LLM seam in v2)
# ---------------------------------------------------------------------------

@dataclass
class SuggestedMapping:
    column: str
    target: Optional[str]  # field key or None (ignored / review)
    confidence: float
    label: str  # High | Medium | Review
    hints: list[str] = field(default_factory=list)


def _ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def suggest_mapping(parsed: ParsedFile, dataset_key: str) -> list[SuggestedMapping]:
    ds = DATASETS[dataset_key]
    header_norms = [_norm(h) for h in parsed.headers]

    # Candidate (column, field, score) triples.
    cands: list[tuple[int, str, float, list[str]]] = []
    for ci, h in enumerate(parsed.headers):
        nh = header_norms[ci]
        if not nh:
            continue
        vals = _column_values(parsed, ci)
        for fi, spec in ds.fields.items():
            score = 0.0
            hints: list[str] = []
            for alias in spec.aliases:
                na = _norm(alias)
                if nh == na:
                    score = max(score, 0.95)
                    hints.append(f"header matches “{alias}”")
                    break
                if len(na) >= 4 and (na in nh or nh in na):
                    score = max(score, 0.8)
                    hints.append(f"header resembles “{alias}”")
                    break
            else:
                best_r = max((_ratio(nh, _norm(a)) for a in spec.aliases), default=0.0)
                if best_r >= 0.62:
                    score = max(score, 0.5 + 0.35 * best_r)
                    hints.append("header is similar")
            # Sample-shape evidence (boosts, and catches unnamed/odd headers).
            if spec.kind == "email" and _looks_like(vals, _is_email, 0.5):
                score = max(score, 0.88)
                hints.append("values look like emails")
            elif spec.kind == "date" and _looks_like(vals, _is_dateish, 0.6):
                score = max(score, 0.85)
                hints.append("values look like dates")
            elif (
                spec.kind == "money"
                and _looks_like(vals, _is_money, 0.6)
                and _looks_like(vals, _is_intish, 0.0)
            ):
                score = max(score, 0.7)
                hints.append("values look like money")
            elif spec.kind == "int" and _looks_like(vals, _is_intish, 0.8):
                score = max(score, 0.6)
                hints.append("values look like whole numbers")
            elif spec.kind == "text" and _looks_like(vals, _is_nameish, 0.8):
                score = max(score, 0.45)
                hints.append("values look like names/text")
            if score > 0.4:
                cands.append((ci, fi, score, hints))

    # Greedy assignment: highest-score pairs first, each column/field used once.
    cands.sort(key=lambda c: -c[2])
    col_used: dict[int, tuple[str, float, list[str]]] = {}
    field_used: set[str] = set()
    for ci, fi, score, hints in cands:
        if ci in col_used or fi in field_used:
            continue
        col_used[ci] = (fi, score, hints)
        field_used.add(fi)

    result: list[SuggestedMapping] = []
    for ci, h in enumerate(parsed.headers):
        if ci in col_used:
            fi, score, hints = col_used[ci]
            label = "High" if score >= 0.85 else "Medium" if score >= 0.6 else "Review"
            result.append(SuggestedMapping(h, fi, round(score, 2), label, hints))
        else:
            result.append(
                SuggestedMapping(
                    h, None, 0.0, "Review", ["no confident match — pick a target or ignore"]
                )
            )
    return result


def mapping_schemas_payload() -> dict[str, Any]:
    """Dataset/field metadata for the mapping review UI (single source of truth)."""
    return {
        "datasets": {
            ds.key: {
                "label": ds.label,
                "description": ds.description,
                "fields": {
                    k: {"label": s.label, "required": s.required, "kind": s.kind}
                    for k, s in ds.fields.items()
                },
            }
            for ds in DATASETS.values()
        }
    }


# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Import validation + executor
#
# Trust model (v1 Instant Onboarding):
#   preview (parse) -> map (suggest) -> VALIDATE (read-only) -> user confirms
#   -> COMMIT (the only path that writes, in one transaction, stamped with
#   an ImportBatch for provenance).
# ---------------------------------------------------------------------------

@dataclass
class ImportValidation:
    """Read-only pre-write validation result (spec item 6)."""

    dataset: str
    total_rows: int
    valid_rows: int
    duplicates: dict[str, int]  # existing -> would be skipped
    unknown_refs: dict[str, int]  # mapped refs not found in Co-op
    would_create: dict[str, int]  # new records the import would create
    errors: list[dict[str, Any]]  # first 20 row errors
    error_fields: dict[str, int]  # per-field error counts
    ambiguous: dict[str, int]  # rows that would be REJECTED (2+ matches)
    warnings: list[str]


@dataclass
class ImportResult:
    dataset: str
    batch_id: int
    total_rows: int
    created: dict[str, int]
    skipped: dict[str, int]
    errors: list[dict[str, Any]]
    warnings: list[str]


def _slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:40] or "item"


def _build_field_col(parsed: ParsedFile, dataset_key: str, mapping: dict[str, Optional[str]]):
    ds = DATASETS[dataset_key]
    col_index = {h: i for i, h in enumerate(parsed.headers)}
    field_col: dict[str, Optional[int]] = {k: None for k in ds.fields}
    for source, field_key in mapping.items():
        if field_key and field_key in ds.fields and source in col_index:
            field_col[field_key] = col_index[source]
    return ds, field_col


def _cell(row: list[str], field_col: dict[str, Optional[int]], field_key: str) -> str:
    ci = field_col.get(field_key)
    if ci is None or ci >= len(row):
        return ""
    return row[ci]


def _parse_product_row(row, field_col):
    """Return (record|None, error_detail|None)."""
    try:
        name = _passthrough(_cell(row, field_col, "name"))
        price = _parse_money(_cell(row, field_col, "unit_price"))
    except ValueError as e:
        field = (
            "name"
            if "empty value" in str(e) and not _cell(row, field_col, "name").strip()
            else "unit_price"
        )
        return None, f"missing/invalid {field}: {e}"
    rec: dict[str, Any] = {"name": name, "unit_price": price}
    try:
        rec["sku"] = _optional(_cell(row, field_col, "sku")) or ""
    except ValueError:
        rec["sku"] = ""
    for fkey in ("description", "category"):
        rec[fkey] = _optional(_cell(row, field_col, fkey))
    for fkey, parse in (
        ("cost_price", _parse_money),
        ("current_stock", _parse_int),
        ("reorder_level", _parse_int),
    ):
        raw = _cell(row, field_col, fkey).strip()
        if not raw:
            rec[fkey] = None
            continue
        try:
            rec[fkey] = parse(raw)
        except ValueError:
            return None, f"invalid {fkey} value {raw!r}"
    return rec, None


def _parse_customer_row(row, field_col):
    try:
        name = _passthrough(_cell(row, field_col, "full_name"))
    except ValueError:
        return None, "missing/invalid customer name"
    rec: dict[str, Any] = {
        "full_name": name,
        "email": _optional(_cell(row, field_col, "email")) or "",
    }
    for fkey in ("phone", "company", "address"):
        rec[fkey] = _optional(_cell(row, field_col, fkey))
    return rec, None


def _parse_order_row(row, field_col):
    try:
        date_iso = _parse_date(_cell(row, field_col, "order_date"))
    except ValueError:
        return None, "missing/invalid order date"
    try:
        cust_name = _passthrough(_cell(row, field_col, "customer_name"))
    except ValueError:
        return None, "missing/invalid customer name"
    try:
        prod_name = _passthrough(_cell(row, field_col, "product_name"))
    except ValueError:
        return None, "missing/invalid product name"
    try:
        qty = _parse_int(_cell(row, field_col, "quantity"))
        if qty < 1:
            return None, "quantity must be at least 1"
    except ValueError:
        return None, "missing/invalid quantity"
    price_raw = _cell(row, field_col, "unit_price").strip()
    price = None
    if price_raw:
        try:
            price = _parse_money(price_raw)
        except ValueError:
            return None, f"invalid price value {price_raw!r}"
    return {
        "date": date_iso,
        "cust_name": cust_name,
        "cust_email": _optional(_cell(row, field_col, "customer_email")) or "",
        "cust_phone": _optional(_cell(row, field_col, "customer_phone")) or "",
        "prod_name": prod_name,
        "prod_sku": _optional(_cell(row, field_col, "product_sku")) or "",
        "qty": qty,
        "price": price,
        "ref": _optional(_cell(row, field_col, "order_id")) or "",
    }, None


# ---------------------------------------------------------------------------
# Read-only validation (spec item 6) — runs BEFORE any database writes
# ---------------------------------------------------------------------------

async def validate_import(
    db,
    business_id: int,
    parsed: ParsedFile,
    dataset_key: str,
    mapping: dict[str, Optional[str]],
) -> ImportValidation:
    from .models import Customer, Product
    from sqlalchemy import select

    ds, field_col = _build_field_col(parsed, dataset_key, mapping)
    parser = {
        "products": _parse_product_row,
        "customers": _parse_customer_row,
        "orders": _parse_order_row,
    }[dataset_key]

    errors: list[dict[str, Any]] = []
    error_fields: dict[str, int] = {}
    records: list[dict[str, Any]] = []
    for row_no, row in enumerate(parsed.rows, start=2):
        rec, err = parser(row, field_col)
        if err:
            errors.append({"row": row_no, "detail": err})
            # bucket by the leading field word ("invalid price", "missing/invalid order date"…)
            key = (
                err.split(":")[0]
                .replace("missing/invalid", "missing")
                .replace("invalid", "invalid")
            )
            error_fields[key] = error_fields.get(key, 0) + 1
            continue
        records.append(rec)

    duplicates: dict[str, int] = {"existing": 0, "in_file": 0}
    unknown_refs: dict[str, int] = {}
    would_create: dict[str, int] = {"products": 0, "customers": 0, "orders": 0, "order_items": 0}
    ambiguous: dict[str, int] = {"customers": 0, "products": 0}

    if dataset_key == "products":
        existing_skus = {
            r[0].lower() for r in (await db.execute(
                select(Product.sku).where(Product.business_id == business_id,
                                          Product.deleted_at.is_(None),
                                          Product.sku.is_not(None),
                                          )
                                          )
                                          ).all()
        }
        existing_names = {
            r[0].lower() for r in (await db.execute(
                select(Product.name).where(Product.business_id == business_id,
                                           Product.deleted_at.is_(None)))).all()
        }
        seen: set = set()
        for rec in records:
            key = (rec["sku"].lower() if rec["sku"] else None) or (rec["name"].lower(),)
            if key in seen:
                duplicates["in_file"] += 1
                continue
            seen.add(key)
            if (rec["sku"] and rec["sku"].lower() in existing_skus) or (
                not rec["sku"] and rec["name"].lower() in existing_names
            ):
                duplicates["existing"] += 1
                continue
            would_create["products"] += 1

    elif dataset_key == "customers":
        existing_emails = {
            (r[0] or "").lower() for r in (await db.execute(
                select(Customer.email).where(Customer.business_id == business_id,
                                             Customer.deleted_at.is_(None)))).all()
        }
        seen_emails: set = set()
        for rec in records:
            email = rec["email"].lower() or f"(generated){rec['full_name'].lower()}"
            if email in seen_emails:
                duplicates["in_file"] += 1
                continue
            seen_emails.add(email)
            if rec["email"] and rec["email"].lower() in existing_emails:
                duplicates["existing"] += 1
                continue
            would_create["customers"] += 1

    else:  # orders
        from .models import Order

        cust_rows = (await db.execute(select(Customer).where(
            Customer.business_id == business_id, Customer.deleted_at.is_(None)))).scalars().all()
        cust_idx = build_customer_indexes(cust_rows)
        prod_rows = (await db.execute(select(Product).where(
            Product.business_id == business_id, Product.deleted_at.is_(None)))).scalars().all()
        prod_by_sku = {p.sku.lower(): p for p in prod_rows if p.sku}
        prod_by_name: dict[str, list[Product]] = {}
        for p in prod_rows:
            if p.name:
                prod_by_name.setdefault(_norm_name(p.name), []).append(p)

        # Same idempotency check the commit runs (read-only here).
        existing_refs = {
            r[0].lower() for r in (await db.execute(
                select(Order.source_order_ref).where(
                    Order.business_id == business_id,
                    Order.deleted_at.is_(None),
                    Order.source_order_ref.is_not(None),
                ))).all()
            if r[0] and r[0].strip()
        }

        unknown_customers = 0
        unknown_products = 0
        pending_new_cust: set[str] = set()
        seen_refs: set[str] = set()
        seen_rows: set = set()
        for rec in records:
            # Order reference already imported (DB) or duplicated in this file.
            ref_key = (rec.get("ref") or "").strip().lower()
            if ref_key:
                if ref_key in existing_refs:
                    duplicates["existing"] += 1
                    continue
                if ref_key in seen_refs:
                    duplicates["in_file"] += 1
                    continue
                seen_refs.add(ref_key)

            # Customer: same safe resolution the commit uses — ambiguous rows
            # would be REJECTED, not guessed.
            _, cust_status = resolve_customer(cust_idx, rec)
            if cust_status == "unknown_email":
                unknown_customers += 1
            elif cust_status in ("ambiguous_name", "ambiguous_phone"):
                ambiguous["customers"] += 1
            elif cust_status == "create":
                key = _norm_name(rec["cust_name"])
                if key not in pending_new_cust:
                    pending_new_cust.add(key)
                    would_create["customers"] += 1  # would be created with a placeholder email

            # Product: exact SKU -> exact name; ambiguous name would reject.
            if rec["prod_sku"] and rec["prod_sku"].lower() in prod_by_sku:
                pass
            else:
                cands = prod_by_name.get(_norm_name(rec["prod_name"]), [])
                if len(cands) == 1:
                    pass
                elif len(cands) > 1:
                    ambiguous["products"] += 1
                else:
                    unknown_products += 1  # no match at all — created only if price exists

            dedup = (rec["cust_email"].lower() or rec["cust_name"].lower(), rec["date"],
                     rec["prod_sku"].lower() or rec["prod_name"].lower(), rec["qty"],
                     round(rec["price"], 2) if rec["price"] else None)
            if dedup in seen_rows:
                duplicates["in_file"] += 1
                continue
            seen_rows.add(dedup)
            if cust_status not in ("unknown_email", "ambiguous_name", "ambiguous_phone"):
                would_create["orders"] += 1
                would_create["order_items"] += 1
        unknown_refs["customers"] = unknown_customers
        unknown_refs["products"] = unknown_products

    warnings: list[str] = []
    if dataset_key == "customers" and field_col.get("email") is None:
        warnings.append("No email column was mapped — placeholder emails will be generated for"
            "deduplication.")
    if dataset_key == "orders":
        warnings.append("Imported sales will be recorded as delivered history; current stock is NOT"
            "decremented.")

    return ImportValidation(
        dataset=dataset_key,
        total_rows=len(parsed.rows),
        valid_rows=len(records),
        duplicates=duplicates,
        unknown_refs=unknown_refs,
        would_create=would_create,
        errors=errors[:20],
        error_fields=error_fields,
        ambiguous=ambiguous,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Commit — the ONLY path that writes (one transaction, batch-stamped)
# ---------------------------------------------------------------------------

async def execute_import(
    db,
    business_id: int,
    parsed: ParsedFile,
    dataset_key: str,
    mapping: dict[str, Optional[str]],
) -> ImportResult:
    from .models import Customer, ImportBatch, Order, OrderItem, OrderStatus, Product
    from sqlalchemy import select

    ds, field_col = _build_field_col(parsed, dataset_key, mapping)
    if parsed.error:
        raise ValueError(parsed.error)

    # Provenance: one batch per committed import (spec item 9).
    batch = ImportBatch(business_id=business_id, dataset=dataset_key,
                        filename=parsed.filename or None, row_count=len(parsed.rows))
    db.add(batch)
    await db.flush()  # assign batch.id

    created = {"products": 0, "customers": 0, "orders": 0, "order_items": 0}
    skipped = {"existing": 0, "in_file": 0, "errors": 0}
    errors: list[dict[str, Any]] = []
    warnings: list[str] = []

    def row_error(row_no: int, detail: str) -> None:
        skipped["errors"] += 1
        if len(errors) < 20:
            errors.append({"row": row_no, "detail": detail})

    if dataset_key == "products":
        existing_skus = {
            r[0].lower() for r in (await db.execute(select(Product.sku).where(
                Product.business_id == business_id,
                Product.deleted_at.is_(None),
                Product.sku.is_not(None),
            )
        )).all()
        }
        existing_names = {
            r[0].lower() for r in (await db.execute(select(Product.name).where(
                Product.business_id == business_id, Product.deleted_at.is_(None)))).all()
        }
        seen: set = set()
        gen_n = 0
        for row_no, row in enumerate(parsed.rows, start=2):
            rec, err = _parse_product_row(row, field_col)
            if err:
                row_error(row_no, err)
                continue
            key = (rec["sku"].lower() if rec["sku"] else None) or (rec["name"].lower(),)
            if key in seen:
                skipped["in_file"] += 1
                continue
            seen.add(key)
            if (rec["sku"] and rec["sku"].lower() in existing_skus) or (
                not rec["sku"] and rec["name"].lower() in existing_names
            ):
                skipped["existing"] += 1
                continue
            gen_n += 1
            p = Product(
                business_id=business_id,
                name=rec["name"],
                sku=rec["sku"] or f"IMP-{_slug(rec['name'])[:24] or 'item'}-{gen_n:03d}",
                description=rec["description"],
                category=rec["category"],
                unit_price=rec["unit_price"],
                cost_price=rec["cost_price"],
                current_stock=rec["current_stock"] or 0,
                reorder_level=rec["reorder_level"] or 5,
                created_by="import",
                import_batch_id=batch.id,
            )
            db.add(p)
            created["products"] += 1
        if not created["products"] and skipped["existing"] == 0:
            warnings.append("No new products were created.")

    elif dataset_key == "customers":
        existing_emails = {
            (r[0] or "").lower() for r in (await db.execute(select(Customer.email).where(
                Customer.business_id == business_id, Customer.deleted_at.is_(None)))).all()
        }
        seen_emails: set = set()
        gen_n = 0
        for row_no, row in enumerate(parsed.rows, start=2):
            rec, err = _parse_customer_row(row, field_col)
            if err:
                row_error(row_no, err)
                continue
            email = rec["email"].lower()
            if not email:
                gen_n += 1
                email = f"{_slug(rec['full_name'])}-{gen_n:03d}@{PLACEHOLDER_EMAIL_DOMAIN}"
            if email in seen_emails:
                skipped["in_file"] += 1
                continue
            seen_emails.add(email)
            if email in existing_emails:
                skipped["existing"] += 1
                continue
            c = Customer(
                business_id=business_id,
                full_name=rec["full_name"],
                email=email,
                phone=rec["phone"],
                company=rec["company"],
                address=rec["address"],
                created_by="import",
                import_batch_id=batch.id,
            )
            db.add(c)
            created["customers"] += 1
        if field_col.get("email") is None:
            warnings.append("No email column was mapped — placeholder emails were generated for"
                "deduplication.")
        if not created["customers"] and skipped["existing"] == 0:
            warnings.append("No new customers were created.")

    else:  # orders
        import datetime as _dt
        cust_rows = (await db.execute(select(Customer).where(
            Customer.business_id == business_id, Customer.deleted_at.is_(None)))).scalars().all()
        cust_idx = build_customer_indexes(cust_rows)
        prod_rows = (await db.execute(select(Product).where(
            Product.business_id == business_id, Product.deleted_at.is_(None)))).scalars().all()
        prod_by_sku = {p.sku.lower(): p for p in prod_rows if p.sku}
        prod_by_name: dict[str, list[Product]] = {}
        for p in prod_rows:
            if p.name:
                prod_by_name.setdefault(_norm_name(p.name), []).append(p)

        # Idempotency (external order reference): an order number already
        # imported for this tenant can never create a second order.
        existing_refs = {
            r[0].lower() for r in (await db.execute(
                select(Order.source_order_ref).where(
                    Order.business_id == business_id,
                    Order.deleted_at.is_(None),
                    Order.source_order_ref.is_not(None),
                ))).all()
            if r[0] and r[0].strip()
        }

        gen_cust_n = 0
        gen_prod_n = 0
        new_customers: dict[str, Customer] = {}
        new_products: dict[str, Product] = {}
        seen_refs: set[str] = set()
        seen_rows: set = set()
        ref_skipped = 0
        ambiguous_name_rows = 0
        ambiguous_phone_rows = 0
        for row_no, row in enumerate(parsed.rows, start=2):
            rec, err = _parse_order_row(row, field_col)
            if err:
                row_error(row_no, err)
                continue

            # Idempotency: a reference already in the DB (previous import) or
            # seen earlier in this file skips the row instead of duplicating.
            ref = rec["ref"].strip()
            ref_key = ref.lower()
            if ref_key:
                if ref_key in existing_refs or ref_key in seen_refs:
                    skipped["existing"] += 1
                    ref_skipped += 1
                    continue
                seen_refs.add(ref_key)

            # Customer resolution — email -> exact phone -> exact name ->
            # placeholder. Never guess: ambiguous name/phone rejects the row
            # with an instruction to disambiguate (see resolve_customer).
            customer, cust_status = resolve_customer(cust_idx, rec)
            if cust_status == "unknown_email":
                row_error(
                    row_no,
                    f"customer email {rec['cust_email']!r} not found — import customers "
                    "first or map the name only",
                )
                continue
            if cust_status == "ambiguous_name":
                ambiguous_name_rows += 1
                row_error(
                    row_no,
                    f"multiple customers are named {rec['cust_name']!r} — add an email or "
                    "phone column to disambiguate",
                )
                continue
            if cust_status == "ambiguous_phone":
                ambiguous_phone_rows += 1
                row_error(
                    row_no,
                    "multiple customers share this phone number — add an email column "
                    "to disambiguate",
                )
                continue
            if cust_status == "create":
                gen_cust_n += 1
                key = _norm_name(rec["cust_name"])
                if key not in new_customers:
                    gen_cust_email = (
                        f"{_slug(rec['cust_name'])}-{gen_cust_n:03d}"
                        f"@{PLACEHOLDER_EMAIL_DOMAIN}"
                    )
                    c = Customer(
                        business_id=business_id, full_name=rec["cust_name"],
                        email=gen_cust_email, created_by="import", import_batch_id=batch.id)
                    db.add(c)
                    await db.flush()  # assign id so orders can reference it
                    new_customers[key] = c
                    cust_idx.by_email[gen_cust_email.lower()] = c
                customer = new_customers[key]

            # Product resolution — exact SKU -> exact name -> create (needs a
            # price). Ambiguous product name rejects the row (never guess).
            product = prod_by_sku.get(rec["prod_sku"].lower()) if rec["prod_sku"] else None
            if product is None:
                cands = prod_by_name.get(_norm_name(rec["prod_name"]), [])
                if len(cands) == 1:
                    product = cands[0]
                elif len(cands) > 1:
                    row_error(
                        row_no,
                        f"multiple products are named {rec['prod_name']!r} — map a SKU "
                        "column to disambiguate",
                    )
                    continue
            price = rec["price"]
            if product is None:
                if price is None:
                    row_error(
                        row_no,
                        "unknown product with no price to create from — import products "
                        "first or map a price",
                    )
                    continue
                key = _norm_name(rec["prod_name"])
                if key not in new_products:
                    gen_prod_n += 1
                    p = Product(
                        business_id=business_id, name=rec["prod_name"],
                        sku=(
                            rec["prod_sku"]
                            or f"IMP-{_slug(rec['prod_name'])[:24] or 'item'}-{gen_prod_n:03d}"
                        ),
                        unit_price=price, created_by="import", import_batch_id=batch.id)
                    db.add(p)
                    await db.flush()  # assign id so order items can reference it
                    new_products[key] = p
                product = new_products[key]
            if price is None:
                price = product.unit_price or 0.0
            if price <= 0:
                row_error(
                    row_no,
                    "no selling price available — map a price column or import the "
                    "product first",
                )
                continue

            dedup = (rec["cust_email"].lower() or rec["cust_name"].lower(), rec["date"],
                     (
                         rec["prod_sku"].lower() or rec["prod_name"].lower(),
                         rec["qty"],
                         round(price, 2),
                     ))
            if dedup in seen_rows:
                skipped["in_file"] += 1
                continue
            seen_rows.add(dedup)

            o = Order(
                business_id=business_id,
                customer_id=customer.id,
                order_date=_dt.date.fromisoformat(rec["date"]),
                status=OrderStatus.delivered,  # historic backfill
                total_amount=round(rec["qty"] * price, 2),
                created_by="import",
                import_batch_id=batch.id,
                source_order_ref=ref or None,
            )
            db.add(o)
            await db.flush()  # assign o.id before the line items reference it
            db.add(OrderItem(
                business_id=business_id,
                order_id=o.id,
                product_id=product.id,
                quantity=rec["qty"],
                unit_price=price,
                total_price=round(rec["qty"] * price, 2),
                created_by="import",
                import_batch_id=batch.id,
            ))
            created["orders"] += 1
            created["order_items"] += 1

        if ref_skipped:
            warnings.append(
                f"{ref_skipped} rows already exist under the same order reference "
                "and were skipped."
            )
        if ambiguous_name_rows:
            warnings.append(
                f"{ambiguous_name_rows} rows skipped — multiple customers share a "
                "name; add an email or phone column to disambiguate."
            )
        if ambiguous_phone_rows:
            warnings.append(
                f"{ambiguous_phone_rows} rows skipped — multiple customers share a "
                "phone number; add an email column to disambiguate."
            )
        if gen_cust_n:
            warnings.append(
                f"{gen_cust_n} customers had no email column — placeholder emails "
                "were generated."
            )
        if gen_prod_n:
            warnings.append(
                f"{gen_prod_n} products were created from order rows (price taken "
                "from the sale where available)."
            )
        if created["orders"]:
            warnings.append(
                "Imported sales were recorded as delivered history; current stock "
                "was NOT decremented."
            )
        if not created["orders"] and skipped["errors"] == 0:
            warnings.append("No orders were created.")

    batch.created_count = sum(created.values())
    await db.commit()
    return ImportResult(
        dataset=dataset_key,
        batch_id=batch.id,
        total_rows=len(parsed.rows),
        created=created,
        skipped=skipped,
        errors=errors,
        warnings=warnings,
    )

