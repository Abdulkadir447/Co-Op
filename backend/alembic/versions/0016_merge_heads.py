"""Merge the two parallel heads into one.

Revision ID: 0016_merge_heads
Revises: 0011_payments, 0015_feedback
Create Date: 2026-09-17

Two migrations branched from ``0010_team_model`` in parallel:
``0011_payments`` (the payments table) and ``0011_subscription_trial`` (which
leads through 0012→0013→0014→0015). Both are required, so rather than reparent
history this adds an empty merge revision that joins the two tips. After this
there is a single head, so ``alembic upgrade head`` works on a fresh Postgres.

No schema change — upgrade/downgrade are intentionally empty.
"""

revision = "0016_merge_heads"
down_revision = ("0011_payments", "0015_feedback")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
