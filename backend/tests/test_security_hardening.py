"""This turn's hardening: redaction, security-event alerting and HSTS.

Nothing here touches the network: the alert webhook is driven through
``httpx.MockTransport`` and the audit write is captured with a stub session.
"""
from __future__ import annotations

import json

import httpx
import pytest

from backend.redact import deep_redact, scrub_text
from backend.security_events import _deliver, security_event

# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------

def test_deep_redact_masks_sensitive_keys_at_any_depth():
    doc = {
        "plan": "starter",
        "headers": {"authorization": "Bearer abc", "x-request-id": "1"},
        "items": [{"api_key": "k", "name": "Yam"}, {"password": "p"}],
        "token": "t",
    }
    out = deep_redact(doc)
    assert out["plan"] == "starter"
    assert out["headers"]["authorization"] == "***"
    assert out["headers"]["x-request-id"] == "1"
    assert out["items"][0]["api_key"] == "***"
    assert out["items"][0]["name"] == "Yam"
    assert out["items"][1]["password"] == "***"
    assert out["token"] == "***"
    # the original is untouched
    assert doc["token"] == "t"


def test_scrub_text_masks_secret_shapes():
    line = "key=sk_live_abc123 other pk_test_xyz Bearer eyJhbGci password=hunter2 done"
    out = scrub_text(line)
    assert "sk_live_abc123" not in out
    assert "pk_test_xyz" not in out
    assert "eyJhbGci" not in out
    assert "hunter2" not in out
    assert "other" in out and "done" in out


# ---------------------------------------------------------------------------
# Audit rows never carry secrets
# ---------------------------------------------------------------------------

class _CapturingDb:
    def __init__(self):
        self.rows = []

    def add(self, row):
        self.rows.append(row)


@pytest.mark.asyncio
async def test_record_audit_redacts_the_change_payload():
    from backend.audit import record_audit

    db = _CapturingDb()
    await record_audit(
        db, 1, "payments", None, "checkout",
        change={"reference": "coop_1", "authorization": "Bearer x", "secret": "s"},
        actor="user-a",
    )
    stored = json.loads(db.rows[0].change_json)
    assert stored["reference"] == "coop_1"
    assert stored["authorization"] == "***"
    assert stored["secret"] == "***"


# ---------------------------------------------------------------------------
# Security events: log always, alert when configured
# ---------------------------------------------------------------------------

def test_deliver_posts_and_reports_success():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={"ok": True})

    ok = _deliver("https://alerts.example/hook", {"event": "x"},
                  transport=httpx.MockTransport(handler))
    assert ok is True
    assert seen == [{"event": "x"}]


def test_deliver_never_raises_on_failure():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    assert _deliver("https://alerts.example/hook", {"event": "x"},
                    transport=httpx.MockTransport(handler)) is False


def test_security_event_logs_at_warning(caplog, monkeypatch):
    monkeypatch.delenv("SECURITY_ALERT_WEBHOOK", raising=False)
    import logging

    with caplog.at_level(logging.WARNING, logger="coop.security"):
        security_event("admin_token_rejected", path="/admin/x", token="should-not-appear")
    joined = " ".join(r.message for r in caplog.records)
    assert "admin_token_rejected" in joined
    # the sensitive key is redacted even in the log line
    assert "should-not-appear" not in joined


# ---------------------------------------------------------------------------
# HSTS is production-only
# ---------------------------------------------------------------------------

def test_hsts_header_only_in_production(api, monkeypatch):
    import backend.main as main_mod

    # not production -> no HSTS
    resp = _get(api, "/healthcheck")
    assert "strict-transport-security" not in resp.headers

    monkeypatch.setattr(main_mod, "get_env", lambda: "production")
    resp = _get(api, "/healthcheck")
    assert resp.headers["strict-transport-security"].startswith("max-age=")


def _get(api, path):
    import asyncio

    return asyncio.new_event_loop().run_until_complete(api.client.get(path))
