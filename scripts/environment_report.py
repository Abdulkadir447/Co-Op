"""Report what this machine and this checkout can actually do.

Read by `scripts/doctor.mjs`, but useful on its own:

    .venv/bin/python scripts/environment_report.py        # or .venv\\Scripts\\python

Prints JSON on stdout. Never raises for a missing capability: "no time zone
database" is an answer, not an error.
"""
from __future__ import annotations

import json
import os
import platform
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    report: dict = {
        "python": sys.version.split()[0],
        "python_executable": sys.executable,
        "platform": platform.platform(),
    }

    # 1. The dependency that Windows lacks and that took the dashboard down.
    try:
        from backend.timezones import has_tz_database

        report["tz_database"] = has_tz_database()
    except Exception as exc:  # noqa: BLE001 - a report must not crash
        report["tz_database"] = None
        report["tz_error"] = f"{type(exc).__name__}: {exc}"

    try:
        import tzdata  # noqa: F401

        report["tzdata_package"] = True
    except ImportError:
        report["tzdata_package"] = False

    # 2. The settings the app will actually use (validated, never printed raw).
    try:
        from backend.config import database_url, get_env

        report["env"] = get_env()
        url = database_url()
        scheme = url.split("://", 1)[0]
        report["database_scheme"] = scheme
        report["database_target"] = (
            "local sqlite file"
            if scheme.startswith("sqlite")
            else url.rsplit("@", 1)[-1].split("/")[0]  # host only: no user, no password
        )
        report["database_url_valid"] = True
    except Exception as exc:  # noqa: BLE001
        report["database_url_valid"] = False
        report["database_url_error"] = str(exc).splitlines()[0]

    # 3. Can the app be imported at all? This is the check that catches a
    #    half-installed virtualenv before uvicorn prints a 40-line traceback.
    try:
        import backend.main  # noqa: F401

        report["imports_ok"] = True
    except Exception as exc:  # noqa: BLE001
        report["imports_ok"] = False
        report["import_error"] = f"{type(exc).__name__}: {exc}"

    report["commit"] = os.getenv("COOP_COMMIT") or _git_commit()
    print(json.dumps(report))
    return 0


def _git_commit() -> str:
    import subprocess

    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=ROOT, capture_output=True, text=True, timeout=2, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    return out.stdout.strip() if out.returncode == 0 else "unknown"


if __name__ == "__main__":
    raise SystemExit(main())
