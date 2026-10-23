"""AI Platform — verified context, structured answer contract, metered
usage, and the safe action registry (no LLM calls: the provider is faked).
"""
from __future__ import annotations

import datetime as dt
import json

import pytest

from backend.ai import service as ai_service
from backend.ai.providers.openrouter import ProviderError, ProviderResult
from backend.models import Business, Customer, Order, OrderItem, OrderStatus, Product


def _good_reply(**over) -> dict:
    reply = {
        "type": "answer",
        "kind": "suggestion",
        "title": "Restock your top seller",
        "message": "Your top seller is running low on stock.",
        "basis": {"period": "last_30_days", "sources": ["products", "orders"]},
        "follow_ups": ["What should I reorder?", "Who should I follow up with?"],
        "links": [
            {"label": "Review inventory", "to": "/inventory?stock=low"},
            {"label": "Evil link", "to": "http://evil.example"},
        ],
        "actions": [
            {"type": "DRAFT_ORDER",
             "parameters": {"customer_name": "Grace", "product_name": "Gadget", "quantity": 2}},
            {"type": "DROP_TABLE", "parameters": {"table": "orders"}},
        ],
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
            ai_service, "build_provider",
            lambda model, key: FakeProvider(reply=reply, error=error),
        )
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    return _install


async def _seed(api):
    p = (await api.client.post("/products", json={
        "sku": "GAD-1", "name": "Gadget", "unit_price": 5.0,
        "cost_price": 2.0, "current_stock": 10,
    })).json()
    c = (await api.client.post("/customers", json={
        "full_name": "Grace", "email": "grace@example.com",
    })).json()
    o = (await api.client.post("/orders", json={
        "customer_id": c["id"],
        "items": [{"product_id": p["id"], "quantity": 4, "unit_price": 5.0}],
    })).json()
    return p, c, o


# ---------------------------------------------------------------------------
# /ai/chat — contract, links, actions, usage
# ---------------------------------------------------------------------------

async def test_chat_verified_contract_links_and_actions(api, fake_provider):
    fake_provider()
    p, c, o = await _seed(api)

    r = await api.client.post("/ai/chat", json={"question": "What should I worry about today?"})
    assert r.status_code == 200, r.text
    body = r.json()

    # Structured contract (UI reads kind/basis, never parses prose).
    assert body["kind"] == "suggestion"
    assert body["source"] == "assistant"
    assert body["model"] == "fake-model"
    assert body["basis"]["period"] == "last_30_days"
    assert "products" in body["basis"]["sources"]

    # Links: only allow-listed targets survive.
    assert body["links"] == [{"label": "Review inventory", "to": "/inventory?stock=low"}]

    # Actions: registry-validated + resolved to REAL ids; unknown type rejected.
    assert len(body["actions"]) == 1
    a = body["actions"][0]
    assert a["type"] == "DRAFT_ORDER"
    assert a["parameters"]["customer"]["id"] == c["id"]
    assert a["parameters"]["lines"][0]["product_id"] == p["id"]
    assert a["parameters"]["lines"][0]["unit_price"] == 5.0
    assert a["parameters"]["total"] == 10.0
    assert body["actions_rejected"][0]["type"] == "DROP_TABLE"

    # Metered usage recorded (1 request, within free token allowance).
    u = (await api.client.get("/ai/usage")).json()
    assert u["requests"] == 1
    assert u["credits_used"] == 1
    assert u["output_tokens"] == 20


async def test_chat_records_credits_for_large_output(api, fake_provider):
    fake_provider()
    await _seed(api)

    # Fake the token counters via a custom reply: 2,000 output tokens
    # -> 1 base credit + ceil((2000-500)/1000) = 3 credits.
    class BigFake(FakeProvider):
        def complete(self, system, messages):
            r = super().complete(system, messages)
            return ProviderResult(text=r.text, input_tokens=100,
                                  output_tokens=2000, model="fake-model")
    monkeypatch = pytest.MonkeyPatch()
    try:
        monkeypatch.setattr(ai_service, "build_provider", lambda model, key: BigFake())
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
        r = await api.client.post("/ai/chat", json={"question": "Why did sales drop?"})
        assert r.status_code == 200
        assert r.json()["credits_used"] == 3
        u = (await api.client.get("/ai/usage")).json()
        assert u["credits_used"] == 3
    finally:
        monkeypatch.undo()


async def test_chat_503_when_model_unavailable(api, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setattr(ai_service, "build_provider",
                        lambda model, key: FakeProvider(error=ProviderError("boom")))
    await _seed(api)

    r = await api.client.post("/ai/chat", json={"question": "Hello?"})
    assert r.status_code == 503


async def test_chat_503_when_not_configured(api, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    r = await api.client.post("/ai/chat", json={"question": "Hello?"})
    assert r.status_code == 503


async def test_chat_rejects_ambiguous_customer(api, fake_provider):
    fake_provider(reply=_good_reply(actions=[{
        "type": "DRAFT_ORDER",
        "parameters": {"customer_name": "John", "product_name": "Gadget", "quantity": 1},
    }]))
    p, c, o = await _seed(api)
    await api.client.post("/customers", json={"full_name": "John", "email": "john1@example.com"})
    await api.client.post("/customers", json={"full_name": "John", "email": "john2@example.com"})

    r = await api.client.post("/ai/chat", json={"question": "Draft an order for John"})
    assert r.status_code == 200
    body = r.json()
    assert body["actions"] == []
    assert "multiple customers" in body["actions_rejected"][0]["reason"]
    assert "couldn't prepare" in body["message"]  # honest note, not silent


async def test_chat_rejects_insufficient_stock(api, fake_provider):
    fake_provider(reply=_good_reply(actions=[{
        "type": "DRAFT_ORDER",
        "parameters": {"customer_name": "Grace", "product_name": "Gadget", "quantity": 999},
    }]))
    await _seed(api)  # Gadget has 10 in stock

    r = await api.client.post("/ai/chat", json={"question": "Draft an order for Grace"})
    body = r.json()
    assert body["actions"] == []
    assert "in stock" in body["actions_rejected"][0]["reason"]


async def test_chat_invalid_json_falls_back_to_503(api, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setattr(ai_service, "build_provider",
                        lambda model, key: FakeProvider(reply="not json at all"))
    await _seed(api)
    r = await api.client.post("/ai/chat", json={"question": "Hello?"})
    assert r.status_code == 503


async def test_chat_empty_business_gets_honest_clarify(api, fake_provider):
    fake_provider()  # no data seeded for this tenant
    r = await api.client.post("/ai/chat", json={"question": "How are sales?"})
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "clarify"
    assert body["links"][0]["to"] == "/import"
    # No usage recorded for the no-data short-circuit.
    u = (await api.client.get("/ai/usage")).json()
    assert u["requests"] == 0


async def test_chat_report_context_is_verified_and_attached(api):
    """'Ask Zeno about this report': the server rebuilds the verified report
    from the FILTERS and attaches it to the model's context — the client
    never supplies the numbers themselves."""
    captured = {}

    class Cap(FakeProvider):
        def complete(self, system, messages):
            captured["system"] = system
            captured["messages"] = messages
            return super().complete(system, messages)

    monkeypatch = pytest.MonkeyPatch()
    try:
        monkeypatch.setattr(ai_service, "build_provider", lambda model, key: Cap())
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
        p, c, o = await _seed(api)  # 1 order: 4 x $5 = $20 revenue today

        today = dt.date.today()
        from_ = (today - dt.timedelta(days=30)).isoformat()
        r = await api.client.post("/ai/chat", json={
            "question": "Explain this report: what changed?",
            "report": {"key": "sales", "from": from_, "to": today.isoformat()},
        })
        assert r.status_code == 200, r.text

        user_msg = captured["messages"][-1]["content"]
        # The verified report block is present, with the report's own title
        # and its real (server-computed) KPI value.
        assert '"report"' in user_msg
        assert "Sales Report" in user_msg
        assert "20.0" in user_msg
        # The prompt tells the model the attached report is its primary subject.
        assert "report" in captured["system"]
    finally:
        monkeypatch.undo()


# ---------------------------------------------------------------------------
# Credit policy (pure) + context builder (read-only, verified numbers)
# ---------------------------------------------------------------------------

def test_credit_policy_math():
    from backend.ai.usage import CreditPolicy
    p = CreditPolicy()
    assert p.apply(100, 20) == 1            # within free allowance
    assert p.apply(100, 500) == 1           # exactly the free allowance
    assert p.apply(100, 2000) == 3          # 1 + ceil(1500/1000)


async def test_context_builder_verified_numbers(session_factory):
    """The context the model sees must contain the business's REAL numbers."""
    from backend.ai.context import build_context

    bid = None
    async with session_factory() as db:
        b = Business(name="Test Co", owner_id="owner-1", currency="USD")
        db.add(b)
        await db.flush()
        prod = Product(business_id=b.id, name="Gadget", sku="G-1",
                       unit_price=10.0, cost_price=4.0, current_stock=2, reorder_level=5)
        cust = Customer(business_id=b.id, full_name="Grace", email="g@example.com")
        db.add_all([prod, cust])
        await db.flush()
        order = Order(business_id=b.id, customer_id=cust.id, status=OrderStatus.delivered,
                      total_amount=30.0, order_date=dt.datetime.now())
        db.add(order)
        await db.flush()
        db.add(OrderItem(business_id=b.id, order_id=order.id, product_id=prod.id,
                         quantity=3, unit_price=10.0, total_price=30.0))
        await db.commit()
        bid = b.id

    async with session_factory() as db:
        ctx = await build_context(db, bid)

    assert ctx["business"]["currency"] == "USD"
    assert ctx["periods"]["this_month"]["revenue"] == 30.0
    assert ctx["periods"]["this_month"]["orders"] == 1
    assert ctx["top_products_30d"][0]["name"] == "Gadget"
    assert ctx["top_products_30d"][0]["units"] == 3
    # Low stock: 2 on hand <= reorder 5.
    assert any(i["name"] == "Gadget" for i in ctx["inventory"]["low_stock"])
    # Verified insight engine contributes its findings.
    assert isinstance(ctx["verified_insights"], list)
