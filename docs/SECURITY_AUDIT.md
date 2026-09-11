# Security audit — Co-op

Verified against the working tree, not against intention. Every line below was
checked with a command that is written next to it, so the finding can be
re-checked in seconds.

Scope: the checklist you sent (OWASP Top 10:2025 / ASVS 5 / API Top 10 /
Electron / Supabase / GenAI), reduced to what this codebase can actually answer
today. Items that need infrastructure you do not have yet (Supabase RLS, Clerk
dashboard config, production monitoring) are marked **out of reach from here**
rather than "passing" — pretending otherwise would be the worst possible
outcome of an audit.

Legend: ✅ verified in code · ⚠️ open, fixable here · 🚧 needs infrastructure
you don't have yet · ➖ not applicable

---

## 1. The 20 that could actually destroy the app

| # | Risk | Status | Evidence |
|---|---|---|---|
| 1 | Broken authorization | ✅ | 65 routes take `Depends(get_current_business)`; `grep -c "Depends(get_current_business)" backend/main.py` |
| 2 | Supabase RLS failure | 🚧 | No RLS policies in the repo (`find . -name "*.sql" | xargs grep -l "row level security"` → none). The app never uses the Supabase REST API — it talks to Postgres through SQLAlchemy with `business_id` in every query — so RLS is defence-in-depth, not the primary control. Enable it anyway before exposing a table to any client. |
| 3 | Leaked service-role key | ✅ | No Supabase key exists in the tree: `grep -rnIE "service_role|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12}" .` → 0 hits |
| 4 | Tenant isolation | ✅ | `backend/tests/test_tenant_isolation.py`; every repository query filters on `business_id` |
| 5 | Admin privilege escalation | ✅ | `/admin/*` requires `X-Admin-Token` (503 when unconfigured, 403 on mismatch) — `backend/main.py:2344` |
| 6 | Authentication bypass | ✅ | Clerk JWKS verification (`backend/clerk_auth.py`); the test seam `COOP_TEST_AUTH_USER` **raises in production** — `clerk_auth.py:139` |
| 7 | Session/token compromise | 🚧 | Clerk-owned. Token lifetime, revocation and rotation are dashboard settings — verify there, not here |
| 8 | Hardcoded secrets | ✅ | Same grep as #3, plus `backend/config.py` reads everything from env/`config/<env>.json` |
| 9 | SQL injection | ✅ | No interpolated SQL anywhere: `grep -rn "text(f\|execute(f\"" backend/` → 0 hits; all queries are SQLAlchemy expressions with bound parameters |
| 10 | Electron privilege escape | ✅ | `contextIsolation: true`, `nodeIntegration: false`, **`sandbox: true`** and the navigation guard, all in `electron/security.js` — see §3 |
| 11 | Unsafe IPC | ✅ | Allow-list only: unknown methods throw `Blocked non-allow-listed …` (`electron/main.js`); the preload exposes named functions, never a generic invoke (`electron/preload.js:24`) |
| 12 | XSS | ✅ | React escapes by default; `grep -rn "dangerouslySetInnerHTML" frontend/src` → 0 hits |
| 13 | Unrestricted API operations | ✅ | Role matrix in `backend/team.py` `WRITE_MATRIX`, enforced server-side in `get_current_business` |
| 14 | Rate limiting | ✅ | `/ai/chat` (8/60 s) plus `/imports/commit` (20/5 min) and `/reports/{key}/export` (30/60 s), per Clerk user — `backend/ratelimits.py` |
| 15 | File upload / import | ✅ | 5 MB cap and csv/xlsx only (`backend/main.py:1845`); exports neutralise leading `= + - @` in csv **and** xlsx — `backend/csvsafe.py` |
| 16 | SSRF | ➖ | The backend never fetches a user-supplied URL |
| 17 | Supply chain | ⚠️ | Backend pinned exactly, pnpm lockfile committed, **`electron` and `electron-builder` now pinned exactly**; `frontend/package.json` (27) still uses `^` ranges against the lockfile |
| 18 | AI prompt injection | ✅ partially | Zeno answers from a verified context and a fixed, validated action registry; it cannot invent an action |
| 19 | AI excessive agency | ✅ | AI actions require user confirmation; credit balance enforced with 402 on every AI request |
| 20 | Monitoring / backups | 🚧 | Audit log exists (`/audit`, migration 0008) and backups exist; **no alerting** — nothing pages anybody |

## 2. P0 items 16–35 (auth + API) in one pass

- **Password reset, MFA, brute force, credential stuffing, session storage**
  (16–28): all delegated to Clerk. 🚧 Verify in the Clerk dashboard: MFA
  enforcement for owners, session length, and that "identify additional
  sessions" is on. Nothing in this repo can prove them.
- **25 account enumeration**: Clerk's hosted pages decide this. 🚧
- **29 auth events logged**: Clerk logs them; Co-op logs business mutations to
  `audit_log`, not sign-ins. 🚧
- **30 privilege escalation via client data**: role changes only happen through
  `/team/invites` (owner/manager) and are re-checked server-side. ✅
- **33 BOLA / IDOR**: every `/{id}` lookup is scoped to the caller's business;
  `backend/tests/test_tenant_isolation.py` asserts a second tenant gets 404. ✅
- **34 function-level auth**: `WRITE_MATRIX` maps each write path to allowed
  roles, including `/invoices` and `/imports`. ✅
- **35 property-level auth**: `ProductUpdate` deliberately omits
  `current_stock` — stock only moves through `/products/{id}/adjust`, which
  writes the ledger (`backend/schemas.py:46`). ✅

## 3. Electron — the real gaps

Checked against the official Electron security checklist.

✅ Already correct: `contextIsolation: true`, `nodeIntegration: false`, a CSP
built per environment and applied via `onHeadersReceived`, no
`shell.openExternal` anywhere, no `<webview>`, no custom protocol, IPC
allow-list, single-instance lock.

✅ Fixed (all three, tested in `electron/test/security.test.js`):

1. **Renderer sandbox** — `sandbox: true` is set for every window. The preload
   only bridges `ipcRenderer`, so this cost nothing.
2. **Navigation guard** — `web-contents-created` installs
   `setWindowOpenHandler` (deny; `http(s)` links are handed to the user's real
   browser via `shell.openExternal`) and a `will-navigate` listener that calls
   `preventDefault()` for anything that is not `file:`/`devtools:`. The logic
   lives in `electron/security.js` so the suite can drive it with a stub
   renderer instead of grepping source.
3. **Electron pinned** — `electron` and `electron-builder` are exact versions.
   `electron/test/windows.test.js` asserts every module `main.js` requires is
   in `build.files`; adding `security.js` without listing it failed that test,
   which is the packaging check doing its job.

## 4. What I would fix, in order

1. ✅ **CSV formula injection** — `backend/csvsafe.py` prefixes any cell
   starting with `= + - @` (or a tab/CR) with a `'`, leaving plain numbers
   numeric. Applied in `backend/exports/renderers.py` for both csv and xlsx
   (`defuse_workbook`, because openpyxl types a leading `=` as a formula on
   assignment) and in `backend/invoicing.py` for customer name and email.
   `backend/tests/test_export_safety.py` drives the real endpoints with
   `=cmd|'/c calc'!A1`, `=HYPERLINK(...)`, `@SUM(A1)` and `+234 …` and asserts
   no exported cell — in either format — can execute.
2. ✅ **Electron sandbox + navigation guard** — see §3.
3. ✅ **Rate limits beyond `/ai/chat`** — `backend/ratelimits.py` adds
   per-Clerk-user sliding windows for `/imports/commit` (20 per 5 minutes) and
   `/reports/{key}/export` (30 per 60 seconds), configured per environment in
   `config/<env>.json` (`requests: 0` disables, which the testing environment
   does). `backend/tests/test_ratelimits.py` proves the 429 path on both routes.
4. ✅ **`electron` pinned**; frontend ranges still sit against the lockfile.
5. **Supabase RLS** before any table is exposed to a client, plus a key
   rotation runbook. 🚧
6. **Alerting**: nothing currently tells you that an admin token was used, that
   a login storm happened, or that a bulk export ran. 🚧

## 5. How to re-run this audit

```bash
# authorisation coverage
grep -c "Depends(get_current_business)" backend/main.py

# secrets
grep -rnIE "service_role|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12}" \
  --exclude-dir=.git --exclude-dir=node_modules .

# injected SQL
grep -rn 'text(f\|execute(f"' backend/

# XSS sinks
grep -rn "dangerouslySetInnerHTML" frontend/src

# Electron posture
grep -n "nodeIntegration\|contextIsolation\|sandbox\|setWindowOpenHandler\|shell.openExternal" electron/*.js

# tenant isolation + roles
.venv/bin/python -m pytest backend/tests/test_tenant_isolation.py backend/tests/test_team.py -q
```

This file is a snapshot. The commands above are the part worth keeping — an
audit you cannot re-run is a rumour.
