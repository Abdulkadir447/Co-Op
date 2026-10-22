#!/usr/bin/env python
"""
Regenerate supabase/migrations/*.sql from the live Alembic schema.

Alembic (backend/alembic/) is the source of truth for this schema. The SQL
under supabase/migrations/ is a generated snapshot so the Supabase CLI and the
Supabase SQL editor can apply the same schema without running Python. Do not
edit the snapshot by hand — change a migration and re-run this.

    python supabase/scripts/export_schema.py

Needs DATABASE_URL (or SUPABASE_DB_URL) pointing at a database this script may
create tables in, and `pg_dump` on PATH. It applies `alembic upgrade head`,
dumps the schema, and rewrites the snapshot. Credentials are never printed or
written to the output file.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Allow `python supabase/scripts/export_schema.py` from the repo root.
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
MIGRATIONS = ROOT / "supabase" / "migrations"
# One snapshot file; the timestamp prefix is the Supabase CLI convention.
SNAPSHOT = MIGRATIONS / "20261022000000_coop_schema.sql"

HEADER = """\
-- Co-op schema snapshot — GENERATED, DO NOT EDIT BY HAND.
--
-- Regenerate with:  python supabase/scripts/export_schema.py
-- Source of truth:  backend/alembic/versions/ (revision {revision})
--
-- Apply in the Supabase SQL editor, or with:
--     supabase db push
-- or directly:
--     psql "$DATABASE_URL" -f supabase/migrations/{name}

SET statement_timeout = 0;
SET client_encoding = 'UTF8';

"""


def _plain_url(url: str) -> str:
    """asyncpg/SQLAlchemy driver suffixes are not understood by libpq tools."""
    return re.sub(r"^postgresql\+asyncpg://", "postgresql://", url)


def main() -> int:
    from backend.config import database_url

    try:
        url = database_url()
    except Exception as exc:
        print(f"FAIL  {exc}")
        return 1

    pg_dump = shutil.which("pg_dump")
    if not pg_dump:
        print("FAIL  pg_dump is not on PATH. Install the PostgreSQL client")
        print("      tools, or export the schema from the Supabase dashboard.")
        return 1

    print("applying alembic migrations …")
    env = {**os.environ, "DATABASE_URL": url}
    r = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"], cwd=ROOT, env=env
    )
    if r.returncode != 0:
        print("FAIL  alembic upgrade head did not succeed")
        return r.returncode

    rev = subprocess.run(
        [sys.executable, "-m", "alembic", "current"],
        cwd=ROOT, env=env, capture_output=True, text=True,
    ).stdout.strip().splitlines()[-1]

    print("dumping schema …")
    out = subprocess.run(
        [pg_dump, _plain_url(url), "--schema-only", "--no-owner", "--no-privileges"],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        print(f"FAIL  pg_dump: {out.stderr.strip()[:400]}")
        return out.returncode

    MIGRATIONS.mkdir(parents=True, exist_ok=True)
    body = HEADER.format(revision=rev, name=SNAPSHOT.name) + out.stdout
    SNAPSHOT.write_text(body)

    tables = body.count("CREATE TABLE")
    policies = body.count("CREATE POLICY")
    print(f"wrote {SNAPSHOT.relative_to(ROOT)}")
    print(f"  revision {rev}")
    print(f"  {tables} tables, {policies} RLS policies, {len(body.splitlines())} lines")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
