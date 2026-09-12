"""SQLAlchemy ORM models for Co-op backend.

Implements the BSD Chapter 1 backend foundation:

  * Multi-tenant isolation  — every business table carries ``business_id``
    (BSD Ch1.8 / Ch1.17). Single-owner dev keeps it NULL; the column is
    the isolation key once multi-business lands.
  * Soft delete           — ``deleted_at`` on every major entity (BSD Ch1.17).
  * Optimistic concurrency — ``version`` column (BSD Ch1.17) lets the sync
    layer detect conflicts without locking.
  * Domain tables          — ``businesses`` (AFD Ch1.10 Company Setup),
    ``sync_queue`` (BSD Ch1.9 / Ch1.17), ``audit_log`` (BSD Ch1.17),
    ``analytics_snapshots`` (BSD Ch1.17 session-based report cache).

Timestamps (``created_at`` / ``updated_at``) are maintained by the ORM via
``server_default`` + ``onupdate`` so they stay correct without DB triggers.
"""

from __future__ import annotations

from enum import Enum

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Base class for all ORM models (SQLAlchemy 2.0 style)."""

    __abstract__ = True


# ---------------------------------------------------------------------------
# Business (tenant root) — AFD Ch1.10 Company Setup, BSD Ch1.8 multi-tenant
# ---------------------------------------------------------------------------
class Business(Base):
    """A tenant. Every record in the system belongs to exactly one business."""

    __tablename__ = "businesses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    owner_id = Column(String(255), index=True)        # Clerk user id of the owner
    owner_email = Column(String(255), index=True)     # business contact email (editable)
    industry = Column(String(100))
    currency = Column(String(8), default="USD")
    # Company profile fields (UXDS 15.6, Task 9) — additive, nullable.
    address = Column(String(500))
    phone = Column(String(20))
    tax_id = Column(String(100))
    website = Column(String(255))
    timezone = Column(String(64))
    # Ask Zeno answer style preference (0009): concise | standard | detailed.
    ai_response_style = Column(
        String(20), default="standard", server_default="standard", nullable=False
    )
    created_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    updated_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime, nullable=True)  # soft delete (BSD Ch1.17 / Ch2.12)
    deleted_by = Column(String(255), nullable=True)   # BSD Ch2.12 soft delete actor
    version = Column(Integer, default=1, nullable=False)  # optimistic lock (BSD Ch1.17 / Ch2.9)


class Product(Base):
    """Product entity. Includes relationship to ``OrderItem``."""

    __tablename__ = "products"
    # SKU uniqueness is TENANT-SCOPED and applies only to live rows
    # (Task 10 / audit fix B-1): two businesses may share a SKU, and a
    # soft-deleted product's SKU can be re-used. Partial unique index —
    # supported natively by Postgres/Supabase and SQLite.
    __table_args__ = (
        Index(
            "uq_products_business_sku",
            "business_id",
            "sku",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True)            # tenant isolation
    sku = Column(String(100), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(String(1000))
    category = Column(String(100))
    unit_price = Column(Float, nullable=False)
    cost_price = Column(Float)
    current_stock = Column(Integer, default=0)
    reorder_level = Column(Integer, default=5)
    created_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    updated_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime, nullable=True)          # soft delete (BSD Ch1.17 / Ch2.12)
    deleted_by = Column(String(255), nullable=True)   # BSD Ch2.12 soft delete actor
    version = Column(Integer, default=1, nullable=False)  # optimistic lock (BSD Ch1.17 / Ch2.9)
    # provenance: NULL = created live
    import_batch_id = Column(Integer, ForeignKey("import_batches.id"), nullable=True)
    # client-generated ULID (offline idempotency key)
    client_id = Column(String(26), nullable=True, unique=True)

    order_items = relationship(
        "OrderItem",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Product id={self.id} sku={self.sku!r} name={self.name!r}>"


class Customer(Base):
    """Customer entity (``customers`` table)."""

    __tablename__ = "customers"
    # Email is unique PER BUSINESS among LIVE rows only (Task 11 / audit H2):
    # two businesses may share a customer email, and a soft-deleted customer's
    # email becomes reusable — mirroring the products SKU rule. Partial unique
    # index, supported natively by Postgres/Supabase and SQLite.
    __table_args__ = (
        Index(
            "uq_customers_business_email",
            "business_id",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True)            # tenant isolation
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    phone = Column(String(20))
    address = Column(String(500))
    company = Column(String(255))
    password_hash = Column(String(255), nullable=True)
    created_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    updated_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime, nullable=True)          # soft delete (BSD Ch1.17 / Ch2.12)
    deleted_by = Column(String(255), nullable=True)   # BSD Ch2.12 soft delete actor
    version = Column(Integer, default=1, nullable=False)  # optimistic lock (BSD Ch1.17 / Ch2.9)
    # provenance: NULL = created live
    import_batch_id = Column(Integer, ForeignKey("import_batches.id"), nullable=True)
    # client-generated ULID (offline idempotency key)
    client_id = Column(String(26), nullable=True, unique=True)

    orders = relationship(
        "Order",
        back_populates="customer",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Customer id={self.id} email={self.email!r}>"


class OrderStatus(str, Enum):
    """Enum for order status values used by the ``orders`` table."""

    pending = "pending"
    confirmed = "confirmed"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"


# ---------------------------------------------------------------------------
# Import provenance (v1 Instant Onboarding, item 9)
#
# Every row created by the Intelligent Importer is stamped with the
# ``ImportBatch`` that created it. ``import_batch_id IS NULL`` means the
# record was created live in Co-op (manual/live); a set value means it came
# from that import batch — giving a clean split between "imported history"
# and "today's live sales", and making undoing an import a batch delete.
# ---------------------------------------------------------------------------
class ImportBatch(Base):
    """One uploaded file that was imported (one dataset per batch)."""

    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True, nullable=False)
    dataset = Column(String(20), nullable=False)  # products | customers | orders
    filename = Column(String(255))
    row_count = Column(Integer, default=0)
    created_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())



class Order(Base):
    """Order entity (``orders`` table)."""

    __tablename__ = "orders"
    # Imported orders carry the source system's order reference
    # (``source_order_ref``) so a re-import of the same file is idempotent:
    # the same external reference can never create a second order per
    # business (partial unique index — mirrors the products SKU rule).
    # Native (live) orders leave it NULL.
    __table_args__ = (
        Index(
            "uq_orders_business_source_ref",
            "business_id",
            "source_order_ref",
            unique=True,
            postgresql_where=text("deleted_at IS NULL AND source_order_ref IS NOT NULL"),
            sqlite_where=text("deleted_at IS NULL AND source_order_ref IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True)            # tenant isolation
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    order_date = Column(DateTime, server_default=func.now())
    # native_enum=False keeps `status` a VARCHAR so the ORM-created schema
    # matches the Alembic baseline migration on every database (Task 11 / H4).
    status = Column(
        SAEnum(OrderStatus, native_enum=False),
        default=OrderStatus.pending,
        nullable=False,
    )
    total_amount = Column(Float, nullable=False, default=0.0)
    created_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    updated_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime, nullable=True)          # soft delete (BSD Ch1.17 / Ch2.12)
    deleted_by = Column(String(255), nullable=True)   # BSD Ch2.12 soft delete actor
    version = Column(Integer, default=1, nullable=False)  # optimistic lock (BSD Ch1.17 / Ch2.9)
    # provenance: NULL = created live
    import_batch_id = Column(Integer, ForeignKey("import_batches.id"), nullable=True)
    # client-generated ULID (offline idempotency key)
    client_id = Column(String(26), nullable=True, unique=True)
    # external order number from the old system (import idempotency)
    source_order_ref = Column(String(100), nullable=True)

    customer = relationship("Customer", back_populates="orders")
    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Order id={self.id} status={self.status.value!r}>"


class OrderItem(Base):
    """OrderItem entity (``order_items`` table)."""

    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True)            # tenant isolation
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)  # price at the moment of ordering
    total_price = Column(Float, nullable=False)
    created_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    updated_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime, nullable=True)          # soft delete (BSD Ch1.17 / Ch2.12)
    deleted_by = Column(String(255), nullable=True)   # BSD Ch2.12 soft delete actor
    version = Column(Integer, default=1, nullable=False)  # optimistic lock (BSD Ch1.17 / Ch2.9)
    # provenance: NULL = created live
    import_batch_id = Column(Integer, ForeignKey("import_batches.id"), nullable=True)
    # client-generated ULID (offline idempotency key)
    client_id = Column(String(26), nullable=True, unique=True)

    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<OrderItem id={self.id} order_id={self.order_id} "
            f"product_id={self.product_id} qty={self.quantity}>"
        )


# ---------------------------------------------------------------------------
# Stock movements — append-only inventory ledger (BSD Ch9 ``stock_movements``,
# UXDS 11.12). Every change to ``products.current_stock`` writes exactly one
# row here. Movements are immutable: no update/delete columns by design.
# ---------------------------------------------------------------------------
class StockMovementReason(str, Enum):
    initial = "initial"                      # initial stock at product creation
    purchase = "purchase"                    # manual adjustment reasons (UXDS 11.11)
    sale = "sale"
    damaged = "damaged"
    returned = "returned"
    correction = "correction"
    order = "order"                          # automatic: order created
    order_cancelled = "order_cancelled"      # automatic: order cancelled
    order_deleted = "order_deleted"          # automatic: order deleted


class StockMovement(Base):
    """One immutable row per stock change (audit trail, Task 8)."""

    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True, nullable=False)   # tenant isolation
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    change = Column(Integer, nullable=False)                    # signed quantity delta
    # VARCHAR, not a native Postgres enum, for parity with the Alembic
    # baseline (Task 11 / H4).
    reason = Column(SAEnum(StockMovementReason, native_enum=False), nullable=False)
    note = Column(String(500))
    order_id = Column(Integer, nullable=True)                   # set for order-driven moves
    actor = Column(String(255))                                 # Clerk user id
    created_at = Column(DateTime, server_default=func.now())
    # client-generated ULID (offline idempotency key)
    client_id = Column(String(26), nullable=True, unique=True)

    product = relationship("Product")


# ---------------------------------------------------------------------------
# Profile — local user profile, keyed to the Clerk identity (BSD Ch3.11).
# Supabase is the storage layer for Co-op; identity comes from Clerk, so the
# profile is keyed by the Clerk user id and lives in Supabase Postgres.
# ---------------------------------------------------------------------------
class AiUsage(Base):
    """One metered AI request (AI Platform phase, Pass 4).

    Every successful /ai/chat request writes exactly one row: model, tokens
    and the credits charged under the current credit policy. Billing reads
    this ledger — it never re-derives usage from anywhere else, and the
    policy (credits per request / per 1k output tokens) lives in config,
    not in the AI engine, so pricing can change without touching AI code.
    """

    __tablename__ = "ai_usage"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True, nullable=False)
    user_id = Column(String(255))  # Clerk user id
    # idempotency key (client-generated or server-assigned)
    request_id = Column(String(64), index=True)
    model = Column(String(64))
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    credits_used = Column(Integer, default=0)
    answer_kind = Column(String(20))  # fact | calculation | forecast | suggestion | draft | clarify
    created_at = Column(DateTime, server_default=func.now())

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<AiUsage business={self.business_id} model={self.model!r} "
            f"credits={self.credits_used}>"
        )


class AiHistory(Base):
    """One answered AI turn (AI Platform phase — AI history deliverable).

    ``ai_usage`` meters cost (tokens/credits); ``ai_history`` is what the
    OWNER sees: the question, the answered kind/title and a short summary.
    One row per completed /ai/chat turn (assistant answers and grounded
    clarify answers). Failed/unanswered requests are NOT recorded — the
    history shows what Co-op actually answered, tenant-scoped like
    everything else.
    """

    __tablename__ = "ai_history"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True, nullable=False)
    user_id = Column(String(255))  # Clerk user id of the asker
    request_id = Column(String(64), index=True)
    question = Column(Text, nullable=False)
    answer_kind = Column(String(20))  # fact | calculation | forecast | suggestion | draft | clarify
    answer_title = Column(String(255))
    answer_summary = Column(Text)  # truncated message — full answers stay in the conversation
    report_key = Column(String(20))  # which report the turn was about, if any
    model = Column(String(64))
    credits_used = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())


class Subscription(Base):
    """The business's active plan (Real Billing phase).

    One row per business. Credits are NOT stored here — they are computed
    from the plan's monthly allowance (config) minus the SUM of the
    ``ai_usage`` ledger for the current calendar month, so the ledger stays
    the single source of truth and there is no balance to drift.

    Payments are deliberately out of scope for this phase: plan changes are
    real server-side state (enforcement + remaining are real), but nothing
    is charged until a payment provider is connected.
    """

    __tablename__ = "subscriptions"
    __table_args__ = (
        Index("uq_subscriptions_business", "business_id", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True, nullable=False)
    # free | starter | professional | enterprise
    plan = Column(String(20), nullable=False, default="free")
    status = Column(String(20), nullable=False, default="active")
    updated_by = Column(String(255), nullable=True)
    # --- Free trial (one per business, opt-in) -----------------------------
    # The trial NEVER overwrites ``plan``: it grants ``trial_plan`` for a
    # fixed window. Expiry is therefore lazy and needs no scheduler — once
    # ``trial_ends_at`` is in the past the effective plan is ``plan`` again
    # (free, unless the owner converted). ``trial_started_at`` doubles as the
    # "already used" marker, so a trial can never be restarted.
    trial_plan = Column(String(20), nullable=True)
    trial_started_at = Column(DateTime, nullable=True)
    trial_ends_at = Column(DateTime, nullable=True)
    # --- Licence (PRD Ch7 §7.19 / Ch8 §8.15) -------------------------------
    # Same shape as the trial, for the same reason: an activated licence
    # grants ``license_plan`` for a fixed window WITHOUT overwriting ``plan``,
    # so expiry is a pure function of (license_ends_at, now) — no scheduler,
    # no downgrade job. ``license_fingerprint`` links back to the ``licenses``
    # row (the key itself is never stored — see License below).
    license_plan = Column(String(20), nullable=True)
    license_seats = Column(Integer, nullable=True)
    license_started_at = Column(DateTime, nullable=True)
    license_ends_at = Column(DateTime, nullable=True)
    license_fingerprint = Column(String(64), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Subscription business={self.business_id} plan={self.plan!r}>"


class License(Base):
    """One issued Co-op licence (PRD Ch8 §8.15, activation per Ch7 §7.19).

    The ledger of every activation string the team has minted and what became
    of it. The key itself is NOT stored — only its SHA-256 ``fingerprint`` —
    so a database leak cannot be replayed as activation strings. A licence is
    bound to exactly one business, and ``revoked_at`` wins over a valid
    signature (see ``backend/licensing.py``).
    """

    __tablename__ = "licenses"
    __table_args__ = (
        Index("uq_licenses_fingerprint", "fingerprint", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True, nullable=False)
    fingerprint = Column(String(64), nullable=False)
    plan = Column(String(20), nullable=False)
    seats = Column(Integer, nullable=False, default=1)
    issued_at = Column(DateTime, nullable=True)
    activated_at = Column(DateTime, nullable=True)
    activated_by = Column(String(255), nullable=True)
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    revoked_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:  # pragma: no cover
        return f"<License business={self.business_id} plan={self.plan!r}>"


class Invoice(Base):
    """A saved invoice for one order (PRD "Invoice generation").

    Numbered per business (INV-0001, INV-0002, ...) so the paperwork a
    customer receives matches what the owner sees in the list. The money is
    deliberately NOT duplicated here: an invoice points at its order, and the
    order stays the single source of truth for the amounts — there is no
    total column that can drift.

    Lifecycle is a document lifecycle (draft -> sent -> void). Recording
    money received is the payments phase and lives elsewhere.
    """

    __tablename__ = "invoices"
    __table_args__ = (
        Index("uq_invoices_business_number", "business_id", "number", unique=True),
        Index("uq_invoices_business_order", "business_id", "order_id", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True, nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    number = Column(String(20), nullable=False)
    issue_date = Column(DateTime, nullable=False)
    due_date = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    # draft | sent | void
    status = Column(String(10), nullable=False, default="draft")
    created_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    updated_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    order = relationship("Order")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Invoice {self.number} order={self.order_id} status={self.status!r}>"


class Profile(Base):
    """Local user profile, linked to the Clerk identity.

    ``clerk_user_id`` stores the external auth user id (Clerk ``sub`` claim);
    the local integer ``id`` keeps the ORM layer backward-compatible with the
    rest of the schema (UUID primary keys are deferred per BSD Ch2.5).
    Authentication *tokens* are intentionally NOT stored here (BSD Ch3.17) —
    Clerk session tokens are verified per-request against Clerk's public JWKS.
    """

    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    clerk_user_id = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255))
    email = Column(String(255), unique=True, index=True)
    avatar_url = Column(String(1024))
    phone_number = Column(String(40))
    preferred_language = Column(String(16), default="en")
    timezone = Column(String(64))
    created_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    updated_by = Column(String(255), nullable=True)   # BSD Ch2.7 universal structure
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime, nullable=True)          # soft delete (BSD Ch1.17 / Ch2.12)
    deleted_by = Column(String(255), nullable=True)   # BSD Ch2.12 soft delete actor
    version = Column(Integer, default=1, nullable=False)  # optimistic lock (BSD Ch1.17 / Ch2.9)


# ---------------------------------------------------------------------------
# Sync queue — dedicated offline-first synchronization buffer (BSD Ch1.9 / Ch1.17)
# ---------------------------------------------------------------------------
class SyncQueue(Base):
    """One row per local mutation awaiting cloud replication."""

    __tablename__ = "sync_queue"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True)
    entity_type = Column(String(50), nullable=False)   # 'order' | 'product' | ...
    entity_id = Column(Integer, nullable=False)
    operation = Column(String(20), nullable=False)      # 'create' | 'update' | 'delete'
    payload = Column(Text)                             # JSON-serialised change
    status = Column(String(20), default="pending")     # pending | synced | failed
    created_at = Column(DateTime, server_default=func.now())
    synced_at = Column(DateTime, nullable=True)


# ---------------------------------------------------------------------------
# Audit log — change tracking via DB triggers (BSD Ch1.17)
# ---------------------------------------------------------------------------
class AuditLog(Base):
    """Append-only record of mutations for security & change tracking."""

    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True)          # tenant scoping (0008)
    table_name = Column(String(50), nullable=False)
    record_id = Column(Integer, nullable=True)
    action = Column(String(20), nullable=False)        # INSERT | UPDATE | DELETE
    actor = Column(String(255))
    change_json = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


# ---------------------------------------------------------------------------
# Analytics snapshots — session-based report cache (BSD Ch1.17)
# ---------------------------------------------------------------------------
class AnalyticsSnapshot(Base):
    """Cached dashboard/forecast metrics, regenerated per session."""

    __tablename__ = "analytics_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, index=True)
    snapshot_date = Column(DateTime, server_default=func.now())
    metric_key = Column(String(50), nullable=False)
    metric_value = Column(Float)
    dimensions_json = Column(Text)


# ---------------------------------------------------------------------------
# Team model (TRD Ch17 §17.7) — memberships + invitations. The owner is the
# businesses.owner_id row; these tables grant the five future roles.
# ---------------------------------------------------------------------------
class BusinessMember(Base):
    """A non-owner user with a role inside one business."""

    __tablename__ = "business_members"
    __table_args__ = (UniqueConstraint("business_id", "user_id", name="uq_member_business_user"),)

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), index=True, nullable=False)
    user_id = Column(String(255), index=True, nullable=False)  # Clerk user id (sub)
    email = Column(String(255), nullable=True)  # claimed at invitation accept
    role = Column(String(20), nullable=False)   # manager|sales|inventory|accountant|viewer
    invited_by = Column(String(255))            # Clerk user id of the inviter
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class BusinessInvitation(Base):
    """A pending (or revoked) invite. Accepted invites become members."""

    __tablename__ = "business_invitations"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), index=True, nullable=False)
    email = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    token = Column(String(64), unique=True, index=True, nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending|accepted|revoked
    created_by = Column(String(255))          # Clerk user id of the inviter
    accepted_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=True)


class Payment(Base):
    """One Paystack charge attempt for a plan (migration 0011).

    The ledger of every checkout Co-op started and what Paystack said about
    it. ``reference`` is Paystack's own idempotency key, so it is unique —
    a duplicated webhook cannot create a second row or upgrade a plan twice.

    The plan is NOT changed by this row alone: ``status`` only becomes
    ``success`` after the charge is verified with Paystack (API verify or a
    signature-checked ``charge.success`` webhook). A browser returning from
    the payment page proves nothing and never touches this table's status.
    """

    __tablename__ = "payments"
    __table_args__ = (
        Index("uq_payments_reference", "reference", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), index=True, nullable=False)
    provider = Column(String(30), nullable=False, default="paystack")
    reference = Column(String(80), nullable=False)
    plan = Column(String(20), nullable=False)            # starter|professional|enterprise
    interval = Column(String(20), nullable=False, default="monthly")  # monthly|annual
    # How the owner was sent to pay: "page" (hosted payment page) or "api"
    # (transaction/initialize -> authorization_url).
    mode = Column(String(20), nullable=True)
    amount_kobo = Column(Integer, nullable=True)
    currency = Column(String(8), nullable=True)
    email = Column(String(255), nullable=True)           # payer's email at checkout
    status = Column(String(20), nullable=False, default="pending")  # pending|success|failed
    provider_status = Column(String(40), nullable=True)  # Paystack's own word
    channel = Column(String(40), nullable=True)          # card|bank|ussd|…
    metadata_json = Column(Text, nullable=True)          # metadata we sent (JSON)
    started_by = Column(String(255), nullable=True)      # Clerk user id
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Payment {self.reference} {self.plan} {self.status}>"
