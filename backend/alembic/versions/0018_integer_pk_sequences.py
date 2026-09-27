"""Give the 0010-0015 tables a real id sequence.

Revision ID: 0018_integer_pk_sequences
Revises: 0017_issue_reports
Create Date: 2026-09-27

0010-0015 declared ``id INTEGER PRIMARY KEY`` in raw DDL. On SQLite that is an
alias for rowid and auto-increments, so the whole suite passed. On Postgres it
is a plain integer column with NO default, so any ORM insert that omits ``id``
fails with a not-null violation::

    null value in column "id" of relation "feedback" violates not-null constraint

Reproduced on a real Postgres 16 for business_invitations, business_members,
feedback, invoices, licenses and payments. The baseline tables (ai_usage,
orders, products, subscriptions) came from 0001 as BIGSERIAL and were never
affected, and 0017 already used BIGSERIAL — so these six were the whole gap.

Each table gets a sequence, a ``nextval`` default, ``OWNED BY`` so the sequence
drops with its column, and a ``setval`` that resumes past rows already present
(so this is safe on a database that has been in use).

The column type stays ``integer``. The missing default was the bug; rewriting
the type to bigint would be a separate, riskier change for no functional gain.

No-op on SQLite. Idempotent (guarded DDL), additive only.
"""

from alembic import op

revision = "0018_integer_pk_sequences"
down_revision = "0017_issue_reports"
branch_labels = None
depends_on = None

# Every table 0010-0015 created with a bare INTEGER PRIMARY KEY.
TABLES = (
    "business_members",      # 0010_team_model
    "business_invitations",  # 0010_team_model
    "payments",              # 0011_payments (parallel branch, merged by 0016)
    "licenses",              # 0012_licenses
    "invoices",              # 0013_invoices
    "feedback",              # 0015_feedback
)


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        # SQLite's INTEGER PRIMARY KEY already aliases rowid and auto-increments.
        return
    for table in TABLES:
        # The to_regclass guard mirrors backend/rls.py: payments lives on a
        # parallel branch, so a table may legitimately not exist yet.
        op.execute(
            "DO $$ BEGIN "
            f"IF to_regclass('public.{table}') IS NOT NULL THEN "
            f"CREATE SEQUENCE IF NOT EXISTS {table}_id_seq; "
            f"ALTER TABLE {table} ALTER COLUMN id SET DEFAULT nextval('{table}_id_seq'); "
            f"ALTER SEQUENCE {table}_id_seq OWNED BY {table}.id; "
            # Resume past existing rows; an empty table starts at 1 because
            # is_called=false makes the NEXT nextval return the value given.
            f"PERFORM setval('{table}_id_seq', "
            f"COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false); "
            "END IF; "
            "END $$"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table in TABLES:
        op.execute(
            "DO $$ BEGIN "
            f"IF to_regclass('public.{table}') IS NOT NULL THEN "
            f"ALTER TABLE {table} ALTER COLUMN id DROP DEFAULT; "
            "END IF; "
            "END $$"
        )
        op.execute(f"DROP SEQUENCE IF EXISTS {table}_id_seq")
