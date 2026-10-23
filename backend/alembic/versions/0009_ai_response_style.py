"""AI response style preference (Settings — AI Preferences).

Revision ID: 0009_ai_response_style
Revises: 0008_audit_business_id
Create Date: 2026-08-31

Adds ``ai_response_style`` to ``businesses`` (concise | standard | detailed,
default standard). The Ask Zeno system prompt reads it, so the owner's
preference shapes every AI answer. Idempotent (guarded DDL), additive.
"""

from alembic import op

revision = "0009_ai_response_style"
down_revision = "0008_audit_business_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ai_response_style "
        "VARCHAR(20) NOT NULL DEFAULT 'standard'"
    )


def downgrade() -> None:
    # Non-destructive: a preference column, never dropped.
    pass
