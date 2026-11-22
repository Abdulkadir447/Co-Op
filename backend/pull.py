"""Co-op sync — cloud -> local PULL (OFFLINE 3, Part 1).

Builds the mirror payload the desktop app downloads to populate (and later
refresh) its local SQLite mirror. This is the server half of the initial
pull + reconnect refresh; the renderer downloads it (with the Clerk token)
and hands it to the main-process mirror module, which upserts it into SQLite
by stable identity (client_id, falling back to server id for cloud-native
rows).

Full vs. delta:
  * No ``since``  -> full dump (initial pull). Includes soft-deleted rows so
                     the mirror can reflect deletions.
  * ``since`` set -> delta: rows with ``updated_at >= (since - 1s)`` (and,
                     for the immutable stock_movements ledger,
                     ``created_at >= (since - 1s)``). Comparing against a
                     floor one second BEFORE the cursor makes deltas
                     at-least-once: a row updated in the same second as the
                     cursor is re-delivered (harmless — the client upserts
                     idempotently by client_id) instead of being lost. The
                     1-second step is what makes the same-second guarantee
                     hold on SQLite, where CURRENT_TIMESTAMP stores
                     'YYYY-MM-DD HH:MM:SS' but SQLAlchemy binds datetime
                     parameters as 'YYYY-MM-DD HH:MM:SS.ffffff' — in that
                     text comparison a plain ``>= cursor`` sorts same-second
                     rows BELOW the bound value and would drop them from
                     every future delta.

The payload is read-only and carries no secrets. Each record carries both
``id`` (server id) and ``client_id`` (ULID, or null for cloud-native rows) so
the local/cloud identity mapping stays stable (OFFLINE 3 requirement). The
returned ``cursor`` is second-precision and monotone non-decreasing
(max(now, incoming since)) so the ``>=`` delta is at-least-once and never
regresses.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import select

from . import money
from .models import Business, Customer, Order, OrderItem, Product, StockMovement


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt is not None else None


def _biz(model, **fields: Any) -> dict[str, Any]:
    """Serialise a row to the mirror shape: id + client_id + fields + deleted_at."""
    out: dict[str, Any] = {"id": model.id, "client_id": getattr(model, "client_id", None)}
    for k, v in fields.items():
        out[k] = v
    return out


def _enum_value(v: Any) -> Any:
    return v.value if hasattr(v, "value") else v


async def build_pull_payload(
    db, business: Business, since: Optional[datetime] = None
) -> dict[str, Any]:
    """Build the mirror payload for a business (full dump, or delta since ``since``)."""
    bid = business.id

    # Normalise the incoming cursor to SECOND precision. The outgoing cursor
    # is monotone non-decreasing (max of now and the incoming cursor), also
    # at second precision, so the cursor never regresses.
    if since is not None:
        since = since.replace(microsecond=0)

    # AT-LEAST-ONCE FLOOR: deltas compare against (cursor - 1s). On Postgres
    # (real timestamps) this is a harmless 1-second overlap that idempotent
    # client upserts absorb. On SQLite it is REQUIRED for same-second rows:
    # CURRENT_TIMESTAMP stores 'YYYY-MM-DD HH:MM:SS' (second precision) while
    # SQLAlchemy binds datetime parameters with a 6-digit fractional suffix
    # ('YYYY-MM-DD HH:MM:SS.ffffff'). In that text comparison a same-second
    # row ('...:47') sorts BELOW the bound cursor ('...:47.000000'), so a
    # plain ``>= cursor`` would silently drop every same-second row from
    # every future delta. Stepping the floor back one second puts every
    # same-second row strictly above the bound value on both backends.
    floor = since - timedelta(seconds=1) if since is not None else None

    def _updated(model):
        return [model.updated_at >= floor] if floor is not None else []

    def _created(model):
        return [model.created_at >= floor] if floor is not None else []

    customers = (
        (await db.execute(
            select(Customer).where(Customer.business_id == bid, *_updated(Customer))
        )).scalars().all()
    )
    products = (
        (await db.execute(
            select(Product).where(Product.business_id == bid, *_updated(Product))
        )).scalars().all()
    )
    orders = (
        (await db.execute(
            select(Order).where(Order.business_id == bid, *_updated(Order))
        )).scalars().all()
    )
    order_items = (
        (await db.execute(
            select(OrderItem).where(OrderItem.business_id == bid, *_updated(OrderItem))
        )).scalars().all()
    )
    # stock_movements is immutable: filter on created_at for deltas.
    movements = (
        (await db.execute(
            select(StockMovement).where(StockMovement.business_id == bid, *_created(StockMovement))
        )).scalars().all()
    )

    customers_out = [
        _biz(
            c,
            full_name=c.full_name, email=c.email, phone=c.phone, address=c.address,
            company=c.company, deleted_at=_iso(c.deleted_at), updated_at=_iso(c.updated_at),
        )
        for c in customers
    ]
    products_out = [
        _biz(
            p,
            sku=p.sku, name=p.name, description=p.description, category=p.category,
            unit_price=p.unit_price, cost_price=p.cost_price,
            current_stock=p.current_stock, reorder_level=p.reorder_level,
            deleted_at=_iso(p.deleted_at), updated_at=_iso(p.updated_at),
        )
        for p in products
    ]
    orders_out = [
        _biz(
            o,
            customer_id=o.customer_id, status=_enum_value(o.status),
            total_amount=o.total_amount, order_date=_iso(o.order_date),
            deleted_at=_iso(o.deleted_at), updated_at=_iso(o.updated_at),
        )
        for o in orders
    ]
    order_items_out = [
        _biz(
            it,
            order_id=it.order_id, product_id=it.product_id, quantity=it.quantity,
            unit_price=it.unit_price, total_price=it.total_price,
            deleted_at=_iso(it.deleted_at), updated_at=_iso(it.updated_at),
        )
        for it in order_items
    ]
    movements_out = [
        {
            "id": m.id, "client_id": m.client_id, "product_id": m.product_id,
            "change": m.change, "reason": _enum_value(m.reason), "note": m.note,
            "order_id": m.order_id, "created_at": _iso(m.created_at),
        }
        for m in movements
    ]

    business_out = {
        "id": business.id,
        "name": business.name,
        "currency": business.currency,
        "industry": business.industry,
        "address": business.address,
        "phone": business.phone,
        "tax_id": business.tax_id,
        "website": business.website,
        "timezone": business.timezone,
        "updated_at": _iso(business.updated_at),
    }

    # Second-precision, monotone non-decreasing cursor (max of now and the
    # incoming cursor) so the ``>=`` delta is at-least-once and never
    # regresses across pulls.
    now_trunc = datetime.utcnow().replace(microsecond=0)
    new_cursor = now_trunc if since is None or now_trunc >= since else since

    # Mirror payload: money crosses as JSON numbers (backend/money.py). Without
    # this the mirror would receive "100.00" as a string and store it as one.
    return money.jsonable({
        "cursor": new_cursor.isoformat(),
        "since": _iso(since),
        "business": business_out,
        "customers": customers_out,
        "products": products_out,
        "orders": orders_out,
        "order_items": order_items_out,
        "stock_movements": movements_out,
        "counts": {
            "customers": len(customers_out),
            "products": len(products_out),
            "orders": len(orders_out),
            "order_items": len(order_items_out),
            "stock_movements": len(movements_out),
        },
    })
