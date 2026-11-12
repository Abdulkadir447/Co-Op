# Code review packet — repo status, leak check, reading order

Prepared 2026-11-23 for an external reviewer. Everything below is checkable in
the repository; nothing is asserted from memory.

---

## 0. Repo status and the leak check you asked for

**The repository is already public.** `GET https://api.github.com/repos/Abdulkadir447/Co-Op`
returns `"private": false, "visibility": "public"` to an unauthenticated request,
so nothing had to be flipped. That makes the leak check urgent rather than
optional, and it was run against the working tree **and the whole commit history**.

| Check | Method | Result |
|---|---|---|
| `.env` files committed | `git ls-files` + history add-scan | **Clean.** Only `.env.example` is tracked; no `.env` has ever been added |
| Hardcoded API keys | pattern scan over every tracked file (`sk_live_`, `pk_live_`, `eyJ…`, AWS key shape, PEM headers) | **Clean.** Every hit is a placeholder (`sk_test_your-secret-key`), a redaction test fixture (`sk_live_abc123`), or documentation |
| Supabase `service_role` key in the frontend | `grep -rn "service_role|SUPABASE" frontend/src electron` | **Clean — no match at all.** The frontend never talks to Supabase. It reads exactly two env vars: `VITE_API_URL` and `VITE_CLERK_PUBLISHABLE_KEY` (a publishable key, safe by design) |
| Secret in git history | `git log -p` scanned for JWT/AWS/live-key shapes and credentialed connection strings | **Clean.** Only literals like `postgresql://user:pass@host` and `[ref]:[password]` placeholders exist |
| Secrets in `config/*.json` | parsed and scanned every string under a key/secret/token/password path | **Clean.** Config holds prices, limits and feature switches; every credential is read from the environment |
| Admin token hardcoded | `grep` for a default admin token | **Clean.** `X-Admin-Token` is compared against an env value with `hmac.compare_digest`; there is no default |

**But the public repo does expose two things you should decide about**, and they
are not "leaks" so much as disclosures:

1. **`docs/SECURITY_AUDIT.md` and `docs/LAUNCH_READINESS.md` publish an
   *unfixed* weakness list** — local SQLite unencrypted, `'unsafe-eval'` still in
   the packaged CSP, cross-tenant 404s not logged, dependencies not hash-locked,
   images not digest-pinned. That is an attacker's prioritised to-do list, and it
   is public right now.
2. **`tools/generate_license.py`, `backend/licensing.py` and the admin console
   source are public** — the licence scheme (HMAC over a payload, SHA-256
   fingerprint stored, revocation wins) is documented as a design, not as a
   secret, and it is sound on the assumption the signing key stays server-side.
   Worth a second pair of eyes before you widen distribution.

If the intent is a *review*, a curated paste (this document + the files below) is
strictly safer than a public repository. If the intent is a *portfolio*, the repo
is already serving that purpose and the fix is to move the two audit documents to
a private location, not to unpublish the code.

---

## 1. What it is supposed to do (the two-line description to grade against)

> Co-op is an offline-first business system for small wholesalers and retailers:
> products, stock, customers, orders, invoices, receivables and reports, running
> as a desktop app with a local database that syncs to the cloud, plus an AI
> assistant that answers only from the business's own verified records and can
> never change data.
>
> It is sold per business in USD ($29 / $99 a month), not per seat, for the
> customer who cannot afford the system to be down or to be wrong.

Full feature-by-feature grading of the code against that intent, including what
is missing, is in **`docs/APP_OVERVIEW.md`**. The file tree is in
**`docs/FILE_TREE.md`**.

---

## 2. File tree (condensed; full list in `docs/FILE_TREE.md`)

```
Co-Op/
├── backend/                     135 files — FastAPI, SQLAlchemy (async), 471 tests
│   ├── main.py                  3,950 lines · 92 routes · the whole HTTP surface
│   ├── models.py                  878 lines · 25 tables · the schema
│   ├── schemas.py                  ~500 lines · Pydantic request/response contracts
│   ├── clerk_auth.py              199 · JWKS verification, token claims
│   ├── team.py                    157 · roles + WRITE_MATRIX (path → roles)
│   ├── rls.py                      98 · Postgres tenant GUC for RLS
│   ├── database.py                 88 · lazy engine, session factory
│   ├── ratelimits.py               89 · imports / exports / writes
│   ├── ai/                      10 files · the assistant
│   │   ├── prompts.py             159 · the contract the model must obey
│   │   ├── service.py             285 · context → prompt → model → validate
│   │   ├── schemas.py              88 · AiChatResponse (validated reply)
│   │   ├── actions.py             ~200 · the only action: DRAFT_ORDER
│   │   ├── lessons.py             417 · invisible memory (mistakes + habits)
│   │   ├── context.py / forecast.py / history.py / usage.py / ratelimit.py
│   │   └── providers/openrouter.py
│   ├── invoicing.py               318 · numbering, one-per-order, status machine
│   ├── receivables.py             ~250 · balances computed from payments
│   ├── billing.py                 531 · plans, trials, credits
│   ├── payments.py                427 · checkout, verify, webhook application
│   ├── paystack.py                ~380 · the provider client (HMAC, amounts)
│   ├── licensing.py               440 · signed keys, fingerprints, revocation
│   ├── reports/                 3 files · sales / P&L / inventory / customers
│   ├── exports/                 3 files · CSV / XLSX / PDF renderers
│   ├── importer.py               · 5-step import with per-row errors
│   ├── backups.py                · encrypted export / restore
│   ├── audit.py                  · append-only mutation log
│   ├── alembic/versions/         24 migrations (0001 … 0024_tax_defaults)
│   └── tests/                   48 modules · 471 passed, 6 skipped
├── frontend/                    180 files — React + TS + Vite + Ant Design
│   └── src/
│       ├── App.tsx               · router, Clerk provider, guards
│       ├── pages/                18 areas: Dashboard, Products, Inventory,
│       │                         Customers, Orders, Invoices, Receivables,
│       │                         Reports, CoopAi, Briefing, Billing, Sync,
│       │                         Settings, Team, Support, Admin, Welcome
│       ├── ai/                   · ask.ts (deterministic answers), client, types
│       ├── billing/              · plans.ts (the price catalogue), useBilling
│       ├── components/ui/        · the design system (CoopButton, CoopCard…)
│       ├── services/api/         · one API client, one error shape
│       └── imports/              · the 5-step import UI
├── electron/                    35 files — desktop shell
│   ├── main.js / preload.js / security.js
│   ├── db/                       8 files · local SQLite schema + queries
│   ├── sync.js                   · idempotent queue, conflict handling
│   ├── updater.js                · auto-update
│   └── test/, e2e/               · 82 tests incl. a real-runtime harness
├── supabase/                      6 files — generated schema snapshot + bucket + RLS
├── config/                        3 files — production / development / testing
├── docs/                         25 files — audits, readiness, business + this packet
├── website/                      13 files — static marketing site
├── scripts/                       4 files — seed_demo, stress_test, paystack smoke
├── samples/                      11 files — example CSVs for the importer
├── tools/                         2 files — licence minting, schema inspection
├── .github/workflows/             2 files — CI (5 jobs) + desktop release
├── .env.example, .gitleaks.toml, .commitlintrc.json, pyproject.toml, alembic.ini
└── Documents/ (100) · stitch_coop_design_system_foundation/ (67) — reference only
```

---

## 3. Read in this order

You said the schema and the auth layer decide whether this is salvageable. Agreed,
and that is the order below.

### 3.1 `backend/models.py` — the schema (878 lines, 25 tables)

The tables that carry the design:

| Table | Why it matters |
|---|---|
| `businesses` | the tenant; `owner_id` is the Clerk subject. Carries `tax_id`, `registration_number`, `tax_rate`, `tax_label` |
| `products` / `stock_movements` | stock is not a number you set, it is the sum of an append-only ledger |
| `orders` / `order_items` | `unit_price` snapshotted per line; `tax_rate` snapshotted per order |
| `invoices` | has **no money columns** — it points at the order. `CREATE UNIQUE INDEX (business_id, number)` and `(business_id, order_id)` |
| `order_payments` | append-only money received; the balance is computed, never stored |
| `ai_usage` | one row per answered AI turn; credits are the sum for the month |
| `subscriptions` | plan, trial window, licence window — expiry is a pure function of the dates, no scheduler |
| `licenses` | **fingerprint only**, never the key |
| `audit_log` | append-only, `business_id` scoped |

Reviewer questions worth asking of this file: is every child table carrying
`business_id` (it is — 19 of them), and is every uniqueness constraint
tenant-scoped rather than global (they are; SKU and customer email use *partial*
indexes scoped to the tenant, so a soft-delete frees the value).

### 3.2 `backend/clerk_auth.py` (199) + `backend/main.py::get_current_business` (line 282)

The single choke point. Verification is RS256 against Clerk's JWKS, issuer and
audience checked, and a dev-only auth seam (`COOP_TEST_AUTH_USER`) that
**raises in production**. Tenant resolution then happens in exactly one place:

```
verify_clerk_token           → ClerkUser (sub, email, azp)
get_current_business         → Business row + role
  ├─ owner?  match businesses.owner_id
  ├─ member? match business_members.user_id
  └─ neither → provision a new business (never from the request body)
      request.state.team_role = role
      team_mod.assert_can_write(role, method, path)     ← fails closed
      set_tenant_context(db, business.id)               ← Postgres RLS backstop
```

That is the correct shape: one dependency, one role check, one tenant context,
and every route below it inherits all three. **The unauthenticated surface is now
pinned by a test** (`backend/tests/test_public_surface.py`, added in this pass):
it enumerates the real router with no auth override and asserts every path either
refuses an anonymous caller or is on an explicit allow-list, so adding a public
route is a decision recorded in code rather than an accident.

What that sweep found, before the test existed: exactly six route/method pairs
answer without a token, and all six are justified —

| Path | Why it is public |
|---|---|
| `GET /` | service banner, no data |
| `GET /healthcheck` | liveness for the platform and CI |
| `GET /billing/payment-config` | the pricing page's own catalogue; no tenant data, no secret (see below) |
| `POST /webhooks/paystack` | HMAC-SHA512 over the raw body; a bad signature is 401 |
| `GET /admin/licenses`, `POST /admin/generate-license`, `POST /admin/licenses/revoke` | shared secret in `X-Admin-Token`; with no token configured they answer **503 (closed)**, never 200 |

`/billing/payment-config` is the only one worth reading line by line, because a
"config" endpoint is a classic place to leak a key. It returns
`backend/paystack.py:public_config()` and nothing else: `provider`, `enabled`,
`currency`, `intervals`, and per plan `checkout_url` + `prices_kobo` +
`checkout_enabled`, plus a boolean `verification`. There is no
`PAYSTACK_SECRET_KEY`, no `public key` either — checkout is a redirect to a
hosted page, so the browser never needs one. The hosted page URL
(`paystack.com/pay/<code>`) and the prices are both already public on the
pricing page; `verification` is a bare boolean saying whether the backend can
confirm a charge. **No tenant data, no secret, no enumeration.**

### 3.3 `backend/team.py` (157)

`WRITE_MATRIX` maps a path prefix to the roles allowed to write there, and
"anything not listed" defaults to owner/manager. `OWNER_ONLY_PREFIXES` covers
team management, licences, backups and settings. Roles: owner, manager, sales,
inventory, accountant, viewer.

### 3.4 The AI, in three files

1. **`backend/ai/prompts.py` (159)** — the contract. Nine hard rules, of which the
   first is *every number must exist in the verified context, or say you do not
   have it*, and the third is *you never execute anything*. The reply must be a
   single JSON object with `type`, `kind` (one of six allowed), `title`,
   `message`, `basis`, `follow_ups`, `links`, `actions`.
2. **`backend/ai/service.py` (285)** — builds the context with read-only SQL,
   checks credits, calls the model in JSON mode, parses with Pydantic
   (`ai/schemas.py`), **one repair retry**, then validates links and actions.
   Failure is an honest 503, never a fabricated answer.
3. **`backend/ai/actions.py`** — `ACTION_REGISTRY` contains exactly one entry,
   `DRAFT_ORDER`, and `validate_actions` resolves the customer and product
   against **live rows** (stock, price, ambiguity) before the UI may show a draft.
   A rejection is ground truth, and it is written to the lesson ledger.

The learning layer (`ai/lessons.py`, 417) is the unusual part: a mistake is
graded 1–5 by what it would have cost; a habit needs two independent mentions
before it can shape an answer; model-authored habits pass `sanitize_preference`
first; and nothing about any of it appears in the UI.

### 3.5 The money modules

- **`invoicing.py` (318)** — `create_for_order` refuses a second invoice for an
  order, allocates the next number and lets the **unique index** be the real
  guard (on collision it retries rather than trusting a count).
- **`receivables.py`** — paid and balance are computed from `order_payments`;
  nothing is stored that can drift.
- **`billing.py` (531)** — credits are `plan allowance − SUM(ai_usage this month)`.
  There is no balance column to get out of sync.
- **`payments.py` / `paystack.py`** — amounts come from the server, the webhook is
  HMAC-SHA512 over the raw body, and a charge only becomes `success` after
  verification. A browser return proves nothing.

### 3.6 `backend/main.py` (3,950) — 92 routes

Read the decorators for shape, then these handlers for substance:
`POST /orders` (price snapshot + stock move), `POST /invoices`,
`POST /orders/{id}/payments`, `POST /billing/checkout`,
`POST /webhooks/paystack`, `POST /sync/push`, `GET /platform/investor-metrics`.

### 3.7 Flags and calculation logic (the answer to your third question)

- **Flags:** `config/<env>.json` has a `features` block (`dashboard`, `orders`,
  `inventory`, `customers`, `aiAssistant`, `reports`, `cloudSync`) — **and
  nothing reads it.** That is a genuine finding: the flags are decorative, so
  "turn a feature off per environment" does not actually work. Either wire them
  or delete them; leaving dead switches in a config is how an operator ships a
  change that does nothing.
- **Pricing:** `config/<env>.json → paystack.prices_kobo` (cents) is what the
  card is charged; `frontend/src/billing/plans.ts` is what the customer reads.
  They must agree, and a test pins both.
- **Tax:** `tax_rate` (percentage) and `tax_label` are per business, snapshotted
  onto each order, exclusive (added on top of the line total), defaulting to
  0% / "Tax". Revenue reporting stays net of tax.
- **Credits:** `ai.credits_per_request` + `credits_per_1k_output_tokens`, applied
  in `ai/service.py` and summed in `billing.py`.

---

## 4. Findings worth your attention before you read anything else

> An external security review was run against this code on 2026-10-23 and every
> finding was worked through — ten numbered, six low, each with the test that
> now pins it. The disposition, including three recommendations deliberately
> left open, is in **`docs/SECURITY_FIXES_2026-10-23.md`**. Read it alongside
> this section; the items below are what remains.

1. **Dead feature flags** (§3.7). Config promises per-environment switches that
   no code consults. *Not fixed* — wiring them changes behaviour per environment,
   which is a product decision, not a cleanup.
2. **`backend/main.py` is 3,950 lines and holds 92 routes.** Logic lives in
   modules, but the HTTP layer is one file; that is a merge-conflict and
   navigation cost, not a correctness bug. It also *caused* a real
   authorization bug (a path-prefix check that never matched
   `/business/settings`), which is why splitting it is the next structural
   change rather than a tidy-up.
3. ~~The unauthenticated surface is not pinned by a test.~~ **Fixed in this
   pass** (`backend/tests/test_public_surface.py`), after the sweep showed the
   surface is sound. See §3.2.
4. **Two documents in a public repo publish unfixed weaknesses** (§0). The code
   is clean of secrets; the *narrative* is the exposure.

---

## 5. What has been verified vs what has only been asserted

| Claim | How it is backed |
|---|---|
| Tenant isolation | `test_tenant_isolation.py` plus a tenant-scoped test in most domains (invoices, audit, backups, forecast, history, trial, onboarding, customer email reuse) |
| Roles fail closed | matrix tests + a test that a manager gets 403 on `/licenses` |
| Webhook cannot be forged | signature test + a test that a tampered body is rejected |
| Amounts come from the server | the checkout route builds the amount from the config catalogue, never from the request body, and the tests assert the exact figure sent for each plan. (The `999999999` test proves a *webhook* body tampered in flight fails the signature check; it is not a client-amount test) |
| The AI cannot invent a number | answer-contract tests; a fabricated figure fails schema validation and returns 503 |
| The AI cannot act | the registry has one action; a second action type in a reply is rejected |
| Stock cannot go negative | adjustment and order tests |
| Invoice numbering is sequential per tenant | unique index + a retry path + tests |
| The demo data reconciles | `test_investor_metrics.py` asserts totals, numbering and stock |
| **No live payment has ever been made** | stated in `docs/LAUNCH_READINESS.md`; the live smoke test requires `COOP_PAYSTACK_LIVE=1` and network egress |
| **RLS has never been functionally tested** | the test skips without `TEST_DATABASE_URL` |
| The anonymous surface is exactly six endpoints | `test_public_surface.py` sweeps the live router for it |

---

## 6. Suggested review questions (the ones I would ask)

1. Does `get_current_business` have any path where a request body can influence
   which tenant is used? *(It should not.)*
2. Can an invoice total ever disagree with its order? *(It has no total.)*
3. Is there any route that mutates without `assert_can_write`?
4. What happens when the model returns valid JSON with a plausible but invented
   number — is the contract enforcement real or advisory? *(Pydantic + prompt; the
   real defence is that the context is the only source of numbers.)*
5. Does the sync path allow a client to create a row for another tenant?
6. Is the licence HMAC key server-side only, and is revocation checked *after*
   signature verification?
