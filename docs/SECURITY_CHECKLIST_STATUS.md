# Co-op — full security checklist status (1–170)

Item-by-item disposition of the master checklist. This is the accountability
twin of `SECURITY_AUDIT.md`: every number gets a status and the evidence, so
"done" is always checkable.

Legend:

* ✅ **done** — implemented and (where possible) asserted by a test in this repo.
* ⚠️ **partial / operator** — the code side is done, but a dashboard or review
  step outside the repo must be finished before launch.
* 🚧 **ops / infra** — genuinely outside this codebase (Clerk, Supabase, CI,
  monitoring). Tracked as an operational task, not silently ignored.
* ➖ **n/a** — the feature the risk depends on does not exist.

---

## P0 1–35

| # | Status | Evidence |
|---|--------|----------|
| 1 | ✅ | Server-side role matrix `backend/team.py` `WRITE_MATRIX`; nothing trusted from the client |
| 2 | ✅ | `backend/tests/test_tenant_isolation.py`: second tenant gets 404 |
| 3 | ✅ | every repository query filters `business_id` |
| 4 | ✅ | 65 routes `Depends(get_current_business)`; only `/` + `/healthcheck` public |
| 5 | ✅ | `/admin/*` require `X-Admin-Token` (503 unconfigured, 403 mismatch) |
| 6 | 🚧 | Supabase RLS: 0 policies today; add before any table is exposed client-side |
| 7 | 🚧 | same as 6 |
| 8 | ✅ | `grep -rnIE "service_role\|sk-[A-Za-z0-9]{16,}\|AKIA[0-9A-Z]{12}" .` → 0 |
| 9 | ✅ | no secret in `electron/`; `PAYSTACK_SECRET_KEY` etc. are backend env-only |
| 10 | ✅ | `backend/config.py` reads DB URL from env; no literal creds |
| 11 | ✅ | `OPENAI_API_KEY` from env |
| 12 | ✅ | Gmail/OAuth deferred; nothing hardcoded |
| 13 | ✅ | `.env` gitignored; only `.env.example` committed; one source of truth (root) |
| 14 | ✅ | no secrets committed |
| 15 | ✅ | nothing was ever committed, so nothing to scrub from history |
| 16 | ⚠️ | auth strength is Clerk's — verify policy in the dashboard |
| 17 | ✅ | Clerk JWKS; the `COOP_TEST_AUTH_USER` seam **raises in production** |
| 18 | ⚠️ | Clerk-hosted |
| 19 | ⚠️ | Clerk-hosted |
| 20 | ⚠️ | Clerk-hosted |
| 21 | ⚠️ | Clerk session settings |
| 22 | ⚠️ | Clerk revocation |
| 23 | ⚠️ | enable MFA for owners in Clerk |
| 24 | ⚠️ | Clerk stores the session; frontend keeps only the token in memory |
| 25 | ⚠️ | Clerk-hosted pages |
| 26 | ⚠️ | Clerk |
| 27 | ⚠️ | Clerk |
| 28 | ⚠️ | Clerk |
| 29 | 🚧 | Clerk logs sign-in; Co-op logs business mutations to `audit_log` |
| 30 | ✅ | role changes only via `/team/invites`, re-checked server-side |
| 31 | ✅ | no interpolated SQL; SQLAlchemy bound params |
| 32 | ➖ | no NoSQL store |
| 33 | ✅ | every `/{id}` scoped to caller's business (tenant test) |
| 34 | ✅ | `WRITE_MATRIX` function-level checks |
| 35 | ✅ | `ProductUpdate` omits `current_stock`; stock only via `/adjust` (`schemas.py:46`) |

## P1 36–75 (API + Electron)

| # | Status | Evidence |
|---|--------|----------|
| 36 | ✅ | all routes authed except `/`, `/healthcheck`; admin token-gated |
| 37 | ✅ | `/ai/chat`, `/imports/commit`, `/reports/{key}/export` rate-limited |
| 38 | ✅ | credits enforced with 402 + per-user limiters |
| 39 | ✅ | see 4 |
| 40 | ✅ | see 5 |
| 41 | ✅ | ids resolved scoped to the caller's business |
| 42 | ✅ | business derives from the Clerk token, never a parameter |
| 43 | ✅ | user id derives from the token |
| 44 | ✅ | pydantic schemas + role matrix restrict writable fields |
| 45 | ⚠️ | responses contain no secrets (`public_config`); trim payloads in a review pass |
| 46 | ⚠️ | same as 45 |
| 47 | ✅ | test seam raises in production; `/docs` can be disabled at the proxy |
| 48 | ➖ | single API version |
| 49 | ✅ | route inventory + `scripts/audit_ui_links.py` (0 dead/unrouted) |
| 50 | ✅ | admin routes token-gated |
| 51 | ✅ | `electron` pinned to `33.4.11` (exact) |
| 52 | ✅ | `nodeIntegration: false` |
| 53 | ✅ | `contextIsolation: true` |
| 54 | ✅ | `sandbox: true` |
| 55 | ✅ | `will-navigate` denies non-`file:`/`devtools:` |
| 56 | ✅ | sandbox + isolation |
| 57 | ✅ | `webSecurity` left at its secure default (never disabled) |
| 58 | ✅ | per-env CSP via `onHeadersReceived`; API adds a strict CSP header |
| 59 | ✅ | no `script-src *`; CSP is `default-src 'none'` on the API |
| 60 | ✅ | navigation denied (60 = 55) |
| 61 | ✅ | `setWindowOpenHandler` → `{action:'deny'}` |
| 62 | ✅ | `isExternalSafeUrl` = http(s) only, re-checked in main |
| 63 | ✅ | preload exposes named methods only |
| 64 | ✅ | no generic invoke channel |
| 65 | ✅ | every IPC channel (`coop:db`, `coop:backup`, `coop:shell`) re-checks `event.sender` against the main window's WebContents; args still validated |
| 66 | ✅ | no IPC handler trusts renderer-provided authorization |
| 67 | ✅ | backup paths come from a native dialog; db path fixed |
| 68 | ✅ | no command execution over IPC |
| 69 | ✅ | no file deletion over IPC |
| 70 | ✅ | data-layer IPC is an allow-list of methods |
| 71 | ✅ | renderer loads only the packaged `renderer-dist` |
| 72 | ✅ | no custom protocol registered |
| 73 | ✅ | no `<webview>` |
| 74 | ✅ | no `<webview>` |
| 75 | ✅ | no extra Electron permissions granted |

## P1 76–100 (secrets + input)

| # | Status | Evidence |
|---|--------|----------|
| 76 | ✅ | frontend sees only the Clerk *publishable* key |
| 77 | ✅ | no secrets in `src`, hence none in source maps |
| 78 | ✅ | no secrets in build output |
| 79 | 🚧 | CI secrets via GitHub env (auto-masked); keep out of `echo` |
| 80 | ✅ | 500 handler scrubs secret shapes (`redact.scrub_text`) before logging; audit diffs redacted (`redact.deep_redact`) |
| 81 | ➖ | no crash reporter |
| 82 | ✅ | clients get a generic `Internal server error.` |
| 83 | 🚧 | GitHub masks secrets in logs |
| 84 | 🚧 | use distinct secrets per env (runbook) |
| 85 | 🚧 | rotation runbook |
| 86 | 🚧 | least-privilege cloud creds |
| 87 | 🚧 | Supabase network restrictions |
| 88 | 🚧 | close unused DB ports |
| 89 | 🚧 | no dev creds in prod |
| 90 | 🚧 | prod creds on need-to-know |
| 91 | ✅ | pydantic validation server-side |
| 92 | ✅ | React escapes; exports escape cells |
| 93 | ✅ | no `dangerouslySetInnerHTML` |
| 94 | ✅ | React escapes |
| 95 | ✅ | no `innerHTML`/`document.write` |
| 96 | ✅ | no HTML injection surface |
| 97 | ✅ | no user-content markdown rendering |
| 98 | ✅ | no rich-text renderer |
| 99 | ✅ | import cap 5 MB, csv/xlsx only, server parse with per-row errors |
| 100 | ✅ | `backend/csvsafe.py` (+ `test_export_safety.py`) |

## P2 101–120 (files + AI)

| # | Status | Evidence |
|---|--------|----------|
| 101 | ✅ | 5 MB cap |
| 102 | ✅ | csv/xlsx only |
| 103 | ✅ | uploads parsed in memory, never stored/served |
| 104 | ✅ | nothing persisted at a URL |
| 105 | ✅ | exports scoped to the caller's business |
| 106 | ✅ | config env validated against an allow-list; no path param reaches `open()` |
| 107 | ✅ | export filenames sanitised (`safe_title`) |
| 108 | ✅ | no temp files with data |
| 109 | ✅ | nothing written to temp |
| 110 | ✅ | restore only when the sync queue is empty; local dialog-chosen file |
| 111 | 🚧 | document that backups are local plaintext; add encryption if they leave the device |
| 112 | ⚠️ | local SQLite mirror is by design (offline-first); documented in ADR-002 |
| 113 | ✅ | Zeno answers from a verified, validated context |
| 114 | ✅ | AI reads only business-scoped data; fixed action registry |
| 115 | ✅ | context built per business before the model sees it |
| 116 | ✅ | answers come from the tenant's own data; no secrets surfaced |
| 117 | ✅ | AI output is never an authorization decision; actions re-checked server-side |
| 118 | ✅ | actions require user confirmation; capability set is small |
| 119 | ✅ | AI JSON validated against schemas before render/action |
| 120 | ✅ | credit allowance + 402 + rate limit |

## P2 121–150 (SSRF, crypto, supply chain, ops)

| # | Status | Evidence |
|---|--------|----------|
| 121 | ✅ | backend never fetches a user-supplied URL (Paystack base is fixed) |
| 122 | ✅ | webhook is inbound-only; no fetch on receipt |
| 123 | ✅ | no outbound webhook URL is user-configurable |
| 124 | ✅ | `x-paystack-signature` required (401 otherwise) |
| 125 | ✅ | idempotent on unique `reference` |
| 126 | ✅ | HMAC-SHA512 over the raw body, constant-time |
| 127 | ✅ | production refuses an open CORS policy at startup |
| 128 | ➖ | Bearer-token API, no cookies → CSRF not applicable |
| 129 | ➖ | no cookies set |
| 130 | ✅ | tokens travel in the `Authorization` header, never the URL |
| 131 | ➖ | passwords are Clerk's |
| 132 | ✅ | no hardcoded encryption keys |
| 133 | ✅ | n/a |
| 134 | ✅ | HTTPS endpoints; Postgres over TLS |
| 135 | 🚧 | TLS config at the proxy/Supabase |
| 136 | ⚠️ | at-rest encryption is Supabase's; document |
| 137 | ✅ | stdlib `hmac`/`hashlib` only — no homegrown crypto |
| 138 | ⚠️ | pnpm lockfile + `pnpm audit` in the release pass |
| 139 | ⚠️ | dependency review pass |
| 140 | ⚠️ | lockfile pins resolutions |
| 141 | ✅ | pnpm lock committed; backend + electron pinned exactly |
| 142 | ✅ | no third-party runtime scripts in the app |
| 143 | ⚠️ | CI installs from the committed lockfile |
| 144 | 🚧 | CI credentials as GitHub secrets only |
| 145 | 🚧 | least-privilege workflow token (the Workflows-permission gap is noted) |
| 146 | 🚧 | branch protection on release branches |
| 147 | 🚧 | sign/verify releases (runbook) |
| 148 | ✅ | FastAPI debug off; generic 500 handler |
| 149 | ✅ | tracebacks logged server-side only |
| 150 | ⚠️ | security events logged at WARNING (`coop.security`) + optional `SECURITY_ALERT_WEBHOOK` alert; wiring a real pager is ops |

## 🔵 151–170 (headers + monitoring + process)

| # | Status | Evidence |
|---|--------|----------|
| 151 | ✅ | security-headers middleware on every response |
| 152 | ✅ | `Strict-Transport-Security` set by the middleware in production (deliberately absent in dev) |
| 153 | ✅ | `X-Content-Type-Options: nosniff` |
| 154 | ✅ | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| 155 | ✅ | `Permissions-Policy` strips camera/geo/mic |
| 156 | ✅ | Electron requests no extra OS permissions |
| 157 | ⚠️ | `audit_log` stores change deltas; review for PII before launch |
| 158 | 🚧 | log access control (ops) |
| 159 | 🚧 | retention policy (ops) |
| 160 | 🚧 | alert on privileged-account change |
| 161 | 🚧 | Clerk suspicious-login alert |
| 162 | 🚧 | alert on mass access |
| 163 | 🚧 | exports are logged; add an alert on unusual volume |
| 164 | 🚧 | Clerk repeated-failed-auth alert |
| 165 | 🚧 | alert on privilege change |
| 166 | 🚧 | write an incident-response doc |
| 167 | ✅ | backup/restore covered by `electron/test/backup.test.js` + `windows.test.js` |
| 168 | 🚧 | DR test runbook |
| 169 | 🚧 | publish a vulnerability-disclosure process |
| 170 | ✅ | this audit + CI gates (ruff, pytest, eslint, tsc, electron, UI-link audit) |

---

## Tally

* ✅ done in code: **113**
* ⚠️ code done, operator/review step remains: **22**
* 🚧 ops/infra (Clerk, Supabase, CI, monitoring): **29**
* ➖ not applicable: **6**

(113 + 22 + 29 + 6 = 170.)

Every P0 item that this codebase can fix is fixed and tested; the remaining P0s
(6, 7 Supabase RLS and the Clerk auth-policy items) are configuration in
dashboards this repo cannot reach, and are called out rather than hidden.
