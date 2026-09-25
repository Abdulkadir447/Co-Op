"""Revenue is bucketed by the business's LOCAL day, not UTC.

Co-op stores ``order_date`` as naive UTC. The dashboard used to group by
``DATE(order_date)`` — the UTC day — so a sale near midnight landed on the wrong
bar for any non-UTC business. These tests pin the local-day behaviour, the UTC
default that keeps existing tenants unchanged, and the DST-safety of the helper.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone as dtz

import pytest

from backend import timezones as tz_mod
from backend.models import Customer, Order, OrderStatus


async def _business_id(api) -> int:
    r = await api.client.get("/auth/me")
    assert r.status_code == 200, r.text
    return r.json()["business_id"]


async def _add_delivered_order(session_factory, business_id, order_date, amount=100.0):
    async with session_factory() as db:
        cust = Customer(business_id=business_id, full_name="Buyer", email="buyer@x.com")
        db.add(cust)
        await db.flush()
        db.add(Order(business_id=business_id, customer_id=cust.id,
                     status=OrderStatus.delivered, total_amount=amount,
                     order_date=order_date))
        await db.commit()


@pytest.mark.asyncio
async def test_timeseries_buckets_a_near_midnight_sale_on_the_local_day(api, session_factory):
    api.set_user("user-tokyo")
    r = await api.client.patch("/business/settings", json={"timezone": "Asia/Tokyo"})
    assert r.status_code == 200, r.text
    bid = await _business_id(api)

    # 23:30 UTC == 08:30 the NEXT day in Tokyo (UTC+9, no DST). Anchored to
    # yesterday's UTC date so it is always inside the 365-day window.
    order_utc = datetime.combine(
        (datetime.now(dtz.utc) - timedelta(days=1)).date(), time(23, 30)
    )  # naive UTC
    await _add_delivered_order(session_factory, bid, order_utc)

    r = await api.client.get("/dashboard/revenue/timeseries", params={"days": 365})
    assert r.status_code == 200, r.text
    points = {p["date"]: p for p in r.json()}

    utc_day = order_utc.date().isoformat()                          # the WRONG day
    tokyo_day = (order_utc.date() + timedelta(days=1)).isoformat()  # the RIGHT day
    assert points.get(tokyo_day, {}).get("revenue") == 100.0, points
    assert points.get(tokyo_day, {}).get("orders") == 1
    assert points.get(utc_day, {}).get("revenue", 0.0) == 0.0, points


@pytest.mark.asyncio
async def test_timeseries_defaults_to_utc_when_no_timezone_is_set(api, session_factory):
    api.set_user("user-utc")
    bid = await _business_id(api)  # auto-provisioned, timezone NULL -> UTC

    order_utc = datetime.combine(
        (datetime.now(dtz.utc) - timedelta(days=1)).date(), time(23, 30)
    )
    await _add_delivered_order(session_factory, bid, order_utc)

    r = await api.client.get("/dashboard/revenue/timeseries", params={"days": 365})
    assert r.status_code == 200, r.text
    points = {p["date"]: p for p in r.json()}
    # No timezone set -> the UTC day, i.e. unchanged legacy behaviour.
    assert points.get(order_utc.date().isoformat(), {}).get("revenue") == 100.0, points


# ---------------------------------------------------------------------------
# Helper unit tests — deterministic, and they cover the logic the
# revenue/today and revenue/month endpoints rely on.
# ---------------------------------------------------------------------------

def test_local_midnight_and_utc_round_trip():
    tokyo = tz_mod.business_tz("Asia/Tokyo")
    # Midnight Jan 2 in Tokyo == 15:00 UTC Jan 1.
    assert tz_mod.local_midnight_utc(date(2026, 1, 2), tokyo) == datetime(2026, 1, 1, 15, 0)
    # 23:30 UTC Jan 1 is already Jan 2 in Tokyo.
    assert tz_mod.utc_to_local_date(datetime(2026, 1, 1, 23, 30), tokyo) == date(2026, 1, 2)


def test_business_tz_falls_back_to_utc_for_unset_or_invalid():
    assert str(tz_mod.business_tz(None)) == "UTC"
    assert str(tz_mod.business_tz("")) == "UTC"
    assert str(tz_mod.business_tz("Not/ARealZone")) == "UTC"
    assert str(tz_mod.business_tz("Africa/Lagos")) == "Africa/Lagos"


def test_bucketing_is_dst_safe():
    ny = tz_mod.business_tz("America/New_York")
    # Summer (EDT, UTC-4): local midnight is 04:00 UTC.
    assert tz_mod.local_midnight_utc(date(2026, 7, 2), ny) == datetime(2026, 7, 2, 4, 0)
    # Winter (EST, UTC-5): local midnight is 05:00 UTC — the offset shifted.
    assert tz_mod.local_midnight_utc(date(2026, 1, 2), ny) == datetime(2026, 1, 2, 5, 0)
