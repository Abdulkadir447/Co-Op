"""Receivables — recording what a customer actually paid.

The order is the source of truth for what was *charged*
(``orders.total_amount``); this module maintains a separate ledger of what
came *in* (``order_payments``). Keeping them apart is what makes partial
payments work without ever mutating the order, and it means revenue reports
(which read ``total_amount``) stay exactly as they were.

Rules enforced here, not in the route:

  * an amount must be > 0 and must not exceed the outstanding balance
    (overpayment is refused, not silently clamped — a wrong number the owner
    never sees is worse than a refusal they can act on);
  * a cancelled order cannot receive money (it was voided, and stock was
    returned);
  * every write is tenant-scoped through the order, so a payment can never
    be attached to another business's order;
  * deletes are audited — the ledger never rewrites history silently.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable, Optional

from . import audit as audit_mod
from . import money
from .models import Business, Order, OrderPayment

# Payment methods the UI offers. Deliberately short and opinionated: the
# Nigerian SME reality is cash, bank transfer, POS card, and "other".
PAYMENT_METHODS = ("cash", "transfer", "card", "pos", "other")

# Tolerance for "settled". Money is exact now (integer kobo), so this is not
# hiding drift: it exists because ``grand_total`` is itself rounded once (net +
# tax), and an order whose tax rounds up could otherwise look one kobo short
# forever. Half a kobo is the smallest meaningful amount.
_EPSILON = Decimal("0.005")


class PaymentError(Exception):
    """A refusal the route turns into 404/409/422."""

    def __init__(self, message: str, status_code: int = 409) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class Balance:
    """What the order was charged, what came in, what is still owed.

    ``total`` is the GRAND total (net + tax, 0021) because that is the money a
    customer actually owes. Revenue reporting keeps using the net
    ``orders.total_amount``, so tax never inflates a revenue figure.
    """

    total: Decimal
    paid: Decimal
    balance: Decimal
    status: str  # unpaid | partial | paid | overpaid

    def as_dict(self) -> dict[str, Any]:
        return {
            "amount_paid": money.as_money(self.paid),
            "balance_due": money.as_money(self.balance),
            "payment_status": self.status,
        }


def balance_for(order: Order, payments: Optional[Iterable[OrderPayment]] = None) -> Balance:
    """Compute the balance from an already-loaded order.

    Uses ``order.payments`` (eager-loaded with ``selectin`` on the
    relationship) so serialising a page of orders never triggers a lazy load
    in async context.
    """
    rows = list(order.payments if payments is None else payments)
    # Grand total (net + tax) is what must be settled; getattr keeps this
    # correct for any Order-shaped object that predates the tax columns.
    total = money.as_money(getattr(order, "grand_total", None) or order.total_amount or 0)
    # Summed in Decimal: a page of payments that should settle an order to zero
    # settles to exactly zero, instead of 0.0000000000000009.
    paid = money.sum_money(p.amount for p in rows)
    balance = money.as_money(total - paid)
    if paid <= _EPSILON:
        status = "unpaid"
    elif balance > _EPSILON:
        status = "partial"
    elif balance < -_EPSILON:
        # Only reachable from legacy/imported data: refuse new overpayment,
        # but never hide one that already exists.
        status = "overpaid"
    else:
        status = "paid"
    return Balance(total=total, paid=paid, balance=balance, status=status)


def to_dict(payment: OrderPayment) -> dict[str, Any]:
    return {
        "id": payment.id,
        "order_id": payment.order_id,
        "amount": money.as_money(payment.amount),
        "method": payment.method,
        "reference": payment.reference,
        "note": payment.note,
        "received_at": payment.received_at.isoformat() if payment.received_at else None,
        "created_by": payment.created_by,
    }


def _clean_method(method: Optional[str]) -> str:
    value = (method or "cash").strip().lower()
    if value not in PAYMENT_METHODS:
        raise PaymentError(
            f"method must be one of: {', '.join(PAYMENT_METHODS)}", status_code=422
        )
    return value


async def record_payment(
    db,
    business: Business,
    order: Order,
    amount: Any,
    method: Optional[str] = "cash",
    reference: Optional[str] = None,
    note: Optional[str] = None,
    actor: Optional[str] = None,
) -> tuple[OrderPayment, Balance]:
    """Record money received against ``order`` and return the new balance."""
    order_status = order.status.value if hasattr(order.status, "value") else str(order.status)
    if order_status == "cancelled":
        raise PaymentError(
            "This order was cancelled — it cannot receive a payment. "
            "Create a new order instead.",
            status_code=409,
        )

    if amount is None:
        raise PaymentError("amount must be greater than zero", status_code=422)
    try:
        value = money.as_money(amount)
    except (TypeError, ValueError):
        raise PaymentError("amount must be a number", status_code=422)
    if value <= 0:
        raise PaymentError("amount must be greater than zero", status_code=422)

    current = balance_for(order)
    if value > current.balance + _EPSILON:
        raise PaymentError(
            f"amount exceeds the outstanding balance "
            f"({current.balance:.2f} left on a {current.total:.2f} order)",
            status_code=409,
        )

    payment = OrderPayment(
        business_id=business.id,
        branch_id=order.branch_id,   # the sale's branch, not the caller's
        order_id=order.id,
        amount=value,
        method=_clean_method(method),
        reference=(reference or None),
        note=(note or None),
        created_by=actor,
    )
    db.add(payment)
    await db.flush()

    # The relationship is already loaded on this instance; appending keeps
    # balance_for() honest without a re-query.
    order.payments.append(payment)
    after = balance_for(order)

    await audit_mod.record_audit(
        db,
        business.id,
        "order_payments",
        payment.id,
        "create",
        change={
            "order_id": order.id,
            "amount": payment.amount,
            "method": payment.method,
            "balance_due": after.balance,
        },
        actor=actor,
    )
    return payment, after


async def list_payments(business: Business, order: Order) -> dict[str, Any]:
    """Every payment on one order, newest first, plus the balance summary."""
    rows = sorted(order.payments, key=lambda p: (p.received_at or p.created_at, p.id), reverse=True)
    return {
        "order_id": order.id,
        "items": [to_dict(p) for p in rows],
        **balance_for(order).as_dict(),
    }


async def delete_payment(
    db,
    business: Business,
    order: Order,
    payment_id: int,
    actor: Optional[str] = None,
) -> Balance:
    """Remove a mis-keyed payment (audited) and return the corrected balance."""
    target = next((p for p in order.payments if p.id == payment_id), None)
    if target is None:
        raise PaymentError("Payment not found", status_code=404)

    removed = money.as_money(target.amount)
    order.payments.remove(target)
    await db.delete(target)
    await db.flush()

    after = balance_for(order)
    await audit_mod.record_audit(
        db,
        business.id,
        "order_payments",
        payment_id,
        "delete",
        change={"order_id": order.id, "amount": removed, "balance_due": after.balance},
        actor=actor,
    )
    return after
