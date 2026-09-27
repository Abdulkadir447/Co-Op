"""Migration smoke test — runs the real alembic chain against Postgres.

The rest of the suite builds its schema with ``Base.metadata.create_all``, which
never executes the alembic migrations' raw SQL. That is exactly how two
deploy-blocking bugs went unnoticed — a malformed index name in ``0002`` and
``0014_rls`` creating a policy on ``payments`` before the parallel
``0011_payments`` branch made the table. They only manifest when the migrations
actually run on Postgres, so a ``create_all`` suite can never catch them.

This test closes that gap. It is gated on ``TEST_DATABASE_URL`` (so it skips on
SQLite / CI without a database), creates a throwaway database, runs
``alembic upgrade head`` against it exactly as an operator would, asserts the
chain lands on the single head with the RLS backstop present, then drops the
database. If the role lacks ``CREATEDB`` it skips rather than fails.
"""
from __future__ import annotations

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

PG_URL = os.getenv("TEST_DATABASE_URL", "")
NEEDS_PG = not PG_URL.startswith("postgres")
REPO_ROOT = Path(__file__).resolve().parents[2]
HEAD = "0018_integer_pk_sequences"


def _asyncpg_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


@pytest.mark.skipif(NEEDS_PG, reason="requires Postgres (set TEST_DATABASE_URL)")
@pytest.mark.asyncio
async def test_alembic_upgrade_head_runs_clean_and_enables_rls():
    base = make_url(_asyncpg_url(PG_URL))
    temp_name = f"coop_mig_{uuid.uuid4().hex[:12]}"

    # CREATE DATABASE cannot run inside a transaction, and the maintenance DB is
    # the server's default 'postgres' database (also Supabase's default).
    maint = create_async_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        async with maint.connect() as conn:
            try:
                await conn.execute(text(f'CREATE DATABASE "{temp_name}"'))
            except Exception as exc:  # noqa: BLE001 — skip, don't fail, without CREATEDB
                pytest.skip(f"role cannot CREATE DATABASE on this server: {exc}")
    finally:
        await maint.dispose()

    temp_url = base.set(database=temp_name)
    # Hand alembic a plain postgresql:// URL, as backend.config.database_url()
    # (and an operator's DATABASE_URL) expects; it rewrites to asyncpg itself.
    db_url = str(temp_url).replace("postgresql+asyncpg://", "postgresql://", 1)
    env = {**os.environ, "DATABASE_URL": db_url}
    proc = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=REPO_ROOT, env=env, capture_output=True, text=True,
    )
    try:
        assert proc.returncode == 0, (
            f"alembic upgrade head failed (rc={proc.returncode}):\n"
            f"{proc.stdout}\n{proc.stderr}"
        )

        eng = create_async_engine(temp_url)
        try:
            async with eng.connect() as conn:
                version = (
                    await conn.execute(text("SELECT version_num FROM alembic_version"))
                ).scalar()
                assert version == HEAD, version

                policies = (
                    await conn.execute(
                        text(
                            "SELECT tablename FROM pg_policies "
                            "WHERE policyname LIKE 'tenant_isolation_%'"
                        )
                    )
                ).scalars().all()
                # All 18 tenant tables, including payments (created on the
                # parallel branch — the bug this test exists to catch) and
                # issue_reports (added by 0017, which re-runs the RLS DDL).
                assert len(policies) == 18, sorted(policies)
                assert "payments" in policies, sorted(policies)
                assert "issue_reports" in policies, sorted(policies)

                # Enabled but NOT forced: the owner-bypass backstop, not a
                # constraint on the backend's own (owner) connection.
                forced = (
                    await conn.execute(
                        text(
                            "SELECT count(*) FROM pg_class c "
                            "JOIN pg_namespace n ON n.oid = c.relnamespace "
                            "WHERE n.nspname = 'public' AND c.relforcerowsecurity "
                            "AND c.relname IN (SELECT tablename FROM pg_policies "
                            "WHERE policyname LIKE 'tenant_isolation_%')"
                        )
                    )
                ).scalar()
                assert forced == 0, forced
        finally:
            await eng.dispose()
    finally:
        # Always drop the throwaway database, pass or fail.
        cleanup = create_async_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
        try:
            async with cleanup.connect() as conn:
                await conn.execute(text(f'DROP DATABASE IF EXISTS "{temp_name}"'))
        finally:
            await cleanup.dispose()


@pytest.mark.skipif(NEEDS_PG, reason="requires Postgres (set TEST_DATABASE_URL)")
@pytest.mark.asyncio
async def test_alembic_rerun_and_rollback_are_safe():
    """A deploy you can re-run and roll back — the 11pm scenarios.

    * Idempotent re-run: ``upgrade head`` twice is a clean no-op, not an error
      (what happens when a deploy half-succeeds and you re-run it).
    * Rollback: ``downgrade`` to a *named* revision then ``upgrade head``
      returns to the single head.

    Note: ``downgrade -1`` does NOT work from the merge head — alembic raises
    "Ambiguous walk" because the merge has two parents. You must target a named
    revision (or ``base``). See docs/DEPLOY_POSTGRES.md.
    """
    base = make_url(_asyncpg_url(PG_URL))
    temp_name = f"coop_mig_{uuid.uuid4().hex[:12]}"
    maint = create_async_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        async with maint.connect() as conn:
            try:
                await conn.execute(text(f'CREATE DATABASE "{temp_name}"'))
            except Exception as exc:  # noqa: BLE001 — skip, don't fail, without CREATEDB
                pytest.skip(f"role cannot CREATE DATABASE on this server: {exc}")
    finally:
        await maint.dispose()

    temp_url = base.set(database=temp_name)
    db_url = str(temp_url).replace("postgresql+asyncpg://", "postgresql://", 1)
    env = {**os.environ, "DATABASE_URL": db_url}

    def alembic(*args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, "-m", "alembic", *args],
            cwd=REPO_ROOT, env=env, capture_output=True, text=True,
        )

    try:
        first = alembic("upgrade", "head")
        assert first.returncode == 0, first.stderr

        # #2 — re-running upgrade head is a no-op, not an error.
        again = alembic("upgrade", "head")
        assert again.returncode == 0, again.stderr

        # #1 — roll back to a named revision (NOT -1), then re-apply to head.
        down = alembic("downgrade", "0015_feedback")
        assert down.returncode == 0, down.stderr
        back = alembic("upgrade", "head")
        assert back.returncode == 0, back.stderr

        eng = create_async_engine(temp_url)
        try:
            async with eng.connect() as conn:
                version = (
                    await conn.execute(text("SELECT version_num FROM alembic_version"))
                ).scalar()
                assert version == HEAD, version
        finally:
            await eng.dispose()
    finally:
        cleanup = create_async_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
        try:
            async with cleanup.connect() as conn:
                await conn.execute(text(f'DROP DATABASE IF EXISTS "{temp_name}"'))
        finally:
            await cleanup.dispose()


@pytest.mark.skipif(NEEDS_PG, reason="requires Postgres (set TEST_DATABASE_URL)")
@pytest.mark.asyncio
async def test_omitting_id_inserts_on_the_0010_0015_tables():
    """Regression: 0010-0015 created bare ``INTEGER PRIMARY KEY`` columns.

    SQLite aliases that to rowid, so the suite stayed green while every insert
    that omitted ``id`` failed on Postgres with a not-null violation. 0018 adds
    the sequence + ``nextval`` default. This asserts the *behaviour* an ORM
    insert depends on rather than the DDL text: omit ``id``, get a real id back.

    Each row is inserted once, because five of the six tables carry a UNIQUE
    constraint (member, invitation token, payment reference, licence
    fingerprint, invoice number+order) that a repeat insert would trip.
    Sequence advancement is proved separately on ``feedback``, the one table
    with no uniqueness rule.
    """
    base = make_url(_asyncpg_url(PG_URL))
    temp_name = f"coop_mig_{uuid.uuid4().hex[:12]}"
    maint = create_async_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        async with maint.connect() as conn:
            try:
                await conn.execute(text(f'CREATE DATABASE "{temp_name}"'))
            except Exception as exc:  # noqa: BLE001 — skip, don't fail, without CREATEDB
                pytest.skip(f"role cannot CREATE DATABASE on this server: {exc}")
    finally:
        await maint.dispose()

    temp_url = base.set(database=temp_name)
    db_url = str(temp_url).replace("postgresql+asyncpg://", "postgresql://", 1)
    env = {**os.environ, "DATABASE_URL": db_url}
    proc = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=REPO_ROOT, env=env, capture_output=True, text=True,
    )
    try:
        assert proc.returncode == 0, (
            f"alembic upgrade head failed (rc={proc.returncode}):\n"
            f"{proc.stdout}\n{proc.stderr}"
        )

        eng = create_async_engine(temp_url)
        try:
            # invoices needs an order and orders needs a customer, so build the
            # chain once and share it.
            async with eng.begin() as conn:
                bid = (await conn.execute(
                    text("INSERT INTO businesses (name) VALUES ('Acme') RETURNING id")
                )).scalar()
                cid = (await conn.execute(
                    text("INSERT INTO customers (full_name, email) "
                         "VALUES ('A A', 'a@a.test') RETURNING id")
                )).scalar()
                oid = (await conn.execute(
                    text("INSERT INTO orders (business_id, customer_id) "
                         "VALUES (:b, :c) RETURNING id"),
                    {"b": bid, "c": cid},
                )).scalar()

            # table -> (column list + VALUES, params). `id` is deliberately
            # absent from every one of these: that omission is the bug.
            inserts = [
                ("business_members",
                 "(business_id, user_id, role) VALUES (:b, 'user_1', 'admin')",
                 {"b": bid}),
                ("business_invitations",
                 "(business_id, email, role, token) "
                 "VALUES (:b, 'invite@a.test', 'staff', 'tok_0001')",
                 {"b": bid}),
                ("payments",
                 "(business_id, reference, plan) VALUES (:b, 'ref_0001', 'starter')",
                 {"b": bid}),
                ("licenses",
                 "(business_id, fingerprint, plan) VALUES (:b, 'fp_0001', 'starter')",
                 {"b": bid}),
                ("invoices",
                 "(business_id, order_id, number, issue_date) "
                 "VALUES (:b, :o, 'INV-0001', now())",
                 {"b": bid, "o": oid}),
                ("feedback",
                 "(business_id, rating) VALUES (:b, 5)",
                 {"b": bid}),
            ]
            for table, cols, params in inserts:
                async with eng.begin() as conn:
                    new_id = (await conn.execute(
                        text(f"INSERT INTO {table} {cols} RETURNING id"), params
                    )).scalar()
                assert isinstance(new_id, int) and new_id > 0, (table, new_id)

            # The default must be a live sequence, not a constant.
            async with eng.begin() as conn:
                first = (await conn.execute(
                    text("INSERT INTO feedback (business_id, rating) "
                         "VALUES (:b, 4) RETURNING id"), {"b": bid}
                )).scalar()
                second = (await conn.execute(
                    text("INSERT INTO feedback (business_id, rating) "
                         "VALUES (:b, 3) RETURNING id"), {"b": bid}
                )).scalar()
            assert second > first, f"feedback id did not advance: {first} -> {second}"
        finally:
            await eng.dispose()
    finally:
        cleanup = create_async_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
        try:
            async with cleanup.connect() as conn:
                await conn.execute(text(f'DROP DATABASE IF EXISTS "{temp_name}"'))
        finally:
            await cleanup.dispose()
