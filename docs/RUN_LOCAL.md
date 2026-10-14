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
| C++ toolchain | — | **only** if you build the Electron desktop app (better-sqlite3). On Windows: Visual Studio Build Tools. Not needed for backend/frontend/website/tests-on-non-Windows. |

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
# committed lockfile. Needs the C++ toolchain for better-sqlite3; if that
# native build fails the app still runs, on the node:sqlite fallback.)
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

To ship an installer: `cd electron && npm run dist` (needs the C++ toolchain).

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
