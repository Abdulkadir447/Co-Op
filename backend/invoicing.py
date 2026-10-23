"""Invoicing — one saved invoice per order, numbered per business.

The PRD lists "Invoice generation" as a v1 capability. Until now the only
invoice in the product was a printable modal rendered from order data: it had
no number, no record, and nothing a customer could be sent twice.

What this module adds is the *document record*:

* a per-business sequential number (``INV-0001``, ``INV-0002``, ...) that is
  stable once issued — the unique index ``(business_id, number)`` makes a
  collision impossible rather than unlikely;
* one invoice per order — ``(business_id, order_id)`` is unique, so "create
  invoice" can never double-issue paperwork to a customer;
* a document lifecycle (``draft`` -> ``sent`` -> ``void``) with issue/due
  dates and free-text notes.

What it deliberately does NOT do: store money. An invoice points at its order
and the order stays the single source of truth for amounts, so there is no
total column that can drift. Recording money *received* belongs to the
payments phase (a gateway decision) and is not here.
"""
from __future__ import annotations

import csv
import datetime as dt
import io

from .csvsafe import csv_safe
from typing import Any, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from .models import Business, Customer, Invoice, Order

INVOICE_STATUSES = ("draft", "sent", "void")
NUMBER_PREFIX = "INV"
_MAX_RETRIES = 5


class InvoiceError(ValueError):
    """An invoice could not be created, read or changed.

    ``reason`` is a stable machine-readable code (the route maps it to a
    status code); ``message`` is the owner-facing sentence.
    """

    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason
        self.message = message


def _now() -> dt.datetime:
    return dt.datetime.utcnow()


async def _sequence(db, business_id: int) -> int:
    """Next number in the business's sequence (1-based)."""
    count = (await db.execute(
        select(func.count(Invoice.id)).where(Invoice.business_id == business_id)
    )).scalar() or 0
    return int(count) + 1


def _number(seq: int) -> str:
    return f"{NUMBER_PREFIX}-{seq:04d}"


async def create_for_order(
    db,
    business: Business,
    order_id: int,
    issue_date: Optional[dt.datetime] = None,
    due_date: Optional[dt.datetime] = None,
    notes: Optional[str] = None,
    actor: Optional[str] = None,
) -> Invoice:
    """Create (or return) the invoice for one of this business's orders."""
    order = (await db.execute(
        select(Order).where(
            Order.id == order_id,
            Order.business_id == business.id,
            Order.deleted_at.is_(None),
        )
    )).scalars().first()
    if order is None:
        raise InvoiceError("order_not_found", "No such order.")

    existing = (await db.execute(
        select(Invoice).where(
            Invoice.business_id == business.id, Invoice.order_id == order.id
        )
    )).scalars().first()
    if existing is not None:
        raise InvoiceError(
            "already_invoiced", f"This order is already invoiced as {existing.number}."
        )

    issued = issue_date or _now()
    if due_date is not None and due_date < issued:
        raise InvoiceError("invalid_dates", "The due date cannot be before the issue date.")

    # The unique index on (business_id, number) is the real guard: if another
    # request numbered an invoice between our count and our insert, retry with
    # the next candidate instead of failing the owner's click.
    seq = await _sequence(db, business.id)
    for attempt in range(_MAX_RETRIES):
        row = Invoice(
            business_id=business.id,
            order_id=order.id,
            number=_number(seq + attempt),
            issue_date=issued,
            due_date=due_date,
            notes=(notes or None),
            status="draft",
            created_by=actor or business.owner_id,
            updated_by=actor or business.owner_id,
        )
        db.add(row)
        try:
            await db.flush()
            return row
        except IntegrityError:
            await db.rollback()
            seq = await _sequence(db, business.id)
    raise InvoiceError("numbering_conflict", "Could not allocate an invoice number — try again.")


async def get_invoice(db, business: Business, invoice_id: int) -> Invoice:
    row = (await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id, Invoice.business_id == business.id
        )
    )).scalars().first()
    if row is None:
        raise InvoiceError("not_found", "No such invoice.")
    return row


async def update_invoice(
    db,
    business: Business,
    invoice_id: int,
    issue_date: Optional[dt.datetime] = None,
    due_date: Optional[dt.datetime] = None,
    notes: Optional[str] = None,
    status: Optional[str] = None,
    actor: Optional[str] = None,
) -> Invoice:
    """Edit the document fields. A void invoice is terminal — it is paperwork
    a customer may already hold, so it cannot be silently rewritten."""
    row = await get_invoice(db, business, invoice_id)
    if row.status == "void":
        raise InvoiceError("voided", "A void invoice cannot be changed.")
    if status is not None:
        status = status.strip().lower()
        if status not in INVOICE_STATUSES:
            raise InvoiceError(
                "invalid_status", f"status must be one of: {', '.join(INVOICE_STATUSES)}"
            )
        row.status = status
    if issue_date is not None:
        row.issue_date = issue_date
    if due_date is not None:
        row.due_date = due_date
    if notes is not None:
        row.notes = notes or None
    if row.due_date is not None and row.due_date < row.issue_date:
        raise InvoiceError("invalid_dates", "The due date cannot be before the issue date.")
    row.updated_by = actor or business.owner_id
    await db.flush()
    return row


async def _load(
    db, business: Business, rows: list[Invoice]
) -> dict[int, tuple[Order, Optional[Customer]]]:
    """Orders (with their customer) for a page of invoices, in one query."""
    order_ids = [r.order_id for r in rows]
    if not order_ids:
        return {}
    orders = (await db.execute(
        select(Order)
        .options(selectinload(Order.customer))
        .where(Order.id.in_(order_ids), Order.business_id == business.id)
    )).scalars().all()
    return {o.id: (o, o.customer) for o in orders}


def to_dict(row: Invoice, order: Optional[Order], customer: Optional[Customer],
            currency: str = "USD") -> dict[str, Any]:
    status = (order.status.value if order and hasattr(order.status, "value") else
              (order.status if order else None))
    return {
        "id": row.id,
        "number": row.number,
        "status": row.status,
        "issue_date": row.issue_date.isoformat() if row.issue_date else None,
        "due_date": row.due_date.isoformat() if row.due_date else None,
        "notes": row.notes,
        "currency": currency,
        "total": float(order.total_amount) if order else 0.0,
        "order": {
            "id": order.id,
            "status": status,
            "order_date": order.order_date.isoformat() if order and order.order_date else None,
            "total_amount": float(order.total_amount) if order else 0.0,
        } if order else None,
        "customer": {
            "id": customer.id,
            "full_name": customer.full_name,
            "email": customer.email,
        } if customer else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


async def list_invoices(
    db,
    business: Business,
    search: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
) -> dict[str, Any]:
    """The Invoices list — same envelope shape as every other list endpoint."""
    if status:
        status = status.strip().lower()
        if status not in INVOICE_STATUSES:
            raise InvoiceError(
                "invalid_status", f"status must be one of: {', '.join(INVOICE_STATUSES)}"
            )

    base = (
        select(Invoice)
        .join(Order, Order.id == Invoice.order_id)
        .join(Customer, Customer.id == Order.customer_id)
        .where(Invoice.business_id == business.id)
    )
    if status:
        base = base.where(Invoice.status == status)
    if search:
        like = f"%{search.strip()}%"
        base = base.where(or_(
            Invoice.number.ilike(like),
            Customer.full_name.ilike(like),
            Customer.email.ilike(like),
        ))

    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar() or 0
    rows = list((await db.execute(
        base.order_by(Invoice.id.desc()).offset((page - 1) * limit).limit(limit)
    )).scalars().all())

    orders = await _load(db, business, rows)
    return {
        "items": [
            to_dict(r, *(orders.get(r.order_id, (None, None))), currency=business.currency or "USD")
            for r in rows
        ],
        "total": int(total),
        "page": page,
        "limit": limit,
    }


async def detail(db, business: Business, invoice_id: int) -> dict[str, Any]:
    row = await get_invoice(db, business, invoice_id)
    orders = await _load(db, business, [row])
    order, customer = orders.get(row.order_id, (None, None))
    return to_dict(row, order, customer, currency=business.currency or "USD")


def render_csv(business: Business, items: list[dict[str, Any]]) -> bytes:
    """CSV of exactly the rows the list is showing."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Invoice number", "Status", "Issue date", "Due date", "Order",
        "Customer", "Email", "Total", "Currency",
    ])
    for it in items:
        writer.writerow([
            it["number"],
            it["status"],
            (it["issue_date"] or "")[:10],
            (it["due_date"] or "")[:10],
            it["order"]["id"] if it["order"] else "",
            # Customer names are user input: keep them text, never a formula.
            csv_safe(it["customer"]["full_name"]) if it["customer"] else "",
            csv_safe(it["customer"]["email"] or "") if it["customer"] else "",
            f"{it['total']:.2f}",
            it["currency"],
        ])
    return buf.getvalue().encode("utf-8")
