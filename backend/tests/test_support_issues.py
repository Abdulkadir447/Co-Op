"""Support — owner-raised issue reports (the in-app "Report an issue" page).

Verified end-to-end through the HTTP API: a report is stored, listed, kept
tenant-scoped, emailed to the support inbox when one is configured, and —
because issue reports live in their own table — raising one never disturbs the
separate product-feedback prompt cadence.
"""
from __future__ import annotations

from backend.notifications import delivery as delivery_mod


def _payload(**over):
    base = {
        "category": "bug",
        "severity": "high",
        "subject": "Stock count is wrong after import",
        "description": "Imported 40 rows and the on-hand count doubled for 3 SKUs.",
        "contact_email": "owner@example.com",
        "app_version": "0.1.0",
        "platform": "windows",
    }
    base.update(over)
    return base


async def test_issue_report_is_stored_and_returned(api):
    api.set_user("user-issues")
    r = await api.client.post("/support/issues", json=_payload())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] > 0
    assert body["subject"] == "Stock count is wrong after import"
    assert body["category"] == "bug"
    assert body["severity"] == "high"
    assert body["status"] == "new"
    assert body["submitted_by"] == "user-issues"


async def test_issue_reports_are_listed_newest_first(api):
    api.set_user("user-issues-list")
    for subject in ("first problem", "second problem"):
        r = await api.client.post("/support/issues", json=_payload(subject=subject))
        assert r.status_code == 200, r.text

    r = await api.client.get("/support/issues")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 2
    # created_at ties inside one second are broken by id, so the newest leads.
    assert rows[0]["id"] > rows[1]["id"]


async def test_issue_report_is_tenant_scoped(api):
    api.set_user("user-issues-a")
    r = await api.client.post("/support/issues", json=_payload(subject="A only"))
    assert r.status_code == 200, r.text

    api.set_user("user-issues-b")
    r = await api.client.get("/support/issues")
    assert r.status_code == 200, r.text
    assert r.json() == []  # B cannot see A's report


async def test_unknown_category_is_rejected(api):
    api.set_user("user-issues-cat")
    r = await api.client.post("/support/issues", json=_payload(category="nonsense"))
    assert r.status_code == 422, r.text
    assert "category" in r.json()["detail"].lower()


async def test_subject_and_description_are_required(api):
    api.set_user("user-issues-req")
    r = await api.client.post("/support/issues", json=_payload(subject="x"))
    assert r.status_code == 422, r.text  # subject shorter than 3 chars
    r = await api.client.post("/support/issues", json=_payload(description="short"))
    assert r.status_code == 422, r.text  # description shorter than 10 chars


async def test_issue_report_emailed_when_inbox_configured(api, monkeypatch):
    api.set_user("user-issues-mail")
    monkeypatch.setenv("SUPPORT_INBOX", "support@coop.app")
    sent = []
    monkeypatch.setattr(delivery_mod, "send_email", lambda *a, **k: sent.append((a, k)))

    r = await api.client.post("/support/issues", json=_payload())
    assert r.status_code == 200, r.text
    assert len(sent) == 1
    (to, subject, body), _ = sent[0]
    assert to == "support@coop.app"
    assert "issue/high" in subject
    assert "Stock count is wrong after import" in body
    assert "owner@example.com" in body  # the reply-to is in the email


async def test_issue_report_email_skipped_when_no_inbox(api, monkeypatch):
    api.set_user("user-issues-nomail")
    monkeypatch.delenv("SUPPORT_INBOX", raising=False)
    monkeypatch.delenv("FEEDBACK_INBOX", raising=False)
    sent = []
    monkeypatch.setattr(delivery_mod, "send_email", lambda *a, **k: sent.append(a))

    r = await api.client.post("/support/issues", json=_payload())
    assert r.status_code == 200, r.text
    assert sent == []  # stored only, nothing emailed


async def test_raising_an_issue_does_not_touch_the_feedback_cadence(api):
    """Issue reports are their own table on purpose: ``feedback_status`` takes
    ``max(created_at)`` over every feedback row, so sharing that table would
    silently silence the periodic product prompt."""
    api.set_user("user-issues-cadence")
    before = (await api.client.get("/feedback/status")).json()

    r = await api.client.post("/support/issues", json=_payload())
    assert r.status_code == 200, r.text

    after = (await api.client.get("/feedback/status")).json()
    assert after == before
