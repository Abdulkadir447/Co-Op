# Security remediation — the external review, worked through

An external reviewer read the code (not the docs) and produced a ranked list of
findings. This is the disposition of every one of them: what was confirmed
against the source, what changed, and which test now fails if the bug comes
back. Where I disagreed, or could not fix something in code, that is written
down too.

**Result: 10 of 10 numbered findings fixed, 6 of 6 low findings fixed, three
structural recommendations left open on purpose (see §4).**
Gates at the end of the pass: **471 backend tests passed / 6 skipped**,
**26 frontend**, **91 Electron (2 skipped)**, ruff + tsc + eslint + prettier
clean, frontend build OK.

---

## 1. Confirmed and fixed

| # | Finding | What was actually wrong | Fix | Pinned by |
|---|---|---|---|---|
| 1 | Cross-tenant writes via `/sync/push` | `_resolve_client_id` looked a client id up **globally**, and every follow-up load (`select(Customer).where(Customer.id == …)`) was unscoped too. A client id belonging to another tenant resolved, so an `update` could overwrite their customer, product, order or stock level. | Every lookup is now tenant-scoped: `_resolve_client_id(db, model, client_id, business_id)` and one `_load(db, model, id, business_id)` helper replace nine inline selects. A foreign client id is indistinguishable from a missing one (`not_found`). | `test_a_client_id_from_another_tenant_does_not_resolve`, `test_a_cross_tenant_reference_does_not_resolve` |
| 2 | `/sync/push` poisons the customer table | Sync stored `payload["email"]` verbatim while `CustomerOut.email` is `EmailStr`. Worse than reported: the *existing* placeholder generator used `@coop.local`, and pydantic rejects `.local` as a reserved name — so **any** email-less customer created offline broke `GET /customers` for the whole tenant. | Emails are validated through `EmailStr` on create and update; an invalid one is a `invalid_payload` conflict. The placeholder domain is now `customers.example.com`, which the response schema accepts. | `test_an_invalid_email_becomes_a_conflict_not_a_poisoned_row`, `test_an_offline_customer_without_an_email_still_renders` |
| 3 | Manager writes owner-only settings | `role_can_write` was called with the **first path segment**, and `"/business".startswith("/business/settings")` is false — so a manager could change currency, tax rate and the legal name printed on invoices. | The owner-only check runs against the full request path; only the write-matrix lookup uses the segment. | `test_a_manager_cannot_rewrite_business_settings`, `test_owner_only_surfaces_stay_owner_only_for_a_manager` |
| 4 | Missing `email` claim breaks three gates | `accept_team_invite` skipped the binding check when the claim was absent (anyone with the token could claim the invitation at the invited role); a pending invitee was silently given a second, empty business; the platform-admin email allow-list matched nobody. | The claim is now **mandatory** for every business endpoint (403 with the exact Clerk setting to change), and the invite path refuses explicitly. The test fixture models a real token (it carries an email) and `email=""` simulates the Clerk default. | `test_a_token_without_an_email_claim_cannot_accept_an_invite`, `test_a_token_without_an_email_claim_gets_no_business` |
| 5 | Unbounded upload buffering, unrated parsers | `await file.read()` buffered the whole body *before* the size check; `/imports/preview` and `/imports/validate` had no rate limit; `openpyxl` had no row cap. | Chunked read that aborts at 5 MB mid-stream; the `imports` limiter on both parse routes; `MAX_IMPORT_ROWS = 20_000` enforced in both parsers. | `test_a_file_over_the_size_cap_is_refused`, `test_a_file_over_the_row_cap_is_refused`, `test_the_row_cap_is_enforced_through_the_route` |
| 6 | `/admin/*` unthrottled | Constant-time compare, unlimited attempts. | A new `admin` limiter section (30/60 s), keyed by peer address, checked **before** the token comparison. Disabled in testing like the others. | `test_admin_routes_return_429_when_the_limiter_refuses` |
| 7 | Checkout trusts URL metadata | In the "no checkout row" branch the webhook created a payment from `metadata.plan` with **no amount check**, while the existing-row branch had one. A payer could edit the hosted page URL and pay the cheapest amount for the top plan. | The create branch now requires a configured price for plan+interval, refuses a currency mismatch, and rejects `charged < expected`. A plan with no published price (Enterprise) is never auto-granted — it is left for reconciliation. | `test_a_page_charge_cannot_be_upgraded_by_editing_metadata`, `test_an_unpriced_plan_is_never_granted`, `test_a_charge_in_another_currency_is_not_applied` |
| 8 | Backup key falls back to a public constant | `BACKUP_ENCRYPTION_KEY` → `SECRET` → `coop-backup-default-key-not-for-production`, which is in the repo. | In production a missing key **refuses** (503 on export and restore); the constant remains for dev/test only. | `test_export_refuses_without_a_key_in_production`, `test_export_still_works_when_the_key_is_set` |
| 9 | `/docs` public in production | FastAPI's generated docs and OpenAPI JSON are not router routes, so the anonymous-surface sweep could not see them. | Both are disabled when `COOP_ENV=production`; `redoc_url=None` everywhere. | verified by import: `docs_url=None, openapi_url=None` under `COOP_ENV=production` |
| 10 | `apply_push` only caught `SyncError` | `int(payload["change"])` on `"abc"` raised past the handler: a 500, and every operation queued behind it was discarded. | Numeric fields go through `_as_int` / `_as_float`, which raise a typed `invalid_payload` conflict; a non-object payload is rejected before use; a belt-and-braces `(ValueError, TypeError, KeyError, AttributeError)` handler marks that one op `failed` and continues. | `test_a_malformed_number_fails_one_op_not_the_batch` |

## 2. Low findings

| Finding | Disposition | Pinned by |
|---|---|---|
| `GET /audit` readable by any role including viewer | Explicit `require_any("owner","manager","accountant")` — reads were exempt from the write matrix, and the audit trail is the whole tenant's history. | `test_owner_only_surfaces_stay_owner_only_for_a_manager` |
| The same hole on `GET /backups/export` (found while checking the above) | Owner-only. A read-only viewer could download the entire business database. | same test |
| `restore_backup` `float()` on unvalidated JSON | `(ValueError, TypeError)` → `400`, with `BackupValidationError` re-raised first so the specific refusal keeps its message. | `test_a_non_numeric_value_in_a_backup_is_a_400` |
| `/dashboard/top-products` counts soft-deleted orders | Joins `orders`, filters `deleted_at IS NULL` and `status != cancelled`, and scopes every leg of the join to the tenant. | `test_top_products_ignores_cancelled_and_deleted_orders` |
| Restore can leave the ledger non-reconciling | `current_stock` is **recomputed** from the restored movements; the file's value is ignored. | `test_restore_recomputes_stock_from_the_ledger` |
| `admin_tokens()` falls back to `config/*.json` | Config fallback is now dev-only; production reads `LICENSE_ADMIN_TOKENS` from the environment. | (production-only branch) |
| `COOP_TEST_AUTH_USER` raised at request time | Refused at **startup** under `COOP_ENV=production`. | verified by running the lifespan |

## 3. Verified claims about the unauthenticated surface

The router sweep (`backend/tests/test_public_surface.py`) still finds exactly six
route/method pairs that answer without a token, unchanged by this pass:

```
GET /                        200   service banner
GET /healthcheck             200   liveness
GET /billing/payment-config  200   plan/price catalogue, no secret, no tenant data
GET /admin/licenses          503   closed (no admin token configured)
POST /admin/generate-license 503   closed
POST /admin/licenses/revoke  503   closed
POST /webhooks/paystack      401   HMAC-SHA512 over the raw body
```

## 4. Not fixed, and why

1. **`main.py` split into `APIRouter` modules.** The reviewer is right that
   3,950 lines / 92 routes is the structural debt, and right that it caused
   finding 3. But it is a mechanical rewrite of every route in the file, and
   doing it in the same change as ten security fixes would make the diff
   unreviewable and the regressions unattributable. It is the next structural
   change, on its own, with the suite as the safety net.
2. **`rls.py` is a backstop, not a control — and now says so.** RLS is enabled
   but not `FORCED`, and the backend connects as the table owner, so every
   policy is bypassed by the only role that exists. Forcing it requires
   provisioning a non-owner role and re-pointing every job at it (webhook,
   migrations, seeder); half of that change is worse than none. Until then the
   module docstring states plainly that it constrains only a future
   non-owner/PostgREST role.
3. **Hash-locked Python dependencies.** Real exposure, but pinning with hashes
   needs a full resolve-and-lock pass against PyPI and a decision about the
   update cadence; it is a supply-chain project, not a patch.
4. **`get_current_business` picks `limit(1)` by id**, so a user who belongs to
   two businesses can never switch. That is a product feature (a tenant
   switcher), not a security fix.
5. **`OPENAI`/model output rendering** — React escapes by default and the AI
   message is rendered as text, but I did not exhaustively audit every place a
   model string reaches the DOM.

## 5. What this pass changed in observable behaviour

- A session token **without an `email` claim** can no longer reach a business
  endpoint. This is intentional and it is a deployment requirement: add `email`
  to the session token in Clerk (Sessions → Customize session token). The app
  now shows that instruction instead of failing per-page.
- A hosted-page charge whose amount is below the published price — or in a
  different currency, or for a plan with no published price — no longer
  upgrades the plan.
- Reports can no longer be exported by read-only roles; owners only for the
  full backup.

## 6. Still true after the fixes

The launch blockers from the readiness docs are unchanged: no live Paystack
charge has ever run, local SQLite is unencrypted, RLS has never been exercised
against a real Postgres with a non-owner role, and the Windows installer is
unsigned. Those are deployment and infrastructure gaps; no amount of code
review closes them.
