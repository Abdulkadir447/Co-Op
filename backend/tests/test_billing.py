"""Real Billing + Credits — plan state, computed credit balance, and
enforcement at the AI boundary. The ai_usage ledger is the single source of
truth for credits consumed; nothing is stored that can drift.
"""
from __future__ import annotations

import datetime as dt
import json


from backend.ai import service as ai_service
from backend.ai.providers.openai import ProviderResult
from backend.models import AiUsage, Business


def _free_summary_body(body):
    assert body["plan"] == "free"
    assert body["granted"] == 25
    assert body["unlimited"] is False
    assert body["payment_connected"] is False
    return body


async def _summary(api):
    r = await api.client.get("/billing/summary")
    assert r.status_code == 200, r.text
    return r.json()


async def _seed_ai_data(api):
    """Give the tenant a product/customer/order so AI requests are admitted."""
    p = (await api.client.post("/products", json={
        "sku": "GAD-1", "name": "Gadget", "unit_price": 5.0, "current_stock": 10,
    })).json()
    c = (await api.client.post("/customers", json={
        "full_name": "Grace", "email": "grace@example.com",
    })).json()
    await api.client.post("/orders", json={
        "customer_id": c["id"],
        "items": [{"product_id": p["id"], "quantity": 4, "unit_price": 5.0}],
    })


def _install_fake(monkeypatch, output_tokens=20):
    class Fake:
        def complete(self, system, messages):
            return ProviderResult(
                text=json.dumps({
                    "type": "answer", "kind": "fact", "title": "t", "message": "m",
                    "basis": {"period": "last_30_days", "sources": ["orders"]},
                    "follow_ups": [], "links": [], "actions": [],
                }),
                input_tokens=100, output_tokens=output_tokens, model="fake-model",
            )
    monkeypatch.setattr(ai_service, "build_provider", lambda model, key: Fake())
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")


# ---------------------------------------------------------------------------
# Plan state
# ---------------------------------------------------------------------------

async def test_free_plan_autoprovisioned_with_allowance(api):
    body = _free_summary_body(await _summary(api))
    assert body["used"] == 0
    assert body["remaining"] == 25
    assert body["period"]["start"] <= body["period"]["end"]
    # The plan catalog is exposed with config-driven allowances.
    plans = {p["key"]: p for p in body["plans"]}
    assert plans["starter"]["credits_per_month"] == 200
    assert plans["enterprise"]["credits_per_month"] is None


async def test_plan_change_is_real_state(api):
    r = await api.client.post("/billing/plan", json={"plan": "starter"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["plan"] == "starter"
    assert body["granted"] == 200
    assert body["remaining"] == 200
    # Persists across requests.
    assert (await _summary(api))["plan"] == "starter"


async def test_plan_change_invalid(api):
    r = await api.client.post("/billing/plan", json={"plan": "platinum"})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Credit consumption (ledger = source of truth)
# ---------------------------------------------------------------------------

async def test_ai_chat_consumes_credits(api, monkeypatch):
    _install_fake(monkeypatch)  # 20 output tokens -> 1 credit (within free allowance)
    await _seed_ai_data(api)
    r = await api.client.post("/ai/chat", json={"question": "How are sales?"})
    assert r.status_code == 200, r.text
    body = await _summary(api)
    assert body["used"] == 1
    assert body["remaining"] == 24
    assert body["usage_month"]["requests"] == 1
    assert body["usage_month"]["output_tokens"] == 20


# ---------------------------------------------------------------------------
# Enforcement at the AI boundary
# ---------------------------------------------------------------------------

async def test_insufficient_credits_returns_402(api, session_factory, monkeypatch):
    _install_fake(monkeypatch)
    await _seed_ai_data(api)
    await _summary(api)
    # Find the business (owner of the seeded tenant) and drain the free
    # allowance directly in the ledger: 25 requests x 1 credit.
    from sqlalchemy import select
    async with session_factory() as db:
        biz = (
            (await db.execute(select(Business).where(Business.owner_id == "user-a")))
            .scalars()
            .first()
        )
        assert biz is not None
        for _ in range(25):
            db.add(AiUsage(business_id=biz.id, model="fake-model",
                           input_tokens=10, output_tokens=10, credits_used=1,
                           answer_kind="fact"))
        await db.commit()

    assert (await _summary(api))["remaining"] == 0

    r = await api.client.post("/ai/chat", json={"question": "How are sales?"})
    assert r.status_code == 402, r.text
    detail = r.json()["detail"]
    assert detail["error"] == "insufficient_credits"
    assert detail["plan"] == "free"
    assert detail["remaining"] == 0
    assert "credits" in detail["message"]

    # No usage was recorded for the rejected request.
    assert (await _summary(api))["used"] == 25


async def test_enterprise_is_unlimited(api, session_factory, monkeypatch):
    _install_fake(monkeypatch)
    await _seed_ai_data(api)
    r = await api.client.post("/billing/plan", json={"plan": "enterprise"})
    assert r.status_code == 200
    assert r.json()["unlimited"] is True
    assert r.json()["remaining"] is None

    # Even a drained month does not block an unlimited plan.
    from sqlalchemy import select
    async with session_factory() as db:
        biz = (
            (await db.execute(select(Business).where(Business.owner_id == "user-a")))
            .scalars()
            .first()
        )
        for _ in range(5):
            db.add(AiUsage(business_id=biz.id, model="fake-model",
                           input_tokens=10, output_tokens=10, credits_used=1))
        await db.commit()

    r = await api.client.post("/ai/chat", json={"question": "How are sales?"})
    assert r.status_code == 200, r.text


async def test_previous_month_usage_does_not_count(api, session_factory):
    """Allowances refresh on the 1st — last month's usage doesn't reduce
    this month's remaining balance."""
    await _summary(api)  # provision
    from sqlalchemy import select
    today = dt.date.today()
    first_this = today.replace(day=1)
    last_month_day = (first_this - dt.timedelta(days=1))
    async with session_factory() as db:
        biz = (
            (await db.execute(select(Business).where(Business.owner_id == "user-a")))
            .scalars()
            .first()
        )
        db.add(AiUsage(business_id=biz.id, model="fake-model",
                       input_tokens=10, output_tokens=10, credits_used=25,
                       created_at=dt.datetime.combine(last_month_day, dt.time(12))))
        await db.commit()

    body = await _summary(api)
    assert body["used"] == 0
    assert body["remaining"] == 25


# ---------------------------------------------------------------------------
# Credit math (pure)
# ---------------------------------------------------------------------------

def test_month_bounds():
    from backend.billing import month_bounds
    start, end = month_bounds(dt.date(2026, 8, 28))
    assert start == dt.datetime(2026, 8, 1)
    assert end == dt.datetime(2026, 9, 1)
    start, end = month_bounds(dt.date(2026, 12, 15))
    assert end == dt.datetime(2027, 1, 1)


# ---------------------------------------------------------------------------
# Free trial (opt-in, one per business, lazy expiry)
# ---------------------------------------------------------------------------

async def _sub(session_factory, owner="user-a"):
    """Fetch the tenant's subscription row directly."""
    from sqlalchemy import select

    from backend.models import Subscription
    async with session_factory() as db:
        biz = (
            (await db.execute(select(Business).where(Business.owner_id == owner)))
            .scalars()
            .first()
        )
        return (await db.execute(
            select(Subscription).where(Subscription.business_id == biz.id)
        )).scalars().first()


async def _expire_trial(session_factory, owner="user-a"):
    """Move the trial window into the past (simulates the 10 days elapsing)."""
    from sqlalchemy import select

    from backend.models import Subscription
    async with session_factory() as db:
        biz = (
            (await db.execute(select(Business).where(Business.owner_id == owner)))
            .scalars()
            .first()
        )
        sub = (await db.execute(
            select(Subscription).where(Subscription.business_id == biz.id)
        )).scalars().first()
        sub.trial_started_at = dt.datetime.utcnow() - dt.timedelta(days=11)
        sub.trial_ends_at = dt.datetime.utcnow() - dt.timedelta(days=1)
        await db.commit()


async def test_trial_offered_to_new_business(api):
    body = await _summary(api)
    assert body["trial_days"] == 10
    assert body["trial"]["available"] is True
    assert body["trial"]["active"] is False
    assert body["trial"]["used"] is False
    assert body["base_plan"] == "free"
    # Paid plans advertise trialability; free does not.
    plans = {p["key"]: p for p in body["plans"]}
    assert plans["professional"]["trialable"] is True
    assert plans["free"]["trialable"] is False


async def test_start_trial_grants_plan_allowance_for_10_days(api):
    r = await api.client.post("/billing/trial", json={"plan": "professional"})
    assert r.status_code == 200, r.text
    body = r.json()
    # Effective plan + allowance are the trialled plan's...
    assert body["plan"] == "professional"
    assert body["granted"] == 1000
    assert body["remaining"] == 1000
    # ...while the plan the business actually owns is untouched.
    assert body["base_plan"] == "free"
    t = body["trial"]
    assert t["active"] is True
    assert t["used"] is True
    assert t["available"] is False
    assert t["plan"] == "professional"
    assert t["days_remaining"] == 10
    ends = dt.datetime.fromisoformat(t["ends_at"])
    started = dt.datetime.fromisoformat(t["started_at"])
    assert (ends - started).days == 10


async def test_trial_survives_reload_and_is_not_a_plan_change(api, session_factory):
    await api.client.post("/billing/trial", json={"plan": "starter"})
    sub = await _sub(session_factory)
    assert sub.plan == "free"          # base plan never overwritten
    assert sub.trial_plan == "starter"
    assert sub.status == "trialing"
    assert (await _summary(api))["plan"] == "starter"


async def test_trial_cannot_be_started_twice(api):
    assert (await api.client.post(
        "/billing/trial", json={"plan": "professional"})).status_code == 200
    r = await api.client.post("/billing/trial", json={"plan": "professional"})
    assert r.status_code == 409
    assert r.json()["detail"]["error"] == "trial_unavailable"
    assert "already used" in r.json()["detail"]["message"]


async def test_trial_cannot_be_restarted_after_it_expires(api, session_factory):
    await api.client.post("/billing/trial", json={"plan": "professional"})
    await _expire_trial(session_factory)
    r = await api.client.post("/billing/trial", json={"plan": "professional"})
    assert r.status_code == 409


async def test_trial_rejects_free_and_unknown_plans(api):
    for plan in ("free", "platinum", ""):
        r = await api.client.post("/billing/trial", json={"plan": plan})
        assert r.status_code == 409, plan


async def test_trial_not_available_on_a_paid_plan(api):
    await api.client.post("/billing/plan", json={"plan": "starter"})
    r = await api.client.post("/billing/trial", json={"plan": "professional"})
    assert r.status_code == 409
    assert "Free plan" in r.json()["detail"]["message"]


async def test_expired_trial_reverts_to_free_with_no_scheduler(api, session_factory):
    await api.client.post("/billing/trial", json={"plan": "professional"})
    await _expire_trial(session_factory)
    body = await _summary(api)
    assert body["plan"] == "free"        # effective plan fell back
    assert body["granted"] == 25         # free allowance again
    assert body["base_plan"] == "free"
    t = body["trial"]
    assert t["active"] is False
    assert t["expired"] is True
    assert t["used"] is True
    assert t["available"] is False
    assert t["days_remaining"] == 0


async def test_expired_trial_enforces_free_allowance_at_the_ai_boundary(
    api, session_factory, monkeypatch
):
    """The trial's larger allowance must not outlive the window."""
    _install_fake(monkeypatch)
    await _seed_ai_data(api)
    await api.client.post("/billing/trial", json={"plan": "professional"})
    await _expire_trial(session_factory)

    from sqlalchemy import select
    async with session_factory() as db:
        biz = (
            (await db.execute(select(Business).where(Business.owner_id == "user-a")))
            .scalars()
            .first()
        )
        for _ in range(25):  # drain the FREE allowance only
            db.add(AiUsage(business_id=biz.id, model="fake-model",
                           input_tokens=10, output_tokens=10, credits_used=1,
                           answer_kind="fact"))
        await db.commit()

    r = await api.client.post("/ai/chat", json={"question": "How are sales?"})
    assert r.status_code == 402, r.text
    detail = r.json()["detail"]
    assert detail["trial"]["expired"] is True
    assert "free trial has ended" in detail["message"]


async def test_cancelling_a_running_trial_is_refused(api):
    """A started trial runs to its end: a free downgrade can't stop it early."""
    await api.client.post("/billing/trial", json={"plan": "professional"})

    r = await api.client.post("/billing/plan", json={"plan": "free"})
    assert r.status_code == 409
    assert r.json()["detail"]["error"] == "trial_locked"
    assert "cannot be cancelled" in r.json()["detail"]["message"]

    # The paid capability keeps applying until the window closes.
    body = await _summary(api)
    assert body["plan"] == "professional"
    assert body["trial"]["active"] is True


async def test_paid_switch_during_a_trial_requires_payment_when_live(api, monkeypatch):
    """With Paystack configured, converting mid-trial must go through checkout."""
    import backend.paystack as ps
    from backend import payments as payments_mod
    from backend.paystack import PaystackConfig

    enabled = PaystackConfig(enabled=True, payment_pages={"starter": "https://p/x"})
    monkeypatch.setattr(payments_mod, "paystack_config", lambda: enabled)
    monkeypatch.setattr(ps, "paystack_config", lambda: enabled)
    monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test_x")

    await api.client.post("/billing/trial", json={"plan": "professional"})
    r = await api.client.post("/billing/plan", json={"plan": "starter"})
    assert r.status_code == 402
    assert r.json()["detail"]["error"] == "payment_required"


async def test_paying_during_a_trial_converts_and_ends_it(api, monkeypatch):
    """The one way out of a trial early is to pay: it converts and closes it."""
    import backend.paystack as ps
    from backend import payments as payments_mod
    from backend.paystack import PaystackConfig

    enabled = PaystackConfig(
        enabled=True,
        payment_pages={"starter": "https://p/x"},
        prices_kobo={"starter": {"monthly": 100}},
    )
    monkeypatch.setattr(payments_mod, "paystack_config", lambda: enabled)
    monkeypatch.setattr(ps, "paystack_config", lambda: enabled)
    monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test_x")
    api.set_user("user-a", "owner@example.com")  # Paystack charges an email

    await api.client.post("/billing/trial", json={"plan": "professional"})
    out = await api.client.post("/billing/checkout", json={"plan": "starter"})
    assert out.status_code == 200, out.text
    reference = out.json()["reference"]

    # Simulate the webhook confirming the charge.
    import hashlib
    import hmac
    import json as json_mod

    payload = {
        "event": "charge.success",
        "data": {
            "reference": reference,
            "status": "success",
            "amount": 100,
            "currency": "NGN",
            "paid_at": "2026-09-11T10:00:00.000Z",
            "metadata": {
                "business_id": "1", "plan": "starter", "interval": "monthly",
                "reference": reference,
            },
        },
    }
    raw = json_mod.dumps(payload).encode()
    sig = hmac.new(b"sk_test_x", raw, hashlib.sha512).hexdigest()
    r = await api.client.post(
        "/webhooks/paystack", content=raw, headers={"x-paystack-signature": sig}
    )
    assert r.status_code == 200, r.text
    assert r.json()["applied"] is True

    body = await _summary(api)
    assert body["plan"] == "starter"
    assert body["trial"]["active"] is False   # the trial closed on payment


async def test_free_switch_still_works_before_any_provider(api):
    """No provider configured → the manual switch keeps working (dev/testing)."""
    r = await api.client.post("/billing/plan", json={"plan": "professional"})
    assert r.status_code == 200
    assert r.json()["plan"] == "professional"


async def test_trial_is_tenant_scoped(api, session_factory):
    """One business's trial must not affect another's eligibility."""
    await api.client.post("/billing/trial", json={"plan": "professional"})
    api.set_user("user-b", email="b@example.com")
    body = await _summary(api)
    assert body["plan"] == "free"
    assert body["trial"]["available"] is True
    assert body["trial"]["used"] is False


async def test_trial_start_is_audited(api):
    await api.client.post("/billing/trial", json={"plan": "professional"})
    r = await api.client.get("/audit")
    assert r.status_code == 200
    actions = [e["action"] for e in r.json()]
    assert "trial_start" in actions


# ---------------------------------------------------------------------------
# Trial math (pure)
# ---------------------------------------------------------------------------

def test_trial_days_remaining_rounds_up():
    from backend.billing import trial_days_remaining
    from backend.models import Subscription

    now = dt.datetime(2026, 9, 2, 12, 0)
    sub = Subscription(business_id=1, plan="free", trial_plan="professional",
                       trial_started_at=now)
    # A partial final day still reads as a day remaining, never 0-while-active.
    sub.trial_ends_at = now + dt.timedelta(hours=3)
    assert trial_days_remaining(sub, now) == 1
    sub.trial_ends_at = now + dt.timedelta(days=9, hours=12)
    assert trial_days_remaining(sub, now) == 10
    sub.trial_ends_at = now - dt.timedelta(seconds=1)   # expired
    assert trial_days_remaining(sub, now) == 0


def test_effective_plan_is_pure():
    from backend.billing import effective_plan
    from backend.models import Subscription

    now = dt.datetime(2026, 9, 2, 12, 0)
    sub = Subscription(business_id=1, plan="free")
    assert effective_plan(sub, now) == "free"
    sub.trial_plan = "professional"
    sub.trial_started_at = now - dt.timedelta(days=1)
    sub.trial_ends_at = now + dt.timedelta(days=9)
    assert effective_plan(sub, now) == "professional"
    # Same row, later clock -> base plan. No write required.
    assert effective_plan(sub, now + dt.timedelta(days=10)) == "free"
