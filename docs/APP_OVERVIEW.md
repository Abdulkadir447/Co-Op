# Co-op — what the app is, what it does, what it does not do

Written 2026-11-23 from the code, not from the pitch. Every claim here is
checkable in the file named beside it. Where something is not finished, it says
so in the same sentence as the feature, because a feature list that hides its
holes is a liability in a code review.

---

## In two lines (your own description — this is what the code should be graded against)

> **Co-op is an offline-first business system for small wholesalers and
> retailers: products, stock, customers, orders, invoices, receivables and
> reports, running on a desktop app with a local database that syncs to the
> cloud, plus an AI assistant that answers only from the business's own verified
> records and can never change data.
>
> It is sold per business in USD ($29 / $99 a month), not per seat, and it is
> built for the customer who cannot afford the system to be down or to be wrong.

That is the intent. If the code does not match it, the code is wrong.

---

## 1. What it is, structurally

| Layer | Technology | Where |
|---|---|---|
| Web frontend | React 18 + TypeScript + Vite + Ant Design, with a hand-built design system | `frontend/src/` |
| API | FastAPI (async) + SQLAlchemy 2 (async) + Pydantic v2 | `backend/` |
| Database | Postgres/Supabase in production; SQLite in tests and in the desktop mirror | `backend/models.py`, `backend/alembic/` |
| Auth | Clerk (JWT, RS256, JWKS-verified) with a tenant row per business | `backend/clerk_auth.py`, `backend/team.py` |
| Desktop | Electron shell with a local SQLite mirror and a sync queue | `electron/` |
| AI | OpenRouter → a model, with a strict JSON answer contract | `backend/ai/` |
| Payments | Paystack (API checkout + signed webhook) | `backend/paystack.py`, `backend/payments.py` |
| Marketing site | Static React site | `website/` |

**Size:** 97 API routes, 18 page areas, 25 database tables, 24 migrations,
**448 backend tests**, 26 frontend tests, 82 Electron tests.

---

## 2. What it does today — feature by feature

### 2.1 Identity, tenancy and access

| Capability | Status | Notes |
|---|---|---|
| Sign-up / sign-in | **Done** (Clerk) | `pk_`-key only in the browser; secret stays server-side |
| Automatic business provisioning | **Done** | First `/auth/me` creates the tenant from the token, never from the request body |
| Tenant isolation | **Done, tested** | Every query is scoped by `business_id`; a cross-tenant read returns 404, not 403 (`get_current_business`) |
| Anonymous surface | **Done, pinned** | A router sweep proves only six endpoints answer without a token: `/`, `/healthcheck`, `/billing/payment-config`, the webhook (signature-gated) and `/admin/*` (token-gated, 503 when unset) |
| Roles: owner, manager, sales, inventory, accountant, viewer | **Done** | `WRITE_MATRIX` in `backend/team.py` maps path → allowed roles; fails closed |
| Invitations | **Done** | Token-bound, email-matched, expiring |
| Owner-only surfaces | **Done** | `/licenses`, team management, backup restore, settings writes |
| Postgres row-level security | **Partial** | 19 policies exist and are applied to the live Supabase project, but **not FORCED**, and the functional test skips without `TEST_DATABASE_URL` |

### 2.2 Catalogue, stock and purchasing

| Capability | Status | Notes |
|---|---|---|
| Products (SKU, price, cost, stock, reorder level) | **Done** | SKU unique per tenant among live rows only |
| Stock ledger | **Done** | Append-only `stock_movements`; stock cannot go negative; every change has a reason |
| Manual adjustment with reasons | **Done** | purchase / damaged / returned / correction |
| Low-stock and reorder signals | **Done** | `GET /dashboard/low-stock`, inventory report |
| Categories, search, pagination | **Done** | |
| Barcode scanning | **Not done** | No scanner integration, no barcode field |
| Purchase orders / supplier records | **Not done** | Stock comes in via manual adjustment only; there is no supplier table |
| Multi-location / multi-warehouse | **Not done** | One stock number per product per business |

### 2.3 Sales: customers, orders, invoices, money in

| Capability | Status | Notes |
|---|---|---|
| Customers (contact, company, address) | **Done** | Email unique per tenant |
| Orders with line items and price snapshot | **Done** | `unit_price` copied at order time, so a later price change never rewrites history |
| Status machine | **Done** | pending → confirmed → shipped → delivered; cancelled is terminal; illegal jumps are 409 |
| Invoices, numbered per business | **Done** | `INV-0001` per tenant, one invoice per order (unique index), draft → sent → void |
| Tax on invoices | **Done** | Rate and label configured per business, snapshotted per order, exclusive (added on top), printed as its own line |
| Invoice statutory identity block | **Done** | Tax ID, company registration number, sequential number, date of supply |
| Recording money received (partial or full) | **Done** | `order_payments` ledger; balance computed, never stored |
| Receivables view | **Done** | "Who owes me money", oldest first, 30+ day flags |
| Printable invoice | **Done** | Print view with the owner's own logo and details |
| Sending invoices by email | **Not done** | No email provider is wired; there is a `customer` mail helper but no invoice delivery |
| Recurring / subscription invoices | **Not done** | |
| Payment collection from the *owner's* customers | **Deliberately not done** | Co-op never touches the merchant's money — regulatory surface, and out of scope by design |

### 2.4 Inventory intelligence, import and reports

| Capability | Status | Notes |
|---|---|---|
| CSV/XLSX import of products, customers, orders | **Done** | 5-step flow: schema → preview → map → validate (read-only) → commit, with per-row errors and provenance |
| Import idempotency | **Done** | `source_order_ref` unique per tenant, so re-importing the same file cannot duplicate orders |
| Reports: Sales, Profit & Loss, Inventory, Customers | **Done** | One filter contract (period, compare, product, customer, category) |
| Exports: CSV, XLSX, PDF | **Done** | Export of exactly what is on screen; CSV injection defused |
| Dashboard: revenue, growth, top products, stock by category | **Done** | 9 endpoints |
| Day-1 briefing / onboarding | **Done** | Deterministic insights, not AI |
| Scheduled email reports | **Not done** | |
| Multi-currency within one business | **Not done** | One currency per business (used for display and tax) |
| Custom report builder | **Not done** | Four fixed reports |

### 2.5 AI (Zeno)

| Capability | Status | Notes |
|---|---|---|
| Ask a question about the business | **Done** | Answers only from a server-built context of verified rows |
| Answer contract | **Done** | JSON with `kind` (fact / calculation / forecast / suggestion / draft / clarify), `basis`, `follow_ups`, `links`, `actions` |
| Propose one action (draft an order) | **Done** | `DRAFT_ORDER` is the only action in the registry; it is validated against live stock/price and never executed |
| Refuse to invent numbers | **Done, in the prompt and in tests** | Every figure must exist in the context; there is a repair retry, then an honest 503 |
| Deterministic revenue forecast | **Done** | `/ai/forecast` is a trend calculation, never ML, never negative |
| AI history ledger the owner can read and delete | **Done** | `ai_history`, tenant-scoped |
| Credit metering and enforcement | **Done** | `ai_usage` ledger; 402 when credits run out |
| Learning from mistakes and habits | **Done, invisible** | Rejected proposals become graded lessons; habits activate on the second mention; no screen shows any of it |
| Tools, web browsing, document ingestion | **Deliberately not done** | Removes prompt-injection and exfiltration paths |
| Writing data, sending email, moving stock | **Deliberately not done** | The assistant proposes; the human confirms |
| Fine-tuning on the tenant's data | **Not done** | Lessons are prompt text, inspectable and deletable |
| Cross-tenant learning | **Not done, deliberately** | Business A's lessons never reach business B |

### 2.6 Offline and desktop

| Capability | Status | Notes |
|---|---|---|
| Electron desktop app | **Done** | `contextIsolation`, `sandbox`, no `nodeIntegration`, CSP |
| Local SQLite mirror | **Done** | Products, customers, orders, stock |
| Offline queue + sync | **Done** | Idempotent push (`client_id` ULID), conflict detection, pull |
| Auto-update | **Done** | `electron/updater.js` |
| Encrypted local database | **Not done** | **The one real code gap for launch.** Local SQLite is plaintext; needs SQLCipher |
| Payment ledger offline | **Not done** | Payments are recorded online only; the UI says so |
| Mobile app | **Not done** | Web app is responsive, but there is no native mobile build |

### 2.7 Billing, licensing and platform

| Capability | Status | Notes |
|---|---|---|
| Plans: Free / Starter $29 / Professional $99 / Enterprise | **Done** | Catalogue in `frontend/src/billing/plans.ts`, prices charged from `config/*.json` |
| 10-day trial (one per business) | **Done** | Never overwrites the paid plan; lazy expiry, no scheduler |
| Paystack checkout | **Done (never live-charged)** | `POST /transaction/initialize` + `verify` + HMAC-SHA512 webhook. **No real charge has ever been made** |
| Licence activation (offline installs) | **Done** | Signed key, SHA-256 fingerprint stored, revocation wins |
| Platform admin console | **Done** | Allow-list by email or Clerk id; cross-tenant aggregates only |
| Investor metrics | **Done** | Signups, activation, retention, MRR, AI credits, each with its definition |
| Feedback widget | **Done** | In-app, reaches the admin console |
| Support tickets | **Partial** | Stored in-app (`/support/issues`); no external helpdesk |
| Public marketing site | **Partial** | `website/` exists, one placeholder ("Support email coming soon") |
| Email (transactional) | **Not done** | No provider configured: no invoice emails, no password emails, no receipts |

---

## 3. What it cannot do (stated plainly)

1. **Take a payment from the merchant's own customers.** By design. Co-op records
   money received; it never is the payment rail for the SME's sales.
2. **Send anything.** No invoice email, no receipts, no reminders. There is no
   email provider in the dependency list.
3. **Work fully offline on a shared or new device.** The session comes from
   Clerk; on the free plan sessions last 7 days, which caps how long the desktop
   app can stay offline without re-authenticating. Usefully offline for days,
   not for months.
4. **Protect the local database if a laptop is stolen.** SQLite is plaintext.
5. **Handle suppliers, purchase orders or multi-location stock.** One stock
   number, no supplier entity.
6. **Handle more than one currency per business**, or tax rules that vary by
   jurisdiction automatically. The owner types the rate.
7. **Run payroll, file taxes, lend money, or do bookkeeping double-entry.**
   Profit & Loss is a report over orders, not a general ledger.
8. **Scan barcodes or run on a phone as a native app.**
9. **Let the AI change anything.** That is a feature, not a gap, but it is
   listed here because it is a capability people expect from "AI ERP" and this
   one will not do it.

---

## 4. Done / not done / next, as three lists

### Done and tested (ships today)

Products, stock ledger, customers, orders with a guarded status machine,
invoices, receivables, tax snapshots, four reports with three export formats,
CSV/XLSX import with validation, dashboard, day-1 briefing, AI chat with a
verified-context contract, AI forecast, AI history, credits and plans, Paystack
checkout code, licensing, team roles, audit log, backups (encrypted), desktop app
with sync, platform admin console, investor metrics, demo seeder.

### Built but not yet proven in the real world (the dangerous middle)

| Item | What is missing |
|---|---|
| Payments | No live charge has ever been made. The code is tested against Paystack's contract, not against Paystack |
| RLS | Policies applied to Supabase but never functionally tested against Postgres |
| Migrations 0012–0014 | Run on SQLite in tests, never on Postgres |
| Desktop CSP | `'unsafe-eval'` is still allowed (needed by the dev runtime; not needed packaged) |
| Offline sync under real conflict | 46 scenarios pass in the harness; no real multi-device deployment |
| Email | Not built at all |

### Next, in the order that actually matters

1. **Encrypt the local database (SQLCipher).** The only launch-blocking *code* item.
2. **Make one real test payment** and one real webhook delivery.
3. **Run the migrations and the RLS test against Postgres**, once, on staging.
4. **Email invoices.** This is the most-requested missing feature in every
   comparable product, and without it the invoice lives only as a PDF download.
5. **Suppliers and purchase orders.** The customer who holds stock needs to
   record where it came from.
6. **Barcode input** (keyboard-wedge scanner is enough; no camera API needed).
7. **Security follow-ups** from `docs/SECURITY_AUDIT.md` §"still missing":
   log cross-tenant 404s, hash-lock Python dependencies, Postgres
   `statement_timeout`, digest-pin container images.
8. **Mobile**: a responsive PWA shell before any native app.

### Deliberately not on the roadmap

Lending, payroll, tax filing, marketplace/storefront, holding customer money,
custom ERP implementation work, AI that writes to the database.

---

## 5. Architecture in one page

```
Browser / Electron renderer
        │  HTTPS, Bearer JWT (Clerk)
        ▼
FastAPI  ── verify_clerk_token ──► Clerk JWKS
   │
   ├─ get_current_business ──► businesses row (tenant)
   ├─ assert_can_write ─────► WRITE_MATRIX by role
   ├─ ratelimits ───────────► imports / exports / writes
   │
   ├─ services ─► orders, stock ledger, invoicing, receivables, reports
   ├─ ai ───────► build_context (read-only SQL) → prompt → model → validate → propose
   ├─ billing ──► plans, credits (computed from ai_usage), paystack
   └─ audit ────► audit_log (append-only, committed with the mutation)

Postgres/Supabase  ⇄  Electron SQLite mirror (sync queue, idempotent client_id)
```

**The three invariants everything else leans on:**

1. Every row is tenant-scoped by `business_id`, resolved from the verified token,
   never from the request body.
2. Money is never duplicated: an invoice points at an order, a balance is
   computed from the payment ledger, credits are computed from the usage ledger.
   There is no stored total that can drift.
3. The AI never writes. It reads verified rows and proposes; a route validates
   the proposal against live data; the owner confirms.

---

## 6. Honest risks in the design (not in the code quality)

| Risk | Where it bites |
|---|---|
| Desktop-first is a hard sell against free web apps | adoption, not engineering |
| The product is broad — it does the work of four tools — and broad products are hard to explain in one sentence | fundraising |
| No email means an invoice is a download, not a conversation | activation: the customer's customer never sees the invoice |
| Session lifetime on Clerk's free plan caps offline use | the headline differentiator is weakened by an auth vendor's pricing |
| No supplier/purchase order chain | a wholesaler's stock history is half-recorded |
| Solo maintenance | 97 routes, 25 tables, 448 tests: real, but one person's attention |

---

## 7. Where to look first (for a reviewer)

| Order | File | Why |
|---|---|---|
| 1 | `backend/models.py` | 25 tables in one file; the schema is the design |
| 2 | `backend/clerk_auth.py` + `backend/team.py` | token verification, tenant resolution, roles |
| 3 | `backend/main.py` | 97 routes; read the decorators, then the handlers that touch money |
| 4 | `backend/ai/prompts.py` → `backend/ai/service.py` → `backend/ai/actions.py` | the AI's contract, its context builder, and the only action it can propose |
| 5 | `backend/invoicing.py`, `backend/receivables.py`, `backend/billing.py` | the three "money must never drift" modules |
| 6 | `backend/alembic/versions/` | 24 migrations, forward-only, guarded DDL |
| 7 | `docs/CODE_REVIEW_PACKET.md` | same list with inline excerpts and line numbers |
