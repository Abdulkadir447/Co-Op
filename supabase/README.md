# Supabase

Co-op uses Supabase for **one thing: the Postgres database.**

This folder holds what belongs on the Supabase side of that split. It does not
contain the application, and it cannot — see
[Why the backend does not live here](#why-the-backend-does-not-live-here).

## What is where

| Concern | Lives in | Notes |
| --- | --- | --- |
| Postgres database | **Supabase** | connection string via `DATABASE_URL` |
| Schema, migrations | `backend/alembic/versions/` | authoritative source |
| Schema snapshot for Supabase | `supabase/migrations/` | **generated** from the above |
| API | `backend/` | FastAPI, runs on its own host (e.g. Render) |
| Identity | Clerk | `backend/clerk_auth.py` — *not* Supabase Auth |
| Desktop shell | `electron/` | bakes the API origin at build time |

There is no Supabase client library in this repository — no `@supabase/supabase-js`,
no Edge Functions, no Supabase Storage, no Supabase Auth. The application talks
to Supabase the way it talks to any Postgres: SQLAlchemy over `asyncpg`.

## 1. Link this folder to your project

```sh
npm install -g supabase        # or: brew install supabase/tap/supabase
supabase link --project-ref <your-project-ref>
```

The project ref is the `<ref>` in your database host, `db.<ref>.supabase.co`.

## 2. Apply the schema

Get the connection string from **Project Settings → Database**. Use the
*session* connection string for migrations (port `5432`), not the transaction
pooler — Alembic and DDL need a session connection.

```sh
export DATABASE_URL="postgresql+asyncpg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

Then either:

```sh
# a) the real migration chain (recommended — this is the source of truth)
python -m alembic upgrade head

# b) or the generated SQL snapshot, if you have no Python handy
psql "$DATABASE_URL" -f supabase/migrations/20261022000000_coop_schema.sql
```

You can also paste `supabase/migrations/20261022000000_coop_schema.sql` into the
Supabase SQL editor. It produces **22 tables and 18 row-level-security
policies**.

> On Supabase, `DATABASE_URL` accepts the plain `postgresql://` form too —
> `backend/config.py` reads it as-is. The `+asyncpg` suffix only matters for
> SQLAlchemy and is stripped by `supabase/scripts/export_schema.py`.
> `SUPABASE_DB_URL` is accepted as an alias for `DATABASE_URL`.

## 3. Test the connection

```sh
python supabase/scripts/check_connection.py
```

It connects, writes a row, reads it back, and cleans up — driving the **same
engine the API uses** (`backend.database.get_engine`), so a pass means the
deployed backend reaches the same database. Output:

```
target  postgresql+asyncpg://postgres:***@host:5432/postgres

[1/5] connect          OK   postgres on PostgreSQL 16.2 …
[2/5] schema reachable OK   businesses has 0 row(s)
[3/5] WRITE            OK   inserted id=6b776b57ab6e…
[4/5] READ             OK   round-tripped the same row
[5/5] cleanup          OK   dropped coop_connection_probe

RESULT  all 5 steps passed — the connection reads and writes
```

Exit code is `0` on success and `1` on failure, with the failing step named.
The password is never printed.

Step 3/4 use a throwaway `coop_connection_probe` table on purpose: it proves
read/write access without touching business data and without having to satisfy
foreign keys or RLS policies. Step 2 is what proves the real application
schema is reachable.

## Keeping the snapshot honest

`supabase/migrations/` is **generated**. Alembic is the source of truth. After
adding a migration, regenerate:

```sh
python supabase/scripts/export_schema.py
```

It applies `alembic upgrade head`, runs `pg_dump --schema-only`, and rewrites
the snapshot with the revision it came from in the header. Needs `pg_dump` on
PATH. Never hand-edit the snapshot.

## Why the backend does not live here

A `supabase/` folder is a **Supabase CLI** convention: `migrations/`, `functions/`,
`seed.sql`, `config.toml`. The only executable thing Supabase itself hosts is
Edge Functions, and those are **TypeScript on the Deno runtime — Python is not
supported**, and not on the roadmap.

Co-op's backend is Python (FastAPI). Moving `backend/` into `supabase/` would
not deploy it anywhere; Supabase has no runtime for it. The backend needs an
application host — Render, Fly.io, a VM — that runs:

```sh
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

See `docs/DEPLOY_POSTGRES.md` for the database side and
`docs/LAUNCH_CHECKLIST.md` for the full operator sequence.

## Troubleshooting

**`DATABASE_URL is not set`** — the variable is not visible to the process. On
Windows PowerShell use `$env:DATABASE_URL = "…"`; in Git Bash, `export`.

**Connection refused / timeout** — Supabase pauses inactive projects. Open the
dashboard and restore it. Also check the project isn't restricted by IP
allowlist (Project Settings → Database → Network Restrictions).

**`relation "businesses" does not exist`** at step 2 — the schema was never
applied. Do step 2 above.

**Works locally, fails on the app host** — the host is probably using the
*transaction* pooler (port `6543`) or is missing the variable entirely.
`backend/config.py` resolves `DATABASE_URL` then `SUPABASE_DB_URL` and refuses
to fall back to SQLite outside tests.
