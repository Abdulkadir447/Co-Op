"""Pydantic schemas for request and response validation.

These mirror the ORM models defined in `backend/models.py` and are used by
FastAPI to validate incoming JSON payloads and to control the shape of
responses. Pydantic v2 style (`model_config = ConfigDict(from_attributes=True)`
replaces the removed v1 `orm_mode`).
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------------------------------------------------------------------------
# Product schemas
# ---------------------------------------------------------------------------

class ProductBase(BaseModel):
    sku: str = Field(..., min_length=3, max_length=50, description="Unique product identifier")
    name: str = Field(..., min_length=1, max_length=255, description="Product name")
    description: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = Field(None, max_length=100)
    unit_price: float = Field(..., gt=0, description="Price must be greater than 0")
    cost_price: Optional[float] = Field(None, ge=0, description="Cost price, if applicable")
    current_stock: int = Field(default=0, ge=0, description="Current inventory level")
    reorder_level: int = Field(default=5, ge=0, description="Stock level that triggers reorder")

    model_config = ConfigDict(from_attributes=True)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = Field(None, max_length=100)
    unit_price: Optional[float] = Field(None, gt=0)
    cost_price: Optional[float] = Field(None, ge=0)
    reorder_level: Optional[int] = Field(None, ge=0)
    # NOTE (Task 8): `current_stock` is deliberately NOT editable here.
    # After creation, stock changes only via POST /products/{id}/adjust,
    # which writes the audit ledger. Initial stock is set at create time.


class ProductOut(ProductBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    version: int = 1  # optimistic-lock counter (bumped on stock adjustments)

    model_config = ConfigDict(from_attributes=True)


class ProductListResponse(BaseModel):
    """Paginated product listing envelope (Task 5)."""

    items: List[ProductOut]
    total: int
    page: int
    limit: int


# ---------------------------------------------------------------------------
# Inventory schemas (Task 8)
# ---------------------------------------------------------------------------

class AdjustReason(str, Enum):
    """Manual adjustment reasons (UXDS 11.11)."""

    purchase = "purchase"
    sale = "sale"
    damaged = "damaged"
    returned = "returned"
    correction = "correction"


class AdjustStockRequest(BaseModel):
    """POST /products/{id}/adjust body.

    `change` is a signed quantity: positive adds stock, negative removes it.
    Zero is rejected. The resulting level may not go below zero (409).
    """

    change: int = Field(..., description="Signed stock delta; must be non-zero")
    reason: AdjustReason
    note: Optional[str] = Field(None, max_length=500)


class StockMovementOut(BaseModel):
    id: int
    product_id: int
    change: int
    reason: str
    note: Optional[str] = None
    order_id: Optional[int] = None
    actor: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MovementListResponse(BaseModel):
    """Paginated stock-movement ledger envelope (newest first)."""

    items: List[StockMovementOut]
    total: int
    page: int
    limit: int


class InventorySummary(BaseModel):
    """Inventory module KPI row (UXDS 11.5): products, value, low, out, categories."""

    products_count: int
    inventory_value: float
    low_stock_count: int
    out_of_stock_count: int
    categories_count: int


# ---------------------------------------------------------------------------
# Customer schemas
# ---------------------------------------------------------------------------

class CustomerBase(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr = Field(..., max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=500)
    company: Optional[str] = Field(None, max_length=255)

    model_config = ConfigDict(from_attributes=True)


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=500)
    company: Optional[str] = Field(None, max_length=255)


class CustomerOut(CustomerBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerListResponse(BaseModel):
    """Paginated customer listing envelope (Task 6, parity with Products)."""

    items: List[CustomerOut]
    total: int
    page: int
    limit: int


class CustomerBrief(BaseModel):
    """Lightweight nested customer used inside order listings."""

    full_name: str

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Order schemas
# ---------------------------------------------------------------------------

class OrderStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"


class OrderItemBase(BaseModel):
    product_id: int
    quantity: int = Field(..., gt=0)
    unit_price: float = Field(..., gt=0)

    model_config = ConfigDict(from_attributes=True)


class OrderItemCreate(OrderItemBase):
    pass


class OrderItemOut(OrderItemBase):
    id: int
    total_price: float
    product_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class OrderBase(BaseModel):
    customer_id: int
    status: Optional[OrderStatus] = OrderStatus.pending


class OrderCreate(OrderBase):
    items: List[OrderItemCreate] = Field(..., min_length=1)


class OrderUpdate(BaseModel):
    status: Optional[OrderStatus] = None
    # Updating items is out of scope for Phase 1 – they are immutable after creation.


class OrderListResponse(BaseModel):
    """Paginated order listing envelope (Task 7, parity with Products/Customers)."""

    items: List["OrderOut"]
    total: int
    page: int
    limit: int


class OrderOut(BaseModel):
    id: int
    customer_id: int
    customer: Optional[CustomerBrief] = None
    status: OrderStatus
    # Legal next statuses, computed from the backend's single transition map
    # (Task 12 / M4). The frontend renders the status control from this instead
    # of maintaining its own copy of the rules.
    allowed_transitions: List[OrderStatus] = []
    total_amount: float
    order_date: datetime
    created_at: datetime
    items: List[OrderItemOut]

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Dashboard schemas
# ---------------------------------------------------------------------------

class RevenueTodayResponse(BaseModel):
    total_revenue: float
    delivered_orders: int


class RevenueMonthResponse(BaseModel):
    total_revenue: float
    total_orders: int


class GrowthResponse(BaseModel):
    this_month_revenue: float
    last_month_revenue: float
    growth_percent: Optional[float] = None


class TopProductItem(BaseModel):
    product_id: int
    product_name: str
    total_quantity: int
    total_revenue: float

    model_config = ConfigDict(from_attributes=True)


class DashboardSummary(BaseModel):
    """Aggregated KPI payload for the Dashboard (one round-trip)."""

    revenue_today: float
    orders_today: int
    revenue_month: float
    orders_month: int
    revenue_growth_percent: Optional[float] = None
    profit_month: float
    products_count: int
    inventory_value: float
    low_stock_count: int
    out_of_stock_count: int
    customers_total: int
    customers_new_month: int


class TimeseriesPoint(BaseModel):
    """One day of revenue/orders for the Revenue chart."""

    date: str
    revenue: float
    orders: int


class CategoryValue(BaseModel):
    """Inventory value grouped by product category (donut chart)."""

    category: str
    value: float


# ---------------------------------------------------------------------------
# Settings schemas (Task 9 — Company Settings, UXDS 15.6)
# ---------------------------------------------------------------------------

# Explicit currency whitelist — garbage codes would corrupt money formatting
# app-wide. Includes NGN (primary market) plus common trading currencies.
ALLOWED_CURRENCIES = {
    "USD", "EUR", "GBP", "NGN", "CAD", "AUD", "JPY", "CNY",
    "ZAR", "GHS", "KES", "EGY", "INR", "AED", "CHF",
}

# Curated timezone list (UXDS 15.6 Time Zone field).
ALLOWED_TIMEZONES = {
    "UTC",
    "Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg",
    "Africa/Cairo", "Africa/Casablanca",
    "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Istanbul",
    "America/New_York", "America/Chicago", "America/Denver",
    "America/Los_Angeles", "America/Sao_Paulo", "America/Toronto",
    "Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata", "Asia/Singapore",
    "Asia/Shanghai", "Asia/Tokyo",
    "Australia/Sydney",
}


class BusinessSettingsUpdate(BaseModel):
    """PATCH /business/settings — whitelisted fields only.

    `owner_id`, `id`, timestamps etc. are NOT part of this schema, so they
    can never be mutated through the API (Task 9 security rule).
    """

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    industry: Optional[str] = Field(None, max_length=100)
    currency: Optional[str] = Field(None, max_length=8)
    owner_email: Optional[EmailStr] = Field(None, max_length=255)
    address: Optional[str] = Field(None, max_length=500)
    phone: Optional[str] = Field(None, max_length=20)
    tax_id: Optional[str] = Field(None, max_length=100)
    website: Optional[str] = Field(None, max_length=255)
    timezone: Optional[str] = Field(None, max_length=64)
    ai_response_style: Optional[str] = Field(None, max_length=20)

    model_config = ConfigDict(from_attributes=True)


class BusinessSettingsOut(BaseModel):
    """Company settings for the caller's tenant (owner_id never exposed)."""

    name: str
    industry: Optional[str] = None
    currency: str
    owner_email: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    tax_id: Optional[str] = None
    website: Optional[str] = None
    timezone: Optional[str] = None
    ai_response_style: str = "standard"
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AuthMeResponse(BaseModel):
    """Identity + tenant info for the signed-in Co-op user."""

    user_id: str
    business_id: Optional[int] = None  # None while a pending invitation awaits
    business_name: str = ""
    currency: str = "USD"
    role: str = "owner"  # owner | manager | sales | inventory | accountant | viewer
    email: Optional[str] = None
    pending_invitation: Optional["TeamInviteOut"] = None


class AuditEntryOut(BaseModel):
    """One audit_log row (read view, newest first)."""

    id: int
    table_name: str
    record_id: Optional[int] = None
    action: str
    actor: Optional[str] = None
    change: Optional[str] = Field(default=None, validation_alias="change_json")
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Team model (TRD Ch17 §17.7)
# ---------------------------------------------------------------------------
class TeamMemberOut(BaseModel):
    """One non-owner member of the business."""

    user_id: str
    email: Optional[str] = None
    role: str
    joined_at: Optional[datetime] = None


class TeamInviteCreate(BaseModel):
    email: EmailStr
    role: str = Field(pattern="^(manager|sales|inventory|accountant|viewer)$")


class TeamInviteAccept(BaseModel):
    token: str = Field(min_length=8, max_length=128)


class TeamInviteOut(BaseModel):
    token: str
    email: str
    role: str
    status: str
    business_name: str = ""
    created_at: Optional[datetime] = None


class TeamRoleUpdate(BaseModel):
    role: str = Field(pattern="^(manager|sales|inventory|accountant|viewer)$")


class TeamResponse(BaseModel):
    members: List[TeamMemberOut]
    invitations: List[TeamInviteOut]


# --- Feedback (periodic in-app product prompt) -----------------------------
class FeedbackStatusOut(BaseModel):
    """Whether a feedback prompt is due for the caller's business."""
    due: bool
    required: bool                       # first prompt = compulsory
    due_at: Optional[str] = None         # ISO timestamp of the current window
    interval_days: int = 21
    submitted_before: bool = False


class FeedbackSubmitIn(BaseModel):
    """A feedback response. ``overall`` is required for the compulsory first
    prompt (enforced in the route); the rest are optional."""
    rating: Optional[int] = Field(None, ge=1, le=5)
    overall: Optional[str] = Field(None, max_length=4000)
    likes: Optional[str] = Field(None, max_length=4000)
    issues: Optional[str] = Field(None, max_length=4000)
    improvements: Optional[str] = Field(None, max_length=4000)
