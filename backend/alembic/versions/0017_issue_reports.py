"""Issue reports — the in-app "Report an issue" page.

Revision ID: 0017_issue_reports
Revises: 0016_merge_heads
Create Date: 2026-09-27

Unlike feedback (which Co-op asks for on a cadence), an issue report is raised
by the owner the moment something is wrong. Every report is stored
tenant-scoped and emailed to the support inbox.

``id`` is BIGSERIAL so the column has a real default: a bare ``INTEGER PRIMARY
KEY`` (as 0010-0015 used) has no sequence on Postgres, and an ORM insert that
omits ``id`` fails with a not-null violation there while passing on SQLite.

Idempotent (guarded DDL), additive only.
"""

from alembic import op

revision = "0017_issue_reports"
down_revision = "0016_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TABLE IF NOT EXISTS issue_reports ("
        "id BIGSERIAL PRIMARY KEY, "
        "business_id INTEGER NOT NULL REFERENCES businesses(id), "
        "submitted_by VARCHAR(255), "
        "category VARCHAR(32) NOT NULL DEFAULT 'other', "
        "severity VARCHAR(16) NOT NULL DEFAULT 'normal', "
        "subject VARCHAR(200) NOT NULL, "
        "description TEXT NOT NULL, "
        "contact_email VARCHAR(255), "
        "app_version VARCHAR(64), "
        "platform VARCHAR(32), "
        "status VARCHAR(16) NOT NULL DEFAULT 'new', "
        "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ")"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_issue_reports_business_id "
        "ON issue_reports (business_id)"
    )
    # Tenant isolation, same policy shape as every other tenant table. Guarded
    # and idempotent, so re-running it for the tables 0014 already covered is a
    # no-op (see backend.rls.enable_rls_ddl).
    from backend.rls import enable_rls_ddl

    for stmt in enable_rls_ddl():
        op.execute(stmt)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS issue_reports")
