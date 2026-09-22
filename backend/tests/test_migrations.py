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
HEAD = "0016_merge_heads"


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
                # All 17 tenant tables, including payments (created on the
                # parallel branch — the bug this test exists to catch).
                assert len(policies) == 17, sorted(policies)
                assert "payments" in policies, sorted(policies)

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
