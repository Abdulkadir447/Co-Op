"""Backup & Restore (PRD Phase 4 "Backup system") — v1 scope, honest by design.

  * **Export** — a JSON snapshot of the tenant's business data (products,
    customers, orders + items, stock movements), downloaded by the owner.
    Read-only; never changes the database.
  * **Restore** — upload a Co-op backup. Allowed ONLY into an empty business
    (no products/customers/orders/movements yet): restoring into a live
    business would mean merging or clobbering data, so we refuse with a
    clear message instead of guessing. Restored rows keep their ``client_id``
    (sync idempotency) but get fresh server ids, with all cross-references
    re-mapped.
  * The desktop app additionally backs up the local SQLite file (Electron
    main process, ``electron/db/backup.js``).

Entity field allow-lists are explicit — the module never reflects columns,
so the backup format is a stable, reviewed contract.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    Business,
    Customer,
    Order,
    OrderItem,
    OrderStatus,
    Product,
    StockMovement,
    StockMovementReason,
)

BACKUP_APP = "coop"
BACKUP_VERSION = 1

_BACKUP_KEY_ENV = "BACKUP_ENCRYPTION_KEY"
# A stable fallback so dev/test always works; production MUST set
# BACKUP_ENCRYPTION_KEY (or SECRET) — backups are only restorable with the
# same key, so rotate with care (checklist 38: encrypted backup files).
_DEV_FALLBACK = "coop-backup-default-key-not-for-production"


def _fernet_key() -> bytes:
    """Derive a Fernet key from BACKUP_ENCRYPTION_KEY, else SECRET, else a dev
    constant. The same key must be present at export and restore time."""
    raw = os.getenv(_BACKUP_KEY_ENV) or os.getenv("SECRET") or _DEV_FALLBACK
    return base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest())


def encrypt_backup(payload: dict[str, Any]) -> dict[str, Any]:
    """Wrap a built backup in an encrypted envelope (Fernet/AES-128-CBC+HMAC).

    The plaintext business data never leaves the server unencrypted: the
    downloaded file holds only a ciphertext blob.
    """
    token = Fernet(_fernet_key()).encrypt(json.dumps(payload, default=str).encode())
    return {
        "app": BACKUP_APP,
        "encrypted": True,
        "version": BACKUP_VERSION,
        "ciphertext": token.decode(),
    }


def decrypt_backup(payload: dict[str, Any]) -> dict[str, Any]:
    """Return the inner backup dict.

    Accepts both the encrypted envelope (current) and a legacy plaintext
    backup, so files exported before encryption still restore.
    """
    if not isinstance(payload, dict):
        raise BackupValidationError("This file is not a Co-op backup.")
    if not payload.get("encrypted"):
        return payload
    try:
        inner = json.loads(Fernet(_fernet_key()).decrypt(payload["ciphertext"].encode()))
    except (InvalidToken, KeyError, ValueError, TypeError) as e:
        raise BackupValidationError(
            "This backup could not be decrypted — wrong key or corrupt file."
        ) from e
    return inner

# Field allow-lists, in restore order (referenced entities first).
ENTITY_FIELDS: dict[str, tuple[str, ...]] = {
    "products": (
        "id", "client_id", "sku", "name", "description", "category",
        "unit_price", "cost_price", "current_stock", "reorder_level",
        "deleted_at", "created_at", "updated_at",
    ),
    "customers": (
        "id", "client_id", "full_name", "email", "phone", "address",
        "company", "deleted_at", "created_at", "updated_at",
    ),
    "orders": (
        "id", "client_id", "source_order_ref", "customer_id", "order_date",
        "status", "total_amount", "deleted_at", "created_at", "updated_at",
    ),
    "order_items": (
        "id", "order_id", "product_id", "quantity", "unit_price", "total_price",
    ),
    "stock_movements": (
        "id", "client_id", "product_id", "order_id", "change", "reason",
        "note", "actor", "created_at",
    ),
}

_RESTORE_ORDER = ("products", "customers", "orders", "order_items", "stock_movements")


class BackupValidationError(ValueError):
    """The uploaded file is not a valid Co-op backup (400)."""


class RestoreRefused(ValueError):
    """The restore is structurally fine but not allowed right now (409)."""


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    # SQLAlchemy enums (OrderStatus, StockMovementReason) are str-mixin
    # enums, whose Python 3.11+ str() is "OrderStatus.pending" — export
    # their bare value instead.
    if isinstance(value, Enum):
        return str(value.value)
    return str(value)


def _row_to_dict(model: Any, fields: tuple[str, ...]) -> dict[str, Any]:
    return {f: _iso(getattr(model, f, None)) for f in fields}


async def _collect(db: AsyncSession, model: Any, business_id: int) -> list[Any]:
    rows = (
        await db.execute(
            select(model).where(model.business_id == business_id).order_by(model.id)
        )
    ).scalars().all()
    return list(rows)


async def build_backup(db: AsyncSession, business: Business) -> dict[str, Any]:
    """Snapshot every entity of the tenant, in a stable, versioned format."""
    data: dict[str, Any] = {}
    for entity, fields in ENTITY_FIELDS.items():
        if entity == "products":
            rows = await _collect(db, Product, business.id)
        elif entity == "customers":
            rows = await _collect(db, Customer, business.id)
        elif entity == "orders":
            rows = await _collect(db, Order, business.id)
        elif entity == "order_items":
            rows = await _collect(db, OrderItem, business.id)
        else:
            rows = await _collect(db, StockMovement, business.id)
        data[entity] = [_row_to_dict(r, fields) for r in rows]
    return {
        "app": BACKUP_APP,
        "version": BACKUP_VERSION,
        "exported_at": datetime.utcnow().isoformat(),
        "business": {"name": business.name, "currency": business.currency or "USD"},
        "entities": data,
    }


async def _has_any_data(db: AsyncSession, business_id: int) -> bool:
    for model in (Product, Customer, Order, StockMovement):
        n = (
            await db.execute(
                select(func.count()).select_from(model).where(model.business_id == business_id)
            )
        ).scalar() or 0
        if n:
            return True
    return False


def _check_status(value: Any) -> str:
    if not isinstance(value, str) or value not in {s.value for s in OrderStatus}:
        raise BackupValidationError(f"Invalid order status {value!r} in backup.")
    return value


def _check_reason(value: Any) -> str:
    if not isinstance(value, str) or value not in {s.value for s in StockMovementReason}:
        raise BackupValidationError(f"Invalid stock movement reason {value!r} in backup.")
    return value


def _check_required(row: dict[str, Any], entity: str, required: tuple[str, ...]) -> None:
    for key in required:
        if row.get(key) is None:
            raise BackupValidationError(f"Backup {entity} row is missing '{key}'.")


def _rows_for(payload: dict[str, Any], entity: str) -> list[dict[str, Any]]:
    raw = payload.get("entities", {}).get(entity) or []
    if not isinstance(raw, list):
        raise BackupValidationError(f"Backup section '{entity}' must be a list.")
    rows: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            raise BackupValidationError(f"Backup section '{entity}' contains a non-object row.")
        rows.append(item)
    return rows


async def restore_backup(
    db: AsyncSession,
    business: Business,
    payload: dict[str, Any],
) -> dict[str, int]:
    """Restore a validated backup into an EMPTY business (see module docstring).

    Returns ``{"restored": {entity: count}}``. Raises BackupValidationError
    (invalid file) or RestoreRefused (business not empty) — the route maps
    these to 400/409. One transaction: any failure rolls back everything.
    """
    if not isinstance(payload, dict) or payload.get("app") != BACKUP_APP:
        raise BackupValidationError("This file is not a Co-op backup.")
    try:
        version = int(payload.get("version", -1))
    except (TypeError, ValueError):
        raise BackupValidationError("Backup version is missing or invalid.")
    if version != BACKUP_VERSION:
        raise BackupValidationError(
            f"Unsupported backup version {version} (expected {BACKUP_VERSION})."
        )
    entities = payload.get("entities")
    if not isinstance(entities, dict) or not entities:
        raise BackupValidationError("Backup contains no entities.")
    unknown = sorted(set(entities) - set(ENTITY_FIELDS))
    if unknown:
        raise BackupValidationError(f"Unknown entity sections in backup: {unknown}")

    if await _has_any_data(db, business.id):
        raise RestoreRefused(
            "Restore is only available while the business is empty. "
            "Your current data is untouched — download the backup file to keep it."
        )

    id_map: dict[str, dict[int, int]] = {"customers": {}, "products": {}, "orders": {}}
    restored: dict[str, int] = {}

    try:
        # --- Products -------------------------------------------------------
        for row in _rows_for(payload, "products"):
            _check_required(row, "products", ("sku", "name"))
            p = Product(
                business_id=business.id,
                client_id=row.get("client_id"),
                sku=str(row["sku"])[:100],
                name=str(row["name"])[:255],
                description=row.get("description"),
                category=row.get("category"),
                unit_price=float(row.get("unit_price") or 0.0),
                # cost_price is nullable, so cast only when present. The export
                # stringifies every value (_iso), and SQLite coerces "4.0" back
                # to a number silently — Postgres/asyncpg does not, so an
                # uncast string here fails the insert on the real database.
                cost_price=float(row["cost_price"]) if row.get("cost_price") is not None else None,
                current_stock=int(row.get("current_stock") or 0),
                reorder_level=int(row.get("reorder_level") or 0),
                deleted_at=_parse_dt(row.get("deleted_at")),
                created_by="backup-restore",
            )
            db.add(p)
            await db.flush()
            if row.get("id") is not None:
                id_map["products"][int(row["id"])] = p.id
        restored["products"] = len(_rows_for(payload, "products"))

        # --- Customers ------------------------------------------------------
        for row in _rows_for(payload, "customers"):
            _check_required(row, "customers", ("full_name", "email"))
            c = Customer(
                business_id=business.id,
                client_id=row.get("client_id"),
                full_name=str(row["full_name"])[:255],
                email=str(row["email"])[:255],
                phone=row.get("phone"),
                address=row.get("address"),
                company=row.get("company"),
                deleted_at=_parse_dt(row.get("deleted_at")),
                created_by="backup-restore",
            )
            db.add(c)
            await db.flush()
            if row.get("id") is not None:
                id_map["customers"][int(row["id"])] = c.id
        restored["customers"] = len(_rows_for(payload, "customers"))

        # --- Orders ---------------------------------------------------------
        for row in _rows_for(payload, "orders"):
            _check_required(row, "orders", ("customer_id",))
            old_customer = int(row["customer_id"])
            if old_customer not in id_map["customers"]:
                raise BackupValidationError(
                    f"Backup order references customer id {old_customer} "
                    "which is not in the backup."
                )
            o = Order(
                business_id=business.id,
                client_id=row.get("client_id"),
                source_order_ref=row.get("source_order_ref"),
                customer_id=id_map["customers"][old_customer],
                order_date=_parse_dt(row.get("order_date")),
                status=OrderStatus(_check_status(row.get("status") or "pending")),
                total_amount=float(row.get("total_amount") or 0.0),
                deleted_at=_parse_dt(row.get("deleted_at")),
                created_by="backup-restore",
            )
            db.add(o)
            await db.flush()
            if row.get("id") is not None:
                id_map["orders"][int(row["id"])] = o.id
        restored["orders"] = len(_rows_for(payload, "orders"))

        # --- Order items ----------------------------------------------------
        for row in _rows_for(payload, "order_items"):
            _check_required(row, "order_items", ("order_id", "product_id"))
            old_order = int(row["order_id"])
            old_product = int(row["product_id"])
            if old_order not in id_map["orders"] or old_product not in id_map["products"]:
                raise BackupValidationError(
                    "Backup order item references an order or product that is not in the backup."
                )
            db.add(
                OrderItem(
                    business_id=business.id,
                    order_id=id_map["orders"][old_order],
                    product_id=id_map["products"][old_product],
                    quantity=int(row.get("quantity") or 0),
                    unit_price=float(row.get("unit_price") or 0.0),
                    total_price=float(row.get("total_price") or 0.0),
                    created_by="backup-restore",
                )
            )
        restored["order_items"] = len(_rows_for(payload, "order_items"))

        # --- Stock movements (the immutable ledger travels with the data) ---
        for row in _rows_for(payload, "stock_movements"):
            _check_required(row, "stock_movements", ("product_id", "change", "reason"))
            old_product = int(row["product_id"])
            if old_product not in id_map["products"]:
                raise BackupValidationError(
                    "Backup stock movement references a product that is not in the backup."
                )
            old_order = row.get("order_id")
            db.add(
                StockMovement(
                    business_id=business.id,
                    client_id=row.get("client_id"),
                    product_id=id_map["products"][old_product],
                    order_id=id_map["orders"].get(int(old_order)) if old_order else None,
                    change=int(row["change"]),
                    reason=StockMovementReason(_check_reason(row["reason"])),
                    note=row.get("note"),
                    actor=row.get("actor") or "backup-restore",
                )
            )
        restored["stock_movements"] = len(_rows_for(payload, "stock_movements"))

        await db.flush()
    except IntegrityError:
        # e.g. a backup with duplicate client_ids — nothing may half-restore.
        await db.rollback()
        raise BackupValidationError(
            "The backup contains duplicate client ids and cannot be restored safely."
        )
    return {"restored": restored}


def _parse_dt(value: Any) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def backup_json(payload: dict[str, Any]) -> str:
    """Serialise helper (routes use JSONResponse directly; kept for tests)."""
    return json.dumps(payload, default=_iso)
