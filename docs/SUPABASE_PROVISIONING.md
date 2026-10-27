# Supabase provisioning record — CoOp project

What was done, when, and how to re-check it. Written so the next operator does
not have to re-diagnose the database.

- **Project:** `CoOp`
- **Project ref:** `clowtikdlkyjxopksash`
- **Region:** `eu-central-1` · Postgres **17.6** · status `ACTIVE_HEALTHY`
- **Provisioned:** 2026-10-23
- **Schema source:** `supabase/migrations/20261022000000_coop_schema.sql`
  (generated snapshot of Alembic head `0019_business_logo`)

> There is a second project in the same organisation,
> `Abdulkadir447's Project` (`cuixbsgcwqxkhobvplby`), status `INACTIVE`. It is
> **not** Co-op's database. Do not point `DATABASE_URL` at it.

## What was wrong before

The project existed and every Supabase service was healthy, but it had **never
been provisioned as Co-op's backend**:

| Check | Co-op needs | Found |
|---|---|---|
| Public tables | 22 | **1** (`profiles` only) |
| `businesses` | required by every core route | **missing** |
| RLS policies | 18 | 3, on the leftover table only |
| `alembic_version` | row `0019_business_logo` | **table empty/missing** |
| `coop-assets` bucket | required for `POST /business/logo` | **absent** |

The single `profiles` table was a **starter-template leftover**, not Co-op's:
it used `id text` and Supabase-Auth RLS (`id = auth.jwt() ->> 'sub'`), with
Supabase migration history `create_profiles_table` / `fix_set_updated_at_search_path`.
Co-op's `profiles` is `id bigint` + `clerk_user_id`, because identity is
**Clerk**, not Supabase Auth (`backend/clerk_auth.py`). It had 0 rows and the
project had 0 `auth.users`, so nothing was lost.

Leaving it would also have blocked the Co-op snapshot: the generated schema
uses a plain `CREATE TABLE public.profiles`, which errors if the table already
exists, and the template table's `set_updated_at()` function would have drifted
from the app's own definition.

## What was applied

1. Dropped the template `profiles` table and its `set_updated_at()` function
   (`drop table ... cascade`). 0 rows, 0 auth users — no data removed.
2. Replayed the whole schema snapshot, statement-preserving, in five batches
   (22 tables, 22 sequences, defaults, 45 indexes + PK/unique indexes, 16 FKs,
   18 `ENABLE ROW LEVEL SECURITY`, **18 `tenant_isolation_*` policies**).
3. Applied `supabase/migrations/20261022010000_storage_bucket.sql` — bucket
   `coop-assets`, public, 5 MB limit, `image/png|jpeg|webp` only.
4. Stamped `alembic_version = '0019_business_logo'` (the repo's head), so
   `alembic upgrade head` is now a **correct no-op** instead of trying to
   re-create existing tables. Do not skip this step when replaying a snapshot.

RLS is enabled but **not FORCED**, exactly as migration `0014_rls` intends: the
API connects as the table owner and scopes every query by `business_id` in
SQLAlchemy; RLS is the backstop for any non-owner role (e.g. PostgREST
`anon`/`authenticated`). The policies key off
`current_setting('app.business_id', true)`, which PostgREST does not set — so
**do not expose these tables through Supabase's REST API** and expect
tenant-safe reads there. The app never uses PostgREST.

## Verified after provisioning

Checked against `information_schema` / `pg_policies` / `pg_indexes` on the live
project, compared with the counts in the snapshot file:

| Check | Snapshot | Live |
|---|---|---|
| Public tables | 22 | **22** ✅ |
| RLS policies | 18 | **18** ✅ |
| Tables with RLS enabled | 18 | **18** ✅ |
| Foreign keys | 16 | **16** ✅ |
| Indexes (incl. PK/unique) | 75 | **75** ✅ |
| `alembic_version` | `0019_business_logo` | **`0019_business_logo`** ✅ |
| `coop-assets` bucket | present | **present** ✅ |
| `profiles` keys | `id, clerk_user_id, email` | **exact** ✅ |
| Write → read round-trip | succeeds | **succeeds**, probe table dropped ✅ |

## Addendum — migration 0020 (order_payments), 2026-10-23

The receivables feature added `order_payments` (see
`backend/alembic/versions/0020_order_payments.py`). It was applied to the live
project the same day, immediately after the schema above:

| Check | Expected | Live |
|---|---|---|
| Public tables | 23 | **23** ✅ |
| RLS policies | 19 | **19** ✅ |
| `alembic_version` | `0020_order_payments` | **`0020_order_payments`** ✅ |
| `order_payments` columns | id, business_id, order_id, amount, method, reference, note, received_at, created_by, created_at | **exact** ✅ |

`supabase/migrations/20261022000000_coop_schema.sql` was updated in the same
commit, so a fresh replay creates all 23 tables and 19 policies in one pass —
the snapshot and the alembic head agree (enforced by
`backend/tests/test_supabase_snapshot.py`).

> Note: `export_schema.py` needs `pg_dump` on PATH. Where it is unavailable,
> the snapshot must be maintained by hand **and** the consistency tests are
> what stop it drifting. Prefer running the generator.

## Addendum 2 — migration 0021 (tax), 2026-10-24

Tax/VAT presentation: `businesses.tax_enabled|tax_rate|tax_label` and
`orders.tax_rate|tax_amount`. No new table, so the table/policy counts are
unchanged. Applied to the live project; `alembic_version = 0021_tax`.

Tax is **exclusive**: `orders.total_amount` stays the net subtotal (every
existing revenue number keeps its meaning), `orders.tax_amount` is the tax on
it, and the grand total is what the customer owes. `tax_rate IS NULL` = tax was
off for that order, which leaves historical rows exactly as they were.

## Wiring the app to it

Nothing in the repo referenced this project ref, and `.env` is gitignored — so
the connection string must be set by the operator, on the API host and/or in a
repo-root `.env` (the single source of truth for backend *and* Vite — do not
create `frontend/.env`).

```sh
# Migrations: SESSION pooler (5432). Use the DB password from
# Project Settings -> Database.
DATABASE_URL="postgresql://postgres.clowtikdlkyjxopksash:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"

# Storage (optional: without it POST /business/logo answers 503)
SUPABASE_URL="https://clowtikdlkyjxopksash.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
SUPABASE_STORAGE_BUCKET=coop-assets
```

Then prove it end to end — this drives the **same engine the API uses**:

```sh
python supabase/scripts/check_connection.py
```

Expected: 5/5 steps OK, plus a storage probe (list → upload → fetch → delete)
because the Supabase vars are set. A pass here means the deployed backend
reaches the same database, with a real write and read.

Notes:
- Use the **session** pooler (5432) for `alembic`; the transaction pooler
  (6543) is for the running API. Alembic/DDL needs a session connection.
- `config.toml` has `project_id = "coop"`; link it with
  `supabase link --project-ref clowtikdlkyjxopksash` if you use the CLI.
- The Supabase CLI's own migration history (`list_migrations`) still shows the
  two template migrations. That history is cosmetic here: the schema on disk is
  Alembic's, and `alembic_version` is the table that matters. Do **not** run
  `supabase db push` — the snapshot is generated, not managed by the CLI.

## Things this doc does not claim

- It does not prove a TCP/asyncpg connection from the sandbox that did the
  work: outbound access to `*.supabase.co` was blocked there, so everything
  above was verified through the Supabase management API (schema-level
  evidence). `check_connection.py` is the last mile and must be run where
  egress exists.
- It does not provision Clerk, Paystack, Resend/SMTP, or `OPENROUTER_API_KEY`.
  Those are separate services; see `docs/LAUNCH_CHECKLIST.md`.
