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


def test_unhandled_errors_never_leak_secrets_in_any_environment():
    """Production says nothing; development names the exception *class* only.

    The class is included because "Internal server error" with no hint cost
    three debugging rounds. The *message* is never included in either mode: a
    SQLAlchemy error routinely embeds the DSN, i.e. the real database password,
    and that string would end up in a screenshot or a bug report.
    """

    class Boom(Exception):
        pass

    req = SimpleNamespace(method="GET", url=SimpleNamespace(path="/x"))
    err = Boom("sk_live_super_secret_do_not_leak postgresql://u:hunter2@h/db")

    from backend import main as main_mod

    # Production: generic, no internals at all.
    original = main_mod._DOCS_ENABLED
    try:
        main_mod._DOCS_ENABLED = False
        resp = _run(_unhandled_error_handler(req, err))
        assert json.loads(resp.body) == {"detail": "Internal server error."}

        # Development: the class name, and nothing that could be a secret.
        main_mod._DOCS_ENABLED = True
        resp = _run(_unhandled_error_handler(req, err))
        text = resp.body.decode()
        assert "Boom" in text  # the useful part
        assert "sk_live" not in text
        assert "hunter2" not in text
        assert "super_secret" not in text
    finally:
        main_mod._DOCS_ENABLED = original
