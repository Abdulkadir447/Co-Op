"""Zeno's learning ledger (0022) — graded mistakes and owner-taught preferences.

The feature is only trustworthy if its *refusals* are pinned down as tightly as
its behaviour, so these tests fix the rules that matter:

  * severity is 1-5 and nothing else (a 7 is a 422, not a clamp);
  * the same mistake twice is ONE lesson with repeat_count=2, not two rows —
    the ledger has to stay small enough to fit in a prompt;
  * a preference is a *candidate* and is NOT injected into the prompt;
  * only an explicit owner accept makes it active;
  * a dismissed lesson is never resurrected by repetition;
  * one tenant can neither read nor modify another's lessons;
  * a refused AI proposal is graded by what executing it would have cost.
"""
from __future__ import annotations

from backend.ai import lessons as zeno
from backend.ai.prompts import build_system_prompt


def test_severity_scale_is_five_labels() -> None:
    assert sorted(zeno.SEVERITY_LABELS) == [1, 2, 3, 4, 5]


def test_severity_validation_rejects_out_of_range() -> None:
    for bad in (0, 6, -1, 99):
        try:
            zeno._validate_severity(bad)
        except ValueError as e:
            assert "1 and 5" in str(e)
        else:  # pragma: no cover
            raise AssertionError(f"severity {bad} should be rejected")


def test_rejection_severity_follows_the_money() -> None:
    # Ambiguous customer = could put a real order on the wrong party.
    assert zeno.severity_for_rejection("multiple customers match 'Ada'") == 4
    # Stock / price problems would have produced a wrong order.
    assert zeno.severity_for_rejection("only 3 of 'Widget' in stock") == 3
    assert zeno.severity_for_rejection("'Widget' has no selling price") == 3
    # Attempting a capability that is not in the registry is a smaller sin.
    assert zeno.severity_for_rejection("not a supported action") == 2


def test_render_is_empty_without_lessons() -> None:
    assert zeno.render_lessons([]) == ""


def test_active_lesson_changes_the_system_prompt() -> None:
    block = zeno.render_lessons(
        [
            {
                "severity": 4,
                "severity_label": "expensive",
                "kind": "mistake",
                "scope": "order_pricing",
                "statement": "never quote list price to a customer on a standing discount",
                "repeat_count": 2,
                "cost_amount": 12400.0,
            }
        ]
    )
    prompt = build_system_prompt("standard", block)
    assert "OUTRANK style" in prompt
    assert "never quote list price" in prompt
    assert "happened 2x" in prompt
    # and the base contract is still intact
    assert "You NEVER execute anything" in prompt


async def test_mistake_is_active_immediately(api) -> None:
    r = await api.client.post(
        "/ai/lessons",
        json={
            "kind": "mistake",
            "statement": "quoted a discount that does not exist",
            "severity": 4,
            "scope": "order_pricing",
            "cost_amount": 1500.0,
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "active"
    assert body["severity"] == 4
    assert body["severity_label"] == "expensive"
    assert body["cost_amount"] == 1500.0


async def test_severity_7_is_rejected_not_clamped(api) -> None:
    r = await api.client.post(
        "/ai/lessons", json={"kind": "mistake", "statement": "x", "severity": 7}
    )
    assert r.status_code == 422


async def test_negative_cost_is_rejected(api) -> None:
    r = await api.client.post(
        "/ai/lessons",
        json={"kind": "mistake", "statement": "x", "severity": 3, "cost_amount": -5},
    )
    assert r.status_code == 422


async def test_same_mistake_twice_is_one_lesson(api) -> None:
    payload = {"kind": "mistake", "statement": "drafted an order for an out of stock item",
               "severity": 3, "scope": "action:draft_order"}
    first = await api.client.post("/ai/lessons", json=payload)
    second = await api.client.post("/ai/lessons", json={**payload, "severity": 5})
    assert first.status_code == 201 and second.status_code == 201
    listed = (await api.client.get("/ai/lessons")).json()["items"]
    same = [i for i in listed if i["statement"] == payload["statement"]]
    assert len(same) == 1, "the same mistake must not duplicate rows"
    assert same[0]["repeat_count"] == 2
    assert same[0]["severity"] == 5, "a recurrence keeps the worst grading seen"


async def test_preference_is_a_candidate_not_a_rule(api) -> None:
    r = await api.client.post(
        "/ai/lessons",
        json={"kind": "preference", "statement": "always show amounts in thousands",
              "scope": "formatting"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["kind"] == "preference"
    assert body["status"] == "candidate", "a preference must never be obeyed on arrival"
    # ...so it is not injected into the prompt
    active = [i for i in (await api.client.get("/ai/lessons?status=active")).json()["items"]
              if i["kind"] == "preference"]
    assert active == []


async def test_second_mention_stays_candidate_until_owner_accepts(api) -> None:
    payload = {"kind": "preference", "statement": "round all totals to the nearest naira"}
    await api.client.post("/ai/lessons", json=payload)
    r = await api.client.post("/ai/lessons", json=payload)
    assert r.json()["repeat_count"] == 2
    assert r.json()["status"] == "candidate", "repetition proposes; the owner decides"

    lesson_id = r.json()["id"]
    accepted = await api.client.patch(f"/ai/lessons/{lesson_id}", json={"status": "active"})
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "active"


async def test_dismissed_preference_is_not_resurrected(api) -> None:
    payload = {"kind": "preference", "statement": "call customers by their first name only"}
    created = (await api.client.post("/ai/lessons", json=payload)).json()
    await api.client.patch(f"/ai/lessons/{created['id']}", json={"status": "dismissed"})

    again = (await api.client.post("/ai/lessons", json=payload)).json()
    assert again["repeat_count"] == 2   # the repeat is still counted ...
    assert again["status"] == "dismissed", "... but the owner's no stands"


async def test_lessons_are_tenant_scoped(api) -> None:
    mine = (await api.client.post(
        "/ai/lessons", json={"kind": "mistake", "statement": "my private mistake", "severity": 5}
    )).json()

    api.set_user("user-b")  # a different Clerk user => a different business
    assert (await api.client.get("/ai/lessons")).json()["items"] == []
    patch = await api.client.patch(f"/ai/lessons/{mine['id']}", json={"status": "dismissed"})
    assert patch.status_code == 404, "another tenant's lesson does not exist for you"


async def test_owner_can_regrade_a_lesson(api) -> None:
    created = (await api.client.post(
        "/ai/lessons", json={"kind": "mistake", "statement": "too vague", "severity": 1}
    )).json()
    r = await api.client.patch(f"/ai/lessons/{created['id']}", json={"severity": 4})
    assert r.status_code == 200
    assert r.json()["severity"] == 4


async def test_refused_proposal_becomes_an_active_lesson(api, session_factory) -> None:
    """The loop a bolt-on assistant cannot copy.

    ``validate_actions`` rejects a draft against the LIVE row, so the refusal
    reason is ground truth. Recording it means the next prompt already knows,
    with no owner effort at all.
    """
    me = (await api.client.get("/auth/me")).json()
    async with session_factory() as session:
        lesson = await zeno.record_rejection(
            session, me["business_id"], "DRAFT_ORDER", "only 3 of 'Widget' in stock"
        )
        await session.commit()

    assert lesson is not None
    items = (await api.client.get("/ai/lessons")).json()["items"]
    detected = [i for i in items if i["source"] == "detected"]
    assert len(detected) == 1
    assert detected[0]["status"] == "active"
    assert detected[0]["severity"] == 3      # a stock/price failure, graded by cost
    assert "only 3 of 'Widget' in stock" in detected[0]["statement"]


async def test_rejection_recording_never_breaks_the_request(api, session_factory) -> None:
    """Bookkeeping must not be able to fail an owner's chat turn.

    The helper swallows its own errors: garbage input still yields a lesson
    (or None), never an exception that would 500 the chat route.
    """
    async with session_factory() as session:
        assert await zeno.record_rejection(session, 1, "", "") is not None
