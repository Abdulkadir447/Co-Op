"""Devices — the machine identity behind an offline write (D1).

Revision ID: 0026_devices
Revises: 0025_branches
Create Date: 2026-10-24

A branch says *where* a sale happened. It does not say *which machine* recorded
it, and once the WAN is down the server cannot ask. That matters for two
reasons:

  * an offline write is attributed to (staff member, device). Without the
    device half, every offline row in the audit ledger is attributed to a
    placeholder and a dispute cannot be resolved;
  * D5 approvals are signed on the till, offline, and verified later. The
    server needs the public key of the machine that signed.

So a device is a row: bound to one branch, never deleted (revoked), and
carrying the public half of its keypair. The private key never leaves the
machine.

``audit_log.device_id`` is nullable because historic rows, membership events
and billing events have no originating machine — the same reason
``branch_id`` is nullable there.
"""

from alembic import op

revision = "0026_devices"
down_revision = "0025_branches"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS devices (
            id SERIAL PRIMARY KEY,
            business_id INTEGER NOT NULL,
            branch_id INTEGER NOT NULL,
            device_key VARCHAR(64) NOT NULL,
            name VARCHAR(255) NOT NULL,
            public_key VARCHAR(4000),
            enrolled_at TIMESTAMP DEFAULT now(),
            last_seen_at TIMESTAMP,
            revoked_at TIMESTAMP,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now(),
            version INTEGER NOT NULL DEFAULT 1,
            CONSTRAINT fk_devices_branch FOREIGN KEY (branch_id)
                REFERENCES branches(id)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_devices_business_id ON devices(business_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_devices_branch_id ON devices(branch_id)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_business_key "
        "ON devices(business_id, device_key)"
    )

    op.execute("ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS device_id INTEGER")
    op.execute(
        """
        ALTER TABLE audit_log
          ADD CONSTRAINT fk_audit_log_device
          FOREIGN KEY (device_id) REFERENCES devices(id)
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_log_device_id ON audit_log(device_id)")

    # devices is tenant-scoped, so it gets the same RLS backstop as every other
    # tenant table (0014_rls ran before this table existed).
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE devices ENABLE ROW LEVEL SECURITY")
        op.execute(
            """
            DO $$ BEGIN
              DROP POLICY IF EXISTS tenant_isolation_devices ON devices;
              CREATE POLICY tenant_isolation_devices ON devices
                USING (business_id = current_setting('app.business_id', true)::int)
                WITH CHECK (business_id = current_setting('app.business_id', true)::int);
            END $$
            """
        )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_devices ON devices")
    op.execute("ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS fk_audit_log_device")
    op.execute("DROP INDEX IF EXISTS ix_audit_log_device_id")
    op.execute("ALTER TABLE audit_log DROP COLUMN IF EXISTS device_id")
    op.execute("DROP TABLE IF EXISTS devices")
