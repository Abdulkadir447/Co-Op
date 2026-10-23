"""
Payments — turning a verified Paystack charge into a real plan change.

Layering: ``backend/paystack.py`` talks to Paystack (transport, config,
signature checking) and knows nothing about the database; this module owns
the ``payments`` ledger and the plan upgrade. The routes in ``main.py`` are
thin wrappers.

The rule that matters: **a charge is only believed once Paystack says so.**
Two independent confirmations exist and either is sufficient, but both are
verified server-side —

* ``POST /billing/payments/verify`` (called when the owner comes back from
  the payment page) asks Paystack ``GET /transaction/verify/{reference}``;
* ``POST /webhooks/paystack`` checks the ``x-paystack-signature`` HMAC over
  the raw body before reading a word of it.

The redirect back to the app is never treated as payment. Everything is
idempotent on ``reference``: a second webhook, or a verify after a webhook,
finds the row already ``success`` and does nothing.
"""
from __future__ import annotations

import datetime as dt
import json
from typing import Any, Optional
from urllib.parse import urlparse

from sqlalchemy import select

from . import billing
from .models import Business, Payment
from .paystack import (
    INTERVALS,
    PURCHASABLE_PLANS,
    PaystackClient,
    PaystackConfig,
    PaystackError,
    build_metadata,
    build_page_url,
    make_reference,
    paystack_config,
)

STATUS_PENDING = "pending"
STATUS_SUCCESS = "success"
STATUS_FAILED = "failed"

MODE_PAGE = "page"
MODE_API = "api"

# Paystack statuses that mean "no money moved".
FAILED_PROVIDER_STATUSES = ("failed", "abandoned")


class PaymentsError(Exception):
    """Checkout could not be started (not configured, bad plan, no email…)."""


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


def _client(cfg: PaystackConfig, transport: Any = None) -> PaystackClient:
    return PaystackClient(
        secret_key=cfg.secret_key or "",
        base_url=cfg.api_base,
        timeout_seconds=cfg.timeout_seconds,
        transport=transport,
    )


def resolve_callback_url(
    cfg: PaystackConfig,
    requested: Optional[str] = None,
    allowed_hosts: Optional[list[str]] = None,
) -> Optional[str]:
    """Where Paystack sends the owner after paying.

    The configured ``paystack.callback_url`` wins when it is absolute. A URL
    from the request is only honoured when its host is explicitly allowed —
    otherwise a crafted checkout call could send the owner anywhere.
    """
    configured = cfg.callback_url
    if configured and urlparse(configured).scheme in ("http", "https"):
        return configured
    if requested:
        parsed = urlparse(requested)
        hosts = [
            h.lower()
            for h in (allowed_hosts if allowed_hosts is not None
                      else cfg.allowed_callback_hosts)
        ]
        if parsed.scheme in ("http", "https") and parsed.hostname \
                and parsed.hostname.lower() in hosts:
            return requested
    return None


async def start_checkout(
    db,
    business: Business,
    *,
    plan: str,
    interval: str = "monthly",
    email: Optional[str] = None,
    user_id: Optional[str] = None,
    return_url: Optional[str] = None,
    allowed_callback_hosts: Optional[list[str]] = None,
    transport: Any = None,
) -> dict[str, Any]:
    """Create the pending charge row and hand back the URL to pay at.

    Prefers the plan's hosted payment page (the merchant already set the
    amount there); falls back to ``/transaction/initialize`` when the
    deployment has a secret key and a configured price instead.
    """
    cfg = paystack_config()
    if not cfg.enabled or not (cfg.payment_pages or cfg.api_ready()):
        raise PaymentsError(
            "Payments are not configured on this deployment "
            "(paystack.enabled + a payment page or PAYSTACK_SECRET_KEY)."
        )

    plan = (plan or "").strip().lower()
    if plan not in PURCHASABLE_PLANS:
        raise PaymentsError(f"plan must be one of: {', '.join(PURCHASABLE_PLANS)}")
    interval = (interval or "monthly").strip().lower()
    if interval not in INTERVALS:
        raise PaymentsError(f"interval must be one of: {', '.join(INTERVALS)}")

    payer_email = (email or business.owner_email or "").strip()
    if not payer_email:
        raise PaymentsError(
            "Add a billing email first — Paystack requires the payer's email."
        )

    reference = make_reference()
    metadata = build_metadata(
        business.id, plan, interval, reference, user_id=user_id or business.owner_id
    )
    callback_url = resolve_callback_url(
        cfg,
        return_url,
        list(allowed_callback_hosts) if allowed_callback_hosts is not None
        else list(cfg.allowed_callback_hosts),
    )
    amount_kobo = cfg.price_kobo(plan, interval)
    page = cfg.page_for(plan)

    if page:
        mode = MODE_PAGE
        url = build_page_url(
            page,
            reference=reference,
            email=payer_email,
            metadata=metadata,
            callback_url=callback_url,
            amount_kobo=amount_kobo,
        )
    else:
        mode = MODE_API
        try:
            result = await _client(cfg, transport).initialize_transaction(
                email=payer_email,
                amount_kobo=amount_kobo,
                reference=reference,
                callback_url=callback_url,
                metadata=metadata,
                currency=cfg.currency,
            )
        except PaystackError as exc:
            raise PaymentsError(str(exc)) from exc
        url = result["authorization_url"]
        reference = result.get("reference") or reference
        if not url:
            raise PaymentsError("Paystack did not return a payment URL.")

    db.add(
        Payment(
            business_id=business.id,
            provider="paystack",
            reference=reference,
            plan=plan,
            interval=interval,
            mode=mode,
            amount_kobo=amount_kobo,
            currency=cfg.currency,
            email=payer_email,
            status=STATUS_PENDING,
            metadata_json=json.dumps(metadata),
            started_by=user_id or business.owner_id,
        )
    )
    await db.flush()

    return {
        "reference": reference,
        "mode": mode,
        "url": url,
        "plan": plan,
        "interval": interval,
        "amount_kobo": amount_kobo,
        "currency": cfg.currency,
        "callback_url": callback_url,
    }


def _payment_dict(p: Payment) -> dict[str, Any]:
    return {
        "id": p.id,
        "reference": p.reference,
        "plan": p.plan,
        "interval": p.interval,
        "mode": p.mode,
        "amount_kobo": p.amount_kobo,
        "currency": p.currency,
        "status": p.status,
        "provider_status": p.provider_status,
        "channel": p.channel,
        "paid_at": p.paid_at.isoformat() if p.paid_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


async def _find_payment(db, reference: str, business_id: Optional[int] = None):
    stmt = select(Payment).where(Payment.reference == reference)
    if business_id is not None:
        stmt = stmt.where(Payment.business_id == business_id)
    return (await db.execute(stmt)).scalars().first()


async def _apply_success(db, payment: Payment, provider_data: dict[str, Any]) -> bool:
    """Mark a payment paid and upgrade the plan. Returns False if it already was.

    Idempotent by construction: the second caller sees ``status == success``
    and leaves the plan alone, so a duplicate webhook cannot grant anything.
    """
    if payment.status == STATUS_SUCCESS:
        return False

    business = (
        await db.execute(select(Business).where(Business.id == payment.business_id))
    ).scalars().first()
    if business is None:  # pragma: no cover — FK guarantees a row
        raise PaymentsError(f"Business {payment.business_id} no longer exists.")

    paid_at = provider_data.get("paid_at")
    payment.status = STATUS_SUCCESS
    payment.provider_status = provider_data.get("status") or STATUS_SUCCESS
    payment.channel = provider_data.get("channel") or payment.channel
    if provider_data.get("amount_kobo"):
        payment.amount_kobo = int(provider_data["amount_kobo"])
    if provider_data.get("currency"):
        payment.currency = str(provider_data["currency"]).upper()
    payment.paid_at = _parse_dt(paid_at) or _now()

    # The plan change is the whole point — and it goes through the same
    # function the manual switch uses, so trial/credit bookkeeping stays
    # consistent (an active trial is closed by the conversion).
    await billing.change_plan(
        db, business, payment.plan,
        actor=payment.started_by or business.owner_id,
        via_payment=True,
    )
    await db.flush()
    return True


def _parse_dt(value: Any) -> Optional[dt.datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


async def verify_and_apply(
    db,
    business: Business,
    reference: str,
    transport: Any = None,
) -> dict[str, Any]:
    """Ask Paystack whether ``reference`` was paid, and act on the answer.

    Scoped to the caller's business: one tenant can never read (or trigger a
    plan change from) another tenant's reference.
    """
    payment = await _find_payment(db, (reference or "").strip(), business.id)
    if payment is None:
        raise PaymentsError("No such payment for this business.")
    if payment.status == STATUS_SUCCESS:
        return {"payment": _payment_dict(payment), "already_applied": True,
                "applied": False, "plan": payment.plan}

    cfg = paystack_config()
    if not cfg.api_ready():
        raise PaymentsError(
            "Cannot verify the payment here: PAYSTACK_SECRET_KEY is not set. "
            "The webhook will apply it once it arrives."
        )

    try:
        data = await _client(cfg, transport).verify_transaction(payment.reference)
    except PaystackError as exc:
        raise PaymentsError(str(exc)) from exc

    if data["status"] == STATUS_SUCCESS:
        if payment.amount_kobo and data["amount_kobo"] < payment.amount_kobo:
            raise PaymentsError(
                f"Payment is short: expected {payment.amount_kobo} "
                f"{payment.currency}, received {data['amount_kobo']}."
            )
        applied = await _apply_success(db, payment, data)
    else:
        payment.provider_status = data["status"] or payment.provider_status
        if data["status"] in FAILED_PROVIDER_STATUSES:
            payment.status = STATUS_FAILED
        await db.flush()
        applied = False

    return {
        "payment": _payment_dict(payment),
        "already_applied": False,
        "applied": applied,
        "plan": payment.plan if payment.status == STATUS_SUCCESS else None,
        "provider_status": data["status"],
    }


async def apply_webhook_event(
    db,
    payload: dict[str, Any],
    transport: Any = None,
) -> dict[str, Any]:
    """Handle one Paystack event. Signature checking happens at the route.

    Returns a small dict describing what happened; the route always answers
    200 for a correctly-signed event so Paystack does not retry forever.
    """
    event = str(payload.get("event") or "")
    if event != "charge.success":
        return {"ignored": event or "unknown_event"}

    data = payload.get("data") or {}
    reference = str(data.get("reference") or "").strip()
    if not reference:
        return {"ignored": "no_reference"}

    payment = await _find_payment(db, reference)
    metadata = data.get("metadata") or {}
    if payment is None:
        # A charge can reach us without a checkout row: the owner may pay the
        # hosted page directly. Trust the metadata (the signature was already
        # verified) and record the row so the plan can be granted.
        business_id = metadata.get("business_id")
        plan = str(metadata.get("plan") or "").strip().lower()
        if not business_id or plan not in PURCHASABLE_PLANS:
            return {"ignored": "unattributable_charge"}
        try:
            business_id = int(business_id)
        except (TypeError, ValueError):
            return {"ignored": "unattributable_charge"}
        business = (
            await db.execute(select(Business).where(Business.id == business_id))
        ).scalars().first()
        if business is None:
            # Money arrived for a business we do not have. Record nothing:
            # Paystack keeps the charge, and a human reconciles it.
            return {"ignored": "unknown_business", "reference": reference}
        payment = Payment(
            business_id=business_id,
            provider="paystack",
            reference=reference,
            plan=plan,
            interval=str(metadata.get("interval") or "monthly").strip().lower(),
            mode=MODE_PAGE,
            amount_kobo=int(data.get("amount") or 0) or None,
            currency=str(data.get("currency") or "").upper() or None,
            email=(data.get("customer") or {}).get("email")
            if isinstance(data.get("customer"), dict) else None,
            status=STATUS_PENDING,
            provider_status=str(data.get("status") or "").lower() or None,
            channel=data.get("channel"),
            metadata_json=json.dumps(metadata),
            started_by=str(metadata.get("user_id") or "") or None,
        )
        db.add(payment)
        await db.flush()
    elif payment.amount_kobo and int(data.get("amount") or 0) < payment.amount_kobo:
        payment.provider_status = str(data.get("status") or "").lower() or None
        await db.flush()
        return {"ignored": "underpayment", "reference": reference}

    applied = await _apply_success(
        db,
        payment,
        {
            "status": str(data.get("status") or STATUS_SUCCESS).lower(),
            "amount_kobo": data.get("amount"),
            "currency": data.get("currency"),
            "channel": data.get("channel"),
            "paid_at": data.get("paid_at"),
        },
    )
    return {
        "applied": applied,
        "reference": reference,
        "business_id": payment.business_id,
        "plan": payment.plan,
        "already_applied": not applied and payment.status == STATUS_SUCCESS,
    }


async def list_payments(db, business: Business, limit: int = 20) -> list[dict[str, Any]]:
    """This business's charge history, newest first."""
    limit = max(1, min(int(limit or 20), 100))
    rows = (
        await db.execute(
            select(Payment)
            .where(Payment.business_id == business.id)
            .order_by(Payment.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [_payment_dict(p) for p in rows]
