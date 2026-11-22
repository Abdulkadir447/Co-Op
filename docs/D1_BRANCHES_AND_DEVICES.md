# D1 — Branches and device identity

**Status:** implemented on `arena/06237ab6-co-op` (2026-10-24). Backend gates green:
491 backend tests, `ruff check backend/` clean.

This is the first of the five irreversible decisions in
[`FORMAL_RETAIL_SCOPE.md`](./FORMAL_RETAIL_SCOPE.md) §3. It comes first because
every later step — exact money, stock positions, approvals, POS — hangs off
"where" and "which machine". Getting it wrong later means rewriting ledgers.

---

## 1. What changed

### A location dimension on the row

A new `branches` table, and `branch_id` as a real column on the tables that
record trade:

| Table | `branch_id` |
|---|---|
| `orders`, `order_items`, `order_payments`, `stock_movements`, `invoices` | **NOT NULL** |
| `audit_log`, `import_batches` | nullable |

The five transactional tables cannot hold a row without a location: that is the
whole point of a dimension. `audit_log` is nullable because a membership or
billing event genuinely belongs to no shop; `import_batches` is nullable because
a chain-wide SKU import is not a shop's document.

Every business gets a `MAIN` branch on first use
(`backend/branches.py::default_branch`). There is **no single-shop code path** —
one tenant and forty tenants run the same code, and the forty-store case is not
a bolted-on variant of the one-store case.

### How the branch is chosen

Resolved once, in `get_current_business`, from the `X-Branch-Id` header:

* absent or blank → the business's `MAIN` branch;
* not an integer → **400**;
* an id belonging to another tenant → **404**, never a silent fallback. A
  fallback files Shop 4's sale under Shop 1, and that is a wrong number nobody
  ever notices.

`GET /branches` (any member), `POST /branches` (owner only, code uppercased,
**409** on a duplicate live code). A branch is never deleted; `closed_at` marks
it, because its history stays in the ledgers it posted.

### Money follows the sale, not the caller

`Invoice.branch_id` and `OrderPayment.branch_id` are copied from the **order**,
not from whoever raised the invoice or took the payment. Head office taking a
payment at the front desk still books it to the shop that made the sale.
Pinned by `test_documents_and_money_follow_the_sale_not_the_caller`.

### Device identity

A new `devices` table: one row per enrolled installation of the desktop app.

* bound to **one branch**; it can only post for that branch;
* carries the **public half** of its keypair (used from D5 to verify supervisor
  approvals signed while offline); the private key never leaves the machine;
* revoked, never deleted, because the audit trail references it.

`POST /devices` (any member — setting up a till is not an organisational
decision), `GET /devices`, `POST /devices/{id}/revoke` (owner only, idempotent).
Re-enrolling the same `device_key` is a **409**: the key *is* the machine.

`POST /sync/push` now reads `X-Device-Id` (the client-generated key). If
present it must be enrolled, live, and bound to the branch being posted for —
unknown → 404, revoked → 403, wrong branch → 409. Audit rows written by a push
now carry **(staff member, device)** rather than the placeholder `"offline-sync"`.

### Migrations and the Supabase snapshot

* `0025_branches` — table, one `MAIN` per existing business, columns backfilled
  from that branch, then `SET NOT NULL`. The backfill is correct because the
  pre-branch product has exactly one location per tenant by construction.
* `0026_devices` — device table, `audit_log.device_id`, RLS on both new tables.
* `supabase/migrations/20261022000000_coop_schema.sql` updated to match, and the
  snapshot test now requires the `0026_devices` head. **The file normally comes
  out of `supabase/scripts/export_schema.py`, which needs `pg_dump` and a
  reachable Postgres; neither existed in the build sandbox, so this update was
  written by hand in pg_dump's shape.** Re-run the exporter on staging and
  diff — if it differs, the exporter is right.

---

## 2. What this means in plain terms

Before: the database had one pile of stock and one set of numbers. Two shops
would have looked like one shop, and nobody could have told which one sold what.

Now: every sale, every stock movement, every invoice says which shop it
belongs to, and every offline write says which machine recorded it and which
person was signed in.

A business with one shop notices nothing. It gets one branch called `MAIN` and
everything lands there automatically.

---

## 3. What is deliberately **not** done yet

Being explicit, because a half-built dimension is a trap if nobody says so:

1. **Reports and dashboards are still consolidated.** They do not filter by the
   resolved branch yet, so a chain with three branches sees one combined set of
   figures everywhere. For a single-branch tenant that is exactly right, which
   is why nothing looks broken. Branch-scoped reads are the next slice.
2. **The desktop app does not enrol yet.** It pushes without `X-Device-Id`, so
   its audit rows name the staff member but no machine. Enrolment belongs on the
   till set-up screen, which does not exist yet; until then the server treats the
   device half as optional rather than refusing every push.
3. **No branch switcher in the UI.** Every request resolves to `MAIN`.
4. **Stock is still one number per product** (`products.current_stock`), not per
   branch. That is D3's stock-position table; until then a chain's on-hand figure
   is the company total.
5. **Nothing consumes `devices.public_key` yet.** It is stored so D5 approvals can
   be verified retroactively, not because something checks it today.

---

## 4. Next

D2 — exact money: integers in minor units, no `Float` money column, integers on
the wire, `NGN` fixed as the only currency, and property tests that prove
`Σ lines == subtotal` and `Σ tenders == total` rather than asserting floats.
