# Co-op — Your Business Advisor, Powered by Real Data

Co-op is an AI-powered business management platform for small businesses.
It is not an ERP with an AI feature bolted on: the product promise is that
Co-op **understands your business** — it ingests your history, operates on
your data through controlled workflows, reports on it, explains what
matters, and drafts the next action for you to confirm.

> **Run your business anywhere. Co-op works offline and syncs when you're
> back online.** (v1 commitment — see ADR-002.)

### Offline boundary (v1)

- **Works offline (once the initial pull has populated the local mirror):**
  Dashboard, Products, Inventory, Customers, Orders, order status changes,
  local invoices, Reports (including CSV export of exactly what's on
  screen), the Day 1 Briefing, and the locally-calculated deterministic
  insights — all computed from the local SQLite mirror by the same
  deterministic engines the cloud uses.
- **Requires internet:** real LLM calls, AI model-based explanations, the
  server-side revenue forecast + AI activity, XLSX/PDF report exports,
  cloud billing/payment, cloud account auth/refresh, and the initial
  mirror pull itself (first run on a device).

The desktop app owns a local SQLite database (Electron main process); the UI
writes locally first and syncs to the cloud when connectivity returns. The
model-based assistant degrades to an honest "unavailable offline" state while
your data and workflows keep working.

```
INGEST → UNDERSTAND → OPERATE → REPORT → EXPLAIN → DRAFT → CONFIRM → METER
```

## What's live

- **Operational core** — products, inventory (adjustments + immutable stock
  ledger + optimistic locking), customers, orders (transactional stock,
  guarded status transitions, printable invoices), dashboard analytics.
- **Intelligent Import** — bring your history from an old system
  (CSV/XLSX). Co-op detects the dataset, suggests a column mapping, runs a
  read-only validation pass, and commits in one transaction with provenance
  (`import_batch_id`) and idempotency (`source_order_ref` — re-importing the
  same file never duplicates).
- **Day 1 Briefing** — verified, deterministic analyses of your business
  (revenue trend, top products, quiet customers, stock risk, margin), each
  with its evidence and an optional *Draft Follow-up* that hands off to the
  real order flow for your confirmation.
- **Reports + exports** — one deterministic reporting engine (Sales,
  Profit & Loss, Inventory, Customers) with shared filters and comparison
  periods, powering the Reports UI and CSV / Excel / PDF exports of exactly
  what's on screen.
- **Zeno (real model, verified context)** — Ask Zeno answers from a
  verified business context the backend rebuilds per request: the model
  never queries the database and never invents numbers. It can explain any
  report you're looking at and propose *drafts* from a fixed, validated
  action registry — execution always requires your explicit confirmation.
- **Forecasting + AI history (AI Platform)** — a deterministic,
  transparent revenue forecast (least-squares trend over your real monthly
  sales, labelled an estimate — never a black-box ML prediction, never
  negative) and an owner-visible, tenant-scoped AI activity ledger
  (`ai_history`: one row per answered question). Both are server-verified,
  deterministic and free — no model call, no credits.
- **Real billing + credits** — plans and monthly AI-credit allowances are
  real server-side state; credits are computed from the `ai_usage` ledger
  (nothing mutable to drift) and enforced on every AI request (402 when
  exhausted, 429 when the per-tenant rate limit is exceeded). A business
  can opt into one **10-day free trial** of a paid plan (no card): the
  trial grants that plan's allowance for a fixed window without changing
  the plan it owns, so it expires by itself — the effective plan is a pure
  function of (plan, trial window, now), with no scheduler to miss and no
  downgrade job to fail. Trial length lives in `config/<env>.json`
  (`billing.trial`). Payment collection is the one deliberately unplugged
  part — the UI says so.
- **Licensing** — a licence is a self-contained HMAC-SHA256 signed activation
  string binding a business id + plan + seats + expiry (`COOP-XXXXX-…`, 66
  characters). The team mints keys offline with `tools/generate_license.py`
  (no database needed) or via the team-only `/admin/generate-license` route;
  the owner pastes one into Settings → Licence, the signature is verified,
  and the plan is granted as a *window* on the subscription — never an
  overwrite of the owned plan — so expiry needs no scheduler and revocation
  withdraws the grant immediately. The server stores only the key's SHA-256
  fingerprint, never the key.
- **Audit log** — every mutation (create/update/delete, stock adjustments,
  order status changes, imports, plan changes, restores, and offline-synced
  operations) writes an append-only, tenant-scoped audit row; Settings →
  Audit Log shows the trail, newest first.
- **Backup & Restore** — download a JSON snapshot of your business data
  from the cloud (restore allowed only into an empty business — never a
  merge), and in the desktop app back up / restore the device's local
  SQLite database (refused while anything is unsynced, so nothing can be
  lost).
- **Complete Settings** — every section is real: Company, Appearance
  (light/dark/system theme), AI (answer style: concise/standard/detailed —
  read by the real system prompt), Notifications (in-app prefs), Security
  (Clerk account management), Backup & Restore, Sync (live engine status),
  Audit Log, About (version + environment).
- **Multi-tenant** — Clerk authentication; every query is scoped to the
  caller's auto-provisioned business.
- **Offline-first sync (OFFLINE 3 → 5)** — the desktop app mirrors your
  business into local SQLite (verified initial pull + delta refresh),
  serves the Dashboard, Reports, Briefing and the four operational modules
  from that mirror, writes locally first with a visible "Pending sync"
  state, and drains the queue to the cloud on reconnect (idempotent,
  one-way in v1). Changes that collide with the cloud (same email/SKU,
  rejected stock movement, stale order status) are parked as explicit
  conflicts with both versions shown side-by-side in the **Sync Center** —
  you decide (new value / keep cloud / discard), nothing is auto-merged,
  and nothing is silently lost. The local report/dashboard
  calculations are a verified port of the cloud engines: same numbers
  online and offline.

Provisional by design: payment provider (nothing is charged yet), and the
Settings "coming soon" sections. See `docs/PRODUCT_READINESS.md` for the
full status.

## Repository layout

```
frontend/   React 18 + Vite + Ant Design app (src/), nginx config, Dockerfile
backend/    FastAPI app (main.py) + domain modules:
            ai/ (LLM seam, verified context, action registry, usage)
            reports/ (reporting engine)  exports/ (CSV/XLSX/PDF)
            billing.py (plans + credits) briefing.py (Day 1 Briefing)
            importer.py (intelligent import)
            Alembic migrations (backend/alembic/), pytest suite (backend/tests/)
database/   Reference SQLite schema (schema.sql)
tools/      Operational scripts (e.g. inspect_db_schema.py)
config/     Per-environment, non-secret configuration (JSON) — incl. AI
            credit policy and plan allowances
electron/   Optional Electron desktop wrapper
Documents/  Product documentation (PRD, TRD, BSD, AFD, IPD, UXDS chapters)
```

## Prerequisites

- Node.js **>= 22**, Python **3.11+**
- A Clerk application (publishable key for the frontend, Frontend API host
  for the backend)
- A Supabase/Postgres database
- (Optional) an OpenAI API key for the real AI assistant — without it,
  Ask Zeno gracefully falls back to the deterministic data engine

## Environment variables

Copy `.env.example` to `.env` and fill in real values. The important ones:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | frontend | Clerk publishable key (baked at build/dev time) |
| `DATABASE_URL` (or `SUPABASE_DB_URL`) | backend (prod + dev) | Supabase/Postgres connection string |
| `CLERK_FRONTEND_API` | backend (prod) | Clerk Frontend API host used to verify session tokens |
| `CLERK_ALLOWED_ORIGINS` | optional | Comma-separated `azp` allow-list |
| `CORS_ORIGINS` | required in prod | Comma-separated CORS allow-list. Development/testing default to `*`; **production refuses to start** if neither this nor `cors.origins` in `config/production.json` is set |
| `COOP_ENV` | optional | `development` (default) \| `testing` \| `production` |
| `OPENAI_API_KEY` | optional | Enables the real AI assistant |
| `OPENAI_MODEL` | optional | Model override (default from `config/*.json`) |
| `TEST_DATABASE_URL` | tests | Postgres URL to enable true-concurrency tests |

> SQLite is used **only** when `COOP_ENV=testing` (or by the test suite).
> There is no silent fallback in production/development.
>
> Plan names, monthly credit allowances and the AI credit policy live in
> `config/<env>.json` (`billing` and `ai` sections) — non-secret product
> configuration, changeable without code.

## Running locally

Backend:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
DATABASE_URL=postgresql://... .venv/bin/uvicorn backend.main:app --reload
```

Frontend (dev server, proxies `/api` to `localhost:8000`):

```bash
cd frontend
npm install
npm run dev
```

Desktop wrapper (optional): `npm run start` from the repo root.

Packaged desktop builds (electron-builder, produces AppImage / NSIS / DMG
per platform):

```bash
cd electron
npm install
npm run dist      # or `npm run pack` for an unpacked build
```

## Key API surface

```
CRUD        /products /customers /orders (+ /adjust, /movements, /status)
Dashboard   /dashboard/summary /revenue/timeseries /inventory/by-category
            /revenue/today /revenue/month /growth /low-stock /top-products
Import      GET /imports/schema  POST /imports/preview /imports/map
            POST /imports/validate  POST /imports/commit
Reports     GET /reports/meta  GET /reports/{sales|profit-loss|inventory|customers}
            GET /reports/{key}/export?format=csv|xlsx|pdf
AI          POST /ai/chat   (verified context, structured answer, 402 when out
                             of credits, 429 over the per-tenant rate limit)
            GET /ai/usage
Billing     GET /billing/summary   POST /billing/plan
            POST /billing/trial (start the one 10-day free trial; 409 if used)
Licensing   GET /licenses          POST /licenses/activate
            (the owner pastes the signed key the team sent; the plan is
            granted as a window, so expiry needs no scheduler)
Admin       POST /admin/generate-license   GET /admin/licenses
            POST /admin/licenses/revoke
            (team only — X-Admin-Token, not Clerk; or mint keys offline with
            tools/generate_license.py)
Backup      GET /backups/export (download JSON snapshot)
            POST /backups/restore (into an EMPTY business only — 409 otherwise)
Audit       GET /audit   (append-only activity trail, tenant-scoped)
Onboarding  GET /onboarding/state
Auth        /auth/me  /business/settings  /healthcheck
```

## Database migrations (Supabase/Postgres)

Migrations live in `backend/alembic/` (baseline → import provenance →
`source_order_ref` → `ai_usage` → `subscriptions`) and are applied with
Alembic.

1. **Inspect first** — never migrate blind:

   ```bash
   DATABASE_URL=postgresql://... python tools/inspect_db_schema.py
   ```

2. **Review** the output, then apply:

   ```bash
   DATABASE_URL=postgresql://... alembic upgrade head
   ```

All migrations are idempotent (guarded DDL), additive, and never rewrite
business data.

## Tests

```bash
# Backend (requires a venv with backend/requirements.txt + pytest + pytest-asyncio)
.venv/bin/python -m pytest

# Frontend — the same four commands CI runs
pnpm --filter ./frontend lint
pnpm --filter ./frontend typecheck
pnpm --filter ./frontend test
pnpm --filter ./frontend build

# Desktop (Electron) data-layer, sync, backup and Windows suites
cd electron && npm test
```

The suite includes a **contract test** that scans every frontend API call
and asserts a matching backend route exists — the guard that makes a
frontend/backend endpoint mismatch impossible. Set `TEST_DATABASE_URL` to a
Postgres URL to additionally run the true-concurrency stock test.

### Sample import files

`samples/imports/` holds ready-to-upload CSV/XLSX files — one wholesaler's
catalogue, customer list and sales history — for trying the Import flow
locally, plus deliberately broken files that exercise the row-by-row
validation report. `samples/imports/README.md` says what each file should
produce, and `backend/tests/test_import_fixtures.py` drives the real
preview → map → validate → commit pipeline to assert exactly that.

## Documentation

Product documentation (PRD, TRD, BSD, AFD, IPD, UXDS) lives in
`Documents/`; engineering docs (branch protection, ADRs, coding standards)
in `docs/`; current readiness status in `docs/PRODUCT_READINESS.md`.

## Licence

Proprietary — All Rights Reserved. See [LICENSE](LICENSE): the codebase is
not open source, and access is granted per business through an activation
key (`tools/generate_license.py` → Settings → Licence). Third-party libraries
keep their own licences.
