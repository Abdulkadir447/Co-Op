"""HTTP hardening (checklist 148-155): headers on every response and a
never-leaking 500.

The header middleware is exercised through a real request; the 500 handler is
driven directly so we can prove an internal exception (including one whose
message embeds a fake secret) is reduced to a generic body.
"""
from __future__ import annotations

import json
from types import SimpleNamespace

from backend.main import _unhandled_error_handler


def test_every_response_carries_the_hardening_headers(api):
    resp = _run(api.client.get("/healthcheck"))
    for header, value in {
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
    }.items():
        assert resp.headers.get(header) == value, header
    assert "default-src 'none'" in resp.headers.get("content-security-policy", "")


def _run(coro):
    import asyncio

    return asyncio.new_event_loop().run_until_complete(coro)


def test_unhandled_errors_never_leak_internals():
    class Boom(Exception):
        pass

    req = SimpleNamespace(method="GET", url=SimpleNamespace(path="/x"))
    err = Boom("sk_live_super_secret_do_not_leak")

    loop = _run(_unhandled_error_handler(req, err))
    assert loop.status_code == 500
    body = json.loads(loop.body)
    assert body["detail"] == "Internal server error."
    assert "sk_live" not in loop.body.decode()
    assert "Boom" not in loop.body.decode()
