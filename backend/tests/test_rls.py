"""Supabase RLS backstop (checklist 6-7).

The always-on tests prove the wiring is safe on SQLite (a deliberate no-op)
and that the generated DDL covers every tenant table. The functional test is
Postgres-gated (set ``TEST_DATABASE_URL``): it enables RLS for real and proves
a *non-owner* role can only see the tenant carried in ``app.business_id`` —
while the table owner (what the backend connects as) still sees everything,
which is exactly why enabling this cannot break the running app.
"""
from __future__ import annotations

import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from backend.rls import GUC, TENANT_TABLES, enable_rls_ddl, set_tenant_context

PG_URL = os.getenv("TEST_DATABASE_URL", "")
NEEDS_PG = not PG_URL.startswith("postgres")


# ---------------------------------------------------------------------------
# Always-on: SQLite no-op + DDL shape
# ---------------------------------------------------------------------------

def test_ddl_covers_every_tenant_table():
    stmts = enable_rls_ddl()
    joined = "\n".join(stmts)
    for table in TENANT_TABLES:
        assert "ENABLE ROW LEVEL SECURITY" in joined
        assert f"tenant_isolation_{table}" in joined, table
        assert f"ON {table}" in joined
    # the policy keys off the GUC, not a hardcoded id
    assert f"current_setting('{GUC}', true)::int" in joined
    # deliberately NOT forced — the owner (the backend) must keep working
    assert "FORCE ROW LEVEL SECURITY" not in joined


@pytest.mark.asyncio
async def test_set_tenant_context_is_a_noop_on_sqlite(api, session_factory):
    async with session_factory() as db:
        # must not raise on a non-Postgres dialect
        await set_tenant_context(db, 1)


# ---------------------------------------------------------------------------
# Postgres-only: RLS actually isolates a non-owner role
# ---------------------------------------------------------------------------

@pytest.mark.skipif(NEEDS_PG, reason="requires Postgres (set TEST_DATABASE_URL)")
@pytest.mark.asyncio
async def test_rls_isolates_a_non_owner_role_on_postgres():
    def _url():
        u = PG_URL
        if u.startswith("postgres://"):
            u = "postgresql+asyncpg://" + u[len("postgres://"):]
        elif u.startswith("postgresql://"):
            u = "postgresql+asyncpg://" + u[len("postgresql://"):]
        return u

    eng = create_async_engine(_url())
    async with eng.begin() as conn:
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS rls_probe ("
            "id SERIAL PRIMARY KEY, business_id INTEGER NOT NULL, name TEXT)"
        ))
        await conn.execute(text("DELETE FROM rls_probe"))
        await conn.execute(text("INSERT INTO rls_probe (business_id, name) VALUES (1,'a'),(2,'b')"))
        for stmt in [
            "ALTER TABLE IF EXISTS rls_probe ENABLE ROW LEVEL SECURITY",
            "DO $$ BEGIN DROP POLICY IF EXISTS tenant_isolation_rls_probe ON rls_probe; "
            f"CREATE POLICY tenant_isolation_rls_probe ON rls_probe "
            f"USING (business_id = current_setting('{GUC}', true)::int) "
            f"WITH CHECK (business_id = current_setting('{GUC}', true)::int); END $$",
            "DROP ROLE IF EXISTS rls_probe_role",
            "CREATE ROLE rls_probe_role NOLOGIN",
            "GRANT SELECT ON rls_probe TO rls_probe_role",
        ]:
            await conn.execute(text(stmt))

    try:
        async with eng.connect() as conn:
            # The OWNER bypasses RLS: sees both rows regardless of the GUC.
            rows = (await conn.execute(text("SELECT count(*) FROM rls_probe"))).scalar()
            assert rows == 2

            # A non-owner role is locked to the GUC's tenant.
            async with conn.begin() as tx:
                await tx.execute(text("SET ROLE rls_probe_role"))
                await tx.execute(text(f"SELECT set_config('{GUC}', '1', true)"))
                names = (await tx.execute(text("SELECT name FROM rls_probe"))).scalars().all()
                assert names == ["a"]
                await tx.execute(text("SET ROLE NONE"))
    finally:
        async with eng.begin() as conn:
            await conn.execute(text(
                "DROP POLICY IF EXISTS tenant_isolation_rls_probe ON rls_probe"))
            await conn.execute(text("ALTER TABLE IF EXISTS rls_probe DISABLE ROW LEVEL SECURITY"))
            await conn.execute(text("DROP TABLE IF EXISTS rls_probe"))
            await conn.execute(text("DROP ROLE IF EXISTS rls_probe_role"))
        await eng.dispose()
