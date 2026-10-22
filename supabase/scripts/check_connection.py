#!/usr/bin/env python
"""
Prove a Supabase/Postgres connection works end to end: connect, WRITE, READ.

Run it from the repository root:

    python supabase/scripts/check_connection.py

It reads the same setting the application reads — ``DATABASE_URL``, falling
back to ``SUPABASE_DB_URL`` (see backend/config.py) — and drives the same
engine the API uses (backend.database.get_engine), so a pass here means the
deployed backend will reach the same database. Nothing is reimplemented.

What it does, in order:

  1. connect            — SELECT version(), current_database()
  2. schema reachable   — row count from a real application table
  3. WRITE              — create a probe table and insert a row
  4. READ               — select that row back and compare it
  5. cleanup            — drop the probe table

The probe table is deliberately separate from the 21 application tables: it
proves read/write access without touching business data, and without needing
to satisfy foreign keys or row-level-security policies. Step 2 is what proves
the application schema itself is reachable.

Exit code 0 means every step passed; 1 means something failed, and the failing
step is named. No credentials are ever printed.
"""

from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path

# Allow `python supabase/scripts/check_connection.py` from the repo root.
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PROBE_TABLE = "coop_connection_probe"
# A real application table, used read-only to prove the app schema is present.
APP_TABLE = "businesses"


def _mask(url: str) -> str:
    """Show the host/database of a URL without its password."""
    try:
        from sqlalchemy.engine import make_url

        u = make_url(url)
        host = u.host or "socket"
        creds = f"{u.username}:***@" if u.username else ""
        return f"{u.drivername}://{creds}{host}:{u.port or '-'}/{u.database}"
    except Exception:  # pragma: no cover - only affects the printed summary
        return "<unparseable url>"


def _resolve() -> str:
    from backend.config import database_url

    return database_url()


async def main() -> int:
    from sqlalchemy import text

    from backend.database import dispose_db, get_sessionmaker

    try:
        url = _resolve()
    except Exception as exc:
        print(f"FAIL  could not resolve a database URL: {exc}")
        print("      Set DATABASE_URL (or SUPABASE_DB_URL) to your Supabase")
        print("      connection string and run again.")
        return 1

    print(f"target  {_mask(url)}")
    print()

    sessionmaker = get_sessionmaker()
    failures: list[str] = []

    try:
        async with sessionmaker() as session:
            # 1. connect ---------------------------------------------------
            try:
                row = (
                    await session.execute(text("SELECT version(), current_database()"))
                ).one()
                server, db = row[0], row[1]
                print(f"[1/5] connect          OK   {db} on {server.split(',')[0]}")
            except Exception as exc:
                print(f"[1/5] connect          FAIL {exc}")
                failures.append("connect")
                return 1

            # 2. schema reachable -----------------------------------------
            try:
                count = (
                    await session.execute(text(f"SELECT count(*) FROM {APP_TABLE}"))
                ).scalar_one()
                print(f"[2/5] schema reachable OK   {APP_TABLE} has {count} row(s)")
            except Exception as exc:
                print(f"[2/5] schema reachable FAIL {exc}")
                print("      Has the schema been applied? Run the SQL in")
                print("      supabase/migrations/, or `alembic upgrade head`.")
                failures.append("schema")

            # 3. WRITE -----------------------------------------------------
            token = uuid.uuid4().hex
            try:
                await session.execute(
                    text(
                        f"CREATE TABLE IF NOT EXISTS {PROBE_TABLE} "
                        f"(id text PRIMARY KEY, note text, created_at timestamptz "
                        f"NOT NULL DEFAULT now())"
                    )
                )
                await session.execute(
                    text(f"INSERT INTO {PROBE_TABLE} (id, note) VALUES (:i, :n)"),
                    {"i": token, "n": "written by check_connection.py"},
                )
                await session.commit()
                print(f"[3/5] WRITE            OK   inserted id={token[:12]}…")
            except Exception as exc:
                await session.rollback()
                print(f"[3/5] WRITE            FAIL {exc}")
                failures.append("write")

            # 4. READ ------------------------------------------------------
            if "write" not in failures:
                try:
                    got = (
                        await session.execute(
                            text(f"SELECT note FROM {PROBE_TABLE} WHERE id = :i"),
                            {"i": token},
                        )
                    ).scalar_one()
                    if got == "written by check_connection.py":
                        print("[4/5] READ             OK   round-tripped the same row")
                    else:
                        print(f"[4/5] READ             FAIL value mismatch: {got!r}")
                        failures.append("read")
                except Exception as exc:
                    print(f"[4/5] READ             FAIL {exc}")
                    failures.append("read")

            # 5. cleanup ---------------------------------------------------
            try:
                await session.execute(text(f"DROP TABLE IF EXISTS {PROBE_TABLE}"))
                await session.commit()
                print(f"[5/5] cleanup          OK   dropped {PROBE_TABLE}")
            except Exception as exc:
                await session.rollback()
                print(f"[5/5] cleanup          FAIL {exc}")
                failures.append("cleanup")
    finally:
        await dispose_db()

    print()
    if failures:
        print(f"RESULT  FAILED at: {', '.join(failures)}")
        return 1
    print("RESULT  all 5 steps passed — the connection reads and writes")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
