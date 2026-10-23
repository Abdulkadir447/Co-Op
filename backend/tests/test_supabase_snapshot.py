"""Guard the generated Supabase schema snapshot against going stale.

``supabase/migrations/`` is generated from the alembic chain by
``supabase/scripts/export_schema.py``. Nothing forces an operator to re-run it
after adding a model, and a stale snapshot fails quietly: Supabase comes up,
the connection test passes, and then a table is simply missing in production.

These tests compare the snapshot against the two things it is derived from —
the SQLAlchemy metadata and the alembic head — so drift fails in CI instead.
"""
from __future__ import annotations

import re
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from backend.models import Base

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"


def _snapshots() -> list[Path]:
    return sorted(MIGRATIONS.glob("*.sql"))


def _sql() -> str:
    files = _snapshots()
    assert files, "supabase/migrations/ has no .sql snapshot; run export_schema.py"
    return "\n".join(f.read_text() for f in files)


def test_a_schema_snapshot_exists() -> None:
    assert _snapshots(), "supabase/migrations/ is empty"


def test_every_model_table_is_in_the_snapshot() -> None:
    sql = _sql()
    # pg_dump schema-qualifies ("CREATE TABLE public.orders (") and quotes only
    # when an identifier needs it, so allow an optional schema prefix and quotes.
    pattern = r'CREATE TABLE (?:IF NOT EXISTS )?(?:"?\w+"?\.)?"?(\w+)"?'
    created = {m.lower() for m in re.findall(pattern, sql, re.I)}

    missing = sorted(set(Base.metadata.tables) - created)
    assert not missing, (
        f"missing from supabase/migrations/: {missing}. "
        "Run `python supabase/scripts/export_schema.py` to regenerate."
    )


def test_snapshot_names_the_alembic_head_it_was_generated_from() -> None:
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "backend" / "alembic"))
    head = ScriptDirectory.from_config(cfg).get_current_head()
    assert head, "alembic has no single head"

    sql = _sql()
    assert f"revision {head}" in sql, (
        f"snapshot was generated from a different revision than the current "
        f"alembic head {head}. Run `python supabase/scripts/export_schema.py`."
    )


def test_snapshot_carries_the_row_level_security_backstop() -> None:
    # 0014_rls is the tenant-isolation backstop. A dump taken before it ran, or
    # with --no-privileges stripping more than expected, would ship without it.
    sql = _sql()
    assert sql.count("CREATE POLICY") == 18, (
        "expected the 18 RLS policies from 0014_rls; the snapshot looks partial"
    )
    assert "ENABLE ROW LEVEL SECURITY" in sql
