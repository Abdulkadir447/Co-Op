"""
Supabase / Postgres Row-Level Security wiring (checklist 6–7).

Co-op's backend always filters on ``business_id`` in application code, and the
test suite asserts cross-tenant reads 404. RLS is the *database-side* backstop
for the day a second Postgres role exists (for example Supabase's ``anon`` /
``auth`` roles behind PostgREST): every tenant table gets

    ENABLE ROW LEVEL SECURITY
    + a policy ``USING (business_id = current_setting('app.business_id', true)::int)``

Crucially we do **not** ``FORCE ROW LEVEL SECURITY``. In Postgres the table
*owner* bypasses RLS unless forced — and the backend connects as the owner. So
today's backend (and the Paystack webhook, background jobs, migrations) keeps
working exactly as before, while any *future* non-owner role is locked to the
tenant carried in the ``app.business_id`` GUC. That is precisely the Supabase
threat model, applied without breaking anything that runs now.

``set_tenant_context`` sets the GUC (transaction-local) on Postgres; on SQLite
it is a no-op, so the testing environment is unaffected.
"""
from __future__ import annotations

from sqlalchemy import text

# Tenant-scoped tables (every one carries a NOT NULL ``business_id``).
# Kept in sync with backend/models.py; migration 0014 iterates this list.
TENANT_TABLES = (
    "products",
    "customers",
    "import_batches",
    "orders",
    "order_items",
    "stock_movements",
    "ai_usage",
    "ai_history",
    "subscriptions",
    "licenses",
    "invoices",
    "sync_queue",
    "audit_log",
    "analytics_snapshots",
    "business_members",
    "business_invitations",
    "payments",
)

GUC = "app.business_id"


def is_postgres(db) -> bool:
    try:
        return db.get_bind().dialect.name == "postgresql"
    except Exception:  # noqa: BLE001 — never let this break a request
        return False


async def set_tenant_context(db, business_id: int) -> None:
    """Set ``app.business_id`` for the current transaction (Postgres only).

    ``true`` makes it transaction-local, so it is reset automatically at the
    next transaction and can never leak across requests on a pooled
    connection. On SQLite this is a deliberate no-op.
    """
    if business_id is None or not is_postgres(db):
        return
    await db.execute(text(f"SELECT set_config('{GUC}', :bid, true)"),
                     {"bid": str(int(business_id))})


def enable_rls_ddl() -> list[str]:
    """The DDL migration 0014 runs on Postgres (guarded, idempotent).

    Each policy is wrapped in a ``to_regclass`` existence check. The tenant
    tables are created across several migrations — and ``payments`` lives on a
    *parallel* branch (``0011_payments``) that ``0014_rls`` may run before — so
    the policy step must tolerate a table that does not exist yet rather than
    raising ``relation does not exist``. ``0016_merge_heads`` re-runs this once
    every branch is merged, so such tables still get their policy. The
    ``ALTER TABLE IF EXISTS`` is already a no-op for a missing table.
    """
    stmts: list[str] = []
    for table in TENANT_TABLES:
        stmts.append(f'ALTER TABLE IF EXISTS {table} ENABLE ROW LEVEL SECURITY')
        stmts.append(
            "DO $$ BEGIN "
            f"IF to_regclass('public.{table}') IS NOT NULL THEN "
            f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table}; "
            f"CREATE POLICY tenant_isolation_{table} ON {table} "
            f"USING (business_id = current_setting('{GUC}', true)::int) "
            f"WITH CHECK (business_id = current_setting('{GUC}', true)::int); "
            "END IF; "
            "END $$"
        )
    return stmts
