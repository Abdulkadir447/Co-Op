"""Business-local time helpers for revenue bucketing.

Co-op stores order timestamps as naive UTC. Bucketing them with
``DATE(order_date)`` groups by *UTC* day, so for a business in, say,
``Asia/Tokyo`` a sale at 00:30 local (= 15:30 UTC the previous day) lands on the
wrong day's bar — and for a UTC-negative zone the mirror image happens. These
helpers convert using the business's IANA timezone (``Business.timezone``),
defaulting to UTC so behaviour is **unchanged when no timezone is set**, and are
DST-safe via ``zoneinfo`` (a 23- or 25-hour local day resolves correctly).
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def business_tz(name: str | None) -> ZoneInfo:
    """The business's timezone, falling back to UTC for unset/invalid names.

    ``Business.timezone`` is validated against ``ALLOWED_TIMEZONES`` on write,
    but legacy rows may be NULL, so the fallback keeps old tenants on UTC.
    """
    if not name:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def local_today(tz: ZoneInfo) -> date:
    """Today's calendar date in the business's timezone."""
    return datetime.now(tz).date()


def utc_to_local_date(naive_utc: datetime, tz: ZoneInfo) -> date:
    """The local calendar date of a naive-UTC timestamp in ``tz``."""
    if naive_utc.tzinfo is None:
        naive_utc = naive_utc.replace(tzinfo=dt_timezone.utc)
    return naive_utc.astimezone(tz).date()


def local_midnight_utc(d: date, tz: ZoneInfo) -> datetime:
    """The naive-UTC instant of midnight starting local date ``d`` in ``tz``.

    Used to turn a local-day boundary into the UTC bound that the naive-UTC
    ``order_date`` column is filtered on, so a WHERE clause and the Python-side
    bucketing agree on where the day starts.
    """
    local = datetime.combine(d, time.min, tzinfo=tz)
    return local.astimezone(dt_timezone.utc).replace(tzinfo=None)
