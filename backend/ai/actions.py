"""Action registry (Pass 5) — the fixed set of things Zeno may PROPOSE.

The model never gets arbitrary API access. It may only propose actions from
this registry; every proposed action is validated HERE (schema + business
rules, tenant-scoped) before it reaches the UI. The UI then shows a review
card and only an explicit user confirmation runs an existing Co-op API.

    LLM draft -> schema validation -> business-rule validation (this file)
              -> UI review -> USER CONFIRMS -> existing API executes

Trust boundary: proposals that fail validation are rejected with a reason;
the AI never creates, edits or deletes data on its own.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select

from ..importer import _norm_name, build_customer_indexes, resolve_customer
from ..models import Customer, Product

# Navigation the assistant may point the owner to (evidence links).
ALLOWED_LINK_TARGETS: tuple[str, ...] = (
    "/",
    "/products",
    "/inventory",
    "/inventory?stock=low",
    "/inventory?stock=out",
    "/customers",
    "/orders",
    "/briefing",
    "/import",
)

# The complete v1 registry. New capabilities are added here — deliberately.
ACTION_REGISTRY: dict[str, dict[str, str]] = {
    "DRAFT_ORDER": {
        "description": (
            "Prepare an order the owner reviews; executes via the existing "
            "Create Order flow."
        ),
    },
}


def validate_links(links: list[Any]) -> list[dict[str, str]]:
    """Keep only links pointing at allow-listed targets."""
    out = []
    for link in links or []:
        to = getattr(link, "to", None) or (link.get("to") if isinstance(link, dict) else None)
        label = getattr(link, "label", None) or (
            link.get("label") if isinstance(link, dict) else None
        )
        if to in ALLOWED_LINK_TARGETS and label:
            out.append({"label": str(label)[:60], "to": to})
    return out[:3]


async def _resolve_draft_order(
    db, business_id: int, params: dict[str, Any]
) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    """Resolve + validate a DRAFT_ORDER proposal. Returns (resolved, error).

    Uses the SAME safe customer resolution as the importer: exact email,
    then unique normalized name — ambiguous names are rejected, never
    guessed. Products: exact SKU, then unique normalized name. Stock and
    price are checked against the live row; the draft only ever references
    data that already exists (the AI never creates records).
    """
    customer_name = str(params.get("customer_name") or "").strip()
    customer_email = str(params.get("customer_email") or "").strip().lower()
    product_name = str(params.get("product_name") or "").strip()
    product_sku = str(params.get("product_sku") or "").strip().lower()
    try:
        quantity = int(params.get("quantity") or 0)
    except (TypeError, ValueError):
        return None, "quantity must be a whole number"
    if quantity < 1 or quantity > 10_000:
        return None, "quantity must be between 1 and 10,000"

    if not customer_name:
        return None, "no customer named in the request"

    # --- Customer (safe resolution, tenant-scoped) --------------------------
    cust_rows = (await db.execute(
        select(Customer).where(Customer.business_id == business_id, Customer.deleted_at.is_(None))
    )).scalars().all()
    customer, status = resolve_customer(
        build_customer_indexes(cust_rows),
        {"cust_email": customer_email, "cust_name": customer_name},
    )
    if status in ("ambiguous_name", "ambiguous_phone"):
        return (
            None,
            f"multiple customers match {customer_name!r} — the owner should "
            "choose manually",
        )
    if status == "unknown_email":
        return None, f"no customer with email {customer_email!r}"
    if status == "create" or customer is None:
        return None, f"{customer_name!r} is not in Co-op yet — import your customers first"

    # --- Product (exact SKU -> unique normalized name) ----------------------
    prod_rows = (await db.execute(
        select(Product).where(Product.business_id == business_id, Product.deleted_at.is_(None))
    )).scalars().all()
    product = None
    if product_sku:
        product = next((p for p in prod_rows if (p.sku or "").lower() == product_sku), None)
    if product is None and product_name:
        cands = [p for p in prod_rows if _norm_name(p.name) == _norm_name(product_name)]
        if len(cands) == 1:
            product = cands[0]
        elif len(cands) > 1:
            return None, f"multiple products are named {product_name!r}"
    if product is None:
        return None, "no matching product found"

    # --- Stock + price (live row) -------------------------------------------
    stock = product.current_stock or 0
    if stock < quantity:
        return None, f"only {stock} of {product.name!r} in stock"
    unit_price = params.get("unit_price")
    try:
        unit_price = (
            float(unit_price)
            if unit_price is not None and float(unit_price) > 0
            else (product.unit_price or 0)
        )
    except (TypeError, ValueError):
        unit_price = product.unit_price or 0
    if unit_price <= 0:
        return None, f"{product.name!r} has no selling price"

    return {
        "customer": {"id": customer.id, "full_name": customer.full_name, "email": customer.email},
        "lines": [{
            "product_id": product.id,
            "name": product.name,
            "sku": product.sku or "",
            "quantity": quantity,
            "unit_price": round(unit_price, 2),
        }],
        "total": round(quantity * unit_price, 2),
        "note": f"{quantity} x {product.name} for {customer.full_name} — review before ordering.",
    }, None


async def validate_actions(
    actions: list[Any], db, business_id: int
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Validate every proposed action. Returns (accepted, rejected).

    ``accepted`` entries carry the RESOLVED parameters (real ids/prices) so
    the UI draft card shows exactly what would be executed.
    """
    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, str]] = []
    for action in actions or []:
        atype = getattr(action, "type", None) or (
            action.get("type") if isinstance(action, dict) else None
        )
        raw = getattr(action, "parameters", None) or (
            action.get("parameters") if isinstance(action, dict) else None
        ) or {}
        params = dict(raw) if isinstance(raw, dict) else {}
        if atype not in ACTION_REGISTRY:
            rejected.append({"type": str(atype), "reason": "not a supported action"})
            continue
        if atype == "DRAFT_ORDER":
            resolved, err = await _resolve_draft_order(db, business_id, params)
            if err:
                rejected.append({"type": atype, "reason": err})
            else:
                accepted.append({"type": atype, "parameters": resolved})
        else:  # pragma: no cover — registry is closed in v1
            rejected.append({"type": str(atype), "reason": "not available yet"})
    return accepted, rejected
