# Formal retail: scope, data model, and what it costs

A specification for the product this codebase would have to become in order to
sell to formal retail chains. Written against the **actual schema in
`backend/models.py`** (25 tables, verified 2026-10-23), not against the docs.

---

## 0. "Formal", defined precisely

Formal is not a size band. It is **third-party accountability**: someone
outside the business can demand the records and punish you for them being wrong.

Four tests. A retailer that fails any of them is informal, whatever its turnover:

1. **A registered entity with a TIN and VAT registration** — so the invoices are
   tax instruments, not receipts.
2. **A lender or lessor with a covenant** — stock finance, BOI facilities, or a
   landlord who wants audited turnover. Someone reads the numbers to decide
   whether to keep funding you.
3. **An auditor who is not the owner's cousin** — year-end accounts that a bank
   or a franchisor will accept.
4. **Staff who are not family** — because once you cannot watch everyone, the
   audit trail replaces your eyes. This is the one that changes the software.

The dividing line for a build decision: **informal software answers "what did I
sell?" Formal software answers "prove it."** Every requirement below follows
from the second question — including the boring ones, especially the boring ones.

### The tier, corrected

"3–40 stores" is two businesses, not one:

| Tier | Stores | Software budget | Delivery cost per chain | Verdict |
|---|---|---|---|---|
| Micro-chain | 1–7 | near zero; will use a spreadsheet + WhatsApp | 2–6 weeks to onboard properly | **Do not sell.** The implementation labour exceeds the ACV. |
| Mid-chain | 8–40 | real, ₦300k–₦1.5m/mo plausible | 4–10 weeks (migration, counts, training per store) | **This is the market.** |
| Large | 40+ | procurement, RFPs, integrators | 6–18 months | Lose early. Revisit with references. |

The economics only work where **annual contract value ≥ 3–5× delivery cost**. At
₦200k/mo (~$130), a 10-week implementation is a loss. At ₦1m/mo (~$650), it is a
business. So the real target is **8–40 stores**, and the bottom of your stated
range is a customer you should be willing to lose.

---

## 1. The fork you cannot avoid

This spec is not an extension of the current product. It is a different company,
and one standing instruction collides with it head-on.

| | Current build | This spec |
|---|---|---|
| Market | USD, US-first | Nigeria, Naira-native |
| Customer | one shop, one owner | 8–40 store chain with a finance function |
| Price | $29 / $99 per business / month | ₦300k–₦1.5m per chain / month |
| Shape | order → invoice → receivable | POS → till → GRN → AP → GL |
| Moat in pitch | AI that reads your records | shrinkage, cash control, landed cost |
| Revenue model | self-serve software | software + implementation services |

**Treated as a reversal for this workstream:** the USD/SMB line is parked, not
deleted. Two products on one core is possible but only if the fork happens at
the schema (branch dimension) and the pricing, and it doubles the sales motion —
which one person cannot run. Pick one.

The AI carries over, but not as the pitch. See §7.

---

## 2. What the existing code gives you (verified)

Reusable, and worth real money because it is already tested:

| Asset | Why it survives |
|---|---|
| `client_id` ULID idempotency (products, customers, orders, items, movements) | This is the hard part of offline POS and it is **already correct** — an offline sale replayed twice applies once. |
| Append-only ledgers (`stock_movements`, `order_payments`, `audit_log`) | Right shape. Extend, do not replace. |
| Tenant scoping at one choke point (`get_current_business` + RLS GUC) | Becomes branch scoping with a second level, not a rewrite. |
| Optimistic `version` columns + 471 tests | The safety net that makes a schema migration survivable. |
| Electron shell (`sandbox`, `contextIsolation`, allow-listed IPC) | The only realistic path to serial/ESC-POS hardware. This is an advantage over a web-only competitor. |
| CSV/XLSX importer with per-row errors | Becomes the onboarding tool. Onboarding is the churn point. |
| Audit log + 6 roles + path write-matrix | A skeleton. Not sufficient — see D5. |

Must be replaced, and the cost is highest *after* the first paying customer:

| Current | Problem for formal retail | Verdict |
|---|---|---|
| **All money is `Float`** — 11 columns, zero `Decimal`/`Numeric` in the codebase | `0.1 + 0.2 != 0.3`. An auditor will find a ledger that does not foot. This alone disqualifies the product from the tier it is aiming at. | **Replace now.** Cheap at 25 tables and 471 tests; brutal later. |
| **Quantity is `Integer`** (`order_items.quantity`, `stock_movements.change`) | Weighed goods cannot exist. Most of this market sells by kg. | Replace. |
| `products.current_stock` (a stored integer on the product) | No branch, no cost layer, no batch. Single location by construction. | Replace with position + cost. |
| No `branch` anywhere in the backend (grep `branch_id`: zero hits) | The entire spec is per-branch. | Add as a dimension, not a filter. |
| No supplier, PO, GRN, or AP (grep: zero hits) | You can sell stock but not buy it. Cannot compute landed cost or margin. | Net new. |
| No cash/till concepts; `order_payments` is receivable collection | No float, no blind close, no variance, no deposit reconciliation. | Net new. |
| Order totals stored on `orders`, invoice has no amounts | For POS, the receipt must be immutable and self-contained (it is the tax document once e-invoicing lands). | Net new receipt model. |

---

## 3. The five irreversible decisions

These determine whether it is buildable. Everything else is work.

### D1 — Branch is a dimension on every stock and money row, never a filter

`branch_id NOT NULL` on every movement, receipt, sale, till, count, transfer and
journal line. A "branch filter" is what generates the bugs you spend year two on:
one query misses the predicate and a chain reports consolidated stock as if it
were one shop.

Cost of doing it now: one migration, mechanical. Cost of retrofitting after a
customer has data: you are rewriting every ledger with a backfill that cannot be
validated against anything.

### D2 — Money is exact

Two-tier rule, because one type cannot do both jobs:

- **Posted amounts** (receipts, payments, ledger, invoice totals):
  `Numeric(18,2)` in NGN, or integer minor units. One representation, no float.
- **Unit rates and allocations** (landed unit cost, FX, apportioned freight):
  `Numeric(18,6)`. A $12,400 freight bill split across 340 lines does not
  divide into 2 decimals; rounding at line level and again at posting is how
  variance appears from nowhere.

Rounding rules become explicit and testable: line, tax, then document rounding,
with the residual assigned to the largest line (not "the last one" — that is a
bug that only shows up on one basket in ten thousand).

### D3 — Quantity is `Numeric(12,3)` with a unit of measure

`uom` on the product (`each`, `kg`, `litre`), `is_weighed`, and a `plu` for
goods with no GTIN. Integer stock cannot represent 0.375 kg of rice, and the
weighed-goods share of a Nigerian grocery is not a rounding error — it is most
of the basket.

### D4 — Stock is a position per (branch, product) with cost, not a number on the product

```
stock_positions(branch_id, product_id, qty_on_hand, qty_in_transit, avg_cost, updated_at)
```

`avg_cost` moves on receipt using the **landed** unit cost (§4.2). Batch/expiry
is a second axis — a `stock_lots` table keyed by `(branch, product, batch_no,
expiry)` — required for pharmacy, and pharmacy is one of the few verticals here
with a real software budget.

Keep the movement ledger. `qty_on_hand` becomes a materialised cache that must
reconcile to `SUM(change)` — and there should be a nightly job that proves it,
because that check is the difference between a stock system and a stock guess.

### D5 — Approval is a first-class object, not a line in an audit log

The threat model is three people: the cashier, the receiver, the branch manager.
Design the trail before the features.

```
approvals(id, business_id, branch_id, subject_type, subject_id,
          action, threshold_kind, threshold_value,
          requested_by, requested_at, status, decided_by, decided_at,
          reason_code, reason_text)
```

Every sensitive action carries `approval_id` when it exceeds a threshold: void,
refund, price override, discount, no-sale, stock write-off, count variance,
credit-limit breach, supplier-invoice price variance. The threshold is data
(per role, per branch, per action), not code, because it changes per chain.

The test that makes this real: **a cashier cannot complete a void without a
second actor**, and the resulting `audit_events` row names both.

---

## 4. Data model, by capability

Column lists are the ones that matter; every table also gets
`business_id`, `branch_id` where applicable, `created_at/by`, and where the
entity is mutable, `version`.

### 4.1 Organisation and catalogue

```
branches(id, business_id, code, name, address, timezone,
         price_file_id, terminal_prefix, opened_at, closed_at)

products             existing + uom, is_weighed, plu, barcode(s), brand,
                     nafdac_number, nafdac_status, is_vat_exempt,
                     tax_class, is_batch_tracked, is_serial_tracked
product_barcodes     (product_id, barcode, pack_qty, uom)   -- multi-pack
product_prices       (branch_id, product_id, price, effective_from,
                      effective_to, is_shelf_edited)
                     -- per-branch price file; a central price is a row
                     -- replicated to every branch, not a global column
```

`is_shelf_edited` exists because staff edit prices at the shelf with a marker.
The system should count those, not pretend they did not happen.

### 4.2 Procurement, landed cost, three-way match

This is where the money leaks and where the differentiation lives.

```
suppliers(id, business_id, name, tin, terms_days, credit_limit,
          currency, is_active)
purchase_orders(id, business_id, branch_id, supplier_id, number, status,
                ordered_at, expected_at, currency, fx_rate, fx_date, notes)
po_lines(po_id, product_id, qty_ordered, unit_cost, uom, tax_code)

goods_receipts(id, business_id, branch_id, po_id, supplier_id, number,
               received_at, received_by, status)      -- GRN
receipt_lines(id, receipt_id, po_line_id, product_id, batch_no, expiry,
              qty_received, qty_rejected, unit_cost_foreign,
              landed_unit_cost, uom)

shipment_costs(id, receipt_id, kind, amount, currency, fx_rate, fx_date,
               allocation_basis, gl_account)
   kind: freight | duty | clearing_agent | port | insurance | inland | other
   allocation_basis: by_value | by_weight | by_quantity
```

**Landed cost rule:** `landed_unit_cost = (qty * unit_cost_foreign * fx_rate +
allocated_costs) / qty`. The FX rate is captured **per shipment** and stored on
the cost row, never read from a table of "today's rate" — a chain that receives
on a Monday and clears on a Thursday has two different Naira costs for the same
container, and both are correct.

```
supplier_invoices(id, business_id, branch_id, supplier_id, number,
                  invoice_date, due_date, currency, fx_rate,
                  subtotal, tax, total, status)
ap_line_matches(supplier_invoice_line_id, po_line_id, receipt_line_id,
                qty_matched, price_variance, qty_variance, status)
    status: matched | price_variance | qty_variance | unmatched | approved
ap_ledger(business_id, branch_id, supplier_id, entry_date, kind, amount,
          due_date, source_type, source_id)   -- derived, aging from it
supplier_payments(...)
```

Three-way match is the control point: a supplier invoice may not post if it does
not match a GRN within tolerance. Tolerance is per-chain data. Without it, the
receiver and the supplier split the difference and nobody finds out for a year.

### 4.3 POS, till, tender

```
terminal_profiles(id, branch_id, name, printer_kind, printer_address,
                  scale_kind, scale_address, drawer_kick, receipt_template)

till_sessions(id, business_id, branch_id, terminal_id, opened_by, opened_at,
              float_amount, closed_by, closed_at,
              counted_cash, expected_cash, variance,
              deposit_amount, deposit_reference, is_blind,
              status)     -- open | closed | reconciled | disputed

sales(id, business_id, branch_id, till_session_id, receipt_number,
      customer_id, sold_at, subtotal, tax, rounding, total,
      status, void_of_sale_id, cashier_id, device_id)
sale_lines(sale_id, product_id, plu, description_snapshot, qty, uom,
           unit_price, discount, tax_code, tax_amount, line_total,
           price_override_reason, approval_id)
tenders(sale_id, method, amount, provider, provider_ref, card_last4,
        approval_id)
      -- method: cash | card | transfer | wallet | credit | voucher
cash_movements(till_session_id, kind, amount, approval_id, note)
      -- float_in | pickup | deposit | no_sale | paid_out | adjustment
```

Rules that are not negotiable:

- **Blind close**: nothing returns `expected_cash` to the till before the count
  is submitted. The variance is computed server-side. The single most common
  fraud in this market is a cashier who knows the target.
- **Split tender is the default case**, not an edge: cash + card + transfer in
  one basket. `tenders` is a table for exactly this reason.
- **A sale is append-only.** A void is a new `sales` row with `void_of_sale_id`
  plus an approval. Never a delete, never an edit.
- **Prices snapshot onto the line** (`unit_price`, `description_snapshot`) so a
  receipt reprinted in 2029 says what it said in 2026.

### 4.4 Stock control

```
stock_movements      existing + branch_id, lot_id, uom, source_type, source_id,
                     approval_id          -- replaces the current enum-only reason
stock_lots           (branch_id, product_id, batch_no, expiry, qty, cost)
stock_counts         (branch_id, kind, scope_filter, status, counted_by,
                      approved_by, started_at, closed_at)
count_lines          (count_id, product_id, system_qty_snapshot, counted_qty,
                      variance_qty, variance_value, approval_id)
transfers            (from_branch_id, to_branch_id, status, requested_by,
                      approved_by, dispatched_at, received_at)
transfer_lines       (transfer_id, product_id, qty, qty_dispatched,
                      qty_received, variance)
```

Transfers must have an **in-transit state** — dispatched but not received is
neither branch's stock, and a system that cannot say that will show every
in-transit delivery as shrinkage.

### 4.5 Money and books

```
journal_entries(id, business_id, branch_id, entry_date, source_type,
                source_id, memo, posted_by)
journal_lines(entry_id, account_id, debit, credit, branch_id, cost_center)
accounts(id, business_id, code, name, type, parent_id)
```

You do not need a full GL to sell this. You do need **double-entry postings for
every business event** (sale, tender, GRN, landed cost, supplier invoice,
payment, stock variance, till variance) and an export that a bookkeeper loads
into QuickBooks/Xero/Sage for the statutory accounts. That is what an auditor
tests: can you reproduce the number from documents. It is also the cheapest path
to "audit-clean", and it keeps you out of the accounting-standard business.

### 4.6 Customer credit

```
credit_limits(customer_id, limit, terms_days, on_hold, approved_by)
ar_ledger(business_id, customer_id, entry_date, kind, amount, due_date,
          source_type, source_id)     -- derived; aging computed, never stored
```

Wholesale counter behind the retail counter is the norm. A credit limit that is
not enforced at the till is not a credit limit.

---

## 5. Compliance: e-invoicing is not a roadmap item any more

Verified 2026-10-23. Nigeria's mandatory e-invoicing runs on the NRS Merchant
Buyer Solution (MBS), Peppol BIS 3.0 UBL, cleared in real time, phased by
turnover:

| Phase | Turnover | Go-live | Enforcement |
|---|---|---|---|
| Large | ≥ ₦5bn | 1 Nov 2025 | live since 1 Jul 2026 |
| **Medium** | **₦1bn–5bn** | **1 Jul 2026** | **Q1 2027** |
| Emerging | < ₦1bn | 1 Jul 2027 | Q1 2028 |

Sources: [DDD Invoices](https://dddinvoices.com/learn/e-invoicing-in-nigeria),
[vatupdate briefing](https://www.vatupdate.com/2026/02/19/briefing-document-podcast-e-invoicing-and-e-reporting-in-nigeria/),
[orchidatax](https://orchidatax.com/countries-compliance/nigeria-e-invoicing-compliance/).
Dates have slipped once (Nov 2025 was itself an extension) and are subject to
NRS revision — re-verify before committing to a customer contract.

**What this means concretely:**

- Your target tier — an 8–40 store chain turning over ₦1bn+ — is **already past
  its go-live date and inside the grace window**, with penalties from Q1 2027.
  A chain buying ERP today is buying a compliance deadline, not a nice-to-have.
  That is the strongest sales argument on this list and it expires in months.
- Architecturally it forces: IRN + CSID + QR per invoice, a clearance call in the
  sales path (B2B), 24-hour post-reporting for B2C over ₦50,000, and a receipt
  template that prints a QR the customer can verify. This shapes `sales` and
  `tenders`, so it must be designed in, not bolted on.
- **Input VAT recovery depends on MBS-validated invoices.** A chain loses credit
  on any purchase it cannot evidence. That cuts both ways: it makes your
  supplier-side capture valuable, and it means a customer will not accept your
  system unless it can consume MBS-validated supplier invoices.
- VAT: 7.5%. Registration threshold ₦50m (raised from ₦25m by the 2025 reforms),
  below which a business is outside both VAT and e-invoicing.

Also needed for this tier: FIRS-compliant invoice layout (TIN, RC number,
address, VAT breakdown), and per-branch tax registration where a chain files
across states.

---

## 6. Effort, honestly

Estimates for **one experienced engineer**, and they are estimates:

| Workstream | Weeks | Note |
|---|---|---|
| D1–D3 foundation: branch, exact money, Decimal qty, UoM | 4–5 | Touches every table, schema, report and test. Do it first, alone. |
| Catalogue: barcodes, PLU, NAFDAC, batches/expiry, per-branch price files | 3 | |
| Procurement: suppliers, PO, GRN, landed cost, three-way match, AP aging | 6–7 | The differentiator and the biggest single block. |
| POS: till sessions, blind close, split tender, voids/refunds, receipt | 7–9 | Plus ESC-POS printing, scale, drawer. Hardware is never as quick as it looks. |
| Stock: positions, lots, counts, transfers with in-transit, shrinkage | 4–5 | |
| Approvals + audit + fraud controls | 3 | Cheapest per unit of risk removed. Do it early, not last. |
| Offline POS sync hardening (multi-terminal, conflict policy) | 5–7 | Existing ULID idempotency helps; the hard part is queue ordering and terminal identity. |
| Journal + lender pack + accounting export | 5–6 | |
| MBS e-invoicing integration + certification | 5–8 | External dependency; assume the long end. |
| Onboarding tooling: Excel/QBO migration, supervised SKU build | 4 | This is churn prevention, not a feature. |
| Multi-store dashboards (phone-first) + device health | 3 | |

**Total: ~50–62 engineer-weeks, ≈ 12–14 months solo, ≈ 6–8 months for two.**
That is the software only. It does not include implementations, support, or
hardware certification.

And the thing that actually kills it is not in that table:

> **Implementation labour you did not price.** Migration of a chain's price file
> and SKU master: 1–3 weeks. Baseline stock count per store: 1–3 nights of
> night-work. Training per store: 2–3 days, per shift. Hardware install and
> network: 1–2 days per till. For a 10-store chain that is **6–10 weeks of a
> person**, and it happens again for every customer. Software margin does not
> survive being spent on site.

Three ways out, and you need to pick one before you sign the second customer:
productise onboarding until it is 5 days (barcode-driven SKU build, import with
per-row repair, self-serve training), charge implementation separately at a day
rate, or build a small integrator network and give them the margin. Most
successful mid-market ERP companies do all three.

---

## 7. What to skip, and what the AI becomes

**Skip for now:** loyalty, demand forecasting, a customer mobile app, generic BI,
multi-currency accounting beyond FX on purchases, and any AI that *predicts*.
Nobody switches ERP for those, and each one is a maintenance liability you will
carry into every support call.

**The AI's only honest job here** is exception triage on verified data, and it
maps almost exactly onto what is already built:

- "Branch 4's gross margin fell 6 points in three weeks — the cause is landed
  cost on rice rising 14% while shelf price did not move."
- "Void rate at Terminal 2 is 8× the network average, concentrated on two
  cashiers, 90% between 19:00 and 21:00."
- "Blind-close variance at Branch 7 has been negative every Friday for six
  weeks."

That is fraud and shrinkage analytics delivered as a briefing, not a chat box,
and the existing architecture is already correct for it: deterministic context
rebuilt server-side, a validated JSON contract, no writes, no DB access. The
learning ledger is genuinely useful here — it learns which exceptions this owner
dismisses. Keep the engine; the pitch is "it finds the money you're losing", not
"ask your business anything".

---

## 8. Verdict

**Buildable?** Yes — and this codebase is a better starting point than a blank
one, because the two hardest things to retrofit (offline idempotency and
tenant scoping) are already correct and tested.

**Not buildable as stated, by one person, this year.** 50–62 engineer-weeks plus
an implementation business is a two-person, 6–8 month software build followed by
a services company. Scope discipline matters more than speed: the first sellable
slice is **one branch, one till, PO→GRN→landed cost, blind close, approvals,
journal, MBS export** — which is roughly 20–24 weeks and is enough to win a
pilot in a single store of a chain that has already missed its compliance date.

**The two things I would do before writing any of the new tables:**

1. Convert money to exact types and quantities to `Numeric`+UoM, and add
   `branch_id`. It is a destructive migration later and a mechanical one now.
2. Decide the fork in §1 explicitly, because every table above assumes the
   Naira/chain answer, and half of them are wrong if the answer is the USD/SMB
   product.
