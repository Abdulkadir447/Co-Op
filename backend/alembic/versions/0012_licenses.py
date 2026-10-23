"""Licensing — the ``licenses`` ledger + the licence window on subscriptions.

Revision ID: 0012_licenses
Revises: 0011_subscription_trial
Create Date: 2026-09-05

Implements PRD Ch8 §8.15 (License table) and the activation flow of Ch7
§7.19. Two additive pieces:

* ``licenses`` — one row per issued activation string: business, plan, seats,
  issued/activated/expires, and revocation. The key itself is never stored,
  only its SHA-256 ``fingerprint`` (unique), so a database leak cannot be
  replayed as keys.
* ``subscriptions.license_*`` — the granted window, mirroring the trial
  columns exactly: an activated licence grants ``license_plan`` for a fixed
  window WITHOUT overwriting ``plan``, which makes expiry a pure function of
  (``license_ends_at``, now) — no scheduler, no downgrade job, no drift.

Idempotent (guarded DDL), additive only.
"""

from alembic import op

revision = "0012_licenses"
down_revision = "0011_subscription_trial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TABLE IF NOT EXISTS licenses ("
        "id INTEGER PRIMARY KEY, "
        "business_id INTEGER NOT NULL REFERENCES businesses(id), "
        "fingerprint VARCHAR(64) NOT NULL, "
        "plan VARCHAR(20) NOT NULL, "
        "seats INTEGER NOT NULL DEFAULT 1, "
        "issued_at TIMESTAMP, "
        "activated_at TIMESTAMP, "
        "activated_by VARCHAR(255), "
        "expires_at TIMESTAMP, "
        "revoked_at TIMESTAMP, "
        "revoked_reason VARCHAR(255), "
        "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
        "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
        "CONSTRAINT uq_licenses_fingerprint UNIQUE (fingerprint)"
        ")"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_licenses_business_id ON licenses (business_id)"
    )
    op.execute(
        "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS license_plan VARCHAR(20)"
    )
    op.execute("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS license_seats INTEGER")
    op.execute(
        "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS license_started_at TIMESTAMPTZ"
    )
    op.execute(
        "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS license_ends_at TIMESTAMPTZ"
    )
    op.execute(
        "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS license_fingerprint VARCHAR(64)"
    )


def downgrade() -> None:
    # Licence history is billing-relevant (it proves what was granted, to
    # whom, and when it was revoked); deliberately non-destructive, in line
    # with the other billing migrations.
    pass
