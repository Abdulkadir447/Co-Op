"""Customer payments against an order (receivables).

Revision ID: 0020_order_payments
Revises: 0019_business_logo
Create Date: 2026-10-23

Before this table Co-op could create an order, deliver it and raise an
invoice — but there was no way to record that the customer actually paid.
``orders.total_amount`` says what was charged; this table is the separate
ledger of what came in, which is what makes "who owes me money?" answerable
and partial payments possible without mutating the order.

Additive only, idempotent (guarded DDL). RLS is enabled with the same
``app.business_id`` GUC policy as every other tenant table (0014), so the
database-side backstop covers the new surface too.
"""

from alembic import op

revision = "0020_order_payments"
down_revision = "0019_business_logo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TABLE IF NOT EXISTS order_payments ("
        " id SERIAL PRIMARY KEY,"
        " business_id INTEGER NOT NULL,"
        " order_id INTEGER NOT NULL REFERENCES orders(id),"
        " amount DOUBLE PRECISION NOT NULL,"
        " method VARCHAR(20) NOT NULL DEFAULT 'cash',"
        " reference VARCHAR(120),"
        " note VARCHAR(500),"
        " received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,"
        " created_by VARCHAR(255),"
        " created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ")"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_order_payments_order_id "
        "ON order_payments (order_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_order_payments_business_id "
        "ON order_payments (business_id)"
    )
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY")
    op.execute(
        "DROP POLICY IF EXISTS tenant_isolation_order_payments ON order_payments"
    )
    op.execute(
        "CREATE POLICY tenant_isolation_order_payments ON order_payments "
        "USING (business_id = current_setting('app.business_id', true)::int) "
        "WITH CHECK (business_id = current_setting('app.business_id', true)::int)"
    )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "DROP POLICY IF EXISTS tenant_isolation_order_payments ON order_payments"
        )
    op.execute("DROP TABLE IF EXISTS order_payments")
