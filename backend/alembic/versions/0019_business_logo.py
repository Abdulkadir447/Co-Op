"""Business logo — a Supabase Storage URL on the tenant record.

Revision ID: 0019_business_logo
Revises: 0018_integer_pk_sequences
Create Date: 2026-10-22

Branding assets are the first thing Co-op stores outside Postgres: a logo is
binary, is read far more often than it is written, and belongs in object
storage rather than a BYTEA column. Supabase Storage holds the bytes; this
column holds only the public URL, so the database stays the source of truth
for *which* logo a business has without carrying the payload.

1024 characters matches ``profiles.avatar_url`` and comfortably fits a signed
URL with its token query string.

Idempotent (guarded DDL), additive only.
"""

from alembic import op

revision = "0019_business_logo"
down_revision = "0018_integer_pk_sequences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE businesses "
        "ADD COLUMN IF NOT EXISTS logo_url VARCHAR(1024)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE businesses DROP COLUMN IF EXISTS logo_url")
