# Co-op — Product Readiness Assessment

_Last updated: 2026-08-28 (product-readiness pass over the v1 feature set)._

**Verdict:** Co-op has a coherent, working v1 foundation: ingest →
understand → operate → report → explain → draft → confirm → meter, with
honest UI states wherever a capability is provisional. It is ready for
internal review and controlled early use. It is **not** ready for open
commercial launch until the payment decision is made (nothing can be
charged yet — deliberately) and the hardening backlog below is worked
down.

---

## 1. Ready today

| Area | Status | Where |
| --- | --- | --- |
| Auth + multi-tenant isolation | Clerk JWKS-verified; every route tenant-scoped (39 business routes audited — all authed; only `/healthcheck`, `/` public) | `backend/clerk_auth.py`, `backend/main.py` |
| Operational core (products, inventory, customers, orders) | Live, transactional, tested (stock ledger, optimistic locking, guarded status transitions, concurrency test) | `backend/main.py`, `backend/tests/` |
| Intelligent Import | 5-endpoint flow, deterministic mapper (LLM seam), read-only validate, commit with provenance + `source_order_ref` idempotency | `backend/importer.py`, `frontend/src/imports/` |
| Day 1 Briefing + first-run onboarding | Verified deterministic insights; `/onboarding/state` + Welcome gate | `backend/briefing.py`, `frontend/src/pages/Welcome/` |
| Reports + exports | One engine, one filter contract; Sales / P&L / Inventory / Customers; CSV/XLSX/PDF of exactly what's on screen | `backend/reports/`, `backend/exports/`, `frontend/src/pages/Reports/` |
| Zeno (real model) | Verified-context architecture; strict answer contract; fixed validated action registry; graceful fallback when the model is unreachable; deterministic revenue forecast (`/ai/forecast`, transparent trend — never ML, never negative) and owner-visible AI activity ledger (`ai_history`, `/ai/history`) — both tenant-scoped, tested, no model call | `backend/ai/`, `frontend/src/ai/`, `frontend/src/components/ai/` |
| Invoicing | Numbered per business (INV-0001), one per order, draft → sent → void with void terminal, search + CSV export of exactly what's on screen; amounts are read from the order, never duplicated | `backend/invoicing.py`, `frontend/src/pages/Invoices/` |
| Billing + credits | Real plan state, computed (never stored) credit balance from the `ai_usage` ledger, enforcement (402) on every AI request; payment collection unplugged by design | `backend/billing.py`, `frontend/src/pages/Billing/` |
| Tests | 226 backend tests (incl. frontend↔backend contract test; 25 licensing, 13 invoicing, 7 forecast, 6 AI history, 2 report-chart/route regressions, 9 OFFLINE 4 conflict tests, 6 rate-limit, 4 CORS, 6 audit, 7 backup, 5 AI-style) + 15 local-analytics port tests (now actually runnable — `npm test` had no runner and the suite had rotted) + 66 Electron Node tests (data layer, sync, backup, and a 32-test Windows suite) + the OFFLINE 6 real-runtime E2E harness (46 scenarios: SIGKILL survival, exactly-once sync, conflict resolution, cold offline start) + tsc/build gates, all green locally. **CI rewritten to run ruff, pytest, eslint, tsc, `node --test`, the production build and commitlint — committed as `b739eed`; the push is refused until the GitHub App gets `workflows` write permission (see §4)** | `backend/tests/`, `frontend/test/`, `electron/test/`, `electron/e2e/`, `.github/workflows/ci.yml` |

## 2. The five parked areas — status and recommendation

### 2.1 Payment provider — **parked (decision needed, not engineering)**
Everything it plugs into exists: plans, allowances, ledger, remaining
balance, 402 enforcement, a **10-day free trial** (opt-in, one per
business, `POST /billing/trial`, migration 0011, 14 tests), and UI states
that already say "nothing is charged yet". When the decision to charge is made, the work is: pick a
gateway (Stripe or Paystack, depending on market), add a
`POST /billing/checkout` + webhook receiver, flip
`payment_connected` to true, remove the preview banner, and decide what
the trial converts *into* (today it simply lapses back to Free — the
honest behaviour while nothing can be charged). **No
engineering should start until the charging decision exists.**

### 2.2 Offline / sync — **v1 commitment (ADR-002); foundation built**
**Decision locked (2026-08-28):** offline-first is a core Co-op v1
requirement, not a future enhancement. See `docs/architecture/adr-002-
offline-first-data-layer.md` for the full decision, the offline boundary
(core operations offline; AI + payments online-only), and the
non-negotiable rules (UI never calls FastAPI for core data; client ULID
ids; idempotent writes; operation-based inventory; visible sync state).

**Foundation delivered this phase (OFFLINE 1 + one-way sync protocol):**
- `electron/db/` — local SQLite data layer: driver contract (better-sqlite3
  for production Electron / node:sqlite for tests), versioned migrations,
  ULID `client_id` generation, repositories (business/customers/products/
  orders/stock) that write locally *and* enqueue sync ops, and a
  `sync_queue`. 10 passing Node tests.
- `electron/preload.js` + `main.js` — secure IPC bridge (contextIsolation
  on, nodeIntegration off) exposing allow-listed data-layer methods;
  connectivity detection wired.
- Server idempotency: `client_id` on all syncable entities (migration 0006)
  + `POST /sync/push` applying a batch idempotently (a retried op applies
  once), resolving references by client_id, applying stock as operations,
  and re-validating (refuses negative stock). 8 passing tests.
- Frontend: `frontend/src/sync/` (types, connectivity, status store, local
  DB seam) + a visible TopBar **SyncIndicator** (Synced / Offline — saved
  on this device / Syncing / N to sync).

**OFFLINE 2 — local-first UI wiring (plumbing delivered; activation gated):**
- `frontend/src/repositories/` — the UI's data-access layer (ADR-002 rule):
  `identity` (tenant + local-business bootstrap), `customers`, `products`,
  `inventory`, `orders`. Each operation branches: local (SQLite + sync
  queue) on desktop, or the unchanged HTTP call in a browser.
- The four write-module hooks (`useCustomers`, `useProducts`,
  `useInventory`, `useOrders`) and `CreateOrderPage` now route their
  mutations through the repositories — the UI no longer calls FastAPI
  directly for core mutations.
- **Safety gate (important finding):** local mode is gated behind
  `isLocalModeActive()` (local DB present **and** mirror ready). It is
  **inactive** until OFFLINE 3, because activating local *writes* before
  local *reads* would (a) make locally-created records invisible to
  server-backed reads, and (b) drive local update/delete against rows that
  aren't mirrored yet (a null-row crash — now a clear error). So OFFLINE 2
  delivers the plumbing + a correct, hardened local branch; OFFLINE 3
  activates it. Until then the app's behaviour is unchanged (all HTTP).
- Local data layer hardened: update/delete on a non-local row now throws a
  clear "not in the local database" error instead of crashing on null.

**OFFLINE 3 — sync engine (delivered; the gate is now real):**
- Server: `GET /sync/pull` (full mirror or delta since cursor; every record
  carries server id + client_id; soft-deleted rows included so the mirror
  reflects deletions; stock movements delta on created_at). `POST /sync/push`
  now also applies order `update` ops (offline status changes — validated
  against the shared `ALLOWED_ORDER_TRANSITIONS` machine; the cancellation's
  stock restore travels as its own `stock_movement` op, so it applies exactly
  once — no double restore).
- Local: `electron/sync.js` — `applyPull` upserts the mirror in one
  transaction keyed by stable identity (ULID, or the synthetic `srv-<id>`
  for cloud-native rows), resolves cross-references through a new `id_map`
  table (local migration 0002), re-attaches soft deletes, dedupes the stock
  ledger by client_id, and — on a full pull — VERIFIES local counts against
  the cloud before committing (cursor stored last, so a failed pull keeps
  the old cursor). `markPushOutcome` marks acknowledged ops synced and
  refused ops failed (retried next cycle). 12 passing Node tests.
- Engine (renderer — it owns the Clerk-authenticated client): one cycle =
  PUSH (drain queue, idempotent) → PULL (initial full, then delta since
  cursor; a failed delta arms a one-shot re-verified full pull). Triggers:
  app startup, connectivity restored, 30 s online interval, manual "Sync
  now". A failed full pull/verification leaves mirror + cursor untouched.
- Activation (the OFFLINE 2 safety gate, now real): local mode flips on
  only when the initial pull succeeds (`mirrorReady` from main → status
  store → `setLocalMirrorReady`). Reads for Orders, Customers, Products and
  Inventory then come from SQLite with the server's exact list semantics
  (search/status/stock filters, ordering, page envelope); the summary the
  Inventory page shows is the same calculation computed from mirrored rows.
- User-facing sync behaviour: offline order appears in the list immediately
  with a "Pending sync" chip (live-updated as the queue drains), the
  success screen says "saved on this device" for local orders, the TopBar
  pill shows Synced / Offline — saved / Syncing / N to sync + a "Sync now"
  button, and the queue is retried on reconnect.
- Local order/order-item push payloads now carry client-id references
  (`customer_client_id`, `order_client_id`, `product_client_id`) — the
  reference gap that would have made every offline order refused by the
  server.

**OFFLINE 3.5 — local Dashboard + Reports (delivered; the whole app surface
is now local-first except the model-based AI):**
- `frontend/src/analytics/` — local ports of the cloud engines over the
  mirror bundle: `localDashboard.ts` (summary, timeseries, by-category,
  top products, recent orders, inventory summary — exact status/rounding
  semantics), `localReports.ts` (filter contract + all four report builders,
  verbatim), `localBriefing.ts` (the deterministic insight engine, verbatim
  prose). `localData.ts` fetches the mirror once (short TTL + invalidation
  on every sync event).
- Dashboard, Reports (all four), Briefing page, Dashboard briefing banner
  and the deterministic AI-insights bundle all take the local path when
  local mode is active — same KPIs/tables/notes/prose as the cloud.
- Port fidelity is PINNED by tests: 15 unit tests on the calculators, plus
  a **cross-check harness that runs the actual server engines (FastAPI +
  SQLAlchemy) and the local port on the same fixture and diffs the JSON
  field-for-field** (clean: only timestamps and auto-assigned ids differ).
- Offline export: the Export menu computes CSV from the on-screen
  ReportData ("export exactly what you're looking at", offline); XLSX/PDF
  are server-rendered and honestly disabled offline. The model-based AI
  surfaces stay online-only (ADR-002) and degrade to the deterministic
  engine offline.
- Found + fixed while cross-checking: the report chart series took data
  from `dict.values()` (row insertion order) while the labels were sorted —
  values plotted under the wrong bucket whenever row order ≠ date order
  (affected Sales, P&L, Inventory donut and Customers charts). Data now
  follows the sorted label order; regression test added. Also fixed a
  latent 500 on `GET /reports/{key}` (`await build_report(...).to_dict()`
  called `.to_dict` on the coroutine — only reachable over HTTP, which the
  service-level tests never hit; route-level regression test added).

**OFFLINE 4 — conflict engine (delivered; correctness, no UI):**
- `/sync/push` now resolves every op to exactly one outcome: `applied`,
  `skipped` (idempotent), `conflict` (structured), or `failed` (transient,
  retriable). The response carries `conflicts[]` with
  `operation_id` (the local queue row id, echoed from the push op), `entity`,
  `client_id`, `reason`, `local` (attempted values), `server` (current
  values where safe); `failed`/`errors` (back-compat alias) hold transient
  refusals. The endpoint stays idempotent.
- Conflict rules (SAFE vs UNSAFE, per the ADR): client_id match = same
  record (safe). An email already owned by a DIFFERENT customer ->
  `email_conflict` (create or update — never silently overwritten, never
  auto-merged; exact NAME match is not identity and creates a distinct
  record). An SKU owned by another product -> `sku_conflict`. Unknown
  client_id target -> `not_found`. Stale/invalid order status transition ->
  `invalid_transition` (validated against the shared
  `ALLOWED_ORDER_TRANSITIONS`). A stock movement that would drive cloud
  stock negative -> `insufficient_stock` with the server's current stock
  (operation-based model unchanged; the movement is not applied, and
  exactly-once is preserved). The pre-checks mirror the partial unique
  indexes (per business, live rows) — previously these collisions were raw
  IntegrityErrors that 500'd the whole push batch.
- Local queue: new `conflict` state. `retryFailed()` re-arms `failed` ops
  ONLY — conflicts stay parked (never endlessly retried), with the original
  payload untouched and the structured server entry retained on the row for
  OFFLINE 5. `syncStatus` exposes a `conflicts` count; the TopBar pill shows
  "N need attention" (visibility only — no resolution UI yet).
- 9 new backend tests (email create/update conflict, name-is-not-identity,
  SKU conflict create+update, not_found targets, invalid transition,
  duplicate-order idempotency, conflict shape + operation_id, no-apply-on-
  retry, tenant isolation) + 3 new Electron tests (conflict parked with
  payload/reason retained, not re-armed by retryFailed, subsequent ops keep
  syncing around a parked conflict).

**OFFLINE 5 — conflict-resolution UX (delivered):**
- **Sync Center** (`/sync`, nav item + the TopBar pill now links to it):
  shows pending upload, last sync/connection, and every parked conflict.
- Each conflict renders its structured context side-by-side (**this device**
  vs **cloud**) with type-specific choices — and every choice executes
  through the repository/sync pathway (the UI never mutates the database
  directly):
  - customer email conflict → *use a new email* (re-queued or re-enqueued
    through the repo, then pushed and re-validated) or *keep cloud*
    (never-synced local customer discarded locally via a resolution-only
    method; an already-synced customer converges back to cloud values via a
    repository update). Never auto-merges unrelated customers.
  - product SKU conflict → *use a new SKU* or *keep cloud* (same rules).
  - stock movement rejected (insufficient stock) → *retry* (re-queued;
    applies once the cloud stock allows) or *discard movement, align local
    stock* (local-only correction: signed 'correction' ledger entry, NO
    queue op — no fake "merge stock" button).
  - order status conflict → *set status* (deliberate, offered only from the
    legal next statuses of the current cloud status) or *keep cloud status*
    (a converging no-op update).
  - not_found → *discard* (the op is dropped; any local-only record stays
    on the device, said plainly).
- Resolution primitives (Electron data layer): `queue.requeue(id,
  override)` (corrected payload, same client_id, back to pending),
  `queue.resolveConflict(id)` (terminal 'resolved' — never retried, excluded
  from needs-attention), `customerDiscardLocal` / `productDiscardLocal`
  (soft-delete a never-synced row WITHOUT queueing a delete op that could
  never apply), `stockSetLocal` (align row + local 'correction' ledger
  entry, no queue op).
- After any resolution a manual sync cycle is requested; while offline the
  resolution still works and the new op syncs on reconnect. 4 new Electron
  tests (requeue correctness, terminal resolved state, discard-without-op,
  local stock correction + ledger).

**Remaining (scheduled sub-phases):** OFFLINE 6 (E2E offline / restart /
duplicate-sync testing in the real Electron runtime — the gate before
calling the offline promise production-ready). Dashboard/Reports reads stay
server-backed for now (the deterministic engines keep working from live
data); moving them to the local mirror is the natural next sub-phase.

### 2.3 Notifications — **partially live; daily summary is the gap**
Live: low-stock / out-of-stock alerts in the TopBar popover (real data,
deep-links to filtered inventory). Missing: the **daily business summary**
(PRD v1 item) — a verified digest (revenue today, new orders, stock risk,
quiet customers) shown once per day. Implementation is small-to-medium:
the numbers already come from `/dashboard/summary` + the briefing engine;
the work is a daily digest endpoint (or reuse briefing), a stored
"last-seen" per tenant, and a notification card in the popover. Desktop +
email channels come later (desktop needs the Electron work; email needs a
mailer — none exists in the repo).

### 2.4 Security / team features — **hardening backlog**
- **Persistent audit log** — the `audit_log` table exists; nothing writes
  to it yet. `AuditService.record()` logs to stdout. Recommended: write
  audit rows for mutations (orders, stock, imports, plan changes) via the
  existing service seam; add a read-only Audit view behind Settings→Security.
- **Users / roles / invitations** — single owner per business today (Clerk
  user auto-provisions a tenant). Plans advertise "up to N users" (display
  values) but there is no team model. Needed before selling multi-seat
  plans: `users`/`memberships` with roles (owner/admin/standard),
  invitations, and scoping.
- **Session management** — Clerk handles token lifecycle; the app has a
  session-expiry guard. Missing: active-session list / revoke (Clerk
  feature to wire) under Settings→Security.
- **Rate limiting** — none. Add a per-tenant limiter on `/ai/chat` (the
  expensive route) before open launch; the 402 credit gate is a cost backstop
  but not a rate control.
- **CORS** — defaults to `*` (no cookies/credentials, so lower risk); must
  be set explicitly (`CORS_ORIGINS`) in production.
- **Secrets** — verified clean: API key lives only in the gitignored
  `.env`; `.env.example` holds placeholders; no key appears in the tree.

### 2.5 Product positioning — **mostly there; polish the last mile**
The advisor/operator identity is already visible: Welcome screen, Day 1
Briefing, "Zeno · Live Insights" on the Dashboard, "Ask Zeno"
throughout, Reports with "Ask Zeno about this report", and drafts-never-
acts copy in the AI composer. Residual ERP-feel:
- **Settings** shows 7 "coming soon" sections (appearance, AI prefs,
  notifications, security, backup, sync, about). Honest, but prominent —
  either implement the cheap ones (About, Appearance display prefs) or
  collapse the list to what's actually planned.
- **List pages** (Products/Customers/Orders/Inventory) are conventional
  tables — acceptable for an operational tool; the advisor voice lives in
  the Dashboard/AI/Briefing/Reports surfaces.
- **README/docs** previously still said "multi-tenant ERP" — corrected in
  this pass.

## 3. Readiness defects found and fixed in this pass

1. **CI never runs on the real branches** — the workflow targets
   `main`/`develop` (default is `master`) and uses pnpm filters + lint
   scripts the repo doesn't have (guaranteed red). The corrected workflow
   is specified in **Appendix A** — the session's agent token lacks GitHub
   `workflows` permission, so the repo owner needs to apply it (copy-paste +
   push). Until then, CI provides no enforcement on `master`.
2. **README stale** — still framed Co-op as "a multi-tenant ERP", listed
   old import endpoints, and omitted import/reports/AI/billing/briefing.
   Rewritten with the true positioning and the current API surface.
3. **CONTRIBUTING stale** — pnpm instructions, `develop` branch,
   pre-Clerk env vars, nonexistent project structure. Rewritten.
4. **Dashboard docstring** still described the AI card as a "module
   pending" placeholder (the module exists). Corrected.

## 4. Hardening backlog (before open launch)

**Done in the v1-completion pass (2026-08-31):**

- [x] **Apply the corrected CI workflow** — superseded Appendix A: the
      workflow now runs ruff, pytest (from the repo root), eslint, tsc,
      `node --test`, the production build and commitlint on push/PR to
      `master`, and every one of those commands was run locally first.
      Committed as `b739eed`; this session's GitHub App still cannot push
      workflow files (no `workflows` permission — the same blocker as the
      original Appendix A note), so the repo owner applies that commit when
      merging. Verified in the meantime by running the identical commands
      by hand: ruff clean, 226 tests green, eslint clean, tsc clean,
      `vite build` clean, commitlint 0 problems
- [x] Per-tenant rate limiting on `/ai/chat` — sliding window per Clerk
      user, `ai.rate_limit {requests, window_seconds}` in
      `config/<env>.json`, 429 + Retry-After; disabled in testing
- [x] `CORS_ORIGINS` explicit in production — production refuses to start
      with an open CORS policy (env or `config/production.json`
      `cors.origins` required); dev/testing keep `*`
- [x] Audit log persistence + read view — every mutation (API + offline
      sync push) writes a tenant-scoped row (migration 0008); `GET /audit`
      + Settings → Audit Log
- [x] Backup system (PRD Phase 4) — cloud JSON export/restore
      (restore only into an empty business, 409 otherwise) + desktop local
      SQLite backup/restore (refused while anything is unsynced) + Settings
      → Backup & Restore
- [x] Settings: implemented every "coming soon" section — Appearance
      (light/dark/system), AI (answer style wired into the real prompt),
      Notifications (in-app prefs), Security (Clerk account management),
      Sync (live engine status), Audit Log, About (version/env)
- [x] Desktop packaging configured — electron-builder (AppImage/NSIS/DMG),
      `npm run dist`/`pack` in `electron/`, with the Windows NSIS options
      (shortcut name, per-user install, uninstall keeps data) now explicit;
      building the installers themselves still needs each real platform
- [x] Decide + document offline-first scope (ADR-002, done in the previous
      pass)

**Done in the gap-closing pass (2026-09-05):**

- [x] **Frontend tests were unrunnable** — the one suite in `frontend/test/`
      had no runner, so it had rotted in silence. `npm test` now compiles it
      to CommonJS and runs it under `node --test` (15 passing)
- [x] **`LICENSE` file** — the About panel already called the app
      proprietary while the repo shipped no licence; now it does, and the
      panel and README point at the same terms
- [x] **Pre-commit hook** — it ran `npx pre-commit`, resolving to an
      unrelated npm package and failing every commit; it now runs ruff and
      eslint under POSIX sh and warns (never blocks) when a tool is absent
- [x] **Invoicing** (PRD invoice generation) — see §1: numbered, tracked,
      exportable, 13 tests

**Done in the Windows/MVP pass (2026-09-05):**

- [x] **Windows correctness in the desktop app** — `electron/platform.js`
      centralises the rules Windows actually enforces (%APPDATA% data dir,
      `Scripts\python.exe` venv layout, `<>:"|?*` and reserved device names
      in filenames, MAX_PATH, EBUSY/EPERM from a scanner holding a handle).
      30 tests exercise it on Linux through `path.win32`; 2 more run only on
      a real Windows filesystem
- [x] **Restore can no longer lose the database** — the live file is renamed
      aside and only discarded once the copy has landed, and a failed swap
      rolls back. Previously a locked file mid-restore left no database at
      all
- [x] **Single-instance lock + AppUserModelID** — a second launch focuses the
      running window instead of opening a second writer on the same SQLite
      file, and the taskbar entry reads "Co-op" instead of "Electron"
- [x] **Windows installer config** — per-user NSIS with a real shortcut name,
      "Co-op" in Add/Remove Programs, uninstall keeps the local database,
      and `platform.js` is now in `build.files` (it was not, which would have
      shipped an installer that crashes on launch)
- [x] **CI runs the desktop suite on `windows-latest`**, and fails if the
      Windows-only tests were skipped (part of the pending workflow push)
- [x] **Project renamed Finch → Co-op** everywhere in the tree, including the
      design archive and its 40-odd provenance references. `FINCH_ENV` is
      still read as a legacy alias for `COOP_ENV` so an existing `.env` keeps
      working

**Still open:**

- [x] Lint tooling wired into CI — done in code: ruff for the backend
      (`pyproject.toml`, E/F/W at line-length 100, full suite green),
      eslint 9 + typescript-eslint for the frontend (`pnpm lint`, zero
      findings across src, test and scripts). Both are steps in `b739eed`,
      which awaits the same owner push.
- [x] commitlint in CI — done in code (`.commitlintrc.json` + root
      devDeps already existed; the workflow now validates every PR commit).
      Same pending owner push as above.
- [x] Team model (memberships, roles, invitations) — `business_members` +
      `business_invitations` (migration 0010); owner invites by email, the
      five future roles (manager/sales/inventory/accountant/viewer) are
      enforced by a write matrix in get_current_business and mirrored
      client-side; invitees join via the accept-or-sign-out gate.
- [x] Daily business summary *delivery* (email) — SMTP-backed
      `POST /notifications/summary/send` (owner/manager, rate-limited,
      audited); the in-app summary remains the always-on channel. Push
      channels stay beyond v1 scope.
- [ ] Payment provider integration (after the charging decision — still
      parked, nothing is charged)
- [x] Licence activation (PRD Ch7 §7.19 / Ch8 §8.15) — `backend/licensing.py`
      issues self-contained HMAC-SHA256 signed activation strings (business
      id + plan + seats + expiry, 16-byte packed payload → a 66-character
      `COOP-…` key); the team mints them offline with
      `tools/generate_license.py` or via the team-only
      `POST /admin/generate-license` (`X-Admin-Token`, constant-time compare,
      503 when unconfigured); the owner activates through
      `POST /licenses/activate` (owner-only; a key for another business, a
      revoked key and an already-activated key are all explicit refusals).
      The grant is a window on the subscription — same shape as the trial —
      so expiry is a pure function of (`license_ends_at`, now) with no
      scheduler, and `POST /admin/licenses/revoke` withdraws it immediately.
      `licenses` (migration 0012) stores the SHA-256 fingerprint, never the
      key. 25 tests (service + routes). **Still open:** the *codebase* licence
      (Settings → About correctly says the project itself is unlicensed).

## 5. Pre-release checklist

- [ ] Run migrations on target Postgres: `alembic upgrade head` (5
      migrations, all idempotent/additive)
- [ ] Set production env: `DATABASE_URL`, `CLERK_FRONTEND_API`,
      `CORS_ORIGINS`, `OPENAI_API_KEY`
- [ ] Verify `/healthcheck`, a login, an import, a report export, an AI
      question, and a plan change on the deployed instance
- [ ] Confirm no `.env` in the deploy artifact and no secrets in logs

---

## Appendix A — Pending CI update (requires repo-owner push)

The agent token used in this session lacks GitHub `workflows` permission,
so the updated workflow below **could not be committed** and is recorded
here for the repo owner to apply (replace `.github/workflows/ci.yml`, then
push). Everything else in this pass is already committed.

```yaml
name: CI

# Co-op's enforced gates:
#   backend    — ruff lint (E/F/W, line-length 100) + full pytest suite
#                (incl. the frontend<->backend contract test, which needs the
#                whole repo, so everything runs from the repo root)
#   frontend   — eslint + TypeScript check + production build
#   commitlint — conventional-commit shape of every commit in the PR
#
# A gate that can't pass (or can't fail) doesn't belong in CI: each of these
# is green on the current tree and is kept green locally by the same commands.

on:
  push:
    branches:
      - master
  pull_request:
    branches:
      - master
  workflow_dispatch:

env:
  PYTHON_VERSION: '3.11'
  NODE_VERSION: '22'

jobs:
  backend:
    name: Backend lint + tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r backend/requirements.txt
          pip install pytest pytest-asyncio ruff

      - name: Lint (ruff E/F/W)
        run: ruff check backend/

      - name: Run test suite
        run: python -m pytest

  frontend:
    name: Frontend lint + type-check + build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        working-directory: frontend
        run: npm ci

      - name: Lint (eslint)
        working-directory: frontend
        run: npm run lint

      - name: Type check
        working-directory: frontend
        run: npx tsc --noEmit -p tsconfig.json

      - name: Production build
        working-directory: frontend
        run: npm run build

  commitlint:
    name: Commit messages (conventional)
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Validate PR commits
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
        run: npx commitlint --from "$BASE_SHA" --to HEAD --verbose
```
