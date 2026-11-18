"""Business-local time helpers for revenue bucketing.

Co-op stores order timestamps as naive UTC. Bucketing them with
``DATE(order_date)`` groups by *UTC* day, so for a business in, say,
``Asia/Tokyo`` a sale at 00:30 local (= 15:30 UTC the previous day) lands on the
wrong day's bar — and for a UTC-negative zone the mirror image happens. These
helpers convert using the business's IANA timezone (``Business.timezone``),
defaulting to UTC so behaviour is **unchanged when no timezone is set**, and are
DST-safe via ``zoneinfo`` (a 23- or 25-hour local day resolves correctly).

**The time zone database may be missing, and that is not a bug in the report.**
PEP 615's ``zoneinfo`` reads the IANA database from the operating system, and
Windows does not ship one — there, every key raises ``ZoneInfoNotFoundError``,
``"UTC"`` included, unless the ``tzdata`` package is installed (it is pinned in
``backend/requirements.txt``). Before this fallback existed, opening the
dashboard on a Windows dev machine returned
``500 {"detail":"Internal Server Error"}`` from ``/dashboard/revenue/timeseries``
— the only difference from Linux being the missing database. A missing
timezone database must cost accuracy (UTC instead of Lagos), never
availability, so these helpers degrade to UTC, say so once in the log, and the
rest of the app keeps working.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timezone as dt_timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_log = logging.getLogger("coop")

_warned = False


def _warn_missing_tz_database_once() -> None:
    """One line in the log, not one per request."""
    global _warned
    if _warned:
        return
    _warned = True
    _log.warning(
        "No IANA time zone database found, so business-local dates fall back "
        "to UTC. Install it with `pip install tzdata` (required on Windows), "
        "then restart. Reports stay correct for UTC businesses and are "
        "UTC-bucketed for everyone else until then."
    )


def has_tz_database() -> bool:
    """Whether named time zones can be resolved on this machine.

    Used by the startup log so the operator learns it before a report looks
    subtly wrong, instead of inferring it from a dashboard that will not open.
    """
    try:
        ZoneInfo("UTC")
    except (ZoneInfoNotFoundError, ValueError, OSError):
        return False
    return True


def business_tz(name: str | None) -> tzinfo:
    """The business's timezone, falling back to UTC for unset/invalid names.

    ``Business.timezone`` is validated against ``ALLOWED_TIMEZONES`` on write,
    but legacy rows may be NULL, so the fallback keeps old tenants on UTC.

    Returns a plain ``timezone.utc`` when this machine has no time zone
    database at all (see the module docstring): the three helpers below accept
    any ``tzinfo``, so everything keeps working on UTC instead of raising.
    """
    if name:
        try:
            return ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError, OSError):
            # An unknown name is the tenant's problem and UTC is the documented
            # fallback; a missing database is the machine's, and the caller
            # should not be able to tell the difference in the response.
            pass
    try:
        return ZoneInfo("UTC")
    except (ZoneInfoNotFoundError, ValueError, OSError):
        _warn_missing_tz_database_once()
        return dt_timezone.utc


def local_today(tz: tzinfo) -> date:
    """Today's calendar date in the business's timezone."""
    return datetime.now(tz).date()


def utc_to_local_date(naive_utc: datetime, tz: tzinfo) -> date:
    """The local calendar date of a naive-UTC timestamp in ``tz``."""
    if naive_utc.tzinfo is None:
        naive_utc = naive_utc.replace(tzinfo=dt_timezone.utc)
    return naive_utc.astimezone(tz).date()


def local_midnight_utc(d: date, tz: tzinfo) -> datetime:
    """The naive-UTC instant of midnight starting local date ``d`` in ``tz``.

    Used to turn a local-day boundary into the UTC bound that the naive-UTC
    ``order_date`` column is filtered on, so a WHERE clause and the Python-side
    bucketing agree on where the day starts.
    """
    local = datetime.combine(d, time.min, tzinfo=tz)
    return local.astimezone(dt_timezone.utc).replace(tzinfo=None)
