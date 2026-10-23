"""Licensing — signed activation keys (PRD Ch7 §7.19 / Ch8 §8.15).

Two halves, tested separately:

* the offline service (``backend/licensing.py``) — the exact code
  ``tools/generate_license.py`` runs with no database at all: issue, verify,
  tamper detection, expiry, normalisation of a key mangled by an email client;
* the routes — team-only minting behind ``X-Admin-Token``, owner-only
  activation, the plan grant, and revocation withdrawing that grant.
"""
from __future__ import annotations

import datetime as dt

import pytest

from backend import billing as billing_mod
from backend import licensing
from backend.models import Subscription

SIGNING_KEY = "test-signing-key-0123456789abcdef"
ADMIN_TOKEN = "team-secret-token"


@pytest.fixture(autouse=True)
def _licensing_env(monkeypatch):
    monkeypatch.setenv("LICENSE_SIGNING_KEY", SIGNING_KEY)
    monkeypatch.setenv("LICENSE_ADMIN_TOKENS", ADMIN_TOKEN)


def _admin(token: str = ADMIN_TOKEN) -> dict:
    return {"X-Admin-Token": token}


async def _business_id(api) -> int:
    me = (await api.client.get("/auth/me")).json()
    assert me["business_id"], me
    return me["business_id"]


# ---------------------------------------------------------------------------
# The offline service — no database involved
# ---------------------------------------------------------------------------

def test_issue_verify_roundtrip():
    issued = licensing.issue(42, "professional", seats=5, days=365)
    assert issued.key.startswith("COOP-")
    claims = licensing.verify(issued.key)
    assert claims.business_id == 42
    assert claims.plan == "professional"
    assert claims.seats == 5
    assert claims.fingerprint == issued.fingerprint
    assert claims.expires_at is not None
    assert claims.expires_at.date() == (dt.datetime.utcnow() + dt.timedelta(days=365)).date()


def test_key_survives_an_email_client():
    """Lower case, spaces instead of dashes, and a dropped prefix all work."""
    key = licensing.issue(7, "starter").key
    body = licensing.normalize_key(key)
    assert licensing.verify(key.lower()).business_id == 7
    assert licensing.verify(key.replace("-", " ")).business_id == 7
    assert licensing.verify(body).business_id == 7


def test_tampered_key_is_rejected():
    key = licensing.issue(1, "starter").key
    tampered = key[:-2] + ("AA" if key[-2:] != "AA" else "BB")
    with pytest.raises(licensing.LicenseError) as exc:
        licensing.verify(tampered)
    assert exc.value.reason == "invalid_signature"


def test_key_signed_with_another_key_is_rejected(monkeypatch):
    key = licensing.issue(1, "starter").key
    monkeypatch.setenv("LICENSE_SIGNING_KEY", "a-completely-different-secret")
    with pytest.raises(licensing.LicenseError) as exc:
        licensing.verify(key)
    assert exc.value.reason == "invalid_signature"


def test_expired_key_is_rejected():
    issued = licensing.issue(1, "starter", days=1)
    future = dt.datetime.utcnow() + dt.timedelta(days=2)
    with pytest.raises(licensing.LicenseError) as exc:
        licensing.verify(issued.key, now=future)
    assert exc.value.reason == "expired"


def test_free_plan_cannot_be_licensed():
    with pytest.raises(licensing.LicenseError) as exc:
        licensing.issue(1, "free")
    assert exc.value.reason == "invalid_plan"


def test_garbage_is_malformed_not_invalid():
    with pytest.raises(licensing.LicenseError) as exc:
        licensing.verify("COOP-hello-world")
    assert exc.value.reason == "malformed"


def test_missing_signing_key_is_an_explicit_refusal(monkeypatch):
    monkeypatch.delenv("LICENSE_SIGNING_KEY", raising=False)
    with pytest.raises(licensing.LicenseError) as exc:
        licensing.issue(1, "starter")
    assert exc.value.reason == "not_configured"


# ---------------------------------------------------------------------------
# The grant window is a pure function of the row + the clock (no scheduler)
# ---------------------------------------------------------------------------

def _sub(**over) -> Subscription:
    sub = Subscription(business_id=1, plan="free")
    sub.license_plan = "professional"
    sub.license_seats = 5
    sub.license_ends_at = dt.datetime.utcnow() + dt.timedelta(days=30)
    for key, value in over.items():
        setattr(sub, key, value)
    return sub


def test_licence_grants_the_plan_while_inside_the_window():
    sub = _sub()
    assert billing_mod.license_is_active(sub) is True
    assert billing_mod.effective_plan(sub) == "professional"
    state = billing_mod.license_state(sub)
    assert state["licensed"] is True and state["active"] is True
    assert state["days_remaining"] == 30


def test_licence_expiry_reverts_the_plan_with_no_job():
    sub = _sub(license_ends_at=dt.datetime.utcnow() - dt.timedelta(seconds=1))
    assert billing_mod.license_is_active(sub) is False
    assert billing_mod.effective_plan(sub) == "free"
    state = billing_mod.license_state(sub)
    assert state["expired"] is True and state["days_remaining"] == 0


def test_perpetual_licence_never_expires():
    sub = _sub(license_ends_at=None)
    assert billing_mod.license_is_active(sub) is True
    assert billing_mod.effective_plan(sub) == "professional"
    assert billing_mod.license_state(sub)["days_remaining"] == 0


def test_licence_outranks_an_active_trial():
    now = dt.datetime.utcnow()
    sub = _sub(license_plan="starter", license_ends_at=now + dt.timedelta(days=10))
    sub.trial_plan = "professional"
    sub.trial_started_at = now
    sub.trial_ends_at = now + dt.timedelta(days=5)
    assert billing_mod.effective_plan(sub, now) == "starter"


def test_no_licence_leaves_the_trial_untouched():
    now = dt.datetime.utcnow()
    sub = _sub(license_plan=None)
    sub.trial_plan = "professional"
    sub.trial_started_at = now
    sub.trial_ends_at = now + dt.timedelta(days=5)
    assert billing_mod.effective_plan(sub, now) == "professional"


# ---------------------------------------------------------------------------
# Admin minting — team only
# ---------------------------------------------------------------------------

async def test_admin_routes_are_closed_without_a_token_configured(api, monkeypatch):
    monkeypatch.delenv("LICENSE_ADMIN_TOKENS", raising=False)
    await _business_id(api)
    r = await api.client.post(
        "/admin/generate-license",
        json={"business_id": 1, "plan": "starter"},
        headers=_admin(),
    )
    assert r.status_code == 503, r.text


async def test_admin_route_rejects_a_missing_or_wrong_token(api):
    business_id = await _business_id(api)
    no_header = await api.client.post(
        "/admin/generate-license", json={"business_id": business_id, "plan": "starter"}
    )
    assert no_header.status_code == 403, no_header.text
    wrong = await api.client.post(
        "/admin/generate-license",
        json={"business_id": business_id, "plan": "starter"},
        headers=_admin("not-the-token"),
    )
    assert wrong.status_code == 403, wrong.text


async def test_admin_generates_a_signed_key(api):
    business_id = await _business_id(api)
    r = await api.client.post(
        "/admin/generate-license",
        json={"business_id": business_id, "plan": "professional", "days": 30, "seats": 3},
        headers=_admin(),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["license_key"].startswith("COOP-")
    assert body["plan"] == "professional" and body["seats"] == 3
    claims = licensing.verify(body["license_key"])
    assert claims.business_id == business_id
    # The server keeps the fingerprint, never the key.
    assert body["license_key"] not in (await api.client.get(
        "/admin/licenses", headers=_admin())).text


async def test_admin_cannot_mint_for_a_business_that_does_not_exist(api):
    await _business_id(api)
    r = await api.client.post(
        "/admin/generate-license",
        json={"business_id": 999999, "plan": "starter"},
        headers=_admin(),
    )
    assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# Activation — owner only, one business per key
# ---------------------------------------------------------------------------

async def test_activation_grants_the_licensed_plan_and_allowance(api):
    business_id = await _business_id(api)
    key = licensing.issue(business_id, "professional", seats=5, days=30).key

    r = await api.client.post("/licenses/activate", json={"key": key})
    assert r.status_code == 200, r.text
    summary = r.json()
    assert summary["plan"] == "professional"
    assert summary["granted"] == 1000
    assert summary["license"]["active"] is True
    assert summary["license"]["seats"] == 5

    status = (await api.client.get("/licenses")).json()
    assert status["effective_plan"] == "professional"
    assert status["license"]["plan"] == "professional"


async def test_activation_is_recorded_in_the_audit_trail(api):
    business_id = await _business_id(api)
    key = licensing.issue(business_id, "starter").key
    await api.client.post("/licenses/activate", json={"key": key})
    entries = (await api.client.get("/audit")).json()
    rows = entries["entries"] if isinstance(entries, dict) else entries
    assert any(row["action"] == "license_activate" for row in rows), rows[:3]


async def test_a_key_for_another_business_is_refused(api):
    business_id = await _business_id(api)
    foreign = licensing.issue(business_id + 4242, "enterprise").key
    r = await api.client.post("/licenses/activate", json={"key": foreign})
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["error"] == "wrong_business"
    assert (await api.client.get("/billing/summary")).json()["plan"] == "free"


async def test_an_invalid_key_is_a_clear_422(api):
    await _business_id(api)
    r = await api.client.post("/licenses/activate", json={"key": "COOP-not-a-real-key"})
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["error"] == "malformed"


async def test_a_manager_cannot_activate_a_licence(api):
    business_id = await _business_id(api)
    key = licensing.issue(business_id, "professional").key

    api.set_user("owner-a", email="owner@example.com")
    invite = (await api.client.post(
        "/team/invites", json={"email": "manager@example.com", "role": "manager"}
    )).json()
    api.set_user("manager-a", email="manager@example.com")
    accepted = await api.client.post("/team/invites/accept", json={"token": invite["token"]})
    assert accepted.status_code == 200, accepted.text

    r = await api.client.post("/licenses/activate", json={"key": key})
    assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# Revocation — wins over a valid signature, and withdraws the grant
# ---------------------------------------------------------------------------

async def test_revocation_withdraws_the_plan_immediately(api):
    business_id = await _business_id(api)
    issued = licensing.issue(business_id, "professional", days=30)
    await api.client.post("/licenses/activate", json={"key": issued.key})
    assert (await api.client.get("/billing/summary")).json()["plan"] == "professional"

    r = await api.client.post(
        "/admin/licenses/revoke",
        json={"fingerprint": issued.fingerprint, "reason": "chargeback"},
        headers=_admin(),
    )
    assert r.status_code == 200, r.text
    assert r.json()["revoked"] is True

    summary = (await api.client.get("/billing/summary")).json()
    assert summary["plan"] == "free"
    assert summary["license"]["active"] is False

    replay = await api.client.post("/licenses/activate", json={"key": issued.key})
    assert replay.status_code == 403, replay.text
    assert replay.json()["detail"]["error"] == "revoked"


async def test_revoking_an_unknown_key_is_404(api):
    await _business_id(api)
    r = await api.client.post(
        "/admin/licenses/revoke", json={"fingerprint": "0" * 64}, headers=_admin()
    )
    assert r.status_code == 404, r.text


async def test_admin_can_list_what_the_team_minted(api):
    business_id = await _business_id(api)
    key = licensing.issue(business_id, "starter").key
    await api.client.post("/licenses/activate", json={"key": key})
    rows = (await api.client.get("/admin/licenses", headers=_admin())).json()["licenses"]
    assert len(rows) == 1
    assert rows[0]["business_id"] == business_id
    assert rows[0]["plan"] == "starter"
    assert rows[0]["activated_at"] is not None
    assert "license_key" not in rows[0]
