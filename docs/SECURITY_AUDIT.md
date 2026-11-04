# Security audit — the AI-app threat model, applied to THIS codebase

Not a generic checklist. Every row below was checked against the code in this
repository, and each one says **verified**, **fixed in this pass**, **gap** (real,
not fixed) or **manual** (cannot be verified from here — needs a live browser,
staging database, or a purchase).

Audited 2026-10-27 against `arena/06237ab6-co-op`. The earlier 20-item
OWASP/ASVS pass is preserved at `docs/SECURITY_AUDIT_2026-10-22_OWASP.md`. Re-run the greps in §7 before
trusting this document again.

## The short version

This app is **not** a typical "vibe-coded" app, and the reason is architectural
rather than careful: the browser never talks to the database. There is no
`supabase-js` in the frontend, no anon key in the bundle, no PostgREST path and
no client-side SQL. Every read and write is a FastAPI route that resolves the
tenant server-side.

That single decision deletes most of the attack surface in the brief:

| Attack in the brief | Why it does not apply here |
|---|---|
| RLS off → PostgREST enumeration → full dump (chain 1) | There is no PostgREST path from the browser. The DB is not reachable from it at all. |
| `service_role` in the browser | Only `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` server-side (`backend/storage.py`); the frontend references neither. |
| Firebase `allow read, write: if true` | No Firebase. |
| IDOR via `/rest/v1/table?id=eq.N` | Every list/detail route filters `business_id == caller` centrally (`_scoped()`), and cross-tenant access is a 404 by test. |
| Mass assignment (`role: admin`) | Every write body is an explicit Pydantic schema — `BusinessSettingsUpdate` lists 13 fields and cannot mutate `owner_id`/`id`. |

## Tier 0 — the first hour

| Item | Status | Evidence |
|---|---|---|
| Deny-by-default authz on every route | ✅ verified | One dependency, `get_current_business`, resolves tenant + role and calls `team_mod.assert_can_write(role, method, path)` — **fails closed**: unknown routes and unlisted methods are refused for non-owners. `ROLE_AGNOSTIC_PREFIXES` is the explicit, short allow-list. |
| RLS on every table | ✅ verified (code) / **manual** (live) | 20 tenant tables in `backend/rls.py`, each with `USING` **and** `WITH CHECK` (`tenant_isolation_<table>`). Deliberately **not** `FORCE`, so the owning role (the backend) is unaffected — documented in `rls.py`. Live verification needs `TEST_DATABASE_URL`; the suite skips it here. |
| Secrets out of the client bundle | ✅ verified | The bundle only ever contains `VITE_API_URL` and `VITE_CLERK_PUBLISHABLE_KEY` (public by design). Grep for `service_role\|sk_live\|secret_key` in `frontend/src` → 0 hits. |
| Edge rate limits on auth/model/upload/write | ⚠️ **partly fixed** | AI (`/ai/chat`), imports, exports already had limits. **Added this pass:** a shared `writes` limiter on the lesson ledger and `/support/issues` (was unbounded while sending email — an inbox flood). **Gap:** limits are in-process, so they reset on restart and do not hold across instances; v1 is single-instance, and Redis is the fix when that changes. |
| Webhook signature verification | ✅ verified | `paystack.verify_webhook_signature` — HMAC-SHA512 over the **raw** body, `hmac.compare_digest`. |
| Price recomputation server-side | ✅ verified | Order totals, tax and payments are computed in `create_order`/`payments`; a client-sent `total_amount` is never trusted. |

## Tier 1 — before real users

| Item | Status | Evidence |
|---|---|---|
| Schema validation + field allowlists | ✅ verified | Pydantic v2 on every body; whitelisted update schemas; `Query(ge=, le=)` on numeric params; `Float(ge=0, le=100)` on the tax rate. |
| Model output sanitised before render | ✅ mostly | The model returns a **strict JSON contract** (`_parse_reply`), the UI renders text through React (auto-escaped), and links are filtered against `ALLOWED_LINK_TARGETS` — a model cannot emit an arbitrary `href`. **Gap:** `kind`/`title` are not length-capped at the schema boundary. |
| Strict CSP with nonces on the app shell | ✅ **fixed this pass** | `frontend/nginx.conf` had **zero** security headers — the CSP existed only on API responses, which protects nothing (the document that runs the app is served by nginx). Now: CSP (`script-src 'self'`, no `unsafe-inline`/`unsafe-eval`, Clerk + Supabase origins), HSTS+preload, nosniff, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, COOP, CORP, `X-Permitted-Cross-Domain-Policies`. `style-src` needs `'unsafe-inline'` — Ant Design injects styles; documented trade-off, not an oversight. |
| `Cache-Control: no-store` on authenticated responses | ✅ **fixed this pass** | Neither tier set it. Now on every API response (middleware) and on `/api/` in nginx — one owner's receivables must not replay to the next person on a shared machine. |
| Treat ingested content as untrusted | ✅ by construction | The model never reads uploaded files, emails or web pages. Its only input is `build_context`, built from the tenant's own rows. Uploads are images (`content_type` allow-list, 5 MB cap) used as logos — never parsed as data. **This removes the entire indirect-injection class (C1–C9) by architecture, not by filtering.** |
| Token budgets / max agent steps / statement timeouts | ✅ partly | Credit ledger + per-month gate (`check_credits`), AI rate limit, one repair retry and no tool loop (single completion). **Gap:** no DB `statement_timeout`; a slow report can hold a connection. |
| Automated object-level authz tests | ✅ verified | Cross-tenant reads/writes assert 404 across products, customers, orders, payments, invoices, team, and lessons. |

## Tier 2 — structural

| Item | Status | Evidence |
|---|---|---|
| Tool least privilege | ✅ verified | `ACTION_REGISTRY` has exactly one entry (`DRAFT_ORDER`); the model cannot call anything else, and a proposal only executes after explicit user confirmation through the normal API. |
| Human confirm on writes | ✅ verified | Same — the AI never writes. |
| MCP allowlist / pinned tool hashes | n/a | No MCP, no agent tool loop, no RAG. Nothing to pin. |
| Per-tenant RAG namespacing | n/a | No retrieval layer. |
| Signed URLs / private buckets | ⚠️ **gap** | `storage.public_url()` is used for logos (fine — a logo is public by nature). `signed_url()` exists but nothing else uses it, because nothing else is uploaded. Revisit the moment invoices/attachments become uploadable: **do not** extend `public_url` to them. |
| Egress allowlist blocking link-local/metadata | ⚠️ **gap** | No user-supplied URL is fetched anywhere (no SSRF sink — verified by grep on `httpx`/`requests` call sites). But there is no egress allow-list either, so a future feature that fetches a URL would be unprotected. |
| Parameterised queries only | ✅ verified | ORM throughout. The only `text()` f-string is a constant GUC name in `rls.py`. No `ORDER BY` is built from user input. |

## Tier 3 — supply chain

| Item | Status | Evidence |
|---|---|---|
| Committed lockfile + `--frozen-lockfile` | ✅ verified | `pnpm-lock.yaml`; CI and `frontend/Dockerfile` use `--frozen-lockfile`. **Gap:** `backend/requirements.txt` mixes exact pins (`fastapi==`) with ranges (`sqlalchemy>=2.0.0`) and has no hash lock — a compromised or yanked release installs silently. |
| Actions pinned to SHAs | ✅ **fixed this pass** | All six actions in `ci.yml`/`desktop.yml` now reference 40-char commit SHAs with the version in a comment (resolved via `git ls-remote`, including the annotated `pnpm/action-setup@v3` tag). |
| `permissions: {}` on workflows | ✅ **fixed this pass** | `ci.yml` had none, so it inherited the repository default (possibly write). Now `contents: read`, per-job for the new scan. `desktop.yml` already restricted. |
| gitleaks pre-commit + history scan | ✅ **fixed this pass** | New `secrets` job with `fetch-depth: 0` (a key committed then deleted is still leaked) and `.gitleaks.toml` whose only exclusions are literal placeholders in docs/`.env.example`. |
| `pull_request_target` leaks | ✅ verified | Neither workflow uses it. |
| Digest-pinned images | ⚠️ **gap** | `postgres:16-alpine`, `python:3.11-slim`, `node:22-alpine`, `nginx:alpine` are tags, not digests. |
| `npm audit` signatures / safetensors | ⚠️ n/a-partial | No model artefacts are downloaded (no pickle, no safetensors). `npm audit` is not wired into CI. |

## Tier 4 — visibility

| Item | Status | Evidence |
|---|---|---|
| Audit log of data changes | ✅ verified | `audit_log` + `GET /audit`, one row per create/update/delete/status/adjust/import/plan change/restore, including offline-synced operations. |
| Structured audit of **authz decisions** | ✅ **fixed this pass** | `team.assert_can_write` now emits `security_event("authz_denied", role, method, route)` on every refusal, and a tripped rate limit emits `rate_limit_tripped` (keyed by a **hashed** user id, so no raw identifier reaches an alert webhook). `security_event` already logs at WARNING and POSTs to `SECURITY_ALERT_WEBHOOK` when configured, with `deep_redact` applied. Pinned by `test_security_baseline.py`. **Gap that remains:** cross-tenant 404s are not events — a probe for another tenant's order is indistinguishable from a typo. |
| Alerting (403 spikes, egress, spend, webhook failures) | ⚠️ **partly** | The delivery path exists: `SECURITY_ALERT_WEBHOOK` receives every `security_event` (bad Paystack signature, rejected admin token, rejected platform admin, and now authz denials + rate-limit trips). What is missing is the *rules on the receiving end* — nobody is paged on a spike. Wire the webhook to a channel and add threshold rules. |
| Quarterly external pentest | manual | Not a code task. |

## Headers baseline

| Header | API (FastAPI) | Web app (nginx) |
|---|---|---|
| `Strict-Transport-Security` | prod only, `max-age` 2y | **added**: `includeSubDomains; preload` |
| `Content-Security-Policy` | `default-src 'none'` | **added**: app CSP (see Tier 1) |
| `X-Content-Type-Options` | ✅ | **added** |
| `Referrer-Policy` | `no-referrer` | **added**: `strict-origin-when-cross-origin` (the baseline you specified) |
| `Permissions-Policy` | ✅ (extended) | **added**, incl. `payment=(), usb=()` |
| COOP / CORP | **added** | **added** |
| `Cache-Control: no-store` | **added** | **added** on `/api/` |

## The five chains, tested against this app

1. **RLS off → PostgREST enumeration → dump.** *Not reachable.* No PostgREST
   client, no anon key, no DB credentials in the bundle. RLS remains a
   second-layer backstop for a future non-owner DB role.
2. **IDOR + token in localStorage → takeover.** *Mitigated.* Tenant scoping is
   central and cross-tenant is a 404 by test; the token lives in Clerk's own
   storage and is a short-lived session token, not a long-lived API key.
3. **Indirect injection + exfil tool → tenant theft.** *Not reachable.* No
   document ingestion, no tools, no egress. The model's only inputs are the
   caller's own verified rows, and its only output path is a JSON contract.
4. **Prompt-leaked keys + SSRF → cloud credentials.** *Not reachable.* The
   system prompt contains no secrets (it is a static string plus context), and
   there is no URL-fetching sink to chain into.
5. **Webhook forgery + referral loop → free product.** *Mitigated.* HMAC-SHA512
   over the raw body with a constant-time compare, and plans are granted by the
   server after verifying with Paystack (`/billing/payments/verify`), not by
   anything the client sends.

## What is still missing, in the order I would fix it

1. **Log cross-tenant 404s.** Authz *refusals* are now events, but a request for
   another tenant's object still returns a plain 404 with no signal — an IDOR
   probe looks exactly like a typo in an id. Add the event at the scoping
   helper, then alert on it.
2. **Hash-lock the Python dependencies** (`pip-compile` → hashes, or
   `uv lock`). This is the cheapest remaining supply-chain win.
3. **`statement_timeout` on Postgres sessions** — a report query should not be
   able to hold a connection indefinitely.
4. **Digest-pin the container images.**
5. **Electron CSP: drop `'unsafe-eval'` for packaged builds.** `electron/main.js`
   keeps it for the Vite dev runtime; a packaged renderer does not need it, and
   it is the one place a strict CSP is weakened in a shipped artefact. I did not
   change it in this pass because the desktop build cannot be executed in this
   environment — an untested CSP change can white-screen the app, which is worse
   than the finding.
6. **A staging run of the RLS test** (`TEST_DATABASE_URL`) so the 20 policies are
   proven on Postgres rather than asserted against source.

## §7 — re-run these checks

```sh
# secrets in the client bundle
grep -rniE "service_role|sk_live|secret_?key" frontend/src
grep -rhoE "VITE_[A-Z_]+" frontend/src | sort -u     # expect only API_URL + CLERK key

# SQL built from strings
grep -rn 'text(f"\|execute(f"' backend/*.py | grep -v tests

# routes with no authz dependency
grep -n "@app\." backend/main.py | wc -l
grep -c "Depends(get_current_business)" backend/main.py

# headers actually served
curl -sI https://<host>/ | grep -iE "content-security|strict-transport|referrer|cache-control"

# rate limits present
grep -rn "Depends(enforce_" backend/main.py
```
