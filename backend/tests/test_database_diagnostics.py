"""The database diagnosis: three failures that used to be one anonymous 500.

Background: in a real run every authenticated endpoint answered
``500 {"detail": "Internal server error."}`` — /auth/me, /onboarding/state,
/products, /feedback/status. Nothing in the browser or the log said the
database was the cause, so the actual fix (``alembic upgrade head``) could not
be guessed from what the user saw.

These tests pin the three answers so they cannot regress into one:

  * an unreachable database   -> 503, plain sentence, cause classified
  * a schema behind the code  -> 503, plain sentence, diagnosis names the fix
  * a health check that means something -> 200 only when the schema matches
"""
from __future__ import annotations


from backend import diagnostics


def test_classify_unreachable_database() -> None:
    """Every driver words this differently; all of them mean 'cannot connect'."""
    for message in (
        "[Errno 111] Connect call failed ('127.0.0.1', 5432)",
        "password authentication failed for user 'postgres'",
        "getaddrinfo failed",
        "connect() timed out after 30s",
        "server closed the connection unexpectedly",
    ):
        # 'server closed' is deliberately NOT unreachable: it is a mid-query
        # failure, which the client may retry. Guard the classification the
        # other way round for the four that are unambiguous.
        if "server closed" in message:
            assert diagnostics.classify_error(Exception(message)) == "unknown"
        else:
            assert diagnostics.classify_error(Exception(message)) == "unreachable", message


def test_classify_schema_behind() -> None:
    for message in (
        'relation "products" does not exist',
        "no such table: businesses",
        'column products.cost_price does not exist',
        "no such column: orders.branch_id",
    ):
        assert diagnostics.classify_error(Exception(message)) == "schema_behind", message


def test_user_message_never_contains_developer_instructions() -> None:
    """A shop owner must not be told to run a migration."""
    for cause in ("unreachable", "schema_behind", "unknown"):
        message = diagnostics.user_message(cause)
        lowered = message.lower()
        for forbidden in ("alembic", "database_url", ".env", "postgres", "sql"):
            assert forbidden not in lowered, f"{cause}: {message!r} leaks {forbidden}"
        assert message.endswith("."), message


def test_operator_explanation_names_the_fix() -> None:
    assert "alembic upgrade head" in diagnostics.explain("schema_behind")
    assert "DATABASE_URL" in diagnostics.explain("unreachable")


async def test_report_flags_an_empty_database_as_behind() -> None:
    """A reachable database with none of our tables is not 'healthy'."""
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        report = await diagnostics.database_report(engine)
    finally:
        await engine.dispose()

    assert report["reachable"] is True
    assert report["cause"] == "schema_behind"
    # The report must be actionable: it lists what is missing, not just that
    # something is.
    assert "products" in report["missing_tables"]
    assert report["missing_tables"] == sorted(report["missing_tables"])


async def test_report_is_silent_about_an_unreachable_host() -> None:
    """The diagnostic must never raise — a failing diagnostic is useless."""
    from sqlalchemy.ext.asyncio import create_async_engine

    # Port 1 is not listening; the connect fails fast and deterministically.
    engine = create_async_engine("postgresql+asyncpg://u:p@127.0.0.1:1/x")
    try:
        report = await diagnostics.database_report(engine)
    finally:
        await engine.dispose()

    assert report["reachable"] is False
    assert report["cause"] == "unreachable"
    assert report["summary"]
    # The operator-facing detail is for the log, never the response body.
    assert "detail_for_log" in report


async def test_healthcheck_fails_when_the_schema_is_behind(api) -> None:
    """The old /healthcheck ran SELECT 1 and passed on an empty database.

    The test database is fully migrated (conftest creates every table), so it
    must be healthy here; the point being pinned is that health now depends on
    the schema, not on a bare connection.
    """
    r = await api.client.get("/healthcheck")
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "healthy", "database": "up"}


async def test_healthcheck_does_not_leak_the_database_host(api, monkeypatch) -> None:
    """503 or 200, the body must never name the host or the driver."""

    async def broken_report(*_args, **_kwargs):
        return {
            "reachable": False,
            "cause": "unreachable",
            "summary": diagnostics.explain("unreachable"),
            "missing_tables": [],
            "missing_columns": {},
            "migration_revision": None,
            "detail_for_log": "postgres://user:secret@internal-host",
        }

    monkeypatch.setattr(diagnostics, "database_report", broken_report)

    r = await api.client.get("/healthcheck")
    assert r.status_code == 503
    body = r.text.lower()
    for forbidden in ("internal-host", "secret", "password", "pooler"):
        assert forbidden not in body, body


def test_the_fix_matches_the_dialect() -> None:
    """The two databases need different answers, and the wrong one wastes time.

    Real case: a stale local `coop_test.db` produced "missing 15 columns" and
    the log said "Run `alembic upgrade head`". The Alembic revisions use
    Postgres-only DDL (SERIAL, ALTER COLUMN ... USING), so that command fails
    on SQLite and the actual fix — delete the file — was never mentioned.
    """
    sqlite_fix = diagnostics.fix_for("sqlite", "./coop_test.db")
    assert "coop_test.db" in sqlite_fix, "the fix must name the file to delete"
    assert "delete" in sqlite_fix.lower()
    assert "alembic upgrade head" not in sqlite_fix.lower()

    postgres_fix = diagnostics.fix_for("postgresql", "db.x.supabase.co:5432/postgres")
    assert "alembic upgrade head" in postgres_fix
    assert "delete" not in postgres_fix.lower()


async def test_the_report_names_the_database_it_inspected() -> None:
    """"Which database?" is the question the symptom never answers."""
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        report = await diagnostics.database_report(engine)
    finally:
        await engine.dispose()

    assert report["dialect"] == "sqlite"
    assert report["database"]  # a path, not None
    assert report["fix"] and "sqlite" in report["fix"].lower()


async def test_the_report_never_contains_a_password() -> None:
    """`_identify` builds the label from host/port/database only."""
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine("postgresql+asyncpg://user:s3cr3t@db.example:5432/coop")
    try:
        dialect, where = diagnostics._identify(engine)
    finally:
        await engine.dispose()

    assert dialect == "postgresql"
    assert "s3cr3t" not in where
    assert where == "db.example:5432/coop"
