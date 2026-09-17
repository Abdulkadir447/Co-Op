"""Feedback — the periodic in-app prompt cadence.

Verifies the product rules end-to-end through the HTTP API:
  * no prompt until the paid relationship is 3 weeks old,
  * the first prompt is compulsory (cannot skip, "overall" required),
  * submitting silences the current window,
  * the next window's prompt is skippable.
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import select

from backend.models import Business, Subscription


async def _set_trial_start(session_factory, days_ago: int, owner="user-a") -> None:
    """Backdate the trial start so the feedback window has elapsed."""
    async with session_factory() as db:
        biz = (
            await db.execute(select(Business).where(Business.owner_id == owner))
        ).scalars().first()
        sub = (
            await db.execute(
                select(Subscription).where(Subscription.business_id == biz.id)
            )
        ).scalars().first()
        sub.trial_started_at = dt.datetime.utcnow() - dt.timedelta(days=days_ago)
        sub.trial_ends_at = sub.trial_started_at + dt.timedelta(days=10)
        await db.commit()


async def _add_feedback(session_factory, days_ago: int, kind="submitted", owner="user-a") -> None:
    """Insert a feedback row with a backdated created_at (simulates elapsed time)."""
    from backend.models import Feedback
    async with session_factory() as db:
        biz = (
            await db.execute(select(Business).where(Business.owner_id == owner))
        ).scalars().first()
        row = Feedback(
            business_id=biz.id,
            kind=kind,
            overall="earlier response",
            created_at=dt.datetime.utcnow() - dt.timedelta(days=days_ago),
        )
        db.add(row)
        await db.commit()


async def _status(api):
    r = await api.client.get("/feedback/status")
    assert r.status_code == 200, r.text
    return r.json()


async def test_no_prompt_before_three_weeks(api, session_factory):
    await api.client.get("/billing/summary")  # auto-provisions the tenant
    # A trial that started 5 days ago is inside the first window: not due.
    await _set_trial_start(session_factory, days_ago=5)
    body = await _status(api)
    assert body["due"] is False
    assert body["required"] is False
    assert body["interval_days"] == 21


async def test_first_prompt_is_compulsory(api, session_factory):
    await api.client.get("/billing/summary")  # auto-provisions the tenant
    await _set_trial_start(session_factory, days_ago=22)
    body = await _status(api)
    assert body["due"] is True
    assert body["required"] is True

    # The compulsory prompt cannot be skipped…
    r = await api.client.post("/feedback/dismiss")
    assert r.status_code == 409, r.text

    # …and requires the "overall" answer.
    r = await api.client.post("/feedback", json={"likes": "the dashboard"})
    assert r.status_code == 422, r.text

    # A real answer is accepted and silences this window.
    r = await api.client.post(
        "/feedback",
        json={"rating": 5, "overall": "Great so far", "likes": "reports"},
    )
    assert r.status_code == 200, r.text
    after = await _status(api)
    assert after["due"] is False
    assert after["submitted_before"] is True


async def test_next_window_is_skippable(api, session_factory):
    await api.client.get("/billing/summary")  # auto-provisions the tenant
    # Now in the second three-week window (day 44), with the compulsory first
    # prompt already answered back at day 22.
    await _set_trial_start(session_factory, days_ago=44)
    await _add_feedback(session_factory, days_ago=22, kind="submitted")

    body = await _status(api)
    assert body["due"] is True
    assert body["required"] is False  # no longer the first

    # A later prompt CAN be skipped, and skipping silences the window.
    r = await api.client.post("/feedback/dismiss")
    assert r.status_code == 200, r.text
    after = await _status(api)
    assert after["due"] is False
