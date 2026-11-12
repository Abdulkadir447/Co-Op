# Handoff: Co-op, and the migration to a formal-retail (Nigerian chain) product

For an external reviewer with no prior context. Everything here was checked
against the source on 2026-10-23, not remembered. Where something is unverified
it says so.

Repo (public): <https://github.com/Abdulkadir447/Co-Op>
Scope spec this answers: `docs/FORMAL_RETAIL_SCOPE.md`, same branch.

---

## 1. What the product is today

Co-op is an **offline-first business system for one small wholesaler/retailer**:
products, stock, customers, orders, invoices, receivables, reports, exports and a
5-step CSV/XLSX importer. It ships as an **Electron desktop app** with a local
SQLite database, a React/TypeScript frontend, and a FastAPI + Postgres backend.
It is sold per business in USD ($29 / $99 a month).

The AI assistant ("Zeno") answers only from data the server rebuilds itself,
returns a validated JSON object, never queries the database and cannot write.
It can propose exactly one action (`DRAFT_ORDER`), which a human must confirm.
It also keeps a private "lesson" ledger used to improve its own answers; that is
deliberately invisible in the UI.

It is **not** a POS, has no branches, no purchasing, no cash handling and no
general ledger. That is the whole gap in §8.

### Measured size (verified)

| | |
|---|---|
| API routes | **92**, all in `backend/main.py` (3,950 lines) |
| Tables | **25** ORM tables, **24** Alembic migrations |
| Tests | **471 backend passed / 6 skipped**, 26 frontend, 91 Electron (2 skipped) |
| Frontend | React 18 + TS + Vite + Ant Design, 19 page areas |
| Desktop | Electron 33, `sandbox: true`, `contextIsolation: true`, allow-listed IPC |
| Backend | FastAPI, SQLAlchemy 2 async, asyncpg, Pydantic v2 |
| Hosting | Supabase Postgres; FastAPI in a container; Electron app for the till side |

---

## 2. Surfaces (four schema surfaces — this matters for the migration)

1. **`backend/models.py`** — the ORM, 25 tables. Source of truth for the code.
2. **`backend/alembic/versions/`** — 24 hand-written migrations.
3. **`supabase/migrations/20261022000000_coop_schema.sql`** — a generated
   snapshot used to provision the Supabase project.
4. **`electron/db/migrations/0001_init.js`** — the **local SQLite mirror** that
   makes offline mode work.

Plus a fifth, non-DDL surface: **the sync wire contract** (`backend/sync.py` ↔
`electron/db/repositories.js` + `syncQueue.js`). Anything that changes a column
type has to change in all five consistently. There is currently no CI check
that they agree; that check is part of this migration (§11.3).

---

## 3. The schema as it exists

Grouped by what it is for:

- **Tenant**: `businesses` (+ currency, tax_rate, tax_label, TIN, registration
  number), `business_members`, `business_invitations`, `profiles`.
- **Catalogue**: `products` (sku, name, category, unit_price, cost_price,
  current_stock, reorder_level), `customers`, `import_batches`.
- **Selling**: `orders` (status machine pending→confirmed→shipped→delivered,
  `total_amount` is the net subtotal, tax_rate/tax_amount snapshotted),
  `order_items` (quantity, unit_price, total_price), `order_payments`
  (append-only money received), `invoices` (deliberately **no money columns** —
  it points at its order so totals cannot drift).
- **Stock**: `stock_movements` — append-only signed ledger; every change to
  `products.current_stock` writes exactly one row. Reasons: initial, purchase,
  sale, damaged, returned, correction, order, order_cancelled, order_deleted.
- **AI**: `ai_usage`, `ai_history`, `zeno_lessons`.
- **Commerce/licensing**: `subscriptions`, `payments` (Paystack),
  `licenses`, `feedback`, `issue_reports`.
- **Ops**: `audit_log` (append-only by convention), `sync_queue`,
  `analytics_snapshots`.

### Money and quantity, as they actually are

- **Money is `Float` in 11 columns. There is no `Decimal`/`Numeric` anywhere in
  the backend.** (Classified in §10.1.)
- **One exception, and it is a useful precedent**: `payments.amount_kobo` is an
  integer of minor units — the Paystack ledger already does the right thing,
  under a name that will not survive multi-currency (it holds USD cents for the
  USD build).
- **Quantity is `Integer`** in `order_items.quantity` and
  `stock_movements.change`, and `products.current_stock` / `reorder_level`.
- Rates (`businesses.tax_rate`, `orders.tax_rate`) are `Float` too.

---

## 4. The offline engine (the part worth keeping)

- Every offline-created entity carries a **client-generated ULID `client_id`**
  (unique globally): products, customers, orders, order items, stock movements.
- `/sync/push` applies a batch idempotently: a `create` whose `client_id` exists
  is a no-op that returns the existing server id, so a retried offline write
  applies **exactly once**.
- **Stock syncs as operations, never as a value** — a signed movement, keyed by
  its own `client_id`, re-validated server-side (it refuses to drive stock
  negative). A client's `current_stock` in a create payload is deliberately
  ignored.
- Conflicts are typed and terminal (retrying cannot fix them):
  `email_conflict`, `sku_conflict`, `not_found`, `invalid_transition`,
  `insufficient_stock`, `invalid_payload`.
- All lookups are tenant-scoped; a cross-tenant `client_id` is indistinguishable
  from a missing one (fixed 2026-10-23).
- Offline writes are attributed to the actor `"offline-sync"` because the client
  does not yet carry a per-device identity — **that is a gap for POS (§11.1)**.

---

## 5. Auth, tenancy, security posture

- **Clerk session tokens** (RS256, JWKS, issuer-checked), sent as
  `Authorization: Bearer`. No cookies (so no CSRF), no PostgREST, no client SQL.
- One choke point: `get_current_business` resolves the tenant **and** the role,
  then calls `assert_can_write(role, method, path)` against a path-keyed role
  matrix (owner / manager / sales / inventory / accountant / viewer), then sets
  the tenant GUC (`set_tenant_context`) that Postgres RLS policies read.
- RLS is **enabled but not `FORCED`**, and the backend connects as the table
  owner, so it constrains only a future non-owner role. It is a documented
  backstop, not a live control. (Do not count it as one.)
- An `email` claim is now **required**; without it the backend refuses (the
  alternative was silently mis-provisioning invitees).
- A test sweeps the real router and asserts only six route/method pairs answer
  without a token: `/`, `/healthcheck`, `/billing/payment-config`, and the
  `/admin/*` licence routes (503 when no token is configured), plus the
  HMAC-gated Paystack webhook.
- Known open items: local SQLite is **unencrypted**, RLS has never been
  exercised against Postgres, no live payment charge has ever run, the Windows
  installer is **unsigned**.

---

## 6. What the tests prove, and what they do not

The suite is broad and genuinely useful: tenant-scoping per domain, optimistic
locking, idempotent sync, the order status machine, stock-ledger invariants,
invoice numbering, exports, imports, the AI contract, and a contract test that
diffs the frontend's API usage against the OpenAPI paths.

It does **not** prove:
- anything about Postgres-specific behaviour that SQLite papers over (RLS,
  `NUMERIC` semantics, concurrent transactions),
- **anything about exact arithmetic** — see §11.2, this is the sharpest problem
  in the migration,
- that the four schema surfaces agree.

---

## 7. The decision taken

**Fork 1 — reversal is live.** The USD/SMB product is parked, not deleted.
Every decision below assumes **Naira and chain**. The constraint that keeps the
park cheap: *the SMB product must not fork the schema.* A single-branch SMB
tenant gets a default `Main` branch row and a non-null `branch_id` like everyone
else. One codebase.

**Fork 2 — accepted.** The sellable tier is **8–40 stores**. 3–7 is a consulting
customer (implementation labour exceeds the contract value); 40+ is a procurement
fight to lose early. The first sellable slice is: **one branch, one till,
PO→GRN→landed cost, blind close, approvals, journal, MBS export** — ≈20–24
engineer-weeks.

---

## 8. What does not exist (verified by grep, not by memory)

| Absent | Evidence |
|---|---|
| Branches / stores | `branch_id` appears **0 times** in `backend/` |
| Suppliers, POs, GRNs, AP | no such tables or routes |
| POS / till / cash / tender | no such tables; selling is order-based |
| Batches, expiry, serials | none |
| Barcodes / PLU / UoM / weighed goods | `products` has none; quantity is `Integer` |
| Journal / GL / cost of goods | none; reports are aggregates over orders |
| Credit limits / AR aging | receivables exist as computed balances, no limits or aging |
| Devices / terminals | none |
| Multi-currency accounting | `currency` is a label; no FX anywhere |

---

## 9. Money and quantity: the exact inventory

### 9.1 The 11 `Float` columns, classified

| # | Column | Role | Target |
|---|---|---|---|
| 1 | `businesses.tax_rate` | **rate** | `Numeric(9,6)` (0.075, not 7.5) |
| 2 | `products.unit_price` | money | integer minor units |
| 3 | `products.cost_price` | money | integer minor units |
| 4 | `orders.total_amount` | money (net subtotal) | integer minor units |
| 5 | `orders.tax_rate` | **rate** (snapshot) | `Numeric(9,6)` |
| 6 | `orders.tax_amount` | money | integer minor units |
| 7 | `order_payments.amount` | money | integer minor units |
| 8 | `order_items.unit_price` | money (snapshot) | integer minor units |
| 9 | `order_items.total_price` | money | integer minor units |
| 10 | `zeno_lessons.cost_amount` | money (measured loss) | integer minor units |
| 11 | `analytics_snapshots.metric_value` | **ambiguous** | needs a unit discriminator — see below |

**9 money, 2 rates, 1 ambiguous. There are no coordinates, no lat/longs, no
scientific columns** — the "some floats are not money" worry does not apply
here. The only genuinely undecidable column is `analytics_snapshots.metric_value`,
which is a generic metric and may be money, a percentage or a count; it needs a
`unit` column (`money | percent | count`) before conversion or it must stay
`Numeric(18,6)` and be documented as a display cache. Recommendation: add the
discriminator; it is also what makes the metric type-safe for the reports layer.

Also in scope beyond those 11: `payment.amount_kobo` (already integer minor
units — rename to `amount_minor` when the currency work lands, since the name is
a Naira assumption) and `zeno_lessons.severity` (an ordinal, correctly Integer).

### 9.2 Quantity conversion sites

`Integer` today, all four are real conversion sites, plus their mirrors:

| Column | Becomes |
|---|---|
| `order_items.quantity` | `Numeric(12,3)` (or integer thousandths) |
| `stock_movements.change` | `Numeric(12,3)` |
| `products.current_stock` | **derived** — replaced by the position table (D4), not converted |
| `products.reorder_level` | `Numeric(12,3)` |

### 9.3 Are sale lines a separate table?

**No — and this is important to the plan.** There is no sales or sale-lines
table today; selling goes through `orders` + `order_items`, and
`order_items.quantity` is `Integer`. The POS `sale_lines` table does not exist
yet, so it is **not a third conversion site — it is born correct** (`Numeric`
quantity, minor-unit money, price snapshots, `approval_id`). The conversion
sites are exactly the four in §9.2.

---

## 10. The migration set, revised

Order (your amendment accepted, with one addition):

**D1 branch + device identity → D2 exact money → D3 quantity/UoM → D5 approvals
→ landed-cost allocation → position recompute → PO/GRN → POS → MBS.**

D5 fourth, before POS: agreed, and for the reason you gave. It touches every
mutating path, so it is written once instead of retrofitted into a live till.

### 10.1 D2 mechanics — where I agree, and the four adjustments

Agreed as stated: integer minor units for posted amounts; `Numeric(18,6)` for
unit rates; **FX rate `Numeric` as well** (a float FX rate re-poisons the amount
one join upstream); one named rounding point (line extension), round there, sum
after, never round an intermediate; half-up, matching local practice; additive
migration with a shadow copy of the originals.

**Adjustment 1 — the reconciliation gate must not canonise a broken total.**
`sum(minor_units) == round(sum(floats) × 100)` is the wrong invariant where the
old data was itself inconsistent: `orders.total_amount` is stored separately
from `Σ order_items.total_price`, and nothing in the current code guarantees
they agree. Comparing to the old float bakes in whatever disagreement exists.
The gate should be:

1. **Recompute each document in exact arithmetic** from its lines + tax rate +
   the named rounding rule, and compare to the stored total.
2. Report every document where they disagree **before** conversion. Those are
   pre-existing data defects, and the chain's opening balances inherit them.
3. **Zero-tolerance post-gate**: `Σ lines == subtotal`, `subtotal + tax ==
   total`, `Σ payments ≤ total`, every `stock_positions.qty == Σ movements` —
   per document and per branch, with a per-row diff file for failures.

### 10.2 VAT rounding — a source, as you asked, and it is not a good one

You are right that this cannot be invented. **I could not find a primary FIRS
source that specifies per-line versus per-invoice rounding.** What the secondary
Nigerian guidance consistently does is compute VAT **once on the taxable
subtotal** — "add the taxable line totals first, then calculate 7.5% VAT on that
taxable subtotal" ([invoicegenerator.ng](https://www.invoicegenerator.ng/vat-calculator-nigeria)),
and every sample invoice layout shows subtotal → VAT → total
([invoicemonk](https://invoicemonk.com/en/blog/vat-invoice-format-ng)).

**Design that survives either ruling:** compute the tax base per tax code
(7.5% standard, 0% zero-rated, exempt), round the tax **once per tax code per
document**, and derive per-line tax for display only, with the residual assigned
to the largest line so per-line sums equal the document tax exactly. That is also
what Peppol/UBL validation expects, so the same numbers clear MBS without a
second rounding path. **Open action: confirm against the FIRS VAT Act /
regulations and the MBS implementation guide before the first e-invoiced
invoice.** Until confirmed, it is an assumption with a named owner, not a guess.

### 10.3 Landed cost — remainder rule, accepted

Allocate proportionally by the chosen basis (`by_value | by_weight |
by_quantity`), compute in `Numeric(18,6)`, compute the residual against the
actual cost total, and assign it **deterministically to the largest-value line**
(tie-break: lowest `line_id`). Store `allocation_basis` and a hash of the input
cost rows on the receipt. Post the allocation as its own journal entry so the
freight bill, the allocation, and the inventory value are three visible objects
rather than one number everyone trusts.

### 10.4 D5 — append-only with supersede, accepted

The object carries: subject, action, breached threshold (kind + value), requested
value, pre-state snapshot, requester, approver, decision, reason code, timestamp,
device. **No update in place:** a decision is a new row with `supersedes_id`, and
the current decision is the row nothing supersedes. An approval you can edit is a
log with extra columns.

---

## 11. Three additions to the plan

### 11.1 Approvals must work with the WAN down (the plan's real gap)

This is an offline-first POS. A void at 14:00 with the link down still has to be
approvable, and the entire point of D5 is that it cannot be self-approved. The
model in `FORMAL_RETAIL_SCOPE.md` implies a server round-trip that will not exist
at the till.

**Design:**

- **Device identity in D1**: every terminal is enrolled with a device id and a
  device keypair. Every offline operation is signed by the device. The actor is
  `(device_id, staff_id)`, never the string `"offline-sync"`.
- **Local supervisor approval**: the supervisor authenticates at the till
  (PIN verified against a local hash of a server-issued credential, cached with
  an expiry and a maximum offline age). The till writes an approval record
  `origin = local`, signs it, and queues it with the sale.
- **Server reconciliation on sync**: the server re-checks the threshold against
  current policy, the approver's role, separation of duties, and the offline age
  limit; a failure is a **money event**, not a sync error — the sale stands
  (the customer has already left) and an exception is raised for review, with
  the variance visible in the till-close report.
- **Thresholds cache at the till with a version**, so an offline till uses the
  policy as of its last sync and reports that version — otherwise every disputed
  void is "the policy had changed".

Without this, offline POS either blocks sales (unusable) or silently
self-approves (the fraud the object exists to prevent).

### 11.2 SQLite has no fixed-point — the local mirror forces the representation

The desktop DB is SQLite. It has no `NUMERIC(p,s)` with fixed-point semantics;
`REAL` is IEEE double and would reintroduce exactly the error being removed.

- **Money: `INTEGER` minor units. Quantity: `INTEGER` thousandths (milli-units).
  Rates: `INTEGER` millionths.** Exact in SQLite, exact in Postgres, exact on the
  wire.
- **The sync contract carries integers only.** No decimal strings for money, no
  floats for quantity, no `1.075` tax factors. A JSON number is a double; keep
  every monetary value an integer the whole way.
- **Currency exponent**: `ALLOWED_CURRENCIES` includes JPY (0 decimals), so an
  integer called "kobo" is a latent bug. For the chain edition, either fix the
  exponent to 2 and constrain the edition to NGN, or store `amount_minor` +
  `currency` + `exponent` and format at the edge. Recommendation: **NGN-only,
  exponent 2, `CHECK (currency = 'NGN')`** until multi-currency returns — a
  Naira system, not a money library.

### 11.3 Exactness evidence, not conversion confidence (your sharpest point)

You are right that a green suite is not evidence. Concretely, three mechanisms:

1. **An architecture test that fails if a money column is typed `Float`** —
   iterate `Base.metadata.tables`, assert no column in `MONEY_COLUMNS` has type
   `Float`/`REAL`. This is a permanent invariant, cheap to keep.
2. **Property tests on arithmetic**: for random baskets, `Σ lines == subtotal`,
   `subtotal + tax == total`, `Σ allocated costs == total costs` (for every
   basis), `Σ tenders == total` including split tender. `hypothesis` over integer
   minor units finds the residual bugs human examples miss.
3. **Delete the tolerant assertions.** The suite today asserts money as float
   literals — including a test I added yesterday:
   `assert float(rows[0]["total_revenue"]) == 10.0`. Exact-integer assertions
   (`== 1000` for ₦10.00) are the only ones that survive the type change, and
   any `pytest.approx` on money should become a hard failure in review.

### 11.4 One more surface to keep honest

The Supabase snapshot is generated from the ORM, and the Alembic chain is
hand-written. Add a CI check that (a) the snapshot regenerates identically from
`models.py`, and (b) a freshly migrated Postgres schema matches the models
(`alembic upgrade head` then compare `information_schema`). Today, "the three
schemas agree" is an assumption.

---

## 12. Open questions that need a human decision, not an engineer

1. **VAT rounding** — confirm with FIRS guidance / the chain's auditor (§10.2).
2. **Currency/exponent** — NGN-only for the chain edition, or build the exponent
   now (§11.2).
3. **Implementation model** — productised onboarding to 5 days, a day-rate
   service line, or an integrator network. Pick before the second customer.
4. **Approval policy ownership** — does the chain's finance team configure
   thresholds per branch, and who can change them without an approval by the
   person they constrain?
5. **Migration cutover** — does an existing Co-op tenant (one branch, order-based
   selling) migrate into the chain product in place, or is the chain product a
   separate edition with a one-way import? This decides whether D1–D3 are a
   migration or a new database.

---

## 13. What to send back

- §9.1 classification: confirm the 8 money / 2 rate split, and rule on
  `analytics_snapshots.metric_value`.
- §10.1 gate definition: accept "recompute from lines" over "compare to the old
  float", and any pre-existing document mismatches become a **data-defect report
  for the customer**, not a migration failure.
- §11.1 offline approval flow: this is the part of D5 that touches POS, and it
  needs agreement before POS starts.
- §11.2 integer-only representation: if you disagree, say so now — it is the
  cheapest thing to change today and the most expensive in six months.
