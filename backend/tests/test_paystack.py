"""
Paystack — no network anywhere.

The API client is driven through ``httpx.MockTransport`` (the real
api.paystack.co is not reachable from CI), which still exercises the real
request shape: URL, bearer auth, JSON body, and the response parsing. The
webhook tests sign their own bodies with a test secret key, so signature
verification runs for real.

What must hold:
  * a charge is believed only when Paystack says so — never on redirect;
  * ``x-paystack-signature`` is HMAC-SHA512 over the RAW body;
  * the same reference can never upgrade a plan twice;
  * one tenant cannot verify another tenant's reference;
  * an underpayment does not grant a plan;
  * no secret key ever leaves the backend.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from backend import payments as payments_mod
from backend.paystack import (
    PaystackClient,
    PaystackConfig,
    PaystackError,
    build_metadata,
    build_page_url,
    make_reference,
    public_config,
    verify_webhook_signature,
)

SECRET = "sk_test_coop_paystack_secret"
PAGE_STARTER = "https://pay.example.com/pay/starter-page"
PAGE_PRO = "https://pay.example.com/pay/pro-page"

TEST_CONFIG = PaystackConfig(
    enabled=True,
    currency="NGN",
    callback_url="https://app.example.test/billing",
    allowed_callback_hosts=("localhost", "127.0.0.1"),
    payment_pages={"starter": PAGE_STARTER, "professional": PAGE_PRO},
    prices_kobo={"starter": {"monthly": 2_900_000, "annual": 27_840_000}},
)


@pytest.fixture
def paystack(api, monkeypatch):
    """Config + secret key + a payer email + no egress, for every test here."""
    monkeypatch.setattr(payments_mod, "paystack_config", lambda: TEST_CONFIG)
    import backend.paystack as ps

    monkeypatch.setattr(ps, "paystack_config", lambda: TEST_CONFIG)
    monkeypatch.setenv("PAYSTACK_SECRET_KEY", SECRET)
    # Paystack charges an email address, so the identity needs one.
    api.set_user("user-a", "owner@example.com")
    return TEST_CONFIG


async def business_id(api) -> int:
    r = await api.client.get("/billing/summary")
    assert r.status_code == 200, r.text
    return r.json()["business_id"]


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()


def use_transport(monkeypatch, handler) -> list:
    """Make every PaystackClient the app builds talk to a MockTransport."""
    calls: list[httpx.Request] = []

    def recording(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return handler(request)

    def factory(cfg, transport=None):
        return PaystackClient(
            secret_key=cfg.secret_key or SECRET,
            base_url=cfg.api_base,
            timeout_seconds=cfg.timeout_seconds,
            transport=httpx.MockTransport(recording),
        )

    monkeypatch.setattr(payments_mod, "_client", factory)
    return calls


def verify_response(reference: str, status: str = "success", amount: int = 2_900_000):
    return httpx.Response(
        200,
        json={
            "status": True,
            "message": "Verification successful",
            "data": {
                "reference": reference,
                "status": status,
                "amount": amount,
                "currency": "NGN",
                "channel": "card",
                "paid_at": "2026-09-11T10:00:00.000Z",
                "customer": {"email": "owner@example.com"},
                "metadata": {"business_id": "1", "plan": "starter"},
            },
        },
    )


async def start_checkout(api, plan: str = "starter", interval: str = "monthly") -> dict:
    r = await api.client.post(
        "/billing/checkout", json={"plan": plan, "interval": interval}
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Webhook signature
# ---------------------------------------------------------------------------

def test_signature_is_hmac_sha512_of_the_raw_body():
    body = b'{"event":"charge.success","data":{"reference":"coop_1"}}'
    assert verify_webhook_signature(body, sign(body), SECRET) is True


def test_a_tampered_body_fails_the_signature():
    body = b'{"event":"charge.success","data":{"reference":"coop_1"}}'
    forged = body.replace(b'"coop_1"', b'"coop_2"')
    assert verify_webhook_signature(forged, sign(body), SECRET) is False


def test_missing_or_wrong_secret_fails_closed():
    body = b'{"event":"charge.success"}'
    assert verify_webhook_signature(body, None, SECRET) is False
    assert verify_webhook_signature(body, "", SECRET) is False
    assert verify_webhook_signature(body, sign(body), None) is False
    assert verify_webhook_signature(body, sign(body), "sk_other") is False
    assert verify_webhook_signature(body, "deadbeef", SECRET) is False


# ---------------------------------------------------------------------------
# Hosted page URLs and metadata
# ---------------------------------------------------------------------------

def test_page_url_carries_reference_email_and_metadata():
    ref = make_reference()
    meta = build_metadata(42, "starter", "monthly", ref, user_id="user_1")
    url = build_page_url(PAGE_STARTER, reference=ref, email="owner@example.com", metadata=meta)

    parsed = urlparse(url)
    assert url.startswith(PAGE_STARTER + "?")
    q = parse_qs(parsed.query)
    assert q["email"] == ["owner@example.com"]
    assert q["reference"] == [ref]
    assert "amount" not in q, "the hosted page carries its own amount"
    sent = json.loads(q["metadata"][0])
    assert sent["business_id"] == "42"
    assert sent["plan"] == "starter"
    assert {f["variable_name"] for f in sent["custom_fields"]} == {
        "business_id", "plan", "interval",
    }


def test_page_url_sends_an_amount_only_when_coop_owns_the_price():
    ref = make_reference()
    meta = build_metadata(1, "starter", "monthly", ref)
    url = build_page_url(PAGE_STARTER, reference=ref, email="a@b.test", metadata=meta,
                         amount_kobo=2_900_000, callback_url="https://app.example.test/billing")
    q = parse_qs(urlparse(url).query)
    assert q["amount"] == ["2900000"]
    assert q["callback_url"] == ["https://app.example.test/billing"]


def test_page_url_appends_to_an_existing_query_string():
    url = build_page_url(PAGE_STARTER + "?ref=x", reference="r", email="a@b.test",
                         metadata={"plan": "starter"})
    assert url.count("?") == 1 and "&" in url


def test_reference_is_unpredictable():
    refs = {make_reference() for _ in range(50)}
    assert len(refs) == 50
    assert all(r.startswith("coop_") and len(r) > 20 for r in refs)


# ---------------------------------------------------------------------------
# Config surface
# ---------------------------------------------------------------------------

def test_public_config_never_leaks_a_secret(paystack):
    body = public_config(paystack)
    assert body["enabled"] is True
    assert body["currency"] == "NGN"
    assert body["plans"]["starter"]["checkout_url"] == PAGE_STARTER
    assert SECRET not in json.dumps(body)
    assert "secret" not in json.dumps(body).lower()


def test_public_config_reports_disabled_cleanly():
    body = public_config(PaystackConfig(enabled=False))
    assert body["enabled"] is False
    assert body["provider"] is None
    assert body["plans"]["starter"]["checkout_url"] is None


def test_price_lookup_is_per_plan_and_interval(paystack):
    assert TEST_CONFIG.price_kobo("starter", "monthly") == 2_900_000
    assert TEST_CONFIG.price_kobo("starter", "annual") == 27_840_000
    # professional has a page but no Co-op price: the page's amount stands
    assert TEST_CONFIG.price_kobo("professional", "monthly") is None


def test_return_url_must_be_an_allowed_host():
    from backend.payments import resolve_callback_url

    # the configured absolute callback wins over anything requested
    assert resolve_callback_url(TEST_CONFIG, "http://evil.test/x", ["evil.test"]) == \
        "https://app.example.test/billing"

    no_configured = PaystackConfig(enabled=True, allowed_callback_hosts=("localhost",))
    assert resolve_callback_url(no_configured, "http://localhost:5173/billing") == \
        "http://localhost:5173/billing"
    assert resolve_callback_url(no_configured, "http://evil.test/billing") is None
    assert resolve_callback_url(no_configured, "javascript:alert(1)") is None


# ---------------------------------------------------------------------------
# API client (MockTransport, no egress)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_initialize_sends_the_shape_paystack_expects():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={
            "status": True,
            "data": {"authorization_url": "https://checkout.paystack.test/abc",
                     "access_code": "abc", "reference": "coop_r1"},
        })

    client = PaystackClient(SECRET, transport=httpx.MockTransport(handler))
    out = await client.initialize_transaction(
        email="owner@example.com", amount_kobo=2_900_000, reference="coop_r1",
        callback_url="https://app.example.test/billing", metadata={"plan": "starter"},
    )
    assert out["authorization_url"] == "https://checkout.paystack.test/abc"

    req = seen[0]
    assert req.method == "POST"
    assert str(req.url) == "https://api.paystack.co/transaction/initialize"
    assert req.headers["authorization"] == f"Bearer {SECRET}"
    body = json.loads(req.content)
    assert body["amount"] == 2_900_000
    assert body["currency"] == "NGN"
    assert body["reference"] == "coop_r1"
    assert body["metadata"] == {"plan": "starter"}


@pytest.mark.asyncio
async def test_verify_normalises_the_paystack_reply():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert str(request.url) == "https://api.paystack.co/transaction/verify/coop_r1"
        return verify_response("coop_r1")

    client = PaystackClient(SECRET, transport=httpx.MockTransport(handler))
    data = await client.verify_transaction("coop_r1")
    assert data["status"] == "success"
    assert data["amount_kobo"] == 2_900_000
    assert data["email"] == "owner@example.com"
    assert data["channel"] == "card"


@pytest.mark.asyncio
async def test_paystack_errors_become_paystack_errors():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"status": False, "message": "Invalid key"})

    client = PaystackClient(SECRET, transport=httpx.MockTransport(handler))
    with pytest.raises(PaystackError, match="Invalid key"):
        await client.verify_transaction("coop_r1")


def test_client_refuses_to_run_without_a_key():
    with pytest.raises(PaystackError):
        PaystackClient("")


@pytest.mark.asyncio
async def test_initialize_without_an_amount_is_a_clear_error():
    client = PaystackClient(SECRET, transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={"status": True, "data": {}})))
    with pytest.raises(PaystackError, match="No amount is configured"):
        await client.initialize_transaction(
            email="a@b.test", amount_kobo=None, reference="coop_r1")


# ---------------------------------------------------------------------------
# Routes: checkout
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_payment_config_is_public_and_honest(api, paystack):
    r = await api.client.get("/billing/payment-config")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["enabled"] is True
    assert body["provider"] == "paystack"
    assert body["plans"]["starter"]["checkout_url"] == PAGE_STARTER
    assert SECRET not in r.text


@pytest.mark.asyncio
async def test_checkout_redirects_to_the_plans_hosted_page(api, paystack):
    out = await start_checkout(api, "starter", "monthly")
    assert out["mode"] == "page"
    assert out["url"].startswith(PAGE_STARTER + "?")
    q = parse_qs(urlparse(out["url"]).query)
    assert q["reference"] == [out["reference"]]
    assert q["amount"] == ["2900000"]  # Co-op price for starter/monthly
    assert out["currency"] == "NGN"

    history = await api.client.get("/billing/payments")
    assert history.status_code == 200
    items = history.json()["items"]
    assert len(items) == 1
    assert items[0]["reference"] == out["reference"]
    assert items[0]["status"] == "pending"
    assert items[0]["plan"] == "starter"


@pytest.mark.asyncio
async def test_checkout_refuses_an_unknown_plan_or_interval(api, paystack):
    r = await api.client.post("/billing/checkout", json={"plan": "enterprise-plus"})
    assert r.status_code == 422
    r = await api.client.post(
        "/billing/checkout", json={"plan": "starter", "interval": "weekly"})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_checkout_falls_back_to_the_api_when_there_is_no_page(
    api, paystack, monkeypatch
):
    cfg = PaystackConfig(
        enabled=True, currency="NGN", payment_pages={},
        prices_kobo={"starter": {"monthly": 2_900_000}},
    )
    monkeypatch.setattr(payments_mod, "paystack_config", lambda: cfg)
    calls = use_transport(monkeypatch, lambda request: httpx.Response(200, json={
        "status": True,
        "data": {"authorization_url": "https://checkout.paystack.test/xyz",
                 "access_code": "xyz", "reference": "coop_api_1"},
    }))

    out = await start_checkout(api, "starter")
    assert out["mode"] == "api"
    assert out["url"] == "https://checkout.paystack.test/xyz"
    assert out["reference"] == "coop_api_1"
    body = json.loads(calls[0].content)
    assert body["metadata"]["plan"] == "starter"
    assert body["metadata"]["custom_fields"][0]["variable_name"] == "business_id"


@pytest.mark.asyncio
async def test_checkout_is_refused_when_payments_are_not_configured(api, monkeypatch):
    monkeypatch.setattr(payments_mod, "paystack_config", lambda: PaystackConfig(enabled=False))
    r = await api.client.post("/billing/checkout", json={"plan": "starter"})
    assert r.status_code == 422
    assert "not configured" in r.json()["detail"]


# ---------------------------------------------------------------------------
# Routes: verification and plan upgrade
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_verify_upgrades_the_plan_once_paystack_confirms(api, paystack, monkeypatch):
    out = await start_checkout(api, "starter")
    use_transport(monkeypatch, lambda request: verify_response(out["reference"]))

    r = await api.client.post("/billing/payments/verify", json={"reference": out["reference"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["applied"] is True
    assert body["payment"]["status"] == "success"
    assert body["payment"]["provider_status"] == "success"
    assert body["summary"]["plan"] == "starter"
    assert body["summary"]["payment_connected"] is True


@pytest.mark.asyncio
async def test_a_second_verify_changes_nothing(api, paystack, monkeypatch):
    out = await start_checkout(api, "starter")
    calls = use_transport(monkeypatch, lambda request: verify_response(out["reference"]))

    first = await api.client.post("/billing/payments/verify", json={"reference": out["reference"]})
    assert first.json()["applied"] is True
    second = await api.client.post("/billing/payments/verify", json={"reference": out["reference"]})
    body = second.json()
    assert body["applied"] is False
    assert body["already_applied"] is True
    assert body["summary"]["plan"] == "starter"
    assert len(calls) == 1, "an already-applied charge must not be re-verified"


@pytest.mark.asyncio
async def test_a_failed_charge_does_not_upgrade_anything(api, paystack, monkeypatch):
    out = await start_checkout(api, "starter")
    use_transport(monkeypatch, lambda request: verify_response(out["reference"], status="failed"))

    r = await api.client.post("/billing/payments/verify", json={"reference": out["reference"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["applied"] is False
    assert body["payment"]["status"] == "failed"
    assert body["summary"]["plan"] == "free"


@pytest.mark.asyncio
async def test_an_underpayment_does_not_grant_the_plan(api, paystack, monkeypatch):
    out = await start_checkout(api, "starter")
    use_transport(monkeypatch,
                  lambda request: verify_response(out["reference"], amount=100))

    r = await api.client.post("/billing/payments/verify", json={"reference": out["reference"]})
    assert r.status_code == 422
    assert "short" in r.json()["detail"]

    summary = await api.client.get("/billing/summary")
    assert summary.json()["plan"] == "free"


@pytest.mark.asyncio
async def test_verifying_an_unknown_reference_is_refused(api, paystack, monkeypatch):
    use_transport(monkeypatch, lambda request: verify_response("coop_nope"))
    r = await api.client.post("/billing/payments/verify", json={"reference": "coop_nope"})
    assert r.status_code == 422
    assert "No such payment" in r.json()["detail"]


@pytest.mark.asyncio
async def test_one_tenant_cannot_verify_anothers_reference(api, paystack, monkeypatch):
    out = await start_checkout(api, "starter")

    api.set_user("user-b")  # a different Clerk identity => a different business
    use_transport(monkeypatch, lambda request: verify_response(out["reference"]))
    r = await api.client.post("/billing/payments/verify", json={"reference": out["reference"]})
    assert r.status_code == 422

    api.set_user("user-a")
    summary = await api.client.get("/billing/summary")
    assert summary.json()["plan"] == "free"


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------

async def post_webhook(api, payload: dict, secret: str | None = SECRET, raw: bytes | None = None):
    body = raw if raw is not None else json.dumps(payload).encode()
    headers = {}
    if secret is not None:
        headers["x-paystack-signature"] = sign(body, secret)
    return await api.client.post("/webhooks/paystack", content=body, headers=headers)


def charge_success(
    reference: str, business_id: int, plan: str = "starter", amount: int = 2_900_000
):
    return {
        "event": "charge.success",
        "data": {
            "reference": reference,
            "status": "success",
            "amount": amount,
            "currency": "NGN",
            "channel": "card",
            "paid_at": "2026-09-11T10:00:00.000Z",
            "customer": {"email": "owner@example.com"},
            "metadata": build_metadata(business_id, plan, "monthly", reference),
        },
    }


@pytest.mark.asyncio
async def test_webhook_upgrades_the_plan(api, paystack):
    out = await start_checkout(api, "starter")

    r = await post_webhook(api, charge_success(out["reference"], await business_id(api)))
    assert r.status_code == 200, r.text
    assert r.json()["applied"] is True

    summary = await api.client.get("/billing/summary")
    assert summary.json()["plan"] == "starter"


@pytest.mark.asyncio
async def test_webhook_is_replayed_safely(api, paystack):
    out = await start_checkout(api, "starter")
    payload = charge_success(out["reference"], await business_id(api))

    first = await post_webhook(api, payload)
    assert first.json()["applied"] is True
    second = await post_webhook(api, payload)
    body = second.json()
    assert body["applied"] is False
    assert body["already_applied"] is True

    history = await api.client.get("/billing/payments")
    assert len(history.json()["items"]) == 1, "a replay must not create a second row"


@pytest.mark.asyncio
async def test_webhook_with_a_bad_signature_changes_nothing(api, paystack):
    out = await start_checkout(api, "starter")
    payload = charge_success(out["reference"], await business_id(api))

    for kwargs in ({"secret": "sk_wrong"}, {"secret": None}):
        r = await post_webhook(api, payload, **kwargs)
        assert r.status_code == 401, r.text

    summary = await api.client.get("/billing/summary")
    assert summary.json()["plan"] == "free"


@pytest.mark.asyncio
async def test_a_tampered_body_fails_the_signature_check(api, paystack):
    out = await start_checkout(api, "starter")
    body = json.dumps(charge_success(out["reference"], await business_id(api))).encode()
    forged = body.replace(b'"amount": 2900000', b'"amount": 999999999')
    r = await api.client.post(
        "/webhooks/paystack",
        content=forged,
        headers={"x-paystack-signature": sign(body)},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_non_charge_events_are_ignored(api, paystack):
    r = await post_webhook(api, {"event": "charge.success.pending", "data": {"reference": "x"}})
    assert r.status_code == 200
    assert r.json()["ignored"] == "charge.success.pending"


@pytest.mark.asyncio
async def test_an_unattributable_charge_is_recorded_as_ignored(api, paystack):
    payload = {"event": "charge.success", "data": {"reference": "coop_orphan", "amount": 100}}
    r = await post_webhook(api, payload)
    assert r.status_code == 200
    assert r.json()["ignored"] == "unattributable_charge"


@pytest.mark.asyncio
async def test_a_charge_paid_straight_on_the_page_still_upgrades(api, paystack):
    """No checkout row: the owner opened the hosted page directly."""
    reference = make_reference()
    expected = await business_id(api)
    r = await post_webhook(
        api, charge_success(reference, expected, plan="professional"))
    assert r.status_code == 200, r.text
    assert r.json()["applied"] is True
    assert r.json()["business_id"] == expected

    summary = await api.client.get("/billing/summary")
    assert summary.json()["plan"] == "professional"

    history = await api.client.get("/billing/payments")
    row = history.json()["items"][0]
    assert row["reference"] == reference
    assert row["plan"] == "professional"
    assert row["status"] == "success"


@pytest.mark.asyncio
async def test_an_underpaid_webhook_does_not_grant_the_plan(api, paystack):
    out = await start_checkout(api, "starter")
    r = await post_webhook(
        api, charge_success(out["reference"], await business_id(api), amount=100))
    assert r.status_code == 200
    assert r.json()["ignored"] == "underpayment"

    summary = await api.client.get("/billing/summary")
    assert summary.json()["plan"] == "free"


@pytest.mark.asyncio
async def test_webhook_body_must_be_json(api, paystack):
    body = b"not json at all"
    r = await api.client.post(
        "/webhooks/paystack", content=body,
        headers={"x-paystack-signature": sign(body)},
    )
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Config file sanity — what ships in the repo
# ---------------------------------------------------------------------------

def test_shipped_config_wires_the_three_payment_pages():
    import backend.paystack as ps
    from backend.config import load_config

    raw = load_config("development").get("paystack", {})
    assert raw["enabled"] is True
    assert raw["currency"] == "USD"
    assert set(raw["payment_pages"]) == {"starter", "professional", "enterprise"}
    assert all(u.startswith("https://") for u in raw["payment_pages"].values())
    # the testing environment never takes money
    assert load_config("testing")["paystack"]["enabled"] is False
    assert ps.SIGNATURE_HEADER == "x-paystack-signature"
