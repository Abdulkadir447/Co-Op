"""Invoices — one saved invoice per order, numbered per business.

Revision ID: 0013_invoices
Revises: 0012_licenses
Create Date: 2026-09-05

Delivers the PRD's "Invoice generation" item, which until now existed only as
a printable modal rendered from order data. An invoice row is a *document
record*: its number (INV-0001 ... per business), issue/due dates, notes and
lifecycle status. Amounts are not copied — the order stays the single source
of truth for the money.

Two unique indexes carry the invariants the service relies on:
  * one invoice number per business (so numbering can never collide)
  * one invoice per order per business (so "create invoice" is idempotent
    rather than able to double-issue paperwork to a customer)

Idempotent (guarded DDL), additive only.
"""

from alembic import op

revision = "0013_invoices"
down_revision = "0012_licenses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TABLE IF NOT EXISTS invoices ("
        "id INTEGER PRIMARY KEY, "
        "business_id INTEGER NOT NULL REFERENCES businesses(id), "
        "order_id INTEGER NOT NULL REFERENCES orders(id), "
        "number VARCHAR(20) NOT NULL, "
        "issue_date TIMESTAMP NOT NULL, "
        "due_date TIMESTAMP, "
        "notes TEXT, "
        "status VARCHAR(10) NOT NULL DEFAULT 'draft', "
        "created_by VARCHAR(255), "
        "updated_by VARCHAR(255), "
        "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
        "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
        "CONSTRAINT uq_invoices_business_number UNIQUE (business_id, number), "
        "CONSTRAINT uq_invoices_business_order UNIQUE (business_id, order_id)"
        ")"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_business_id ON invoices (business_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS invoices")
