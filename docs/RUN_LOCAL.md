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

# desktop (its own step; needs the C++ toolchain)
cd electron && pnpm install && cd ..

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

**Desktop (Electron)** — new terminal:
```sh
cd frontend && npm run start      # runs vite dev + electron together
#   or: cd electron && npm run electron   (uses built renderer)
```
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
.venv/bin/python -m pytest                      # 314 passed, 3 skipped

# Frontend: lint, types, unit tests, build
pnpm --filter ./frontend lint
pnpm --filter ./frontend typecheck
pnpm --filter ./frontend test
pnpm --filter ./frontend build

# Desktop / Electron data-layer + sync + backup suite
cd electron && pnpm test && cd ..
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
