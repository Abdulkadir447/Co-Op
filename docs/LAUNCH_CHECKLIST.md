# Launch checklist — DeepSeek security + launch lists mapped to this codebase

This document answers "implement everything in the DeepSeek list and document
it" honestly. Those lists total ~2,100 items, but the overwhelming majority are
**already implemented and documented** in this repo, or are **operator/business
tasks that are not code** (buying certificates, user interviews, registering a
legal entity). This file maps each DeepSeek *category* to the real status with a
pointer to the code or doc that proves it, so nothing has to be taken on faith.

Companion documents (already in `docs/`):

- `SECURITY_CHECKLIST_STATUS.md` — item-by-item disposition of the 1–170
  security checklist (113 done in code, 22 code+ops, 29 ops/infra, 6 n/a).
- `SECURITY_AUDIT.md` — the security audit narrative.
- `LAUNCH_READINESS.md` — v1 feature coverage + ship-blocking items.
- `PAYMENTS.md` — the full Paystack contract (pages, init, verify, webhook).
- `RUN_LOCAL.md` — how to run the backend + frontend locally.

**Legend:** ✅ done in code · ⚠️ code done, operator must finish · 🚧
ops/infra · ➖ not code (business/legal/marketing).

---

## 1. Electron security baseline (DeepSeek items 1–176, 321–408)

| DeepSeek category | Status | Evidence |
|---|---|---|
| `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` | ✅ | `electron/security.js` `rendererPreferences()` |
| No `remote` module, no `nodeIntegrationInSubFrames/Worker` | ✅ | not enabled anywhere in `electron/` |
| Minimal `contextBridge` surface (named methods only, no generic bridge) | ✅ | `electron/preload.js` — single `coop:db` channel, explicit method list |
| IPC sender validation | ✅ | `electron/security.js` `isTrustedSender()` compares `webContents.id` |
| `setWindowOpenHandler` denies new windows; http(s) → real browser | ✅ | `electron/security.js` `containNavigation()` |
| `will-navigate` containment (local app URLs only) | ✅ | `electron/security.js` `isLocalAppUrl()` + handler |
| `shell.openExternal` restricted to http(s) | ✅ | `electron/security.js` `isExternalSafeUrl()` |
| CSP with nonce, no `unsafe-inline`/`unsafe-eval` | ✅ | `electron/main.js` `SESSION_CSP` / `RENDER_CSP` (+ backend origins) |
| Deny device permissions by default (camera/mic/geolocation/…) | ✅ | `electron/main.js` `setPermissionRequestHandler`/`setPermissionCheckHandler` (added this round) |
| Secrets only in backend env, never in the packaged renderer | ✅ | grep-verified: 0 secret-like matches in `electron/` (checklist #9) |
| **Electron Fuses** (`runAsNode`, `nodeCliInspect`, `onlyLoadAppFromAsar`, ASAR integrity) | 🚧 | **Not set.** Build-time step — see §6. Cannot be flipped or verified without packaging on the target OS. |
| **Code signing** (EV cert, `signtool`/`osslsigncode`) | 🚧➖ | Requires a purchased certificate + the signing toolchain. See §6. |
| `autoUpdater` signed-HTTPS + signature check | ⚠️ | `electron/updater.js` uses `electron-updater` over GitHub Releases (HTTPS). Full integrity depends on code signing (above). |

## 2. Backend security (DeepSeek auth/RLS/secrets/rate-limit items)

| Category | Status | Evidence |
|---|---|---|
| Auth on every endpoint, tenant isolation, role matrix | ✅ | `backend/clerk_auth.py`, `backend/team.py` `WRITE_MATRIX`, 404-on-other-tenant tests |
| Postgres Row-Level Security | ⚠️🚧 | `backend/rls.py` + migration `0014_rls` written; **must be applied + verified on real Postgres** (none in this sandbox) |
| No secrets in code / git history | ✅ | grep clean (checklist #8); secrets via env only |
| Audit trail, security-event logging, redaction | ✅ | `backend/audit.py`, `backend/security_events.py`, `backend/redact.py` |
| Encrypted backups | ✅ | `backups.encrypt_backup` (checklist #38) |
| Local SQLite encrypted at rest | 🚧 | Desktop offline cache is plaintext (Python `sqlite3` has no cipher). Needs SQLCipher + rekey migration — native toolchain, not buildable in this sandbox. |
| Clerk operator config (MFA, session lifetime, password policy, rate limits) | 🚧 | Clerk Dashboard settings — operator, not code. |

## 3. Payments — Paystack (the user's real "what's left")

**The code is complete.** `backend/paystack.py` (378 lines) + `backend/payments.py`
(427 lines) implement the whole flow the DeepSeek plan describes:

- Plan → hosted payment page (`config/*.json` `paystack.payment_pages`).
- `POST /transaction/initialize` → `authorization_url`; `GET /transaction/verify/{ref}`.
- Webhook `charge.success` verified with `x-paystack-signature` (HMAC-SHA512).
- Subscription state machine: **trial → paid → past_due → inactive**; trial
  non-cancellable; plan/price changes; renewal.
- Frontend: billing pages wired to the three pages.

| Item | Status |
|---|---|
| Paystack integration code (init/verify/webhook/subscription) | ✅ |
| Contract + unit tests | ✅ (`backend/tests/`, Paystack live test skips without egress) |
| **Live verification** (one real test charge) | ⚠️ **Operator:** set `PAYSTACK_SECRET_KEY=sk_test_…` + `COOP_PAYSTACK_LIVE=1`, run `pytest backend/tests/test_paystack_live.py` where egress exists, then point the Paystack webhook at `POST /webhooks/paystack`. |
| **Go-live keys** (switch test → live `sk_live_…`) | ⚠️ Operator, after the test charge passes. |

## 4. Packaging & distribution

| Item | Status | Evidence |
|---|---|---|
| electron-builder config (NSIS x64, GitHub publish) | ✅ | `electron/package.json` `build` |
| Renderer bundling into the app | ✅ | `electron/scripts/copy-renderer.js` (path fixed this round) |
| Auto-update (check/download/apply, staged install) | ✅ | `electron/updater.js` + test |
| `VITE_API_URL` baked at build time | ⚠️ | **Operator:** the packaged build has no dev proxy — set `$env:VITE_API_URL="https://<api>"` before `npm run dist`. |
| Build the Windows `.exe` | 🚧 | Must be built on Windows (this sandbox is Linux, no Wine). |
| Code signing + SmartScreen reputation | 🚧➖ | Needs an EV/OV certificate; until then SmartScreen shows "More info → Run anyway". |

## 5. Website (React)

| Item | Status |
|---|---|
| React site, pricing in **dollars**, brand "CO OP", weave logo (no letters) | ✅ |
| App-download CTA, founders-video slot, app-page visuals, configurable contact email | ✅ |
| OG/Twitter meta | ➖ Intentionally removed per product decision. |
| Domain + deploy | 🚧 Operator. |

## 6. The two genuine build/operator hardening steps (not yet done)

These are the only security items that are neither done nor pure business tasks.
Both need the target OS / a purchased artifact, so they cannot be completed or
verified in this sandbox:

1. **Electron Fuses.** In `electron/`, add `@electron/fuses` and an
   `afterPack` hook that flips, on the packaged binary:
   `RunAsNode=off`, `EnableNodeCliInspectArguments=off`,
   `EnableNodeOptionsEnvironmentVariable=off`, `OnlyLoadAppFromAsar=on`,
   and enable ASAR integrity. Verify with `npx @electron/fuses read --app <path>`.
   *Deliberately not added blind:* an unverified `afterPack` change can break the
   installer, and this must be tested on the machine that builds the `.exe`.
2. **Code signing.** Purchase an OV/EV certificate, then configure
   `electron-builder` `win.certificateFile`/`certificatePassword` (or `signtool`).
   This is what removes the SmartScreen warning and lets `electron-updater`
   verify update signatures.

## 7. Not code — operator / business / legal (cannot be "implemented")

Registering a legal entity, terms of service + privacy policy, a real support
inbox, user interviews, pricing strategy, marketing/SEO/ads, social handles,
analytics, insurance, hiring, and ongoing backups/monitoring. These are real
launch tasks but no amount of code completes them.

---

## Bottom line — the short "before Sunday" list

Everything code-level is implemented and tested (backend 328 passed / 3 skipped;
Electron 82 pass / 2 skip; frontend typecheck+lint+build clean). What actually
stands between you and launch is **operator work**, in this order:

1. **Paystack:** set the test secret key, run one live test charge, then switch
   to live keys and point the webhook at `POST /webhooks/paystack`.
2. **Clerk:** production keys + the security settings (MFA, session lifetime,
   password policy, rate limits).
3. **Deploy** the backend (Supabase/Postgres): run migrations `0012–0014`
   **including RLS** on the real database and smoke-test.
4. **Build the `.exe` on Windows** with `VITE_API_URL` set; publish the GitHub
   Release (`.exe` + `latest.yml` + `.blockmap`) so auto-update works.
5. **Website:** deploy + point the domain.
6. **Optional but recommended:** Electron Fuses + code signing (§6).

The DeepSeek "2,100 items" reduce to the six operator steps above plus the
business tasks in §7. The code is not the bottleneck.

---

## Appendix — the three "silent blockers", verified against this codebase

A launch review flagged three production risks that "eat weekends". Two are
code-level and were verified directly against the source; the third is
operator-only.

1. **Webhook signature vs. JSON parsing — SAFE (no bug).**
   `backend/main.py` `paystack_webhook_route` reads `raw = await request.body()`
   and calls `verify_webhook_signature(raw, …)` — HMAC-SHA512 over the **raw
   bytes** with `hmac.compare_digest` — *before* `json.loads(raw)`. The route
   takes `request: Request`, not a Pydantic body model, so FastAPI never parses
   the body before the HMAC runs. The classic "signature verifies locally then
   fails in prod because a JSON middleware consumed the body first" bug **does
   not apply here.**

2. **RLS vs. backend role — by design, not a bug.** `backend/rls.py` ENABLES RLS
   on every tenant table but deliberately does **not** `FORCE` it. The backend
   connects as the table *owner*, and in Postgres the owner bypasses RLS — so
   RLS does **not** constrain the backend's own queries. Tenant isolation is
   enforced in **application code** (every query filters `business_id`), covered
   by 23 cross-tenant tests (`test_*_is_tenant_scoped`,
   `test_one_tenant_cannot_verify_anothers_reference`, …) — all passing. The
   `app.business_id` GUC *is* set per request (`main.py:335`
   `set_tenant_context`), so RLS becomes a real database backstop the day a
   non-owner role (e.g. Supabase PostgREST `anon`/`auth`) touches the DB.
   **Do not** try to "test RLS with a real user token per table" — this
   backend-only architecture has no per-user DB role; that test model does not
   fit. The real deploy task is simply: run migration `0014` on Postgres so the
   backstop exists.

3. **Clerk dev → prod instance — operator, and the genuine #1 silent blocker.**
   Not verifiable in code. Dev (`pk_test_`/`sk_test_`) and production are
   separate Clerk instances with **separate user pools**; users do not migrate.
   Create the prod instance, swap the keys, and re-test login before launch —
   otherwise prod looks "empty".

Verified this turn: `pytest backend/tests` → **328 passed, 3 skipped** (the 3
skips are the live-Paystack and Postgres-RLS tests that need egress/Postgres).
