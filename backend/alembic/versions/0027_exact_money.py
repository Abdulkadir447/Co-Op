"""Exact money — float columns become integer minor units (D2).

Revision ID: 0027_exact_money
Revises: 0026_devices
Create Date: 2026-10-24

Every money column was a ``REAL``/``double precision``. That is the wrong type
for money: a binary fraction cannot represent 0.01, so sums drift, and a
subtotal that is one kobo away from the sum of its own lines makes an invoice
that nobody will trust. See backend/money.py for the full argument.

This migration changes the storage, not the meaning:

  ``REAL naira``  ->  ``INTEGER kobo``   (multiply by 100, round half up)
  ``REAL percent`` ->  ``INTEGER 1e-4 %`` (multiply by 10 000, round half up)

Doing it in SQL is deliberate: the conversion has to be one statement per
column so it can run inside a transaction and be verified, and doing it in
Python would mean loading every tenant's ledger into the migration process.
``round()`` in Postgres is half-away-from-zero for numeric, which is the
commercial convention the application uses (ROUND_HALF_UP).

The ``businesses.currency`` column is then constrained to ``NGN``. Money is
kobo with a fixed exponent of 2; a currency with a different exponent (JPY 0,
KWD 3) would be silently mis-scaled, and a stored amount does not carry its own
currency. Tenants in any other currency must not exist before this runs — the
product is Naira-only by decision, so the guard is a two-line assertion rather
than a data migration.

Downgrade restores ``REAL`` with the same rounding, so a rollback does not
silently change any amount.
"""

from alembic import op

revision = "0027_exact_money"
down_revision = "0026_devices"
branch_labels = None
depends_on = None

#: (table, column) of money columns, in naira -> kobo.
MONEY_COLUMNS = (
    ("products", "unit_price"),
    ("products", "cost_price"),
    ("orders", "total_amount"),
    ("orders", "tax_amount"),
    ("order_items", "unit_price"),
    ("order_items", "total_price"),
    ("order_payments", "amount"),
    ("zeno_lessons", "cost_amount"),
)

#: (table, column) of percentage columns, percent -> 1e-4 percent.
RATE_COLUMNS = (
    ("businesses", "tax_rate"),
    ("orders", "tax_rate"),
)


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if not _is_postgres():  # pragma: no cover - the suite builds SQLite directly
        return

    # An amount stored as a double has already lost the last kobo; rounding it
    # once, here, is the only honest conversion. It is also the last time this
    # database ever rounds a stored amount.
    for table, column in MONEY_COLUMNS:
        op.execute(
            f"""
            ALTER TABLE {table}
              ALTER COLUMN {column} TYPE INTEGER
              USING ROUND({column}::numeric * 100)::integer
            """
        )
        # NOT NULL is preserved by ALTER TYPE; nullable columns stay nullable.

    for table, column in RATE_COLUMNS:
        op.execute(
            f"""
            ALTER TABLE {table}
              ALTER COLUMN {column} TYPE INTEGER
              USING ROUND({column}::numeric * 10000)::integer
            """
        )

    # Defaults were written for floats and would now insert naira into a kobo
    # column. 0 is 0 either way, but the text default has to change type.
    # ``tax_amount`` and ``tax_rate`` on businesses keep an integer default of
    # 0 (0 kobo, 0%); the others had no server default in the model, so they
    # get none here either — matching the ORM matters more than tidiness.
    op.execute("ALTER TABLE businesses ALTER COLUMN tax_rate SET DEFAULT 0")
    op.execute("ALTER TABLE orders ALTER COLUMN tax_amount SET DEFAULT 0")

    # One currency, one exponent. Refuse rather than rewrite: a tenant whose
    # books are in another currency needs a decision from a human, not a
    # multiplication by 100.
    op.execute(
        """
        DO $$
        DECLARE bad integer;
        BEGIN
          SELECT count(*) INTO bad FROM businesses
           WHERE currency IS DISTINCT FROM 'NGN';
          IF bad > 0 THEN
            RAISE EXCEPTION
              'Migration 0027: % business(es) are not on NGN. This edition stores '
              'money as integer kobo, so those rows cannot be converted '
              'automatically. Convert or remove them first.', bad;
          END IF;
        END $$
        """
    )
    op.execute("UPDATE businesses SET currency = 'NGN' WHERE currency IS NULL")
    op.execute("ALTER TABLE businesses ALTER COLUMN currency SET DEFAULT 'NGN'")
    op.execute(
        "ALTER TABLE businesses ADD CONSTRAINT ck_businesses_currency_ngn "
        "CHECK (currency = 'NGN')"
    )

    # The one remaining inexact column gets a unit, so a cached number can
    # never be mistaken for a ledger figure.
    op.execute("ALTER TABLE analytics_snapshots ADD COLUMN IF NOT EXISTS metric_unit VARCHAR(16)")


def downgrade() -> None:
    if not _is_postgres():  # pragma: no cover
        return

    op.execute("ALTER TABLE businesses DROP CONSTRAINT IF EXISTS ck_businesses_currency_ngn")
    op.execute("ALTER TABLE businesses ALTER COLUMN currency SET DEFAULT 'USD'")
    op.execute("ALTER TABLE analytics_snapshots DROP COLUMN IF EXISTS metric_unit")

    for table, column in RATE_COLUMNS:
        op.execute(
            f"""
            ALTER TABLE {table}
              ALTER COLUMN {column} TYPE DOUBLE PRECISION
              USING ({column}::numeric / 10000)::double precision
            """
        )
    for table, column in MONEY_COLUMNS:
        op.execute(
            f"""
            ALTER TABLE {table}
              ALTER COLUMN {column} TYPE DOUBLE PRECISION
              USING ({column}::numeric / 100)::double precision
            """
        )
