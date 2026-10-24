"""Tax presentation — per-business rate, snapshotted onto each order.

Revision ID: 0021_tax
Revises: 0020_order_payments
Create Date: 2026-10-24

Why a snapshot on the order rather than reading the rate live: an invoice the
customer already holds must not change when the business later changes its
rate. ``orders.tax_rate`` records the rate that applied when the order was
raised; ``orders.tax_amount`` the money it produced.

Semantics (tax is EXCLUSIVE, the default in this market):

    orders.total_amount   = net subtotal (unchanged — revenue reporting stays
                            net-of-tax and every existing number stays correct)
    orders.tax_amount     = total_amount * tax_rate / 100
    grand total           = total_amount + tax_amount  (what the customer owes)

``tax_rate IS NULL`` means tax was off for that order, which keeps every
legacy row exactly as it was (tax_amount defaults to 0).

Additive only, idempotent (guarded DDL).
"""

from alembic import op

revision = "0021_tax"
down_revision = "0020_order_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tax_enabled "
        "BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(
        "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tax_rate "
        "DOUBLE PRECISION NOT NULL DEFAULT 7.5"
    )
    op.execute(
        "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tax_label "
        "VARCHAR(20) NOT NULL DEFAULT 'VAT'"
    )
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_rate DOUBLE PRECISION")
    op.execute(
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount "
        "DOUBLE PRECISION NOT NULL DEFAULT 0"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS tax_amount")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS tax_rate")
    op.execute("ALTER TABLE businesses DROP COLUMN IF EXISTS tax_label")
    op.execute("ALTER TABLE businesses DROP COLUMN IF EXISTS tax_rate")
    op.execute("ALTER TABLE businesses DROP COLUMN IF EXISTS tax_enabled")
