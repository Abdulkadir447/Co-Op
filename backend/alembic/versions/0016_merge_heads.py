"""Merge the two parallel heads into one.

Revision ID: 0016_merge_heads
Revises: 0011_payments, 0015_feedback
Create Date: 2026-09-17

Two migrations branched from ``0010_team_model`` in parallel:
``0011_payments`` (the payments table) and ``0011_subscription_trial`` (which
leads through 0012→0013→0014→0015). Both are required, so rather than reparent
history this adds a merge revision that joins the two tips. After this there is
a single head, so ``alembic upgrade head`` works on a fresh Postgres.

Because ``0014_rls`` sits on the subscription branch, it can run *before*
``0011_payments`` creates the ``payments`` table — so ``payments`` would miss
its RLS policy. Now that both branches are merged and every tenant table
exists, this re-asserts the (guarded, idempotent) RLS backstop so coverage is
complete regardless of the order alembic picked for the parallel branches.
"""

from alembic import op

revision = "0016_merge_heads"
down_revision = ("0011_payments", "0015_feedback")
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    from backend.rls import enable_rls_ddl

    for stmt in enable_rls_ddl():
        op.execute(stmt)


def downgrade() -> None:
    # 0014_rls.downgrade drops every tenant_isolation policy; nothing extra
    # to undo here.
    pass
