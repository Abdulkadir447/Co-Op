"""Neutral tax defaults — no pre-filled 7.5% VAT on a new business.

Revision ID: 0024_tax_defaults
Revises: 0023_invoice_compliance
Create Date: 2026-11-23

0021 defaulted ``tax_rate`` to 7.5 and ``tax_label`` to 'VAT', which was right
for a Nigeria-only product and wrong for the market Co-op now sells into: sales
tax is set per US state and county (and many services are not taxed at all), so
a pre-filled rate is a number the owner has to notice and correct. The neutral
default is 0 / 'Tax'; the owner sets the real rate once in Settings, and the
rate is snapshotted per order either way.

Existing rows are left untouched — this changes the default for new businesses
only, never anybody's data.
"""

from alembic import op

revision = "0024_tax_defaults"
down_revision = "0023_invoice_compliance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE businesses ALTER COLUMN tax_rate SET DEFAULT 0")
    op.execute("ALTER TABLE businesses ALTER COLUMN tax_label SET DEFAULT 'Tax'")


def downgrade() -> None:
    op.execute("ALTER TABLE businesses ALTER COLUMN tax_rate SET DEFAULT 7.5")
    op.execute("ALTER TABLE businesses ALTER COLUMN tax_label SET DEFAULT 'VAT'")
