# Contributing Guide

Thank you for your interest in contributing to Co-op! This document explains
how to work on this project.

## Prerequisites

- **Node.js** 22 or higher
- **Python** 3.11 or higher
- **npm** (the repo uses npm + lockfiles — not pnpm)
- **Git**
- A local Clerk app, a Postgres/Supabase database, and (optionally) an
  OpenAI API key — see `README.md`

## Development setup

```bash
git clone <repo-url> && cd Co-op

# Backend
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt pytest pytest-asyncio

# Frontend
cd frontend && npm install && cd ..

# Environment
cp .env.example .env   # then fill in real values
```

Key files:

- `README.md` — product overview, running locally, API surface
- `.env.example` — every environment variable, documented
- `config/<env>.json` — non-secret product config (AI credit policy, plan
  allowances)
- `pytest.ini` — pytest config (run from the repo root)
- `Documents/` — product documentation (PRD, TRD, BSD, AFD, IPD, UXDS)

## Project structure

```
frontend/   React 18 + Vite + Ant Design (src/: pages, components, ai,
            billing, imports, theme/, services/)
backend/    FastAPI app — main.py (routes) + domain modules:
            ai/ reports/ exports/ billing.py briefing.py importer.py
            alembic/ (migrations) tests/ (pytest)
config/     Per-environment JSON config
database/   Reference SQLite schema
docs/       Engineering docs + PRODUCT_READINESS.md
electron/   Optional desktop wrapper
```

## Running locally

```bash
# Backend (port 8000)
DATABASE_URL=postgresql://... .venv/bin/uvicorn backend.main:app --reload

# Frontend (port 3000, proxies /api -> :8000)
cd frontend && npm run dev
```

## Testing

```bash
# Backend — full suite from the repo root (contract test needs both trees)
.venv/bin/python -m pytest

# Frontend — type check + production build
cd frontend && npx tsc --noEmit -p tsconfig.json && npm run build
```

A **contract test** scans every `api.get/post/...` call in the frontend and
asserts a matching backend route exists. If you add a frontend call, add the
route (or the test will tell you it's missing).

Set `TEST_DATABASE_URL` to a Postgres URL to additionally run the
true-concurrency stock test.

## Branches, commits, PRs

- The default branch is **`master`**; PRs target `master`.
- Use conventional commit messages (`feat:`, `fix:`, `chore:`, …).
- CI runs the backend test suite plus the frontend type check and
  production build on every push/PR to `master`. Keep it green — a gate that
  can't pass doesn't belong in CI, so if you change tooling, update
  `.github/workflows/ci.yml` in the same change.

## Coding conventions

- **Numbers are deterministic**: business figures come from the backend's
  SQL aggregation (reporting engine, briefing, dashboards). The LLM never
  computes business numbers — it only explains verified context.
- **Trust boundary**: AI can only propose actions from the fixed registry
  (`backend/ai/actions.py`); execution always requires explicit user
  confirmation through an existing API.
- **Honesty by construction**: provisional capabilities say so in the UI
  (billing preview banner, Settings "coming soon" sections, AI fallback
  messages). Don't fake states to make screens look complete.
- **Tenant scoping**: every query is scoped by `business_id`; add new
  models with `business_id` + soft-delete columns to match the rest.
- TypeScript strict mode; interface-based typing; minimal `any`.
- Backend: keep routes thin in `main.py`; domain logic in its module
  (`ai/`, `reports/`, `exports/`, `billing.py`, …).

## Adding a migration

1. Create `backend/alembic/versions/NNNN_name.py` with a `down_revision`
   pointing at the current head.
2. Use **guarded, idempotent, additive** DDL (the repo convention).
3. Add matching ORM models in `backend/models.py`.
4. Add/extend tests; the suite uses `Base.metadata.create_all`, so the ORM
   must stay in sync with the migrations.

## Code of Conduct

Please respect all contributors and maintain a professional, inclusive
environment. Harassment, discrimination, or inappropriate behavior will not
be tolerated.
