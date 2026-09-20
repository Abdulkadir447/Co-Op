"""Platform-admin console — the allow-list gate and cross-tenant reads.

The console is closed by default (no allow-list => nobody is an admin), opens
only for an allow-listed email, and every ``/platform/*`` data route is a 403
for everyone else. ``/platform/me`` is the one route any signed-in user can
call (it just reports whether they are an admin, to drive the UI).
"""
from __future__ import annotations

from backend import platform_admin


def test_admin_identifiers_parse_and_match_case_insensitively(monkeypatch):
    monkeypatch.setenv("COOP_PLATFORM_ADMINS", " Admin@Coop.Test , other@coop.test ")
    assert platform_admin.admin_identifiers() == {"Admin@Coop.Test", "other@coop.test"}
    assert platform_admin.is_platform_admin("ADMIN@coop.test")
    assert platform_admin.is_platform_admin("other@coop.test")
    assert not platform_admin.is_platform_admin("rando@coop.test")
    assert not platform_admin.is_platform_admin(None)


def test_admin_match_by_clerk_user_id(monkeypatch):
    # Clerk's default token has no email claim, so the user id is the robust
    # identifier — it must match exactly and independently of any email.
    monkeypatch.setenv("COOP_PLATFORM_ADMINS", "user_abc123")
    assert platform_admin.is_platform_admin(None, "user_abc123")
    assert platform_admin.is_platform_admin("whoever@coop.test", "user_abc123")
    assert not platform_admin.is_platform_admin(None, "user_other")
    assert not platform_admin.is_platform_admin("user_abc123@coop.test", None)


def test_empty_allow_list_closes_the_console(monkeypatch):
    monkeypatch.setenv("COOP_PLATFORM_ADMINS", "")
    assert platform_admin.admin_identifiers() == set()
    assert not platform_admin.is_platform_admin("admin@coop.test", "user-a")


async def test_platform_data_routes_closed_to_non_admins(api):
    # The default test identity has no admin email -> not a platform admin.
    me = await api.client.get("/platform/me")
    assert me.status_code == 200
    assert me.json()["is_admin"] is False

    for path in ("/platform/overview", "/platform/businesses",
                 "/platform/feedback", "/platform/licenses"):
        r = await api.client.get(path)
        assert r.status_code == 403, path


async def test_platform_console_opens_for_allow_listed_admin(api, monkeypatch):
    monkeypatch.setenv("COOP_PLATFORM_ADMINS", "admin@coop.test")
    api.set_user("user-a", email="admin@coop.test")

    me = await api.client.get("/platform/me")
    assert me.status_code == 200 and me.json()["is_admin"] is True

    # Provision this tenant so there is at least one business to count.
    await api.client.get("/billing/summary")

    ov = await api.client.get("/platform/overview")
    assert ov.status_code == 200
    body = ov.json()
    assert body["businesses"] >= 1
    assert set(body) == {
        "businesses", "members", "feedback_responses", "licenses_total",
        "licenses_active", "payments_success", "payments_pending",
    }

    biz = await api.client.get("/platform/businesses")
    assert biz.status_code == 200
    assert len(biz.json()["items"]) >= 1

    fb = await api.client.get("/platform/feedback")
    assert fb.status_code == 200 and fb.json()["items"] == []

    lic = await api.client.get("/platform/licenses")
    assert lic.status_code == 200 and lic.json()["items"] == []


async def test_platform_feedback_lists_responses_across_tenants(api, monkeypatch, session_factory):
    monkeypatch.setenv("COOP_PLATFORM_ADMINS", "admin@coop.test")
    api.set_user("user-a", email="admin@coop.test")
    await api.client.get("/billing/summary")  # provision the tenant

    # A real submission through the normal (tenant) endpoint…
    from backend.models import Business, Subscription
    from sqlalchemy import select
    import datetime as dt

    async with session_factory() as db:
        biz = (
            await db.execute(select(Business).where(Business.owner_id == "user-a"))
        ).scalars().first()
        sub = (
            await db.execute(select(Subscription).where(Subscription.business_id == biz.id))
        ).scalars().first()
        sub.trial_started_at = dt.datetime.utcnow() - dt.timedelta(days=22)
        await db.commit()
    r = await api.client.post("/feedback", json={"rating": 5, "overall": "Great product"})
    assert r.status_code == 200, r.text

    # …is visible in the cross-tenant admin feed, tagged with the business name.
    fb = await api.client.get("/platform/feedback")
    assert fb.status_code == 200
    items = fb.json()["items"]
    assert len(items) == 1
    assert items[0]["overall"] == "Great product"
    assert items[0]["rating"] == 5
    assert items[0]["business_name"]


async def test_platform_console_opens_via_user_id_without_email(api, monkeypatch):
    # The realistic Clerk-default case: the token has a user id but NO email
    # claim. The user id alone must open the console.
    monkeypatch.setenv("COOP_PLATFORM_ADMINS", "user-a")
    api.set_user("user-a")  # no email

    me = await api.client.get("/platform/me")
    assert me.status_code == 200
    body = me.json()
    assert body["is_admin"] is True
    assert body["user_id"] == "user-a"
    assert body["email"] is None

    ov = await api.client.get("/platform/overview")
    assert ov.status_code == 200
