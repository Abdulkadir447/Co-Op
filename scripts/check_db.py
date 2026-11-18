#!/usr/bin/env python3
"""Is the database the reason nothing works? Run this.

    python scripts/check_db.py

Answers four questions in plain English, in the order that matters:

  1. Is DATABASE_URL set, and which host does it point at?
  2. Can this machine reach that host and authenticate? (a TCP connect, then a
     real query — not a DNS lookup that only proves a name resolves)
  3. Does the schema match this code? (tables, then columns, then the Alembic
     revision)
  4. If not, what exactly do I run?

Exit codes: 0 = fine, 1 = reachable but schema behind, 2 = unreachable.

It never prints the password: the URL is shown with the password replaced.
Written after a run where every endpoint 500'd and the only visible symptom was
"Internal server error".
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _redact_url(url: str) -> str:
    """`postgresql://user:secret@host/db` -> `postgresql://user:***@host/db`."""
    return re.sub(r"(://[^:/@]+:)[^@]+@", r"\1***@", url)


def _print_ascii(text: str) -> None:
    """cp1252 on Windows cannot encode every character; never crash on it."""
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("ascii", "replace").decode("ascii"))


async def main() -> int:
    env = os.getenv("COOP_ENV", "development")
    _print_ascii(f"COOP_ENV          : {env}")

    # -- 1. configuration ----------------------------------------------------
    try:
        from backend.config import database_url

        url = database_url()
    except Exception as exc:  # noqa: BLE001 — the whole point is to explain it
        _print_ascii(f"DATABASE_URL      : NOT USABLE — {exc}")
        _print_ascii("")
        _print_ascii("Fix: set DATABASE_URL in the repo-root .env, e.g.")
        _print_ascii(
            "  DATABASE_URL=postgresql://postgres.<ref>:<password>"
            "@aws-0-<region>.pooler.supabase.com:5432/postgres"
        )
        _print_ascii(
            "  (testing only: COOP_ENV=testing uses a local SQLite file instead)"
        )
        return 2

    _print_ascii(f"DATABASE_URL      : {_redact_url(url)}")
    kind = "Postgres" if url.startswith("postgres") else "SQLite"
    _print_ascii(f"Engine            : {kind}")

    # -- 2. reachability + schema ------------------------------------------
    from backend.diagnostics import database_report, explain

    report = await database_report()

    if not report["reachable"]:
        _print_ascii("")
        _print_ascii("REACHABILITY      : FAILED — could not connect.")
        detail = report.get("detail_for_log")
        if detail:
            _print_ascii(f"Driver says       : {detail}")
        _print_ascii("")
        _print_ascii(explain("unreachable"))
        if kind == "Postgres":
            _print_ascii("")
            _print_ascii("The two failures that look identical are:")
            _print_ascii(
                "  - wrong password        -> 'password authentication failed'"
            )
            _print_ascii(
                "  - wrong/unreachable host-> 'getaddrinfo failed' or a timeout."
            )
            _print_ascii(
                "    Supabase's db.<ref>.supabase.co resolves to IPv6 only; "
                "use the pooler host."
            )
        return 2

    _print_ascii("REACHABILITY      : OK — connected and ran a query.")
    _print_ascii(
        f"Tables            : {report['tables_present']} present, "
        f"{report['tables_expected']} expected by this code"
    )
    _print_ascii(
        f"Alembic revision  : {report['migration_revision'] or 'none recorded'}"
    )

    if report["cause"] == "schema_behind":
        _print_ascii("")
        _print_ascii("SCHEMA            : BEHIND THIS CODE")
        missing_tables = report["missing_tables"]
        if missing_tables:
            _print_ascii(f"Missing tables    : {', '.join(missing_tables)}")
        missing_columns = report["missing_columns"]
        if missing_columns:
            for table, cols in missing_columns.items():
                _print_ascii(f"Missing columns   : {table}({', '.join(cols)})")
        _print_ascii("")
        _print_ascii(f"FIX: {report['fix']}")
        if report["dialect"] == "sqlite":
            # The Alembic revisions are Postgres-only, so a stamp/upgrade pair
            # would fail here. The file is a disposable local database.
            _print_ascii("")
            _print_ascii("Or, in one command:")
            _print_ascii("  python scripts/check_db.py --reset")
        elif report["migration_revision"] is None:
            _print_ascii("")
            _print_ascii(
                "No alembic_version row was found. If this database was created "
                "by the app's create_all() bootstrap, stamp it at the baseline "
                "FIRST, or the upgrade will try to create tables that exist:"
            )
            _print_ascii("  alembic stamp 0001")
            _print_ascii("  alembic upgrade head")
        return 1

    _print_ascii("")
    _print_ascii("SCHEMA            : matches this code.")
    _print_ascii("Database is ready. If the app still fails, the database is not the")
    _print_ascii("cause — check the backend console for the traceback.")
    return 0


async def reset_testing_db() -> int:
    """Delete the local testing SQLite file so the app recreates it.

    Guarded three ways, because "delete a database" is not a thing to make
    convenient by accident:

      * refuses unless COOP_ENV is exactly ``testing``;
      * refuses unless the resolved URL is SQLite (never a Postgres host);
      * prints the absolute path and asks for the word `delete` first.

    This exists because the natural mistake after pulling schema changes is to
    run the *testing* server against a months-old ``coop_test.db``, which fails
    with a wall of "missing column" errors whose real fix is one file deletion.
    """
    from backend.config import database_url

    env = os.getenv("COOP_ENV", "development")
    url = database_url()
    if env != "testing":
        _print_ascii(f"COOP_ENV is {env!r}, not 'testing' — refusing to delete anything.")
        return 2
    if not url.startswith("sqlite"):
        _print_ascii(f"That is a {url.split(':')[0]} database — refusing to delete it.")
        return 2

    from backend.diagnostics import fix_for  # noqa: F401  (keeps advice in one place)

    path = url.split("///", 1)[-1]
    absolute = Path(path).resolve()
    _print_ascii(f"This will delete the local testing database:\n  {absolute}")
    _print_ascii("Only throwaway local data is lost. Nothing on Supabase is touched.")
    _print_ascii("Type 'delete' to continue: ", )
    answer = input().strip().lower() if sys.stdin.isatty() else ""
    if answer != "delete":
        _print_ascii("Cancelled — nothing was deleted.")
        return 2
    if absolute.exists():
        absolute.unlink()
        _print_ascii("Deleted. Start the backend again; it recreates the schema.")
    else:
        _print_ascii("That file does not exist — nothing to do.")
    return 0


if __name__ == "__main__":
    if "--reset" in sys.argv:
        sys.exit(asyncio.run(reset_testing_db()))
    sys.exit(asyncio.run(main()))
