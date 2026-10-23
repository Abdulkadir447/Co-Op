"""Supabase Storage client tests.

There is no Supabase project to talk to from the test suite, so every HTTP
call goes through httpx.MockTransport — the same approach test_paystack.py
uses. That verifies the request we *send* (method, path, auth header, upsert
flag, body) and how we interpret the response, which is the part that breaks
silently in production. It does not verify Supabase's own behaviour.
"""
from __future__ import annotations

import httpx
import pytest

from backend import storage as st

URL = "https://abcdefgh.supabase.co"
KEY = "sb-service-role-test-key"
BUCKET = "coop-assets"


@pytest.fixture(autouse=True)
def _configured_env(monkeypatch):
    """StorageConfig reads url/key from the env even when passed explicitly.

    Tests that assert on the *unconfigured* paths delete these themselves.
    """
    monkeypatch.setenv("SUPABASE_URL", URL)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)


def cfg(handler) -> st.StorageConfig:
    """A configured StorageConfig whose transport answers via `handler`."""
    return st.StorageConfig(
        bucket=BUCKET, transport=httpx.MockTransport(handler)
    )


def recording(handler):
    """Wrap a handler so tests can assert on the requests actually sent."""
    calls: list[httpx.Request] = []

    def inner(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return handler(request)

    return inner, calls


# --- configuration -----------------------------------------------------------


def test_unconfigured_by_default(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    assert st.is_configured() is False


def test_half_configured_is_still_not_configured(monkeypatch):
    """A URL with no key is a broken deploy, not a working one."""
    monkeypatch.setenv("SUPABASE_URL", URL)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    assert st.is_configured() is False

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)
    assert st.is_configured() is False


def test_fully_configured(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", URL + "/")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)
    assert st.is_configured() is True
    # trailing slash must not leak into built URLs
    assert st.storage_config().url == URL


def test_bucket_is_overridable(monkeypatch):
    monkeypatch.setenv("SUPABASE_STORAGE_BUCKET", "custom-bucket")
    assert st.storage_config().bucket == "custom-bucket"


# --- path validation ---------------------------------------------------------


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "   ",
        "../escape.png",
        "a/../../escape.png",
        "a//b.png",
        "semi;colon.png",
        "a/b/c/d/e/f/g.png",  # 7 segments, limit is 6
    ],
)
def test_rejects_unsafe_paths(bad):
    with pytest.raises(st.StorageError):
        st.validate_path(bad)


@pytest.mark.parametrize(
    "good,expected",
    [
        ("logo.png", "logo.png"),
        ("businesses/42/logo.png", "businesses/42/logo.png"),
        ("  spaced name.png ", "spaced name.png"),
        ("/leading/slash.png", "leading/slash.png"),
        ("/absolute.png", "absolute.png"),
        ("with\\backslash.png", "with/backslash.png"),
    ],
)
def test_accepts_and_normalises_safe_paths(good, expected):
    assert st.validate_path(good) == expected


# --- upload ------------------------------------------------------------------


def test_upload_sends_the_request_supabase_expects(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"Key": f"{BUCKET}/businesses/7/logo.png"})

    inner, calls = recording(handler)
    c = cfg(inner)

    out = st.upload("businesses/7/logo.png", b"\x89PNG\r\n", "image/png", cfg=c)

    req = calls[0]
    assert req.method == "POST"
    assert str(req.url) == f"{URL}/storage/v1/object/{BUCKET}/businesses/7/logo.png"
    assert req.headers["authorization"] == f"Bearer {KEY}"
    assert req.headers["content-type"] == "image/png"
    assert req.headers["x-upsert"] == "true"
    assert req.content == b"\x89PNG\r\n"

    assert out["path"] == "businesses/7/logo.png"
    assert out["bucket"] == BUCKET
    assert out["size"] == 6
    assert out["url"] == f"{URL}/storage/v1/object/public/{BUCKET}/businesses/7/logo.png"


def test_upload_without_upsert_omits_the_header(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)
    inner, calls = recording(lambda r: httpx.Response(200, json={}))
    st.upload("a.png", b"x", "image/png", upsert=False, cfg=cfg(inner))
    assert "x-upsert" not in calls[0].headers


def test_upload_refuses_when_not_configured(monkeypatch):
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    with pytest.raises(st.StorageNotConfigured):
        st.upload("a.png", b"x")


def test_upload_rejects_empty_and_oversize_payloads(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)
    c = cfg(lambda r: httpx.Response(200, json={}))
    with pytest.raises(st.StorageError):
        st.upload("a.png", b"", cfg=c)
    with pytest.raises(st.StorageError):
        st.upload("a.png", b"x" * (st.MAX_BYTES + 1), cfg=c)


def test_upload_surfaces_a_storage_error_with_status(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)
    c = cfg(lambda r: httpx.Response(400, text="The resource already exists"))
    with pytest.raises(st.StorageError) as exc:
        st.upload("a.png", b"x", cfg=c)
    assert exc.value.status_code == 400
    assert "already exists" in str(exc.value)


def test_upload_wraps_network_failure(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)

    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route to host", request=request)

    with pytest.raises(st.StorageError, match="could not reach"):
        st.upload("a.png", b"x", cfg=cfg(boom))


# --- urls --------------------------------------------------------------------


def test_public_url_is_deterministic_and_needs_no_network(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", URL)
    assert (
        st.public_url("businesses/7/logo.png")
        == f"{URL}/storage/v1/object/public/{BUCKET}/businesses/7/logo.png"
    )


def test_public_url_requires_a_project_url(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    with pytest.raises(st.StorageNotConfigured):
        st.public_url("a.png")


def test_signed_url_posts_expiry_and_builds_the_url(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)
    token = f"/object/sign/{BUCKET}/secret.pdf?token=abc123"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"signedURL": token})

    inner, calls = recording(handler)
    out = st.signed_url("secret.pdf", expires_in=600, cfg=cfg(inner))

    import json as _json

    assert _json.loads(calls[0].content) == {"expiresIn": 600}
    assert out == f"{URL}/storage/v1{token}"


def test_signed_url_rejects_silly_expiry(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)
    c = cfg(lambda r: httpx.Response(200, json={}))
    for bad in (0, -1, 604801):
        with pytest.raises(st.StorageError):
            st.signed_url("a.pdf", expires_in=bad, cfg=c)


# --- delete / list -----------------------------------------------------------


def test_delete_hits_the_right_url(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)
    inner, calls = recording(lambda r: httpx.Response(200, json=[]))
    assert st.delete("businesses/7/logo.png", cfg=cfg(inner)) is True
    assert calls[0].method == "DELETE"
    assert str(calls[0].url).endswith(f"/storage/v1/object/{BUCKET}/businesses/7/logo.png")


def test_delete_propagates_failure(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)
    c = cfg(lambda r: httpx.Response(404, text="not found"))
    with pytest.raises(st.StorageError) as exc:
        st.delete("nope.png", cfg=c)
    assert exc.value.status_code == 404


def test_list_buckets_returns_the_project_buckets(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)
    payload = [{"id": BUCKET, "name": BUCKET, "public": True}]
    c = cfg(lambda r: httpx.Response(200, json=payload))
    assert st.list_buckets(cfg=c) == payload


# --- the endpoint that consumes it -------------------------------------------
#
# A Storage client with no caller is dead code. These drive the real route
# through the app's own ASGI client, so the auth dependency, the tenant lookup,
# the content-type gate and the audit write are all exercised.


@pytest.fixture
def fake_storage(monkeypatch):
    """Storage reports itself configured and records what it was asked to store."""
    sent: list[dict] = []

    def fake_upload(path, data, content_type, **kwargs):
        sent.append({"path": path, "data": data, "content_type": content_type})
        return {
            "path": path,
            "bucket": BUCKET,
            "url": f"{URL}/storage/v1/object/public/{BUCKET}/{path}",
            "size": len(data),
        }

    monkeypatch.setattr(st, "is_configured", lambda cfg=None: True)
    monkeypatch.setattr(st, "upload", fake_upload)
    return sent


@pytest.mark.asyncio
async def test_logo_upload_stores_the_file_and_records_the_url(api, fake_storage):
    api.set_user("user-logo")
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 32

    r = await api.client.post(
        "/business/logo", files={"file": ("logo.png", png, "image/png")}
    )
    assert r.status_code == 200, r.text
    body = r.json()

    # The tenant-scoped path, not a caller-chosen one.
    assert fake_storage[0]["path"].startswith("businesses/")
    assert fake_storage[0]["path"].endswith("/logo.png")
    assert fake_storage[0]["content_type"] == "image/png"
    assert fake_storage[0]["data"] == png

    assert body["logo_url"] == f"{URL}/storage/v1/object/public/{BUCKET}/{fake_storage[0]['path']}"

    # And it is readable back through the normal settings route.
    r2 = await api.client.get("/business/settings")
    assert r2.status_code == 200
    assert r2.json()["logo_url"] == body["logo_url"]


@pytest.mark.asyncio
async def test_logo_upload_rejects_non_images_before_touching_storage(api, fake_storage):
    api.set_user("user-logo2")
    r = await api.client.post(
        "/business/logo",
        files={"file": ("evil.html", b"<script>alert(1)</script>", "text/html")},
    )
    assert r.status_code == 415, r.text
    assert fake_storage == [], "a rejected type must never reach Storage"


@pytest.mark.asyncio
async def test_logo_upload_is_503_not_500_when_storage_is_absent(api, monkeypatch):
    """An unset env var is an operator error, not a server fault."""
    api.set_user("user-logo3")
    monkeypatch.setattr(st, "is_configured", lambda cfg=None: False)
    r = await api.client.post(
        "/business/logo", files={"file": ("logo.png", b"\x89PNG", "image/png")}
    )
    assert r.status_code == 503, r.text
    assert "SUPABASE_URL" in r.json()["detail"]


@pytest.mark.asyncio
async def test_logo_upload_maps_a_storage_failure_to_502(api, monkeypatch):
    api.set_user("user-logo4")
    monkeypatch.setattr(st, "is_configured", lambda cfg=None: True)

    def boom(path, data, content_type, **kwargs):
        raise st.StorageError("bucket is full", 507)

    monkeypatch.setattr(st, "upload", boom)
    r = await api.client.post(
        "/business/logo", files={"file": ("logo.png", b"\x89PNG", "image/png")}
    )
    assert r.status_code == 502, r.text
    assert "bucket is full" in r.json()["detail"]


@pytest.mark.asyncio
async def test_logo_cannot_be_set_through_the_settings_patch(api):
    """logo_url is not in BusinessSettingsUpdate, so PATCH cannot point it
    at an arbitrary external host."""
    api.set_user("user-logo5")
    r = await api.client.patch(
        "/business/settings", json={"logo_url": "https://evil.example/x.png"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["logo_url"] is None
