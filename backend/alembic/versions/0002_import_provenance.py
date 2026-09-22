"""Import provenance — import_batches table + import_batch_id provenance columns.

Revision ID: 0002_import_provenance
Revises: 0001_postgres_baseline
Create Date: 2026-08-27

Adds the v1 Instant Onboarding provenance (spec item 9):
  * ``import_batches`` — one row per imported file/dataset
  * ``import_batch_id`` — nullable provenance column on products/customers/
    orders/order_items. NULL = created live in Co-op; set = created by that
    import batch. This cleanly separates "imported history" from "today's
    live sales" and makes undoing an import a batch-scoped operation later.

Idempotent (guarded DDL), additive only — never rewrites or drops data.
"""
from alembic import op

revision = "0002_import_provenance"
down_revision = "0001_postgres_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS import_batches (
            id             BIGSERIAL PRIMARY KEY,
            business_id    INTEGER NOT NULL,
            dataset        VARCHAR(20) NOT NULL,
            filename       VARCHAR(255),
            row_count      INTEGER NOT NULL DEFAULT 0,
            created_count  INTEGER NOT NULL DEFAULT 0,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_import_batches_business ON import_batches"
        "(business_id)")

    for table in ("products", "customers", "orders", "order_items"):
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS import_batch_id INTEGER")
        op.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_import_batch ON {table}"
            f"(import_batch_id)")
        op.execute(
            f"""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = '{table}'::regclass
                      AND conname = 'fk_{table}_import_batch'
                ) THEN
                    ALTER TABLE {table} ADD CONSTRAINT fk_{table}_import_batch
                        FOREIGN KEY (import_batch_id) REFERENCES import_batches (id);
                END IF;
            END $$;
            """
        )


def downgrade() -> None:
    # Deliberately non-destructive (matches baseline policy): provenance is
    # additive and dropping it would lose import history.
    pass
