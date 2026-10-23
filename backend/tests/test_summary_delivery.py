"""Daily summary EMAIL delivery — the outbound channel for the in-app
summary (queue item 4). SMTP is stdlib smtplib behind notifications.smtp
config + env overrides; the tests capture messages with a fake SMTP class.
"""

import pytest

from backend.notifications import delivery as delivery_mod


class FakeSMTP:
    sent = []

    def __init__(self, host, port, timeout=15):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.tls_started = False
        self.logged_in = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        self.tls_started = True

    def login(self, username, password):
        self.logged_in = (username, password)

    def send_message(self, msg):
        FakeSMTP.sent.append(msg)


@pytest.fixture(autouse=True)
def fake_smtp(monkeypatch):
    FakeSMTP.sent = []
    monkeypatch.setattr(delivery_mod.smtplib, "SMTP", FakeSMTP)
    yield FakeSMTP


def _configure_smtp(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USERNAME", "apikey")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("SMTP_FROM", "Co-op <no-reply@example.com>")


async def _seed_data(api):
    p = (await api.client.post(
        "/products", json={"name": "Chair", "sku": "CH1", "unit_price": 50.0, "current_stock": 10}
    )).json()
    c = (await api.client.post(
        "/customers", json={"full_name": "Grace", "email": "g@x.com"}
    )).json()
    await api.client.post(
        "/orders",
        json={
            "customer_id": c["id"],
            "status": "delivered",
            "items": [{"product_id": p["id"], "quantity": 2, "unit_price": 50.0}],
        },
    )


@pytest.mark.asyncio
async def test_send_delivers_summary_email(api, monkeypatch):
    _configure_smtp(monkeypatch)
    api.set_user("owner-mail", email="owner@example.com")
    await _seed_data(api)

    resp = await api.client.post(
        "/notifications/summary/send", json={"email": "boss@example.com"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["email"] == "boss@example.com"

    assert len(FakeSMTP.sent) == 1
    msg = FakeSMTP.sent[0]
    assert msg["To"] == "boss@example.com"
    assert msg["From"] == "Co-op <no-reply@example.com>"
    assert "daily summary" in msg["Subject"].lower()
    body = msg.get_content()
    assert "Chair" in body or "100.00" in body  # revenue line rendered
    assert "Test" in body or "Co" in body


@pytest.mark.asyncio
async def test_send_unconfigured_answers_503(api, monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    api.set_user("owner-nomailcfg", email="owner@example.com")
    await _seed_data(api)
    resp = await api.client.post(
        "/notifications/summary/send", json={"email": "boss@example.com"}
    )
    assert resp.status_code == 503
    assert FakeSMTP.sent == []


@pytest.mark.asyncio
async def test_send_rate_limited(api, monkeypatch):
    _configure_smtp(monkeypatch)
    api.set_user("owner-spam", email="owner@example.com")
    await _seed_data(api)
    for _ in range(3):
        resp = await api.client.post(
            "/notifications/summary/send", json={"email": "boss@example.com"}
        )
        assert resp.status_code == 200
    resp = await api.client.post(
        "/notifications/summary/send", json={"email": "boss@example.com"}
    )
    assert resp.status_code == 429
    assert "Retry-After" in resp.headers


@pytest.mark.asyncio
async def test_send_requires_operational_role(api, monkeypatch):
    _configure_smtp(monkeypatch)
    api.set_user("owner-team", email="owner@example.com")
    await api.client.post(
        "/team/invites", json={"email": "viewer@example.com", "role": "viewer"}
    )
    roster = (await api.client.get("/team")).json()
    token = next(i["token"] for i in roster["invitations"])
    api.set_user("user-viewer2", email="viewer@example.com")
    await api.client.post("/team/invites/accept", json={"token": token})

    resp = await api.client.post(
        "/notifications/summary/send", json={"email": "viewer@example.com"}
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_send_without_any_email_is_400(api, monkeypatch):
    _configure_smtp(monkeypatch)
    api.set_user("owner-noemail")
    await _seed_data(api)
    resp = await api.client.post("/notifications/summary/send", json={})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_render_summary_text_covers_empty_business(api):
    api.set_user("owner-empty-mail")
        # use the endpoint's own summary for a business with no data
    summary = (await api.client.get("/notifications/daily-summary")).json()
    from backend.notifications.schemas import DailySummary

    text = delivery_mod.render_summary_text(DailySummary(**summary))
    assert "daily summary" in text.lower() or "Co-op" in text
    assert text.strip()


@pytest.mark.asyncio
async def test_send_uses_resend_when_configured(api, monkeypatch):
    """With RESEND_API_KEY set, the summary goes out via the Resend API."""
    monkeypatch.setenv("RESEND_API_KEY", "re_test_123")
    monkeypatch.setenv("RESEND_FROM", "CO OP <hello@verified.com>")
    monkeypatch.delenv("SMTP_HOST", raising=False)
    api.set_user("owner-mail", email="owner@example.com")
    await _seed_data(api)

    captured: dict = {}

    class FakeResp:
        status_code = 200
        text = "{}"

    def fake_post(url, json=None, headers=None, timeout=None):
        captured.update(url=url, json=json, headers=headers)
        return FakeResp()

    monkeypatch.setattr(delivery_mod.httpx, "post", fake_post)

    resp = await api.client.post(
        "/notifications/summary/send", json={"email": "boss@example.com"}
    )
    assert resp.status_code == 200, resp.text
    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["json"]["to"] == ["boss@example.com"]
    assert captured["json"]["from"] == "CO OP <hello@verified.com>"
    assert captured["headers"]["Authorization"] == "Bearer re_test_123"
    assert "daily summary" in captured["json"]["subject"].lower()
