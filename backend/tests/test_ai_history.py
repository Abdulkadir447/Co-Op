"""AI Platform — AI history (PRD Phase 3 deliverable).

The owner-visible activity ledger: one row per COMPLETED /ai/chat turn.
Failed requests (503) never land in the history — it shows only what Co-op
actually answered. No LLM calls: the provider is faked.
"""

from __future__ import annotations

import json

import pytest

from backend.ai import service as ai_service
from backend.ai.providers.openrouter import ProviderError, ProviderResult


def _good_reply(**over) -> dict:
    reply = {
        "type": "answer",
        "kind": "fact",
        "title": "Revenue this month",
        "message": "You made $1,000 across 4 orders this month.",
        "basis": {"period": "this_month", "sources": ["orders"]},
        "follow_ups": [],
        "links": [],
        "actions": [],
    }
    reply.update(over)
    return reply


class FakeProvider:
    name = "fake"

    def __init__(self, reply=None, error=None):
        self.reply = reply if reply is not None else _good_reply()
        self.error = error

    def complete(self, system: str, messages: list) -> ProviderResult:
        if self.error:
            raise self.error
        text = self.reply if isinstance(self.reply, str) else json.dumps(self.reply)
        return ProviderResult(text=text, input_tokens=100, output_tokens=20, model="fake-model")


@pytest.fixture
def fake_provider(monkeypatch):
    def _install(reply=None, error=None):
        monkeypatch.setattr(
            ai_service,
            "build_provider",
            lambda model, key: FakeProvider(reply=reply, error=error),
        )
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")

    return _install


async def _seed(api):
    await api.client.post(
        "/products",
        json={
            "sku": "H-1",
            "name": "Chair",
            "unit_price": 100.0,
            "current_stock": 10,
        },
    )
    await api.client.post("/customers", json={"full_name": "Grace", "email": "g@x.com"})
    await api.client.post(
        "/orders",
        json={
            "customer_id": (await api.client.get("/customers")).json()["items"][0]["id"],
            "items": [
                {
                    "product_id": (await api.client.get("/products")).json()["items"][0]["id"],
                    "quantity": 2,
                    "unit_price": 100.0,
                }
            ],
        },
    )


# ---------------------------------------------------------------------------
# Recording + listing
# ---------------------------------------------------------------------------


async def test_completed_turns_are_recorded(api, fake_provider):
    fake_provider()
    await _seed(api)

    await api.client.post("/ai/chat", json={"question": "How is revenue this month?"})
    await api.client.post("/ai/chat", json={"question": "What are my top products?"})

    r = await api.client.get("/ai/history")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2

    newest = body["items"][0]
    assert newest["question"] == "What are my top products?"  # newest first
    assert newest["answer_kind"] == "fact"
    assert newest["answer_title"] == "Revenue this month"
    assert newest["answer_summary"]
    assert newest["model"] == "fake-model"
    assert newest["credits_used"] == 1  # default policy: 1 credit per request
    assert newest["created_at"]


async def test_history_is_newest_first_and_paginated(api, fake_provider):
    fake_provider()
    await _seed(api)

    for i in range(3):
        await api.client.post("/ai/chat", json={"question": f"Question number {i}?"})

    page1 = (await api.client.get("/ai/history", params={"limit": 2})).json()
    assert page1["total"] == 3
    assert [it["question"] for it in page1["items"]] == ["Question number 2?", "Question number 1?"]

    page2 = (await api.client.get("/ai/history", params={"limit": 2, "offset": 2})).json()
    assert [it["question"] for it in page2["items"]] == ["Question number 0?"]


async def test_report_ref_is_stored(api, fake_provider):
    fake_provider()
    await _seed(api)

    r = await api.client.post(
        "/ai/chat",
        json={
            "question": "Explain this report",
            "report": {"key": "sales", "from": "2026-01-01", "to": "2026-06-30"},
        },
    )
    assert r.status_code == 200, r.text

    body = (await api.client.get("/ai/history")).json()
    assert body["total"] == 1
    assert body["items"][0]["report_key"] == "sales"


# ---------------------------------------------------------------------------
# Honesty + tenancy + clearing
# ---------------------------------------------------------------------------


async def test_failed_chat_is_not_recorded(api, fake_provider):
    """A 503 (model unreachable) is not an answer — the history must not
    claim one exists."""
    fake_provider(error=ProviderError("boom"))
    await _seed(api)

    r = await api.client.post("/ai/chat", json={"question": "How is revenue?"})
    assert r.status_code == 503

    body = (await api.client.get("/ai/history")).json()
    assert body["total"] == 0
    assert body["items"] == []


async def test_history_is_tenant_scoped(api, fake_provider):
    fake_provider()
    await _seed(api)
    await api.client.post("/ai/chat", json={"question": "How is revenue?"})
    assert (await api.client.get("/ai/history")).json()["total"] == 1

    api.set_user("user-b")  # different owner -> empty history
    body = (await api.client.get("/ai/history")).json()
    assert body["total"] == 0


async def test_clear_history(api, fake_provider):
    fake_provider()
    await _seed(api)
    for i in range(2):
        await api.client.post("/ai/chat", json={"question": f"Question {i}?"})

    r = await api.client.delete("/ai/history")
    assert r.status_code == 200, r.text
    assert r.json() == {"deleted": 2}

    assert (await api.client.get("/ai/history")).json()["total"] == 0
    # Clearing an already-empty history is a no-op.
    assert (await api.client.delete("/ai/history")).json() == {"deleted": 0}
