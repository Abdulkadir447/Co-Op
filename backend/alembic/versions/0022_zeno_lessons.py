"""Zeno learning ledger — lessons from mistakes, and owner preferences.

Revision ID: 0022_zeno_lessons
Revises: 0021_tax
Create Date: 2026-10-27

One table, two kinds of row (``kind``):

* ``mistake``  — something Zeno got wrong, graded 1-5 by what it cost.
* ``preference`` — something the owner asked for more than once. Starts as
  ``candidate`` at ``repeat_count >= 2`` and only becomes ``active`` when the
  OWNER accepts it.

The trust rule lives in the data: only ``status='active'`` rows are injected
into the prompt, and nothing in this table can mutate business data. A wrong
answer costs a sentence; a wrong *rule* costs money — so a learned rule has to
be visible and reversible, never silent.

``fingerprint`` is unique per business so a repeated mistake increments
``repeat_count`` instead of growing the ledger without bound (the whole point
is that it stays small enough to fit in a prompt).

Additive only, idempotent (guarded DDL), mirroring 0021's style.
"""

from alembic import op

revision = "0022_zeno_lessons"
down_revision = "0021_tax"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS zeno_lessons (
            id SERIAL PRIMARY KEY,
            business_id INTEGER NOT NULL,
            kind VARCHAR(16) NOT NULL DEFAULT 'mistake',
            scope VARCHAR(40) NOT NULL DEFAULT 'general',
            statement TEXT NOT NULL,
            severity INTEGER NOT NULL DEFAULT 3,
            cost_amount DOUBLE PRECISION,
            cost_basis VARCHAR(12) DEFAULT 'estimated',
            blast_radius INTEGER DEFAULT 0,
            repeat_count INTEGER NOT NULL DEFAULT 1,
            status VARCHAR(12) NOT NULL DEFAULT 'active',
            source VARCHAR(12) NOT NULL DEFAULT 'owner',
            fingerprint VARCHAR(40) NOT NULL,
            evidence_ref VARCHAR(80),
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            CONSTRAINT uq_zeno_lessons_business_fingerprint UNIQUE (business_id, fingerprint)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_zeno_lessons_business_id "
        "ON zeno_lessons (business_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_zeno_lessons_id ON zeno_lessons (id)")
    # Database-side tenant backstop, same shape as every other tenant table
    # (migration 0016 re-runs this for tables that arrive late, but creating it
    # here keeps 0022 self-contained for a fresh database).
    op.execute("ALTER TABLE zeno_lessons ENABLE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation_zeno_lessons ON zeno_lessons")
    op.execute(
        "CREATE POLICY tenant_isolation_zeno_lessons ON zeno_lessons "
        "USING (business_id = current_setting('app.business_id', true)::int) "
        "WITH CHECK (business_id = current_setting('app.business_id', true)::int)"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_zeno_lessons ON zeno_lessons")
    op.execute("DROP TABLE IF EXISTS zeno_lessons")
