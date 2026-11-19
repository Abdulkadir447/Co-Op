"""
Why is the database unhappy? — one place that answers the question.

Written after a real failure: every authenticated endpoint returned
``500 Internal server error`` at once, including ``/auth/me`` and
``/onboarding/state``. When *everything* fails together the cause is shared by
every request, and there are only two realistic ones — the database cannot be
reached, or the database is reachable but its schema is older than the code
(the app selects a column that does not exist yet). Both used to surface as
the same anonymous 500, with the useful part only in a server log the operator
may never see.

This module turns that into a sentence:

    "The database is reachable but is missing 3 tables and 1 column. Its
     schema is older than this code. Run: alembic upgrade head"

Nothing here is imported by a request handler at import time; `main.py` calls
it at startup (to log loudly) and from ``/health/db`` (to answer on demand).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import inspect, text
from sqlalchemy.exc import DBAPIError

from .models import Base

# Tables SQLAlchemy itself does not create but Alembic does. Their absence is
# normal on a database that was bootstrapped by `create_all` rather than by
# migrations, so they must not be reported as "missing".
_NON_MODEL_TABLES = {"alembic_version"}


def _sort_names(names) -> List[str]:
    return sorted(names)


def _inspect_sync(connection) -> Dict[str, Any]:
    """Introspect the live database. Runs inside ``run_sync`` (blocking)."""
    inspector = inspect(connection)
    existing = set(inspector.get_table_names())

    missing_tables: List[str] = []
    missing_columns: Dict[str, List[str]] = {}
    for name, table in Base.metadata.tables.items():
        if name in _NON_MODEL_TABLES:
            continue
        if name not in existing:
            missing_tables.append(name)
            continue
        live_columns = {col["name"] for col in inspector.get_columns(name)}
        absent = [col.name for col in table.columns if col.name not in live_columns]
        if absent:
            missing_columns[name] = _sort_names(absent)

    version: Optional[str] = None
    if "alembic_version" in existing:
        try:
            version = connection.execute(
                text("SELECT version_num FROM alembic_version LIMIT 1")
            ).scalar()
        except Exception:  # noqa: BLE001 — a cosmetic field must never fail the check
            version = None

    return {
        "tables_present": len(existing),
        "tables_expected": len(
            [n for n in Base.metadata.tables if n not in _NON_MODEL_TABLES]
        ),
        "missing_tables": _sort_names(missing_tables),
        "missing_columns": missing_columns,
        "migration_revision": version,
    }


#: Where the local SQLite file lives when COOP_ENV=testing. Kept in sync with
#: backend/config.py; the value is only ever used to *name* the file.
TESTING_SQLITE = "./coop_test.db"


def _identify(engine) -> tuple[str, str]:
    """(dialect, human-readable location) for the engine, never the password.

    "Which database?" is the first question an operator asks and the last one
    the symptom answers — a local `coop_test.db` and Supabase both say
    "database error". The file path or host settles it in one line.
    """
    try:
        url = engine.url
        dialect = url.get_backend_name()
        if dialect == "sqlite":
            return dialect, str(url.database or TESTING_SQLITE)
        host = url.host or "?"
        port = f":{url.port}" if url.port else ""
        return dialect, f"{host}{port}/{url.database or '?'}"
    except Exception:  # noqa: BLE001 — a label must never fail the diagnostic
        return "unknown", "unknown"


def fix_for(dialect: str, database: str) -> str:
    """The migration advice that is actually correct for this database.

    The two cases are not interchangeable: the Alembic revisions use
    Postgres-only DDL (`SERIAL`, `ALTER COLUMN ... USING`), so telling somebody
    whose local testing SQLite is out of date to run `alembic upgrade head`
    sends them to an error message and wastes their afternoon.
    """
    if dialect == "sqlite":
        return (
            f"This is the local testing SQLite file `{database}`. The Alembic "
            "revisions are Postgres-only, so do not run them here — stop the "
            "server, delete that file, and start it again. The app recreates "
            "the schema on startup; only throwaway local data is lost."
        )
    return (
        "Run `alembic upgrade head` (safe to re-run; it applies only the "
        "migrations this database has not seen)."
    )


def classify_error(exc: BaseException) -> str:
    """Map a database exception to one of a few plain-English causes.

    Deliberately string-based: asyncpg, psycopg and SQLite phrase the same
    problem three different ways, and the driver's own words are the most
    reliable signal available without driver-specific imports.
    """
    text_ = str(exc).lower()
    if any(
        marker in text_
        for marker in (
            "could not connect",
            "cannot connect",
            "connect call failed",
            "connection refused",
            "connection failed",
            "errno 111",
            "getaddrinfo",
            "name or service not known",
            "timeout",
            "timed out",
            "password authentication failed",
            "authentication failed",
            "ssl",
            "network is unreachable",
            "no route to host",
        )
    ):
        return "unreachable"
    if any(
        marker in text_
        for marker in (
            "does not exist",
            "no such table",
            "no such column",
            "undefined column",
            "undefined table",
            "unknown column",
        )
    ):
        return "schema_behind"
    return "unknown"


def explain(cause: str, detail: str = "") -> str:
    """The operator-facing sentence: what is wrong and what to run.

    This is for `/healthcheck`, the startup log and scripts/check_db.py — an
    audience that can act on a filename. Never show it to a shop owner; that
    is `user_message` below.
    """
    if cause == "unreachable":
        return (
            "The server cannot reach its database. Check DATABASE_URL in .env — "
            "for Supabase use the pooler host (...pooler.supabase.com:5432), not "
            "the direct db.<ref>.supabase.co host, which resolves to IPv6 only "
            "and is unreachable from most machines."
        )
    if cause == "schema_behind":
        return (
            "The database is reachable but its schema is older than this code, "
            "so queries name tables or columns that do not exist yet. Run "
            "`alembic upgrade head` (it is safe to re-run)."
        )
    if detail:
        return f"The database raised an error: {detail}"
    return "The database raised an error."


def user_message(cause: str) -> str:
    """What a signed-in shop owner sees when the database is the problem.

    No host names, no SQL, no file paths — nothing they could act on and
    nothing they should have to read. Their one useful action is to try again.
    """
    if cause == "schema_behind":
        return (
            "The service is being updated right now. Your data is safe — please "
            "try again in a few minutes."
        )
    return (
        "The service cannot reach its database at the moment. Please try again "
        "in a moment; if it keeps happening, contact support."
    )


async def database_report(engine=None, session=None) -> Dict[str, Any]:
    """Connect, introspect, and describe the gap between code and database.

    Give it the request's ``session`` when one exists: that is the connection
    the endpoints actually use, which may be an overridden dependency (the
    test suite swaps in its own engine), and a health check that inspects a
    different database than the one serving requests is worse than none.

    With neither argument it falls back to the application engine.

    Never raises: a diagnostic that can fail is not a diagnostic. A failure to
    connect is itself the most useful thing it can report.
    """
    from .database import get_engine

    report: Dict[str, Any] = {
        "reachable": False,
        "cause": None,
        "summary": None,
        "fix": None,
        "database": None,
        "dialect": None,
        "missing_tables": [],
        "missing_columns": {},
        "migration_revision": None,
    }
    try:
        if session is not None:
            info = await (await session.connection()).run_sync(_inspect_sync)
        else:
            async with (engine or get_engine()).connect() as connection:
                info = await connection.run_sync(_inspect_sync)
    except Exception as exc:  # noqa: BLE001 — see docstring
        cause = classify_error(exc)
        report["cause"] = cause
        # The driver message is for the operator's console, not for a client:
        # it can contain the host name and user, never the password.
        report["summary"] = explain(cause, type(exc).__name__)
        report["detail_for_log"] = str(exc).split("\n")[0][:300]
        report["dialect"], report["database"] = _identify(engine or get_engine())
        return report

    report["reachable"] = True
    report.update(info)
    report["dialect"], report["database"] = _identify(engine or get_engine())
    if info["missing_tables"] or info["missing_columns"]:
        report["cause"] = "schema_behind"
        bits = []
        if info["missing_tables"]:
            bits.append(f"{len(info['missing_tables'])} table(s)")
        if info["missing_columns"]:
            bits.append(
                f"{sum(len(v) for v in info['missing_columns'].values())} column(s)"
            )
        report["summary"] = (
            f"The database is reachable but is missing {' and '.join(bits)} "
            "that this version of the code expects."
        )
        report["fix"] = fix_for(report["dialect"], report["database"])
    else:
        report["summary"] = "Database reachable; schema matches the code."
    return report


def is_database_error(exc: BaseException) -> bool:
    """True for a broken DB rather than a broken request handler."""
    if isinstance(exc, DBAPIError):
        return True
    # SQLite's driver errors are wrapped, but a bare OperationalError can also
    # escape a connection attempt made outside the ORM.
    return type(exc).__name__ in {"OperationalError", "ProgrammingError", "InterfaceError"}
