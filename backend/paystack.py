"""
Paystack — transport and configuration only (no database, no FastAPI).

Co-op charges through Paystack. Two ways to take a payment exist and this
module supports both, because they need different things:

1. **Hosted payment page** (what the three `…/pay/<slug>` links are). The
   merchant creates the page in the Paystack dashboard, including the amount.
   Co-op redirects the owner there with ``email``, ``reference`` and
   ``metadata`` appended, so the resulting charge can be traced back to the
   business. No API key is required for the redirect itself.
2. **API checkout** (``POST /transaction/initialize``). Used when no page is
   configured for a plan, or when the price must be computed per business.
   This needs the secret key.

Either way the plan is only upgraded after the charge is confirmed —
server-side, by verifying the transaction with Paystack (``GET
/transaction/verify/{reference}``) and/or by a ``charge.success`` webhook
whose body is authenticated with the ``x-paystack-signature`` HMAC-SHA512.
A redirect back to the app is NEVER treated as proof of payment.

Secrets: ``PAYSTACK_SECRET_KEY`` (and ``PAYSTACK_PUBLIC_KEY`` if the inline
JS popup is ever used) come from the environment via ``backend.config.secret``.
Non-secret settings — which page belongs to which plan, the currency, the
callback URL — live in ``config/<env>.json`` under ``"paystack"``.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass, field
from typing import Any, Optional
from urllib.parse import urlencode

from .config import load_config, secret

API_BASE = "https://api.paystack.co"
SIGNATURE_HEADER = "x-paystack-signature"

# Billed intervals Co-op offers. Paystack's own plan objects use the same
# words, so nothing has to be translated when subscription plans are added.
INTERVALS = ("monthly", "annual")

# Only these plans are purchasable — Enterprise is negotiated (Contact Sales).
PURCHASABLE_PLANS = ("starter", "professional", "enterprise")

DEFAULT_SECRET_ENV = "PAYSTACK_SECRET_KEY"
DEFAULT_PUBLIC_KEY_ENV = "PAYSTACK_PUBLIC_KEY"


class PaystackError(Exception):
    """Paystack rejected the request, or it is not configured."""


@dataclass(frozen=True)
class PaystackConfig:
    """The non-secret Paystack settings for this environment."""

    enabled: bool = False
    currency: str = "NGN"
    api_base: str = API_BASE
    callback_url: Optional[str] = None
    secret_key_env: str = DEFAULT_SECRET_ENV
    public_key_env: str = DEFAULT_PUBLIC_KEY_ENV
    timeout_seconds: float = 15.0
    # Hosts a caller-supplied return URL may use (open-redirect guard).
    allowed_callback_hosts: tuple[str, ...] = ()
    # plan -> hosted payment page URL (created in the Paystack dashboard)
    payment_pages: dict[str, str] = field(default_factory=dict)
    # plan -> {"monthly": kobo, "annual": kobo}. Absent = the hosted page
    # carries its own amount, so none is sent.
    prices_kobo: dict[str, dict[str, int]] = field(default_factory=dict)

    @property
    def secret_key(self) -> Optional[str]:
        return secret(self.secret_key_env) or None

    @property
    def public_key(self) -> Optional[str]:
        return secret(self.public_key_env) or None

    def page_for(self, plan: str) -> Optional[str]:
        return self.payment_pages.get(plan) or None

    def price_kobo(self, plan: str, interval: str) -> Optional[int]:
        amount = (self.prices_kobo.get(plan) or {}).get(interval)
        try:
            return int(amount) if amount is not None else None
        except (TypeError, ValueError):
            return None

    def api_ready(self) -> bool:
        """Can this deployment call the Paystack API (not just redirect)?"""
        return bool(self.secret_key)


def paystack_config() -> PaystackConfig:
    """Read the ``paystack`` section of ``config/<env>.json``."""
    try:
        raw = load_config().get("paystack", {}) or {}
    except Exception:  # noqa: BLE001 — a broken config must not break billing
        raw = {}

    pages: dict[str, str] = {}
    for plan, url in (raw.get("payment_pages") or {}).items():
        plan = str(plan).strip().lower()
        url = str(url or "").strip()
        if plan and url:
            pages[plan] = url

    prices: dict[str, dict[str, int]] = {}
    for plan, by_interval in (raw.get("prices_kobo") or {}).items():
        plan = str(plan).strip().lower()
        if not plan or not isinstance(by_interval, dict):
            continue
        clean: dict[str, int] = {}
        for interval, amount in by_interval.items():
            try:
                clean[str(interval).strip().lower()] = int(amount)
            except (TypeError, ValueError):
                continue
        if clean:
            prices[plan] = clean

    return PaystackConfig(
        enabled=bool(raw.get("enabled", False)),
        currency=str(raw.get("currency", "NGN")).upper(),
        api_base=str(raw.get("api_base", API_BASE)).rstrip("/"),
        callback_url=raw.get("callback_url") or None,
        secret_key_env=str(raw.get("secret_key_env", DEFAULT_SECRET_ENV)),
        public_key_env=str(raw.get("public_key_env", DEFAULT_PUBLIC_KEY_ENV)),
        timeout_seconds=float(raw.get("timeout_seconds", 15.0)),
        allowed_callback_hosts=tuple(
            str(h).strip().lower()
            for h in (raw.get("allowed_callback_hosts") or [])
            if str(h).strip()
        ),
        payment_pages=pages,
        prices_kobo=prices,
    )


def is_configured(cfg: Optional[PaystackConfig] = None) -> bool:
    """True when at least one real way to take money exists."""
    cfg = cfg or paystack_config()
    return bool(cfg.enabled and (cfg.payment_pages or cfg.api_ready()))


def public_config(cfg: Optional[PaystackConfig] = None) -> dict[str, Any]:
    """What the frontend is allowed to see (never a secret key)."""
    cfg = cfg or paystack_config()
    configured = is_configured(cfg)
    plans = {}
    for plan in PURCHASABLE_PLANS:
        plans[plan] = {
            # The page URL is not a secret — it is the thing we redirect to.
            "checkout_url": cfg.page_for(plan) if configured else None,
            "prices_kobo": cfg.prices_kobo.get(plan) or {},
        }
    return {
        "provider": "paystack" if configured else None,
        "enabled": configured,
        "currency": cfg.currency,
        "intervals": list(INTERVALS),
        "plans": plans,
        # True when the backend can verify charges itself (secret key present).
        "verification": cfg.api_ready() if configured else False,
    }


# ---------------------------------------------------------------------------
# References and metadata
# ---------------------------------------------------------------------------

def make_reference(prefix: str = "coop") -> str:
    """A unique, opaque, unguessable reference for one charge attempt.

    Paystack treats the reference as the idempotency key, and it is the only
    thing tying a webhook back to a business — so it must not be guessable.
    """
    return f"{prefix}_{secrets.token_urlsafe(18)}"


def build_metadata(
    business_id: int,
    plan: str,
    interval: str,
    reference: str,
    user_id: Optional[str] = None,
) -> dict[str, Any]:
    """Metadata attached to the charge.

    ``custom_fields`` is what the merchant sees in the Paystack dashboard;
    the flat keys are what the webhook reads back. Both are set because only
    the flat keys survive verbatim in the event payload.
    """
    return {
        "business_id": str(business_id),
        "plan": plan,
        "interval": interval,
        "reference": reference,
        "user_id": user_id or "",
        "custom_fields": [
            {"display_name": "Business", "variable_name": "business_id",
             "value": str(business_id)},
            {"display_name": "Plan", "variable_name": "plan", "value": plan},
            {"display_name": "Interval", "variable_name": "interval", "value": interval},
        ],
    }


def build_page_url(
    page_url: str,
    *,
    reference: str,
    email: str,
    metadata: dict[str, Any],
    callback_url: Optional[str] = None,
    amount_kobo: Optional[int] = None,
) -> str:
    """Append Co-op's charge context to a hosted payment page URL.

    Paystack's hosted pages accept ``email``, ``amount``, ``reference``,
    ``metadata`` and ``callback_url`` as query parameters. The amount is only
    sent when Co-op owns the price; otherwise the page's own amount stands.
    """
    params: dict[str, str] = {
        "email": email,
        "reference": reference,
        "metadata": json.dumps(metadata, separators=(",", ":"), sort_keys=True),
    }
    if amount_kobo is not None:
        params["amount"] = str(int(amount_kobo))
    if callback_url:
        params["callback_url"] = callback_url
    joiner = "&" if "?" in page_url else "?"
    return f"{page_url}{joiner}{urlencode(params)}"


# ---------------------------------------------------------------------------
# Webhook authentication
# ---------------------------------------------------------------------------

def verify_webhook_signature(
    raw_body: bytes,
    signature: Optional[str],
    secret_key: Optional[str],
) -> bool:
    """Check Paystack's ``x-paystack-signature`` over the RAW request body.

    HMAC-SHA512 of the exact bytes received, keyed with the secret key,
    compared in constant time. Parsing the body first and re-serialising it
    would produce a different digest, so callers must pass the raw payload.
    """
    if not signature or not secret_key:
        return False
    expected = hmac.new(secret_key.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature.strip())


# ---------------------------------------------------------------------------
# API client
# ---------------------------------------------------------------------------

class PaystackClient:
    """The two Paystack calls Co-op makes.

    ``transport`` and ``base_url`` are injectable so the test suite can drive
    this without egress (see backend/tests/test_paystack.py).
    """

    def __init__(
        self,
        secret_key: str,
        base_url: str = API_BASE,
        timeout_seconds: float = 15.0,
        transport: Any = None,
    ) -> None:
        if not secret_key:
            raise PaystackError(
                "Paystack is not configured: set PAYSTACK_SECRET_KEY on the backend."
            )
        self.secret_key = secret_key
        self.base_url = (base_url or API_BASE).rstrip("/")
        self.timeout_seconds = timeout_seconds
        self._transport = transport

    def _client(self):
        import httpx

        return httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout_seconds,
            headers={
                "Authorization": f"Bearer {self.secret_key}",
                "Content-Type": "application/json",
            },
            transport=self._transport,
        )

    async def initialize_transaction(
        self,
        *,
        email: str,
        amount_kobo: Optional[int],
        reference: str,
        callback_url: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        currency: str = "NGN",
    ) -> dict[str, Any]:
        """Start a charge; returns ``{authorization_url, access_code, reference}``.

        ``amount_kobo=None`` is only valid for a hosted page flow — Paystack's
        initialize endpoint requires an amount, so callers that reach here
        without one get a clear error rather than a 400 from the API.
        """
        if amount_kobo is None:
            raise PaystackError(
                "No amount is configured for this plan; set paystack.prices_kobo "
                "or use the hosted payment page."
            )
        payload: dict[str, Any] = {
            "email": email,
            "amount": int(amount_kobo),
            "currency": currency,
            "reference": reference,
        }
        if callback_url:
            payload["callback_url"] = callback_url
        if metadata:
            payload["metadata"] = metadata
        data = await self._request("POST", "/transaction/initialize", payload)
        return {
            "authorization_url": data.get("authorization_url", ""),
            "access_code": data.get("access_code", ""),
            "reference": data.get("reference", reference),
        }

    async def verify_transaction(self, reference: str) -> dict[str, Any]:
        """Ask Paystack whether a reference was really paid.

        Returns a normalised dict; ``status`` is Paystack's own word
        (``success``, ``failed``, ``pending``, ``abandoned``).
        """
        data = await self._request("GET", f"/transaction/verify/{reference}", None)
        return {
            "reference": data.get("reference", reference),
            "status": str(data.get("status") or "").lower(),
            "amount_kobo": int(data.get("amount") or 0),
            "currency": str(data.get("currency") or "").upper(),
            "email": data.get("customer", {}).get("email") if isinstance(
                data.get("customer"), dict) else data.get("email"),
            "paid_at": data.get("paid_at"),
            "channel": data.get("channel"),
            "metadata": data.get("metadata") or {},
            "raw": data,
        }

    async def _request(self, method: str, path: str, payload: Optional[dict]) -> dict[str, Any]:
        import httpx

        try:
            async with self._client() as client:
                resp = await client.request(method, path, json=payload)
        except httpx.HTTPError as exc:
            raise PaystackError(f"Could not reach Paystack: {exc.__class__.__name__}") from exc

        try:
            body = resp.json()
        except ValueError:
            body = {}

        if resp.status_code != 200 or not body.get("status"):
            message = str(body.get("message") or resp.text)[:200]
            raise PaystackError(f"Paystack error (HTTP {resp.status_code}): {message}")
        return body.get("data") or {}
