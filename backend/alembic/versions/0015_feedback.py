"""Feedback — periodic in-app product-feedback prompt responses.

Revision ID: 0015_feedback
Revises: 0014_rls
Create Date: 2026-09-17

Co-op asks the owner how the app is doing three weeks after the paid
relationship begins (trial start, or the first successful charge). The first
prompt is compulsory; later ones repeat every three weeks and can be skipped.
A row is written both on submit and on dismiss (``kind``), so the prompt
cadence is driven off this table.

Idempotent (guarded DDL), additive only.
"""

from alembic import op

revision = "0015_feedback"
down_revision = "0014_rls"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TABLE IF NOT EXISTS feedback ("
        "id INTEGER PRIMARY KEY, "
        "business_id INTEGER NOT NULL REFERENCES businesses(id), "
        "submitted_by VARCHAR(255), "
        "kind VARCHAR(12) NOT NULL DEFAULT 'submitted', "
        "rating INTEGER, "
        "overall TEXT, "
        "likes TEXT, "
        "issues TEXT, "
        "improvements TEXT, "
        "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ")"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_feedback_business_id ON feedback (business_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS feedback")
