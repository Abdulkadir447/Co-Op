"""Branches — the location dimension (D1).

Revision ID: 0025_branches
Revises: 0024_tax_defaults
Create Date: 2026-10-24

Co-op was built as a single-shop product: one business, one stock number, no
concept of *which shop*. Every report therefore answers "what does the company
hold" when a chain needs "what does Branch 4 hold", and one query that forgets
the filter silently reports consolidated stock as if it were one shop.

This migration makes the location a **dimension on the row** rather than a
filter applied at read time:

  * a ``branches`` table;
  * a ``MAIN`` branch for every existing business, so no code below this line
    has to handle "a tenant with no branch";
  * ``branch_id`` on the five transactional tables, backfilled to that branch
    and then made NOT NULL;
  * nullable ``branch_id`` on ``audit_log`` and ``import_batches``, because a
    membership change or a chain-wide SKU import genuinely belongs to no
    single shop.

The backfill is only correct because every existing tenant has exactly one
branch — which is true of the pre-branch product by construction, not by
assumption. That is also why the columns can be NOT NULL immediately: there is
no state in which a historic row has no location.
"""

from alembic import op

revision = "0025_branches"
down_revision = "0024_tax_defaults"
branch_labels = None
depends_on = None

#: Tables that are genuinely chain-level; their branch_id is nullable.
NULLABLE_TABLES = ("audit_log", "import_batches")

#: Tables where a row without a location cannot be attributed to a shop.
REQUIRED_TABLES = (
    "orders",
    "order_items",
    "order_payments",
    "stock_movements",
    "invoices",
)


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS branches (
            id SERIAL PRIMARY KEY,
            business_id INTEGER NOT NULL,
            code VARCHAR(20) NOT NULL,
            name VARCHAR(255) NOT NULL,
            address VARCHAR(500),
            timezone VARCHAR(64),
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            opened_at TIMESTAMP,
            closed_at TIMESTAMP,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now(),
            deleted_at TIMESTAMP,
            version INTEGER NOT NULL DEFAULT 1,
            CONSTRAINT fk_branches_business FOREIGN KEY (business_id)
                REFERENCES businesses(id)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_branches_business_id ON branches(business_id)")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_business_code
            ON branches(business_id, code)
            WHERE deleted_at IS NULL
        """
    )

    # One MAIN branch per existing business. A business with no branch would
    # make the NOT NULL backfill below fail, which is the point: the state is
    # created here rather than left for a request to discover.
    op.execute(
        """
        INSERT INTO branches (business_id, code, name, is_default)
        SELECT b.id, 'MAIN', 'Main Branch', TRUE
        FROM businesses b
        WHERE NOT EXISTS (
            SELECT 1 FROM branches x WHERE x.business_id = b.id
        )
        """
    )

    for table in REQUIRED_TABLES:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS branch_id INTEGER")
        op.execute(
            f"""
            UPDATE {table} t
               SET branch_id = b.id
              FROM branches b
             WHERE t.branch_id IS NULL
               AND b.business_id = t.business_id
               AND b.is_default = TRUE
            """
        )
        op.execute(f"ALTER TABLE {table} ALTER COLUMN branch_id SET NOT NULL")
        op.execute(
            f"""
            ALTER TABLE {table}
              ADD CONSTRAINT fk_{table}_branch
              FOREIGN KEY (branch_id) REFERENCES branches(id)
            """
        )
        op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table}_branch_id ON {table}(branch_id)")

    for table in NULLABLE_TABLES:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS branch_id INTEGER")
        op.execute(
            f"""
            ALTER TABLE {table}
              ADD CONSTRAINT fk_{table}_branch
              FOREIGN KEY (branch_id) REFERENCES branches(id)
            """
        )
        op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table}_branch_id ON {table}(branch_id)")

    # branches is tenant-scoped, so it gets the same RLS backstop as every other
    # tenant table. 0014_rls ran before this table existed and must not be
    # edited in place, so its policy is created here.
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE branches ENABLE ROW LEVEL SECURITY")
        op.execute(
            """
            DO $$ BEGIN
              DROP POLICY IF EXISTS tenant_isolation_branches ON branches;
              CREATE POLICY tenant_isolation_branches ON branches
                USING (business_id = current_setting('app.business_id', true)::int)
                WITH CHECK (business_id = current_setting('app.business_id', true)::int);
            END $$
            """
        )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_branches ON branches")
    for table in REQUIRED_TABLES + NULLABLE_TABLES:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS fk_{table}_branch")
        op.execute(f"DROP INDEX IF EXISTS ix_{table}_branch_id")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS branch_id")
    op.execute("DROP TABLE IF EXISTS branches")
