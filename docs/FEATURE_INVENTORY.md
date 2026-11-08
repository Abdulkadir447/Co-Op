# Feature inventory — everything the app does, and what to secure in each

Built by reading the routes in `backend/main.py` (**91**), the pages in
`frontend/src/pages/` (**18**), the Electron shell and the website. Each area
lists: what the feature does, what data it touches, and its security posture
today. "Posture" refers to the controls in `docs/SECURITY_AUDIT.md`.

Universal controls that apply to **every** row below (not repeated):
tenant scoping via `get_current_business` → `_scoped()`, role gate via
`assert_can_write` (fails closed), Pydantic validation on input, `audit_log`
row on mutation, `no-store` on responses, security headers on every response.

## 1. Identity & access

| Feature | Routes / UI | Data | Posture |
|---|---|---|---|
| Sign-in / session | Clerk (external) + `GET /auth/me` | Clerk user id, email, azp | RS256 pinned, issuer verified, azp allow-list, dev seam refused in production |
| Tenant provisioning | auto-provision "My Business" on first `/auth/me` | `businesses` | owner_id from the verified token; never from the body |
| Team members & roles | `GET /team`, `PATCH/DELETE /team/members/{id}` | `business_members` | owner-only mutations; the last-owner guard prevents locking the tenant out |
| Invitations | `POST /team/invites/accept`, `DELETE /team/invites/{token}` | `business_invitations` | token-bound, email-matched, expires; accepting requires a verified email |
| Platform admin console | `/platform/*` (5) | cross-tenant aggregates | email/allow-list gate (`platform_admin.is_platform_admin`), refusals emit `platform_admin_rejected` |
| Licence admin | `/admin/*` (3) | `licenses` | shared secret in `X-Admin-Token`, constant-time compare, refusals emit `admin_token_rejected` |
| Role enforcement | all mutating routes | — | `WRITE_MATRIX` per surface; viewers/accountants cannot write; denial now emits `authz_denied` |

## 2. Catalogue & stock

| Feature | Routes / UI | Data | Posture |
|---|---|---|---|
| Products CRUD | `GET/PUT/DELETE /products`, `POST /products` | `products` | SKU/name uniqueness per tenant; cross-tenant 404 by test |
| Inventory adjustment | `POST /products/{id}/adjust` | `stock_movements` | append-only ledger, reason required, audited, stock cannot go negative |
| Movement history | `GET /products/{id}/movements` | `stock_movements` | read-only, tenant-scoped |
| Stock summary / risk | `GET /inventory/summary`, `/dashboard/low-stock` | derived | no writes |
| Categories | product field | `products` | free text, length-capped |

## 3. Sales

| Feature | Routes / UI | Data | Posture |
|---|---|---|---|
| Customers CRUD | `/customers` (4) | `customers` | unique email per tenant; delete is soft (`deleted_at`) |
| Orders | `POST/GET /orders`, `GET /orders/{id}`, `DELETE /orders/{id}` | `orders`, `order_items`, `stock_movements` | **server computes all money** (never trusts client totals); stock deducted on status transitions; delete is soft |
| Order status machine | `PUT /orders/{id}/status` | `orders` | validated transitions only (no `cancelled → delivered`); audited |
| Receivables (payments) | `POST/GET/DELETE /orders/{id}/payments`, `GET /receivables` | `order_payments` | overpayment refused, cancelled orders refused, balance recomputed server-side, audited |
| Invoices | `/invoices` (5), `GET /invoices/export` | `invoices` | sequential numbering per tenant (gap-free, DB-enforced), tax snapshot, PATCH restricted to status/notes |
| Tax / VAT (0021) | `PATCH /business/settings`, order fields | `orders.tax_*` | rate validated 0–100, **snapshotted per order** so a later rate change cannot reprice history |
| Reports | `GET /reports/meta`, `/reports/{key}`, `/reports/{key}/export` | derived | filter values validated (`FilterError` → 422); export rate-limited |

## 4. Import & export

| Feature | Routes / UI | Data | Posture |
|---|---|---|---|
| CSV import | `/imports/schema|preview|map|validate|commit` (5) | creates products/customers/orders | all-or-nothing transaction; commit is the only mutating step; capped (row/size limits); rate-limited 20/5min; `csvsafe` neutralises spreadsheet formula injection |
| Report export | `GET /reports/{key}/export` | derived | rate-limited 30/min, tenant-scoped |
| Invoice export | `GET /invoices/export` | `invoices` | same |
| Backup export / restore | `GET /backups/export`, `POST /backups/restore` | every tenant table | owner-only; restore is additive and audited; the file is a full tenant dump — **treat it as sensitive** (see gaps) |

## 5. Money & billing

| Feature | Routes / UI | Data | Posture |
|---|---|---|---|
| Plans | `GET /billing/summary`, `POST /billing/plan` | `subscriptions` | plan change is server-validated against `VALID_PLANS` |
| Trial | `POST /billing/trial` | `subscriptions` | one trial per business, `TRIALABLE_PLANS` only |
| Checkout | `POST /billing/checkout`, `GET /billing/payment-config` | `payments` | amount from the **server's** plan config, never the client |
| Payment verification | `POST /billing/payments/verify` | `payments` | verifies with Paystack before granting; a browser redirect alone grants nothing |
| Webhook | `POST /webhooks/paystack` | `payments` | HMAC-SHA512 over the raw body, constant-time compare, bad signatures emit `paystack_bad_signature` |
| Credits | `GET /ai/usage` + gate in `/ai/chat` | `ai_usage` | monthly ledger; 402 before an unaffordable request |
| Licences | `GET /licenses`, `POST /licenses/activate` | `licenses` | activation is a signed/minted token, not a self-asserted flag |

## 6. AI (Zeno)

| Feature | Routes / UI | Data | Posture |
|---|---|---|---|
| Chat advisor | `POST /ai/chat` | reads verified context; writes `ai_history`, `ai_usage` | model **never** queries the DB; strict JSON contract; numbers must come from context; rate-limited |
| Action proposals | `actions.py` registry (1 action) | resolved against live rows | the model can only propose `DRAFT_ORDER`; the user confirms; refusals become lessons |
| Learning ledger (0022) | `/ai/lessons` (3) | `zeno_lessons` | only `active` rows reach the prompt; a preference activates on its 2nd mention (no UI, no review step); model-authored text passes `sanitize_preference`; tenant-scoped 404s |
| Forecast | `GET /ai/forecast` | derived | deterministic trend maths, labelled a forecast |
| AI history | `GET/DELETE /ai/history` | `ai_history` | owner-visible activity ledger; clearing is explicit and tenant-scoped |
| Answer style | `PATCH /business/settings` | `businesses.ai_response_style` | enum-validated |
| Briefing / insights | `GET /dashboard/briefing` | derived | deterministic engine, evidence attached — the same source the AI is given |

## 7. Desktop (Electron)

| Feature | Where | Posture |
|---|---|---|
| Offline data layer | `electron/` + SQLite | local DB, per-device; `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` |
| Sync | `POST /sync/push`, `GET /sync/pull` | queue-based, per-tenant, conflicts resolved server-side; synced writes still audited |
| Auto-update | `electron/updater.js` | reads a signed-checking Updater feed (`latest.yml`); **no code-signing certificate yet** (see `docs/GO_LIVE_COSTS.md`) |
| Navigation containment | `electron/security.js` | external URLs blocked, `isTrustedSender` on IPC, `containNavigation` |

## 8. Operations & platform

| Feature | Routes | Posture |
|---|---|---|
| Health | `GET /healthcheck` | public by design; exposes only up/down, no version or stack detail |
| Audit log | `GET /audit` | read-only, tenant-scoped, newest first |
| Notifications | `GET /notifications/daily-summary`, `POST /notifications/summary/send` | delivery channel is env-configured; sends are idempotent per day |
| Feedback | `/feedback` (4) | cadence rules enforced server-side (anchor = trial or first charge) |
| Support | `POST/GET /support/issues` | now write-rate-limited (was unbounded while emailing) |
| Onboarding | `GET /onboarding/state` | read-only state machine |
| Settings | `GET/PATCH /business/settings`, `POST /business/logo` | 13-field allow-list; logo content-type allow-list + 5 MB cap |

## 9. Website

Static marketing site (`website/`) — no API calls, no user data, no auth. Its
only security surface is dependency hygiene; it is built separately from the app.

## What the inventory implies

**Three features carry essentially all the risk**, because they are the only
ones that (a) move money, (b) accept a file, or (c) talk to a third party:

1. **Money** — orders, payments, invoices, billing, webhook. Already the
   strictest area: server-computed totals, HMAC webhook, verified payments.
2. **Files** — logo upload and CSV import. Both capped and type-checked, but
   `GET /backups/export` produces a complete tenant dump: whoever holds that
   file holds the business. It is owner-only, but there is no expiry, no
   encryption at rest and no download audit beyond the `audit_log` row.
3. **Third parties** — Paystack (signature-verified), Clerk (JWKS-verified),
   Supabase Storage (service key, server-side only), OpenRouter (the model).

Everything else is CRUD behind a tenant filter, which is why the app's risk
profile is unusually narrow for something AI-branded: **the AI has no tools,
no database access and no network egress.** The moment any of those three
changes — a document-ingestion feature, an agent that can call APIs, a URL
fetcher — the entire C-phase (prompt injection, exfiltration, RAG poisoning)
in `docs/SECURITY_AUDIT.md` becomes live instead of "not reachable". That is
the line to defend in review.
