"""Row-Level Security backstop for tenant tables (checklist 6-7).

Revision ID: 0014_rls
Revises: 0013_invoices
Create Date: 2026-09-12

Enables RLS and a per-tenant policy on every ``business_id``-bearing table,
keyed to the ``app.business_id`` GUC that ``backend/rls.set_tenant_context``
sets per transaction. NOT forced, so the table owner (the backend) bypasses
RLS exactly as today; the policies protect any *future* non-owner role (the
Supabase anon/auth model). No-op on SQLite. See backend/rls.py.
"""

from alembic import op

from backend.rls import enable_rls_ddl

revision = "0014_rls"
down_revision = "0013_invoices"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        # RLS is a Postgres feature; the testing SQLite DB is unaffected.
        return
    for stmt in enable_rls_ddl():
        op.execute(stmt)


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    from backend.rls import TENANT_TABLES

    for table in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table}")
        op.execute(f"ALTER TABLE IF EXISTS {table} DISABLE ROW LEVEL SECURITY")
