# Co-op — MVP launch readiness (v1.0)

Checked against the v1.0 scope in `Documents/PRD` Ch1 ("five major systems") and
Ch4 (core ERP modules), with evidence from the code. **Bottom line: the v1
feature set is implemented and every automated gate passes — but the MVP is
NOT yet launch-ready.** One v1 security requirement is a genuine code gap
(see "Blocking"), and the rest are operator/infra steps that cannot be done
inside this repository.

## v1 feature coverage (all five systems present)

| v1 system / feature | Evidence | Status |
|---|---|---|
| Dashboard — KPIs, revenue charts, inventory summary, customer growth, daily sales | `/dashboard/{summary,revenue/today,revenue/month,timeseries,by-category,growth,low-stock,top-products,briefing}` | ✅ |
| Orders — create, lifecycle/status, search, history | `/orders` CRUD + `/orders/{id}/status` + `OrdersPage`, `CreateOrderPage`, `OrderDetailsPage` | ✅ |
| Invoices — generation, export, PDF | `/invoices` CRUD + `/invoices/export` + `exports/renderers.render_pdf` | ✅ |
| Inventory — products, categories, low-stock, valuation, movements | `/products` CRUD, `/products/{id}/adjust`, `/products/{id}/movements`, `/inventory/summary` | ✅ |
| Customers — contacts, purchase history, spending | `/customers` CRUD + `/customers/{id}` + `CustomerProfilePage` | ✅ |
| AI Assistant — chat, reports, explain, forecast, invoice help | `/ai/chat` (gated on `OPENAI_API_KEY`), `/ai/forecast`, `/ai/usage`, `/ai/history` | ✅ (needs key) |
| Import — preview/map/validate/commit, rollback | `/imports/*` + `ImportPage` | ✅ |
| Sync / offline-first | `/sync/push`, `/sync/pull`, electron `sync-store`, SQLite cache | ✅ |
| Notifications — daily summary | `/notifications/daily-summary`, `/notifications/summary/send`, `NotificationsPopover` | ✅ |
| Global search | `CommandPalette` | ✅ |
| Export — reports/invoices/CSV/XLSX/PDF | `exports/service.py` (`render_csv/xlsx/pdf`), `/reports/{key}/export` | ✅ |
| Billing & subscription (trial → paid) | `/billing/*`, Paystack checkout/verify/webhook, trial rule | ✅ (needs Paystack key) |
| Licensing — team-only generate + activation | `/admin/generate-license`, `/licenses/activate`, Settings key paste | ✅ |
| Manual backups | `/backups/export`, `/backups/restore` | ✅ |
| Auth — cloud account | Clerk `verify_clerk_token` on every endpoint | ✅ (needs Clerk config) |
| Theme — light/dark | `useCoopTheme().isDark`, `theme.ts` dark algorithm | ✅ |
| Team roles + invitations | `/team/*`, `team.py` role matrix | ✅ |
| Audit trail + security middleware | `audit.py`, security headers, `redact.py`, `security_events.py`, RLS backstop | ✅ |

Out-of-scope v1 items (mobile, voice AI, agents, multi-company, multi-warehouse,
payroll, accounting ledger, public API, plugins) are correctly absent.

## Automated gates (last run)

- Backend: `pytest` → **310 passed, 3 skipped** (skips = the live-Paystack and
  Postgres-RLS tests, which need egress/Postgres).
- Electron: `node --test` → **80 tests, 78 pass, 0 fail, 2 skip** (live sync).
- Frontend: `tsc --noEmit`, `eslint`, `vitest` (22), `vite build` — clean.
- UI audit (`audit-ui-wiring.mjs --strict`): 0 wiring problems.
- Security checklist: 170/170 dispositioned — 113 done in code, 22 code+ops,
  29 ops/infra, 6 n/a (`docs/SECURITY_CHECKLIST_STATUS.md`).

## Blocking before launch

1. **Encryption at rest is NOT implemented (checklist 5).** No `sqlcipher` /
   `PRAGMA key` anywhere in `backend/` or `electron/` — the local SQLite DB is
   plaintext on disk. PRD lists "Encryption" as a v1.0 Security requirement.
   This is the one genuine *code* gap. (Checklist 37/42 "data in transit" and
   43 "PII redaction" are done; at-rest is not.)
2. **Supabase RLS is written but unrun.** Migration `0014_rls` + `rls.py` exist,
   but must be applied to the real Postgres; there is no Postgres in this
   sandbox. RLS is intentionally not FORCED, so it only constrains non-owner
   roles — apply and verify on the real DB.
3. **Real-DB migrations 0012–0014 are untested against Postgres.** They run on
   SQLite in tests only; execute + smoke on Postgres before deploy.
4. **Payments not live-verified.** `paystack.shop` is not the documented Paystack
   domain and the plan→page mapping is assumed. Live smoke = run
   `PAYSTACK_SECRET_KEY=sk_test_… COOP_PAYSTACK_LIVE=1 pytest
   backend/tests/test_paystack_live.py` where egress exists (this sandbox has
   none). Set the real secret key and point the webhook at `POST /webhooks/paystack`.
5. **Clerk operator config:** enable MFA/2FA (17, 26), session lifetime (25),
   password policy + recovery (24, 27), rate limiting (19, 49, 57).
6. **CI is blocked:** `.github/workflows/ci.yml` cannot be pushed until the
   GitHub App gets **Workflows** write permission.

## Verdict

**Feature-complete for v1.0 and all automated gates green — but not launch-ready.**
Ship-blocking work: (a) implement SQLite encryption-at-rest (the only code gap),
(b) run + verify the Postgres migrations & RLS on a real DB, (c) live-verify
Paystack with a test key, (d) finish the Clerk security config, (e) enable the
CI workflow. Everything else in the v1 scope is implemented and tested.
