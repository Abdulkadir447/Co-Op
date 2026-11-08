"""Demo data — a believable business, seeded into one tenant in seconds.

Why this exists: the strongest thing a pre-traction product can show is the
product, populated. An empty ERP proves nothing; a business with eleven weeks
of orders, invoices, receivables and a stock ledger proves the thing works and
makes a three-minute demo possible without waiting for a real customer.

Rules this file follows:

* **It writes through the same tables the app writes through**, with the same
  invariants — order totals equal the sum of their lines, invoice numbers are
  sequential per business, stock movements reconcile to the current stock, and
  tax is computed the way ``backend/main.py`` computes it. A demo that an
  accountant can break is worse than no demo.
* **It is deterministic.** A fixed seed means the same demo every time, so a
  recording can be re-shot and a screenshot can be explained months later.
* **It is opt-in and refuses to run on a business that already has data**
  unless the caller passes ``force``. A seeder that quietly doubles a real
  customer's books is a data-loss bug, not a feature.
* **It is time-stamped in the past**, growing week over week, so the reports
  and the investor metrics have something honest to compute.
"""

from __future__ import annotations

import datetime as dt
import random
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    AuditLog,
    Business,
    Customer,
    Invoice,
    Order,
    OrderItem,
    OrderPayment,
    OrderStatus,
    Product,
    StockMovement,
    StockMovementReason,
)

# A small, plausible catalogue: a coffee-roastery/wholesale business, because it
# exercises stock, wholesale pricing and repeat customers at the same time.
PRODUCTS: list[tuple[str, str, str, float, float, int]] = [
    ("CFE-1KG", "House Blend — 1 kg", "Coffee", 32.00, 18.50, 120),
    ("CFE-5KG", "House Blend — 5 kg", "Coffee", 145.00, 88.00, 34),
    ("ESP-1KG", "Espresso Roast — 1 kg", "Coffee", 36.00, 21.00, 80),
    ("DEC-1KG", "Decaf — 1 kg", "Coffee", 38.00, 23.00, 40),
    ("FIL-100", "Paper filters — 100 pack", "Accessories", 9.50, 3.20, 260),
    ("CUP-12", "12 oz cups — sleeve of 50", "Accessories", 14.00, 6.10, 150),
    ("GRN-500", "Grinder burr set — 500 series", "Parts", 78.00, 41.00, 12),
    ("SIR-1L", "Vanilla syrup — 1 L", "Syrups", 11.00, 4.40, 90),
    ("CAR-1L", "Caramel syrup — 1 L", "Syrups", 11.00, 4.40, 86),
    ("SUB-BOX", "Monthly subscription box", "Subscriptions", 54.00, 27.00, 45),
]

CUSTOMERS: list[tuple[str, str, str]] = [
    ("Marta Okafor", "marta@northcafe.example", "North Cafe"),
    ("Daniel Reyes", "daniel@brewhouse.example", "Brewhouse Co."),
    ("Priya Shah", "priya@thegrind.example", "The Grind"),
    ("Tom Whitfield", "tom@whitfieldcoffee.example", "Whitfield Coffee"),
    ("Aisha Bello", "aisha@morningcup.example", "Morning Cup"),
    ("Lukas Meyer", "lukas@meyerroast.example", "Meyer Roast"),
    ("Grace Lindqvist", "grace@lindqvist.example", "Lindqvist Kaffe"),
    ("Omar Haddad", "omar@haddadcafe.example", "Haddad Cafe"),
    ("Elena Rossi", "elena@rossibar.example", "Rossi Bar"),
    ("Kwame Mensah", "kwame@accracup.example", "Accra Cup"),
    ("Sophie Tan", "sophie@tancoffee.example", "Tan Coffee"),
    ("Ben Clarke", "ben@clarkeandsons.example", "Clarke & Sons"),
]


def _tax_for(business: Business, subtotal: float) -> tuple[float | None, float]:
    """Mirror the order route: tax is exclusive and snapshotted, or absent."""
    if not getattr(business, "tax_enabled", False):
        return None, 0.0
    rate = float(getattr(business, "tax_rate", 0.0) or 0.0)
    return rate, round(subtotal * rate / 100.0, 2)


async def business_has_data(db: AsyncSession, business_id: int) -> bool:
    count = (
        await db.execute(
            select(func.count(Product.id)).where(
                Product.business_id == business_id, Product.deleted_at.is_(None)
            )
        )
    ).scalar()
    return bool(count)


async def seed_business(
    db: AsyncSession,
    business: Business,
    *,
    weeks: int = 11,
    orders_per_week: int = 4,
    growth_per_week: float = 0.18,
    now: dt.datetime | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Populate one tenant with a coherent trading history.

    Returns a summary dict of what was written. Commits nothing: the caller
    owns the transaction, so a failure leaves no half-seeded business.
    """
    now = now or dt.datetime.utcnow()
    if await business_has_data(db, business.id) and not force:
        raise ValueError(
            "this business already has products; pass force=True only for a "
            "throwaway demo tenant"
        )

    rng = random.Random(20261123)
    owner = business.owner_id
    written = {"products": 0, "customers": 0, "orders": 0, "invoices": 0, "payments": 0}

    products: list[Product] = []
    for sku, name, category, price, cost, stock in PRODUCTS:
        product = Product(
            business_id=business.id, sku=sku, name=name, category=category,
            unit_price=price, cost_price=cost, current_stock=stock,
            reorder_level=max(5, stock // 10), created_by=owner,
            created_at=now - dt.timedelta(days=weeks * 7),
        )
        db.add(product)
        products.append(product)
        written["products"] += 1

    customers: list[Customer] = []
    for full_name, email, company in CUSTOMERS:
        customer = Customer(
            business_id=business.id, full_name=full_name, email=email,
            company=company, created_by=owner,
            created_at=now - dt.timedelta(days=weeks * 7),
        )
        db.add(customer)
        customers.append(customer)
        written["customers"] += 1

    await db.flush()   # ids for the foreign keys below

    # Opening stock, so the ledger explains the opening balance.
    for product in products:
        db.add(StockMovement(
            business_id=business.id, product_id=product.id,
            change=product.current_stock, reason=StockMovementReason.initial,
            note="Opening stock (demo)", actor=owner,
            created_at=now - dt.timedelta(days=weeks * 7),
        ))

    invoice_seq = 0
    for week in range(weeks):
        # Newest week last; volume grows so the charts trend upward.
        orders_this_week = max(2, round(orders_per_week * (1 + growth_per_week) ** week))
        week_end = now - dt.timedelta(days=(weeks - week - 1) * 7)
        for _ in range(orders_this_week):
            placed_at = week_end - dt.timedelta(
                days=rng.randint(0, 6), hours=rng.randint(8, 18), minutes=rng.randint(0, 59)
            )
            if placed_at > now:
                placed_at = now - dt.timedelta(hours=1)
            customer = rng.choice(customers)
            lines = rng.sample(products, k=rng.choice([1, 1, 2, 2, 3]))

            order = Order(
                business_id=business.id, customer_id=customer.id,
                order_date=placed_at, created_by=owner, created_at=placed_at,
                status=rng.choice([
                    OrderStatus.delivered, OrderStatus.delivered, OrderStatus.delivered,
                    OrderStatus.shipped, OrderStatus.pending,
                ]),
                total_amount=0.0,
            )
            db.add(order)
            await db.flush()

            subtotal = 0.0
            for product in lines:
                quantity = rng.randint(1, 4)
                unit_price = round(product.unit_price * rng.choice([1.0, 1.0, 0.95]), 2)
                line_total = round(quantity * unit_price, 2)
                subtotal += line_total
                db.add(OrderItem(
                    business_id=business.id, order_id=order.id, product_id=product.id,
                    quantity=quantity, unit_price=unit_price, total_price=line_total,
                    created_by=owner, created_at=placed_at,
                ))
                # Stock ledger: the sale is a negative movement on the product.
                db.add(StockMovement(
                    business_id=business.id, product_id=product.id, change=-quantity,
                    reason=StockMovementReason.sale, order_id=order.id, actor=owner,
                    created_at=placed_at,
                ))
                product.current_stock = max(0, (product.current_stock or 0) - quantity)

            tax_rate, tax_amount = _tax_for(business, round(subtotal, 2))
            order.total_amount = round(subtotal, 2)
            order.tax_rate = tax_rate
            order.tax_amount = tax_amount
            written["orders"] += 1
            # The audit trail is a real feature a demo should show, and it is
            # also the honest source of "was this business active this week".
            db.add(AuditLog(
                business_id=business.id, table_name="orders", record_id=order.id,
                action="create", actor=owner,
                change_json='{"total_amount": %s}' % order.total_amount,
                created_at=placed_at,
            ))

            # Invoices for everything older than three days: a young order is
            # legitimately un-invoiced, and the invoice number must be sequential.
            if placed_at < now - dt.timedelta(days=3):
                invoice_seq += 1
                invoice_at = placed_at + dt.timedelta(hours=rng.randint(1, 20))
                db.add(Invoice(
                    business_id=business.id, order_id=order.id,
                    number=f"INV-{invoice_seq:04d}", issue_date=invoice_at,
                    due_date=invoice_at + dt.timedelta(days=14), status="sent",
                    created_by=owner, created_at=invoice_at,
                ))
                written["invoices"] += 1
                db.add(AuditLog(
                    business_id=business.id, table_name="invoices",
                    record_id=order.id, action="create", actor=owner,
                    change_json='{"number": %s}' % ('"' + f"INV-{invoice_seq:04d}" + '"'),
                    created_at=invoice_at,
                ))

                gross = order.total_amount + order.tax_amount
                roll = rng.random()
                if roll < 0.68:
                    db.add(OrderPayment(
                        business_id=business.id, order_id=order.id,
                        amount=round(gross, 2), method=rng.choice(["transfer", "card"]),
                        reference=f"demo-{order.id}-full", created_by=owner,
                        received_at=invoice_at + dt.timedelta(days=rng.randint(1, 12)),
                        created_at=invoice_at + dt.timedelta(days=rng.randint(1, 12)),
                    ))
                    written["payments"] += 1
                elif roll < 0.85:
                    # A partial payment leaves a receivable — the dashboard and
                    # the receivables report both need some of these to be real.
                    db.add(OrderPayment(
                        business_id=business.id, order_id=order.id,
                        amount=round(gross * 0.4, 2), method="transfer",
                        reference=f"demo-{order.id}-part", created_by=owner,
                        received_at=invoice_at + dt.timedelta(days=rng.randint(1, 9)),
                        created_at=invoice_at + dt.timedelta(days=rng.randint(1, 9)),
                    ))
                    written["payments"] += 1

    await db.flush()
    written["invoice_numbers"] = f"INV-0001 … INV-{invoice_seq:04d}"
    return written
