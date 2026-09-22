# Step 3 runbook — deploy the backend to Supabase Postgres

The exact, ordered sequence to run migrations `0012–0016` (and the full chain on
a fresh project), confirm the RLS backstop, and prove tenant isolation against
**real Postgres** rather than SQLite. Every command and query below was executed
against a real PostgreSQL 16.2 instance; expected outputs are from that run.

> **Two migration bugs were found and fixed by running this on real Postgres**
> (they are invisible on SQLite, which the test suite uses). See
> [Bugs fixed](#bugs-fixed-by-running-this-on-real-postgres) at the end — if you
> are on a commit before those fixes, `alembic upgrade head` **will fail**.

## 0. Prerequisites

```bash
python -m venv .venv
. .venv/bin/activate            # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt   # includes alembic + asyncpg
```

`alembic.ini` is at the **repo root** (`script_location = backend/alembic`), so
run alembic from the repo root. The DB URL comes from `DATABASE_URL` (or
`SUPABASE_DB_URL`); `backend/config.py` rewrites `postgres(ql)://` to the
`postgresql+asyncpg://` driver automatically, so you can paste the Supabase
string as-is.

## 1. Snapshot first (30 seconds, do not skip)

Supabase Dashboard → **Database → Backups → Take a backup** (free, manual). On
paid tiers PITR is on, but a manual snapshot before DDL is free insurance.

## 2. Use a staging target before production

Prefer a **Supabase branch** (paid) or a **second free project** as staging.
Run steps 3–5 there first; only promote to production once they are green.

Set the connection string. **Use the Session pooler (port 5432), not the
Transaction pooler (6543)** — alembic needs a persistent connection and
transactional DDL, which the transaction pooler breaks.

```bash
# bash / macOS / Linux
export DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require"
```
```powershell
# Windows PowerShell
$env:DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require"
```

## 3. Run the migrations

```bash
alembic current        # where the DB is now (empty on a fresh project)
alembic upgrade head   # applies 0001 → 0016_merge_heads
```

Expected tail on a fresh project (single head, no ambiguity):

```
INFO  [alembic.runtime.migration] Running upgrade 0013_invoices -> 0014_rls, ...
INFO  [alembic.runtime.migration] Running upgrade 0014_rls -> 0015_feedback, ...
INFO  [alembic.runtime.migration] Running upgrade 0010_team_model -> 0011_payments, ...
INFO  [alembic.runtime.migration] Running upgrade 0011_payments, 0015_feedback -> 0016_merge_heads, ...
```
```bash
alembic current        # → 0016_merge_heads (head) (mergepoint)
```

> Note the order: alembic applies the `0011_subscription_trial → … → 0014_rls →
> 0015_feedback` branch **before** the parallel `0011_payments`. That ordering is
> exactly what used to break `0014_rls` (see below); it is now handled.

## 4. Confirm the RLS backstop applied

Run in the Supabase **SQL Editor** (or `psql "$DATABASE_URL"`):

```sql
-- 4a. RLS is ENABLED but NOT FORCED on every tenant table.
--     Expect: rls_enabled = 17, rls_forced = 0  (owner-bypass backstop)
SELECT count(*) FILTER (WHERE relrowsecurity)      AS rls_enabled,
       count(*) FILTER (WHERE relforcerowsecurity) AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (SELECT tablename FROM pg_policies
                    WHERE policyname LIKE 'tenant_isolation_%');

-- 4b. The 17 per-tenant policies exist (incl. payments).
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE 'tenant_isolation_%'
ORDER BY tablename;
```

Verified output: `rls_enabled = 17 | rls_forced = 0`, and 17 policies —
`ai_history, ai_usage, analytics_snapshots, audit_log, business_invitations,
business_members, customers, import_batches, invoices, licenses, order_items,
orders, payments, products, stock_movements, subscriptions, sync_queue`.

`rls_forced = 0` is **correct and intended**: the backend connects as the table
owner and bypasses RLS, so your live queries are unaffected. RLS only constrains
a *non-owner* role (the Supabase `anon`/`auth` model) if you ever add one. Your
day-to-day tenant isolation is the app-layer `business_id` filter, proven next.

## 5. Prove app-layer isolation against real Postgres

The test harness switches to Postgres via `TEST_DATABASE_URL`. **Point it at a
separate, empty database** (a Supabase branch / second project, or a `coop_test`
DB) — not the migrated production DB. The harness now drop-then-creates the
schema per test, so tests are isolated on a shared Postgres just as they are on
SQLite temp files.

```bash
# bash
TEST_DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require" \
  python -m pytest backend/tests -q
```
```powershell
# Windows PowerShell
$env:TEST_DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require"
python -m pytest backend/tests -q
```

Verified on PostgreSQL 16.2: **331 passed, 1 skipped** (the skip is the
live-Paystack test, which needs network egress). The cross-tenant isolation
tests (`test_*_is_tenant_scoped`, `test_one_tenant_cannot_verify_anothers_reference`,
`test_tenant_isolation.py`, and the Postgres-only
`test_rls_isolates_a_non_owner_role_on_postgres`) all pass — the last one proves
a non-owner role sees only the tenant in `app.business_id` while the owner sees
everything.

This run also includes **`test_migrations.py`**, which closes the structural gap
that hid the two bugs below: the rest of the suite builds its schema with
`create_all` and never executes the migrations' SQL, so `test_migrations.py`
runs the real `alembic upgrade head` against a throwaway database and asserts it
lands on `0016_merge_heads` with all 17 RLS policies (it skips if the role lacks
`CREATEDB`). Running the suite against a Supabase staging project therefore
verifies the migrations on Supabase itself, not just on a local Postgres.

To run only the isolation subset:

```bash
python -m pytest backend/tests -k "tenant_scoped or another or isolation or _404 or refused" -q
```

## 6. Promote to production

Once staging is green: take a production snapshot (§1), set `DATABASE_URL` to the
production string, `alembic upgrade head`, and re-run the §4 catalog checks.
Then deploy the backend with the production `DATABASE_URL`.

## Rollback

`alembic downgrade -1` steps back one revision (the RLS migration's downgrade
drops the policies). For anything worse, restore the §1 snapshot.

---

## Bugs fixed by running this on real Postgres

These were latent because the test suite uses SQLite (`create_all`), so the
alembic migrations' raw SQL never ran in CI. Both **block any Postgres deploy**:

1. **`0002_import_provenance` — malformed index name.** The f-string
   `idx_ {table} _import_batch` had literal spaces, emitting
   `CREATE INDEX … idx_ products _import_batch …` → `syntax error at or near
   "products"`. Fixed to `idx_{table}_import_batch`.
2. **`0014_rls` — policy on a not-yet-created table.** `payments` is created on
   the *parallel* `0011_payments` branch, which alembic schedules **after**
   `0014_rls`, so `CREATE POLICY … ON payments` hit `relation "payments" does
   not exist`. Fixed two ways: `enable_rls_ddl()` now guards each policy with
   `to_regclass(...) IS NOT NULL` (order-independent), and `0016_merge_heads`
   re-asserts the guarded RLS once every branch is merged, so `payments` is
   covered. Verified: 17 policies incl. `payments`.

Two further fixes surfaced by the full Postgres run (not deploy-blocking, but
real):

3. **`backups.restore_backup` — `cost_price` not cast.** The export stringifies
   every value; restore casts each numeric field back **except** `cost_price`,
   so `"4.0"` was inserted into a `FLOAT` column. SQLite coerced it; asyncpg
   raised `invalid input … must be real number, not str`. Now cast like
   `unit_price` (preserving `NULL`).
4. **`test_rls.py` — never actually ran.** The Postgres-gated test had two
   SQLAlchemy 2.0 bugs (`conn.begin()` after an autobegun transaction;
   `tx.execute` instead of `conn.execute`). It was always skipped on SQLite, so
   the RLS isolation proof had never executed. Fixed; it now passes on PG.
