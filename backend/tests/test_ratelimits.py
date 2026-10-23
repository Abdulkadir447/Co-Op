"""Rate limits on the two expensive non-AI endpoints (finding 3).

/imports/commit rewrites the catalogue; /reports/{key}/export renders whole
result sets. Both are now bounded per Clerk user. The unit tests cover the
config plumbing; the route tests prove the 429 by swapping in a limiter that
refuses everything, exactly as test_ratelimit.py does for /ai/chat.
"""
from __future__ import annotations

import io
import json

import pytest
from fastapi import HTTPException

from backend import ratelimits


class _RefusingLimiter:
    def __init__(self, detail: str) -> None:
        self.detail = detail
        self.checks = 0

    def check(self, key: str) -> None:
        self.checks += 1
        raise HTTPException(status_code=429, detail=self.detail, headers={"Retry-After": "42"})


@pytest.fixture(autouse=True)
def _clean_limiters():
    ratelimits.reset()
    yield
    ratelimits.reset()


# --- config plumbing -------------------------------------------------------


def test_defaults_match_the_documented_production_limits():
    assert ratelimits.DEFAULTS["imports"] == {"requests": 20, "window_seconds": 300}
    assert ratelimits.DEFAULTS["exports"] == {"requests": 30, "window_seconds": 60}


def test_each_section_is_independent_and_worded_for_its_own_action():
    imports = ratelimits.limiter_for("imports")
    exports = ratelimits.limiter_for("exports")
    assert imports is not exports
    assert ratelimits.limiter_for("imports") is imports  # cached per section
    assert "import" in imports.detail.lower()
    assert "export" in exports.detail.lower()
    # the AI limiter's wording must not leak into these sections
    assert "Zeno" not in imports.detail and "Zeno" not in exports.detail


def test_limits_come_from_config_not_from_the_source(monkeypatch):
    monkeypatch.setattr(
        ratelimits,
        "load_config",
        lambda: {"rate_limits": {"imports": {"requests": 2, "window_seconds": 5}}},
    )
    limiter = ratelimits.limiter_for("imports")
    assert limiter.requests == 2
    assert limiter.window == 5.0
    # an unconfigured section falls back to the documented default
    assert ratelimits.limiter_for("exports").requests == ratelimits.DEFAULTS["exports"]["requests"]


def test_testing_environment_disables_both_sections():
    """config/testing.json sets requests: 0, so unrelated tests never 429."""
    from backend.config import load_config

    cfg = load_config().get("rate_limits", {})
    assert cfg["imports"]["requests"] == 0
    assert cfg["exports"]["requests"] == 0
    assert ratelimits.limiter_for("imports").requests == 0


def test_window_expiry_is_per_user():
    from backend.ai.ratelimit import SlidingWindowRateLimiter

    now = {"t": 100.0}
    limiter = SlidingWindowRateLimiter(
        requests=2, window_seconds=60, now_fn=lambda: now["t"], detail="stop"
    )
    limiter.check("user:a")
    limiter.check("user:a")
    limiter.check("user:b")  # unaffected
    with pytest.raises(HTTPException) as exc:
        limiter.check("user:a")
    assert exc.value.status_code == 429
    assert exc.value.detail == "stop"  # section-specific wording, not Zeno's
    assert int(exc.value.headers["Retry-After"]) >= 1
    now["t"] += 60.1
    limiter.check("user:a")  # window slid past


# --- route level -----------------------------------------------------------


@pytest.mark.asyncio
async def test_imports_commit_returns_429_when_the_limiter_refuses(api):
    refuser = _RefusingLimiter("Too many imports.")
    ratelimits._limiters["imports"] = refuser  # noqa: SLF001 — deliberate seam

    resp = await api.client.post(
        "/imports/commit",
        files={"file": ("products.csv", io.BytesIO(b"sku,name,unit_price\n"), "text/csv")},
        data={"entity": "products"},
    )
    assert resp.status_code == 429
    assert resp.headers["retry-after"] == "42"
    assert resp.json()["detail"] == "Too many imports."
    assert refuser.checks == 1


@pytest.mark.asyncio
async def test_report_export_returns_429_when_the_limiter_refuses(api):
    refuser = _RefusingLimiter("Too many exports.")
    ratelimits._limiters["exports"] = refuser  # noqa: SLF001 — deliberate seam

    resp = await api.client.get("/reports/sales/export", params={"format": "csv"})
    assert resp.status_code == 429
    assert resp.headers["retry-after"] == "42"
    assert refuser.checks == 1


@pytest.mark.asyncio
async def test_export_still_works_when_limiting_is_off(api):
    """The default testing config disables the limiter; export still works."""
    assert ratelimits.limiter_for("exports").requests == 0
    resp = await api.client.get("/reports/sales/export", params={"format": "csv"})
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_imports_commit_still_works_when_limiting_is_off(api):
    assert ratelimits.limiter_for("imports").requests == 0
    mapping = {"sku": "sku", "name": "name", "unit_price": "unit_price"}
    resp = await api.client.post(
        "/imports/commit",
        files={
            "file": (
                "products.csv",
                io.BytesIO(b"sku,name,unit_price\nX-1,Yam,500\n"),
                "text/csv",
            )
        },
        data={"entity": "products", "mapping": json.dumps(mapping)},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["created"]["products"] == 1, resp.json()
