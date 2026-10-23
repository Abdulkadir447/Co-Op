"""Payments — Paystack charge ledger (plan upgrades are paid).

Revision ID: 0011_payments
Revises: 0010_team_model
Create Date: 2026-09-11

Adds ``payments``: one row per checkout Co-op starts, keyed by Paystack's own
``reference`` (unique) so a replayed webhook can neither create a second row
nor upgrade a plan twice. Additive, guarded DDL, no data movement.
"""

from alembic import op

revision = "0011_payments"
down_revision = "0010_team_model"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TABLE IF NOT EXISTS payments ("
        "id INTEGER PRIMARY KEY, "
        "business_id INTEGER NOT NULL REFERENCES businesses(id), "
        "provider VARCHAR(30) NOT NULL DEFAULT 'paystack', "
        "reference VARCHAR(80) NOT NULL, "
        "plan VARCHAR(20) NOT NULL, "
        "interval VARCHAR(20) NOT NULL DEFAULT 'monthly', "
        "mode VARCHAR(20), "
        "amount_kobo INTEGER, "
        "currency VARCHAR(8), "
        "email VARCHAR(255), "
        "status VARCHAR(20) NOT NULL DEFAULT 'pending', "
        "provider_status VARCHAR(40), "
        "channel VARCHAR(40), "
        "metadata_json TEXT, "
        "started_by VARCHAR(255), "
        "paid_at TIMESTAMP, "
        "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
        "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
        "CONSTRAINT uq_payments_reference UNIQUE (reference)"
        ")"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payments_business_id ON payments (business_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payments_status ON payments (business_id, status)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_payments_status")
    op.execute("DROP INDEX IF EXISTS ix_payments_business_id")
    op.execute("DROP TABLE IF EXISTS payments")
