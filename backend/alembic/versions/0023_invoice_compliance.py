"""Invoice compliance — the business registration number a VAT invoice must show.

Revision ID: 0023_invoice_compliance
Revises: 0022_zeno_lessons
Create Date: 2026-11-06

A tax invoice has to say who the supplier legally is. Co-op already stored and
printed the supplier name, address, tax ID, sequential invoice number, date of
supply, buyer name, gross amount and tax (rate + amount). The one field with no
home in the schema was the supplier's **incorporation / business registration
number** (CAC RC or BN in Nigeria; a state filing number, CRN, or EIN
elsewhere). The Nigeria Tax Act 2025 s.153(d) is the clearest statement of the
requirement; the same identity block is expected on US, UK and EU invoices.

Nullable on purpose: a sole trader, and any business that has not registered,
must not be blocked from invoicing. The invoice prints it only when it is set.

Additive only, idempotent (guarded DDL), mirroring 0021/0022.
"""

from alembic import op

revision = "0023_invoice_compliance"
down_revision = "0022_zeno_lessons"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS registration_number VARCHAR(60)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE businesses DROP COLUMN IF EXISTS registration_number")
