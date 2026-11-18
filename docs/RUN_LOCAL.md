# Run Co-op locally — app, website and every test

Everything below is the exact command CI runs (`.github/workflows/ci.yml`), so
"green locally" == "green in CI". Versions CI pins: **Python 3.11**, **Node 22**,
**pnpm 9**.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.11 | `python3 -m venv` + `pip` |
| Node | **22 (18–23)** | **Node 24 breaks the desktop install.** `better-sqlite3` publishes no prebuild for ABI 137, so npm falls back to compiling and demands Visual Studio. `.nvmrc` pins 22.20.0 — run `nvm use` in the repo root. See §3. |
| pnpm | 9 | `corepack enable` (needs admin on Windows — see §1a) or `npm i -g pnpm@9` |
| C++ toolchain | — | Not needed on Node 22. Only required if you insist on Node 24. |

### 1a. Windows: three errors that look fatal and are not

If you follow the commands literally you will hit these. Only the second is real.

**1. `python -m venv` — "Unable to copy … venvlauncher.exe to .venv\Scripts\python.exe"**

Harmless. It means `.venv` already existed (or antivirus locked the file for a
second); Python still finished creating the environment, which is why the very
next `pip install` line worked. Verify, and if `python.exe` is genuinely
missing, recreate it cleanly:

```powershell
Test-Path .venv\Scripts\python.exe          # True = you can ignore the error
# only if False:
Remove-Item -Recurse -Force .venv
python -m venv .venv
```

Use `python`, not the Windows Store alias, or `py -3.11`. Do not run this while
`.venv` is active in a shell with the interpreter in use.

**2. `cd electron; npm ci` — a wall of node-gyp / Visual Studio errors**

This one is real, and its cause is **your Node version, not a missing compiler**.
`better-sqlite3` has prebuilt binaries for Node 18/20/22/23 only. On Node 24
(ABI 137) npm silently falls back to compiling from source, which needs the
"Desktop development with C++" workload. Two ways out, in order of preference:

```powershell
nvm install 22.20.0
nvm use 22.20.0
node -p "process.versions.modules"     # must print 127
Remove-Item -Recurse -Force electron\node_modules   # drop stale artefacts
cd electron; npm ci; cd ..
```

If you cannot change Node, install the desktop dependencies without building
them. Packaging still works — electron-builder fetches the Electron-ABI prebuild
itself — but `npm start` (dev mode) will not:

```powershell
cd electron; npm ci --ignore-scripts; cd ..
```

`electron/.npmrc` now sets `engine-strict=true`, so on Node 24 npm refuses
immediately with `EBADENGINE` instead of downloading 200 packages and then
failing. (The old `scripts/check-node.js` could not catch this: npm runs a root
`preinstall` *after* the dependency tree is built, so `better-sqlite3` had
already failed by the time it ran. It is still wired to `npm test` / `npm start`
for its long-form advice.)

**3. `corepack enable` — "EPERM: operation not permitted, open 'C:\Program Files\nodejs\pnpm.CMD'"**

`corepack enable` writes shims into the Node install directory, which needs
Administrator on Windows. Three ways out:

```powershell
# a) no admin: install pnpm as a global npm package instead
npm i -g pnpm@9.15.9

# b) no admin, keep corepack: put the shims in your own profile
corepack enable --install-directory "$env:LOCALAPPDATA\node\corepack"
#    then add that folder to PATH

# c) one elevated PowerShell, once
Start-Process powershell -Verb RunAs -ArgumentList 'corepack enable'
```

`corepack prepare pnpm@9.15.9 --activate` still works without admin — only
`enable` (writing the shims) refuses.

**Two more Windows notes from a real run:**

- `pnpm install` may ask *"The modules directory will be removed and reinstalled
  from scratch. Proceed?"* when `node_modules` was created by npm. Answering yes
  is fine; to skip the prompt: `pnpm install --frozen-lockfile --config.confirmModulesPurge=false`.
- A full cold `pnpm install` took **22 minutes** on a home connection. That is
  normal, not a hang. `--frozen-lockfile` is doing what it should.
- `website/` is optional. `npm install` there reports 2 high-severity advisories
  from the Vite toolchain and a `allow-scripts` warning about esbuild; neither
  affects the app, and no CI job builds the website. Skip it unless you are
  editing the marketing site.

### On Windows (PowerShell)

Windows PowerShell (5.x) does **not** accept `&&` as a separator — run one command
per line (or join with `;`). The venv executables live in `.venv\Scripts\`, not
`.venv/bin/`. So everywhere this doc shows `.venv/bin/python`, use
`.venv\Scripts\python` (and `pip` likewise), and split chained commands:

```powershell
python -m venv .venv
.venv\Scripts\pip install -r backend\requirements.txt
.venv\Scripts\pip install pytest pytest-asyncio ruff
.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

(`python` may be `py` on some installs.) PowerShell 7+ accepts `&&` if you prefer.

## 1b. Which branch, which database (read this before switching)

Running the app is identical on every branch — the commands below do not
change. What changes is **the schema the code expects**, and a mismatch fails
in confusing ways rather than at startup.

| Code branch | Database state | Result |
|---|---|---|
| any branch, `COOP_ENV=testing` (SQLite) | created from the models at startup | ✅ always matches — the easy way to just poke at the app |
| a branch with newer migrations (current head `0027_exact_money`) | old schema (e.g. through `0024_tax_defaults`) | ❌ 500s on orders/stock — missing `branch_id`, and money columns are still floats |
| an **older** branch | already-migrated Supabase | ⚠️ app runs, but the new columns are invisible and `alembic upgrade head` fails with *Can't locate revision …* (the DB is ahead of that branch's migration scripts) |

So: **SQLite (`COOP_ENV=testing`) is branch-proof; Postgres is not.** Before
running an older branch against the Supabase project, either switch back to a
branch that contains those migrations or point `DATABASE_URL` at a scratch
database.

### Bringing an already-migrated database up to the current head

The current head is **`0027_exact_money`**. Three migrations land on top of
`0024_tax_defaults`:

| Revision | What it does |
|---|---|
| `0025_branches` | `branches` table, a `MAIN` branch per business, `branch_id` on every transactional row (backfilled, then NOT NULL) |
| `0026_devices` | `devices` table + `audit_log.device_id` |
| `0027_exact_money` | money columns `REAL naira` → `INTEGER kobo`, `CHECK (currency = 'NGN')`, `analytics_snapshots.metric_unit` |

Two things to know before you run it on the real project:

1. **Check the currency first.** `0027` refuses to convert a business that is
   not on NGN — it raises rather than multiplying someone's books by 100. If the
   project has test/demo tenants created before the Naira pivot, clear them or
   convert them first:

   ```sql
   SELECT id, name, currency FROM businesses WHERE currency IS DISTINCT FROM 'NGN';
   ```

2. **Back up first.** `0027` rewrites every money column. `GET /backups/export`
   per tenant, or take a Supabase snapshot, before applying.

```powershell
$env:DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
.venv\Scripts\python tools\inspect_db_schema.py     # look before you leap
.venv\Scripts\python -m alembic upgrade head
```

#### "Every screen says Internal server error"

This actually happened on the `CoOp` Supabase project (ref
`clowtikdlkyjxopksash`): `alembic_version` was `0021_tax` while the code was at
`0027_exact_money`, so `branches`, `devices` and `zeno_lessons` did not exist.
The tenant lookup in `get_current_business` resolves a branch on **every**
authenticated request, so *every* endpoint 500'd at once — the dashboard, the
products list, `/auth/me` — and the app showed "We can't sign you in yet /
Internal server error". Nothing in the browser pointed at the database.

Diagnose it in one command:

```powershell
.venv\Scripts\python scripts\check_db.py    # 0 ready | 1 schema behind | 2 unreachable
```

It prints the missing tables and columns, and the fix. The same check runs at
startup (the diagnosis goes to the backend log) and at
`GET /healthcheck`, which now returns 503 with
`{"database": "schema_behind"}` instead of a false "healthy". After that,
`alembic upgrade head` — applied and verified on the project above, which now
matches the ORM exactly (26 tables, 333 columns) and is at `0027_exact_money`.

**Two values that look alike and are not.** Supabase shows a *project URL*
(`https://<ref>.supabase.co`) and a *database connection string*
(`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`)
next to each other. Only the second goes in `DATABASE_URL`; the first is
`SUPABASE_URL` (used for logo storage). Pasting the project URL produced
`Can't load plugin: sqlalchemy.dialects:https`, which names neither the
variable nor the fix. `DATABASE_URL` is now validated at startup and says:

```
DATABASE_URL is a web address (https://...), not a database connection string.
That value belongs in SUPABASE_URL.
Use the Postgres string from Supabase (Project Settings -> Database ->
Connection string -> URI), which looks like:
  postgresql://postgres.<your-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

The same check runs in `scripts/check_db.py`, so it is the first thing you see
there too.

**The same wall of "missing column" errors on your own machine has a different
cause.** If you started the backend with `COOP_ENV=testing`, you are on a local
SQLite file (`./coop_test.db`), not on Supabase — and that file was probably
created months ago, before `logo_url`, `tax_*` and `branch_id` existed. Do
**not** run `alembic upgrade head` there: those revisions use Postgres-only DDL
(`SERIAL`, `ALTER COLUMN … USING`) and will fail. Instead:

```powershell
.venv\Scripts\python scripts\check_db.py --reset   # delete the throwaway file
.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

The startup log now names the database it inspected, e.g.
`DATABASE SCHEMA IS BEHIND THIS CODE (sqlite ./coop_test.db)`, so the two cases
cannot be confused again. To run against Supabase instead, set `COOP_ENV` to
`development` (or unset it) and put the Supabase `DATABASE_URL` in `.env` —
that is the database a real user's data lives in.

A second, unrelated failure on the same project at the same time: Supabase
reported **every** service except the pooler `UNHEALTHY` and SQL queries timed
out with "Connection terminated due to connection timeout". That is their
infrastructure, not this repo — the fix is to wait, or to restart the project
from the Supabase dashboard. `/healthcheck` says `unreachable` for that case.

The Supabase SQL snapshot in `supabase/migrations/` is generated output; it was
updated by hand for `0025`–`0027` because the build has no `pg_dump`. On a
machine that has `pg_dump` and a reachable database, regenerate it and diff:

```powershell
.venv\Scripts\python supabase\scripts\export_schema.py
git diff supabase/migrations/
```

Getting a branch locally, without losing work on another one:

```sh
git status                 # commit or stash first if dirty
git fetch origin
git switch arena/06237ab6-co-op      # inspect/run it in place

# or keep your own branch and bring the work onto it:
git switch my-branch
git merge arena/06237ab6-co-op
```

`node_modules/` and `.venv/` belong to the working tree, not the branch, so
after switching **rebuild them if the dependency files changed** in that
branch (`git diff --name-only <old> <new> | grep -E 'package\.json|requirements'`).

## 2. Environment

```sh
cp .env.example .env   # then fill in what you need
```

Two ways to point the backend at a database (`backend/config.py database_url`):
- **Real:** set `DATABASE_URL=postgresql://user:pass@host:5432/coop` (Supabase).
- **Quick local (no Postgres):** set `COOP_ENV=testing` → the backend uses a local
  SQLite file. (Testing also disables payments/AI — fine for poking around.)

There is one `.env` for the whole repo (`vite envDir: '..'`). Do **not** create
`frontend/.env` or `backend/.env`.

`VITE_CLERK_PUBLISHABLE_KEY` is a **build-time** requirement, not just a runtime
one: Vite pastes the value into the bundle as a literal, so a build without it
used to compile an app whose first line throws — every screen was tree-shaken
away and you got a blank page with no error. The build now stops with
`VITE_CLERK_PUBLISHABLE_KEY is missing, so the build would produce a blank
screen`. Fix: put `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...` in the root `.env`,
or pass it for a single command (`$env:VITE_CLERK_PUBLISHABLE_KEY="pk_test_..."`
on Windows, `VITE_CLERK_PUBLISHABLE_KEY=pk_test_... pnpm build` on macOS/Linux).

## 3. Install

```sh
# backend
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt        # Linux/mac
#   Windows:  .venv\Scripts\pip install -r backend\requirements.txt
.venv/bin/pip install pytest pytest-asyncio ruff          # test/lint tools

# frontend (workspace member)
pnpm install --frozen-lockfile

# desktop (its own step; npm, NOT pnpm — electron/ ships a package-lock.json
# and is deliberately not a pnpm workspace member, so pnpm would ignore the
# committed lockfile.)
#
# Requires Node 18, 20, 22 or 23. better-sqlite3 ships prebuilt binaries only
# for those ABIs; on Node 24+ npm tries to compile it and fails with
# "Could not find any Visual Studio installation to use". That message is
# misleading — it is an ABI problem, not a missing compiler. Use Node 22 LTS
# (.nvmrc pins 22.20.0: `nvm use`) and no C++ toolchain is needed.
# electron/.npmrc sets engine-strict=true, so Node 24 now stops immediately
# with EBADENGINE instead of after 200 downloads. See §1a.
#
# Stuck on Node 24 and cannot install another Node? Use:
#     cd electron && npm ci --ignore-scripts && cd ..
# Packaging still works — electron-builder's @electron/rebuild fetches the
# prebuilt better-sqlite3 for Electron's own ABI. Only "npm start" (dev mode,
# which loads the module against Node's ABI) is unavailable.
cd electron && npm ci && cd ..

# website (standalone npm project)
cd website && npm install && cd ..
```

## 4. Run the app

> **The one command that starts both halves:** `pnpm dev:all`. It runs the API
> and the web app together and labels each log line `[api]` or `[web]`. If you
> run `pnpm dev` alone you get the UI and a wall of `502 Bad Gateway` for every
> `/api` call, because the API is a *separate process* — see "Everything is
> 502" below.

**Backend** (FastAPI) — from the repo root:
```sh
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

**Frontend (web)** — new terminal:
```sh
pnpm --filter ./frontend dev      # http://localhost:3000 (proxies /api -> :8000)
```

**Windows PowerShell, two terminals — the shortest path to a running app**

Terminal 1 (API). `COOP_ENV=testing` means "use a local SQLite file instead of
Supabase", which is the fastest way to just look at the app; drop that line and
set `DATABASE_URL` to run against the real database:

```powershell
$env:COOP_ENV="testing"        # local SQLite; omit for Supabase
.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Terminal 2 (UI):

```powershell
pnpm --filter ./frontend dev   # http://localhost:3000
```

Shortcut for the API half alone: `pnpm dev:api` (picks the repo `.venv`
interpreter on Windows or macOS/Linux, then runs uvicorn on 127.0.0.1:8000).

> **After `git pull`, restart the API.** `pnpm dev:api` watches files and
> reloads itself; a `uvicorn` you started by hand without `--reload` keeps
> serving the old code and every fix looks like it did not work. `pnpm doctor`
> tells you which commit the running process is on.

Sanity checks: `http://127.0.0.1:8000/healthcheck` returns
`{"status":"healthy","database":"up"}`, and `http://127.0.0.1:8000/docs` is the
full API reference. In `testing` mode payments and real AI are disabled on
purpose; sign-in still needs `VITE_CLERK_PUBLISHABLE_KEY` in `.env`.

> On this branch the database must be at migration head `0027_exact_money`
> (see §1b). Running it against a database stuck on `0024` produces 500s on
> every order — the columns it expects do not exist yet.

**Desktop (Electron)** — new terminal. **You must build the renderer first.**
`electron/main.js` loads `electron/renderer-dist/index.html`, falling back to
`frontend/dist/index.html`; if neither exists it loads a missing file and shows
a blank window with no error to explain why.

```sh
cd electron
# Both values are baked into the bundle at build time — the packaged renderer
# has no environment of its own.
VITE_API_URL=http://127.0.0.1:8000 \
VITE_CLERK_PUBLISHABLE_KEY=pk_test_... \
    npm run build:renderer
npm start                          # = npm run electron = `electron .`
```

On Windows PowerShell set the variables on their own lines instead:
```powershell
cd electron
$env:VITE_API_URL="http://127.0.0.1:8000"
$env:VITE_CLERK_PUBLISHABLE_KEY="pk_test_..."
npm run build:renderer
npm start
```

> `cd frontend && npm run start` does **not** work, despite the `start` script
> existing there: it runs `electron .` from `frontend/`, which is not an
> Electron app (no `main` in its package.json) and does not have `electron`
> installed. Run the desktop app from `electron/`.

To ship an installer, with the two `VITE_*` variables still set in the same
shell:

```sh
npm run dist:desktop          # from the repo root, or:
cd electron && npm run dist   # the same thing
```

The artifact lands at `electron/dist/Co-op-<version>-setup.exe`.

> **Do not run `npx electron-builder` from the repo root.** The root
> `package.json` has empty `dependencies` and no `electron`, so electron-builder
> reads the wrong manifest and dies with *"Cannot compute electron version from
> installed node modules"* (plus an *"author is missed"* warning, since only
> `electron/package.json` has an `author`). It also ignores the pinned
> `electron-builder@24.13.3` and downloads whatever the latest major is. Build
> from `electron/`, or use `npm run dist:desktop`, which cannot be run from the
> wrong directory.

`dist` passes `--publish never`; use `npm run release` when you actually want
to publish to GitHub Releases.

No C++ toolchain is involved: `@electron/rebuild` fetches the prebuilt
`better-sqlite3` for Electron's own ABI (33.4.11 → ABI 130, which exists), so
the compiler is never invoked. It does download the ~100 MB Electron binary on
first run — on a metered connection that looks like a hang. It is not one.

### 4b. The one-command path: podman (no Python, no Node, no uvicorn)

Everything above needs three terminals and a host toolchain. If you only want
the app running, use the containers instead — Postgres, the API and the
frontend all start as services, and `uvicorn` is launched *inside* the backend
image, so you never type it:

```sh
# pk_test_... from dashboard.clerk.com — baked into the bundle, so a change
# needs --build. Put it in .env at the repo root (podman-compose reads it).
echo "VITE_CLERK_PUBLISHABLE_KEY=pk_test_..." > .env

podman-compose up -d --build     # docker compose up -d --build works identically
podman-compose ps
```

Then open **http://localhost:3000**. nginx serves the built app and proxies
`/api/` to the `backend` service, so there is no CORS setup and no second URL.

```sh
podman-compose logs -f backend   # what the API is doing
podman-compose down              # stop  (add -v to also wipe the database)
podman-compose up -d --build     # rebuild after a code change
```

| Port | Serves |
|---|---|
| 3000 | the app (nginx) — **use this one** |
| 8000 | the API directly (`/healthcheck`, `/docs` for OpenAPI) |
| 5432 | the local Postgres container |

**Using Supabase instead of the container database:** the `db` service is a
local Postgres. To point the stack at your Supabase project, set `DATABASE_URL`
before starting (it is passed through in `podman-compose.yml`):

```sh
# .env
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

The app creates missing tables at startup (`create_all`, additive only) — it
never alters existing ones, so the schema still comes from the Alembic
migrations in `backend/alembic/`.

**Two bugs this path had until now** (both fixed, and both silent failures
before): `frontend/Dockerfile` ran `npm ci` but the repo only ships
`pnpm-lock.yaml`, so the image failed with *"`npm ci` can only install with an
existing package-lock.json"*; and it never copied `frontend/nginx.conf` into the
image, so the stock nginx config would have listened on `:80` with **no `/api`
proxy** and nothing answering on the published `:3000`. The build now also
fails loudly if `VITE_CLERK_PUBLISHABLE_KEY` is empty, instead of shipping a
blank white screen.

**What pods cannot fix:** the desktop/Electron app is not containerised (it
needs a real desktop session), and `better-sqlite3` is a native module — see
section 4.

### "500 Internal Server Error" and nothing else — start with `pnpm doctor`

Three rounds of the same two endpoints failing produced three different causes
and one identical message, so there is now one command that names the cause:

```
pnpm doctor
```

It prints the checkout's commit, the interpreter in use, whether the time zone
database exists, whether `DATABASE_URL` is valid, and — this is the one that
matters — **which commit the running API is actually serving** (read from
`GET /version`, which is public and carries no tenant data):

```
API
  ok    answering  http://127.0.0.1:8000
  ok    healthcheck  healthy
  ok    running commit  a31528c   started 2026-11-18T21:47:31Z
```

If those two commits differ, the API is a process from before your `git pull`:
a stale `uvicorn` and an unfixed bug look exactly alike from a browser. Restart
it. Exit code is 1 when something is definitely wrong, so it also works in a
script.

Since this release a 500 in **development** also names the exception in the
response body (`"detail": "ZoneInfoNotFoundError: ..."`), so the browser console
carries the cause instead of the word "Internal server error". Production keeps
the generic sentence and the stack stays in the log.

### "Everything is 502 Bad Gateway" (the console fills with them)

The API process is not running, or it crashed, or it is on a different port.
The browser only ever sees the dev server, so the dev server is what reports
it. Since this release you get one line in the *dev-server* terminal, not just
a silent 502 in the browser:

```
[vite] ✗ The Co-op API is not answering on http://127.0.0.1:8000.
[vite]   Start it with `pnpm dev:api` (or `pnpm dev:all`), then reload.
[vite]   cause: connect ECONNREFUSED 127.0.0.1:8000
```

and the app shows that same sentence instead of "Request failed with status
code 502". Start the API (`pnpm dev:api`), then reload — the UI recovers on
its own; nothing needs restarting.

If the API *is* running and you still get 502, look at the API terminal: a
startup failure exits the process, and the reason is the last line before the
prompt returns (a wrong `DATABASE_URL` is the usual one — see §1b).

### The dashboard's revenue chart returns 500 on Windows (but works on Linux)

Windows ships no IANA time zone database. Python's `zoneinfo` then raises for
**every** time zone, `"UTC"` included, and every business-local report —
`/dashboard/revenue/timeseries`, `/dashboard/summary`, the reports module, the
daily summary, the AI forecast — failed with a bare
`500 {"detail":"Internal Server Error"}`.

Two things changed:

1. `tzdata` is now pinned in `backend/requirements.txt`. If your `.venv` predates
   this, install it: `.venv\Scripts\pip install tzdata`.
2. If it is ever missing again, the API now says so at startup —

```
TIME ZONES: no IANA database on this machine — business-local days fall back
to UTC. FIX: pip install tzdata (it is in backend/requirements.txt), then restart.
```

— and the reports keep working on UTC instead of returning 500. Accuracy
degrades; availability does not. (Lagos is UTC+1, so a sale between 23:00 and
00:00 local would land on the previous UTC day while the fallback is active.)

## 5. Run the website

```sh
cd website
npm run dev      # http://localhost:5178
npm run build    # type-check + production build (dist/)
```

## 6. Run every test

All from the repo root unless noted.

```sh
# Backend: lint + full suite (MUST run from repo root — pytest.ini sets paths)
.venv/bin/python -m ruff check backend/
.venv/bin/python -m pytest                      # 501 passed, 6 skipped

# Frontend: lint, types, unit tests, build
pnpm --filter ./frontend lint
pnpm --filter ./frontend typecheck
pnpm --filter ./frontend test
pnpm --filter ./frontend build

# Desktop / Electron data-layer + sync + backup suite (npm, not pnpm —
# electron/ is deliberately not a pnpm workspace member)
cd electron && npm test && cd ..
#   93 tests, 91 pass, 2 skipped on Linux/macOS. On Windows all 93 run and
#   nothing is skipped — CI fails the Windows job if `# skipped` is not 0.

# Website: type-check + build
(cd website && npm run build)
```

### The same gates in PowerShell (Windows)

One command per line — PowerShell 5.x does not accept `&&`. Run from the repo
root. These are exactly the commands CI runs, with the venv's Windows paths:

```powershell
.venv\Scripts\python -m ruff check backend/
.venv\Scripts\python -m pytest

pnpm --filter ./frontend lint
pnpm --filter ./frontend typecheck
pnpm --filter ./frontend test
pnpm --filter ./frontend build

Push-Location electron; npm test; Pop-Location

Push-Location website; npm run build; Pop-Location
```

Expected on this commit: backend `501 passed, 6 skipped`; frontend `26 pass,
0 fail` plus a clean type check, lint and build; Electron `93 tests, 91 pass,
**0 skipped**` (the Windows-only group runs here — 2 are skipped on Linux/macOS);
website builds clean.

### Optional / environment-gated tests (skipped by default)

```sh
# Live Paystack round-trip (needs egress + a TEST key — never sk_live_)
PAYSTACK_SECRET_KEY=sk_test_... COOP_PAYSTACK_LIVE=1 \
    .venv/bin/python -m pytest backend/tests/test_paystack_live.py

# Postgres RLS isolation (needs a real Postgres)
TEST_DATABASE_URL=postgresql://user:pass@host:5432/coop \
    .venv/bin/python -m pytest backend/tests/test_rls.py

# The real Alembic chain against Postgres (also needs TEST_DATABASE_URL):
# creates a throwaway database, runs `alembic upgrade head`, checks RLS, drops it.
TEST_DATABASE_URL=postgresql://user:pass@host:5432/coop \
    .venv/bin/python -m pytest backend/tests/test_migrations.py

# PowerShell equivalent for either:
$env:TEST_DATABASE_URL="postgresql://user:pass@host:5432/coop"
.venv\Scripts\python -m pytest backend/tests/test_migrations.py
```

## 7. One-line reference

| What | Command |
|---|---|
| Backend tests | `.venv/bin/python -m pytest` |
| Backend lint | `.venv/bin/python -m ruff check backend/` |
| Frontend all | `pnpm --filter ./frontend lint && ... typecheck && ... test && ... build` |
| Desktop tests | `cd electron; npm test` |
| Website build | `cd website && npm run build` |
| Web app | backend `uvicorn` :8000 + `pnpm --filter ./frontend dev` :3000 |
| Website dev | `cd website && npm run dev` :5178 |
