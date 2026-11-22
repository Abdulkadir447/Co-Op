# D2 — Exact money

**Status:** implemented on `arena/06237ab6-co-op` (2026-10-24). Gates green:
507 backend tests, `ruff` clean, 26 frontend tests + `tsc` + eslint clean,
91 Electron tests (2 skipped).

This is the second of the five irreversible decisions. It comes after branches
because a ledger that is exactly wrong is still wrong.

---

## 1. The bug being fixed

Every money column was a `float`. In SQLite that is a `REAL`, an IEEE-754 double.
A double cannot represent 0.01, so:

```
>>> 0.1 + 0.2
0.30000000000000004
```

Add a thousand order lines and the drift is no longer theoretical. Then VAT is
computed on the drifted subtotal, the invoice is one kobo off the sum of its own
lines, and an accountant who checks the arithmetic finds a number that is wrong
in a way nobody can explain. A ledger that is *nearly* right is a ledger nobody
trusts — and a chain's whole reason for buying software is that the numbers are
checkable.

## 2. What changed

| Before | After |
|---|---|
| `unit_price REAL` (naira) | `unit_price INTEGER` (kobo) |
| `total_amount REAL` | `total_amount INTEGER` |
| `tax_rate REAL` (7.5) | `tax_rate INTEGER` (75 000 = 7.5% × 10 000) |
| Python `float` | Python `Decimal` |
| `round()` (banker's) | `ROUND_HALF_UP` — 0.125 → 0.13 |

Nine money columns and two rate columns. The `Money` and `Rate` column types in
`backend/money.py` do the conversion at the database boundary, so no route,
report or job ever sees a float amount:

* **in** — a stored kobo integer becomes `Decimal("19.99")`;
* **out** — a `Decimal` becomes integer kobo, rounded half-up, exactly once.

`Decimal` refuses to be added to a `float` (`TypeError`). That is not an
inconvenience, it is the guard: the one place a float could re-enter a total is
the place Python stops the program. Making the suite green entailed finding
every such site — reports, dashboards, the AI context, invoice documents,
receivables, the importer, sync, backups, the demo seed — which is precisely
the audit the change was for.

### Rounding, stated once

Money is rounded **once per line**, and a subtotal is the sum of those rounded
lines. Tax is computed **once on the subtotal**, not per line. A grand total is
the sum of two already-rounded values, so it introduces no further rounding.
That ordering is deliberate: rounding a sum is not the sum of roundings, and
only this way can the invoice prove `Σ lines == subtotal` exactly.

### One currency, enforced in the database

Money is stored as kobo, so the minor unit is fixed at **2**. A currency with a
different exponent — JPY has none, KWD has three — would be silently
mis-scaled by a hundred or a thousand, and a stored integer does not carry its
own currency. Therefore:

* `businesses.currency` is constrained by `CHECK (currency = 'NGN')`;
* `POST /business/settings` rejects any other code with a **422** and says why;
* new tenants are created in NGN; the settings screen offers NGN only.

This is the "Naira-only chain edition" decision made physical. When the parked
USD/SMB edition returns it needs its own exponent handling, not a quiet change
to this column.

### Proof instead of assertion

Green tests written against floats prove nothing: `assert 0.1 + 0.2 == 0.3`
passes or fails for reasons unrelated to the storage type. `test_money.py`
therefore tests things that only hold if the storage is exact:

* `0.1 + 0.2 == 0.3`, and 100 × 0.1 == 10.00 exactly;
* half-up rounding (0.125 → 0.13), contrasted with Python's `round` giving 0.12;
* `to_minor`/`from_minor` round-trips for awkward amounts;
* **architecture** — every money column in the ORM must be `Money`/`Rate`, and
  the only `Float` left in the whole schema is `analytics_snapshots.metric_value`
  (a cached, derived number, now accompanied by `metric_unit`);
* **the database itself** — column types are inspected, not assumed;
* through the real API — `Σ lines == subtotal`, `subtotal + tax == grand_total`,
  six odd tenders settle an order to exactly 0.00, and a payment row reads back
  as 10 then 20 kobo;
* the wire never carries money as a string, in any endpoint tested.

## 3. The decision I reversed, and why

The reviewer's plan said **integers on the wire** as well. I did not do that,
and it is worth being blunt about why:

* the renderer reads money in dozens of screens and does its own formatting;
  switching the wire to kobo means touching every one of them, in the same
  change as a storage rewrite. That is how a migration ships two bugs at once;
* every number the app *acts* on is recomputed server-side. The client formats,
  it does not decide;
* so the wire still carries **naira as a JSON number with two decimals**
  (`19.99`), and `backend/money.py::jsonable` is the one place a `Decimal`
  becomes a float. It is display-only, and it is named that way.

The commitment that follows: **the till's own wire is integer kobo from birth.**
POS does not exist yet, so its sale lines and tender lines can be born exact
the way `sale_lines` was always going to be. That is a smaller, safer change
than converting the whole UI now.

## 4. What is still inexact, and why that is acceptable

| Surface | Stored as | Why it is not a problem |
|---|---|---|
| `analytics_snapshots.metric_value` | float + `metric_unit` | A cache. Every figure the owner is shown is recomputed from the ledger. |
| Frontend local analytics | JS number | Display arithmetic over mirrored values. The mirror is a cache; nothing is posted from it. |
| Forecast estimate | float | An estimate, not a ledger entry; it is labelled as a forecast in the UI. |
| Percentages everywhere | float | A ratio has no kobo. `_pct` deliberately returns a float. |
| Electron mirror (`0001_init.js`) | `REAL` | It now receives 2-decimal numbers, so it holds what the server computed. It will move to kobo when POS lands and the till needs to compute — not before. |
| Platform billing (`payments`, Paystack) | `amount_kobo INTEGER` | Already minor units. Outside the tenant ledger. |

## 5. Migration

`0027_exact_money` converts on Postgres, in SQL:

```sql
ALTER TABLE orders ALTER COLUMN total_amount TYPE INTEGER
  USING ROUND(total_amount::numeric * 100)::integer;
```

One statement per column, inside one transaction. `ROUND` on `numeric` is
half-away-from-zero, which matches the application. Then it adds the NGN check
constraint — refusing to run if any tenant is on another currency, because that
needs a human decision, not a multiplication — and adds
`analytics_snapshots.metric_unit`.

The Supabase snapshot was updated to the same shape by hand again (no
`pg_dump`/Postgres in the build sandbox). **Regenerate it with
`supabase/scripts/export_schema.py` on a machine that has both and diff the
result before applying it to a real project.**

## 6. What this means in plain terms

Before, the system stored prices as approximations and hoped the errors stayed
small. Now it stores whole kobo — the smallest unit of Naira — so adding up a
thousand invoices gives the right answer exactly, not nearly.

One thing changed visibly: the company currency is Naira and the app refuses to
be set to anything else, because the storage format assumes two decimal places.

## 7. Next

**D3 — quantities and units of measure**: `Numeric(12,3)` for
`order_items.quantity`, `stock_movements.change` and `products.reorder_level`;
`products.current_stock` replaced by a stock-position table per branch, because
a chain does not have "one" stock number.

Then D5 (approvals that work with the WAN down), landed-cost allocation,
position recompute, PO/GRN, POS, MBS.
