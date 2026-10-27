# Run Co-op locally — app, website and every test

Everything below is the exact command CI runs (`.github/workflows/ci.yml`), so
"green locally" == "green in CI". Versions CI pins: **Python 3.11**, **Node 22**,
**pnpm 9**.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.11 | `python3 -m venv` + `pip` |
| Node | 22 | |
| pnpm | 9 | `corepack enable` (reads nothing here) or `npm i -g pnpm@9` |
| C++ toolchain | — | Not normally needed. Only if your Node has no `better-sqlite3` prebuild (Node 24+); use Node 22 LTS instead and skip it entirely. See §3. |

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
| a branch with newer migrations (e.g. `0020_order_payments`, `0021_tax`) | old schema | ❌ 500s on orders/payments — missing columns |
| an **older** branch (e.g. head `0019`) | already-migrated Supabase (`0021_tax`) | ⚠️ app runs, but the new columns are invisible and `alembic upgrade head` fails with *Can't locate revision '0021_tax'* (the DB is ahead of that branch's migration scripts) |

So: **SQLite (`COOP_ENV=testing`) is branch-proof; Postgres is not.** Before
running an older branch against the Supabase project, either switch back to a
branch that contains those migrations or point `DATABASE_URL` at a scratch
database.

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
# and no C++ toolchain is needed. scripts/check-node.js blocks the install
# early with that explanation.
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

**Backend** (FastAPI) — from the repo root:
```sh
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

**Frontend (web)** — new terminal:
```sh
pnpm --filter ./frontend dev      # http://localhost:3000 (proxies /api -> :8000)
```

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
.venv/bin/python -m pytest                      # 351 passed, 6 skipped

# Frontend: lint, types, unit tests, build
pnpm --filter ./frontend lint
pnpm --filter ./frontend typecheck
pnpm --filter ./frontend test
pnpm --filter ./frontend build

# Desktop / Electron data-layer + sync + backup suite
cd electron && npm test && cd ..
#   (windows.test.js has a group that only runs on a real Windows filesystem)

# Website: type-check + build
cd website && npm run build && cd ..
```

### Optional / environment-gated tests (skipped by default)

```sh
# Live Paystack round-trip (needs egress + a TEST key — never sk_live_)
PAYSTACK_SECRET_KEY=sk_test_... COOP_PAYSTACK_LIVE=1 \
    .venv/bin/python -m pytest backend/tests/test_paystack_live.py

# Postgres RLS isolation (needs a real Postgres)
TEST_DATABASE_URL=postgresql://user:pass@host:5432/coop \
    .venv/bin/python -m pytest backend/tests/test_rls.py
```

## 7. One-line reference

| What | Command |
|---|---|
| Backend tests | `.venv/bin/python -m pytest` |
| Backend lint | `.venv/bin/python -m ruff check backend/` |
| Frontend all | `pnpm --filter ./frontend lint && ... typecheck && ... test && ... build` |
| Desktop tests | `cd electron && pnpm test` |
| Website build | `cd website && npm run build` |
| Web app | backend `uvicorn` :8000 + `pnpm --filter ./frontend dev` :3000 |
| Website dev | `cd website && npm run dev` :5178 |
