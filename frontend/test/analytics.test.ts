/**
 * OFFLINE 3.5 — port-fidelity tests for the local analytics engines.
 *
 * These pin the local calculators to the SERVER's semantics (the ports'
 * contract): known inputs -> the exact outputs the backend produces. Run:
 *
 *   ./node_modules/.bin/tsc test/analytics.test.ts --outDir /tmp/anatest \
 *     --module commonjs --target es2020 --moduleResolution node \
 *     --esModuleInterop --skipLibCheck
 *   node --test /tmp/anatest/test/
 *
 * Dates are built relative to today so the suite is wall-clock independent.
 */
import test from 'node:test';
import assert from 'node:assert';

import {
  addDays,
  dayDiff,
  dayOf,
  fmtDay,
  fmtDayYear,
  money,
  monthStart,
  previousMonthStart,
  todayIso,
} from '../src/analytics/localTypes';
import type { LCustomer, LOrder, LOrderItem, LProduct, LocalBundle } from '../src/analytics/localTypes';
import {
  byCategory,
  inventorySummary,
  recentOrders,
  summary,
  timeseries,
  topProducts,
} from '../src/analytics/localDashboard';
import {
  buildLocalReport,
  parseFilters,
  previousRange,
  type LocalReportFilters,
} from '../src/analytics/localReports';
import { buildLocalBriefing } from '../src/analytics/localBriefing';

// ---------------------------------------------------------------------------
// Bundle builders
// ---------------------------------------------------------------------------

const today = todayIso();
const firstThis = monthStart(today);
const firstLast = previousMonthStart(firstThis);
const d = (n: number) => addDays(today, n); // -n = n days ago

let oid = 0;
let iid = 0;

/** Reset the row-id counters so tests can reference order_id: 1..n deterministically. */
function resetIds() {
  oid = 0;
  iid = 0;
}

function order(o: Partial<LOrder> & { order_date: string; status: string; total_amount: number }): LOrder {
  oid += 1;
  return { id: oid, customer_id: 1, ...o, created_at: o.order_date } as LOrder;
}
function item(o: Partial<LOrderItem> & { order_id: number; product_id: number; quantity: number; unit_price: number }): LOrderItem {
  iid += 1;
  return { id: iid, total_price: o.quantity * o.unit_price, ...o } as LOrderItem;
}
function product(p: Partial<LProduct> & { id: number; name: string }): LProduct {
  return { sku: null, category: null, unit_price: 100, cost_price: null, current_stock: 10, reorder_level: 2, ...p } as LProduct;
}
function customer(c: Partial<LCustomer> & { id: number; full_name: string }): LCustomer {
  return { email: `c${c.id}@x.com`, created_at: today, ...c } as LCustomer;
}

function bundle(b: Partial<LocalBundle> = {}): LocalBundle {
  return {
    business: { id: 1, name: 'Test Co', currency: 'USD' },
    orders: [],
    items: [],
    products: [product({ id: 11, name: 'Chair', unit_price: 100, cost_price: 40, current_stock: 10, reorder_level: 3, category: 'Furniture' })],
    customers: [customer({ id: 1, full_name: 'Grace' })],
    movements: [],
    ...b,
  };
}

// ---------------------------------------------------------------------------
// Filters (port of backend/reports/filters.py)
// ---------------------------------------------------------------------------

test('filter defaults: last 30 days including today', () => {
  const f = parseFilters({ from: null, to: null });
  assert.strictEqual(f.to, today);
  assert.strictEqual(dayDiff(f.from, f.to), 29);
});

test('filter validation mirrors the server messages', () => {
  assert.throws(() => parseFilters({ from: d(-5), to: d(-10) }), /'from' must be on or before 'to'/);
  assert.throws(() => parseFilters({ from: '2020-01-01', to: '2026-01-01' }), /2 years/);
  assert.throws(() => parseFilters({ compare: 'bogus' }), /compare must be one of/);
  assert.throws(() => parseFilters({ from: '2026-13-40' }), /Invalid date/);
});

test('previous_range: all three compare modes', () => {
  // previous_period: equal-length window ending the day before `from`.
  let f = parseFilters({ from: d(-29), to: today, compare: 'previous_period' });
  let prev = previousRange(f)!;
  assert.strictEqual(prev[1], d(-30));
  assert.strictEqual(dayDiff(prev[0], prev[1]), 29);

  // previous_month: the whole previous calendar month.
  f = parseFilters({ from: firstThis, to: today, compare: 'previous_month' });
  prev = previousRange(f)!;
  assert.strictEqual(prev[0], firstLast);
  assert.strictEqual(prev[1], addDays(firstThis, -1));

  // previous_year: same window shifted back a year (Feb 29 -> Feb 28).
  f = { from: '2024-02-28', to: '2024-03-02', compare: 'previous_year', category: null, product_id: null, customer_id: null } as LocalReportFilters;
  prev = previousRange(f)!;
  assert.strictEqual(prev[0], '2023-02-28');
  assert.strictEqual(prev[1], '2023-03-02');
  const leap: LocalReportFilters = { from: '2024-02-29', to: '2024-03-01', compare: 'previous_year', category: null, product_id: null, customer_id: null };
  assert.strictEqual(previousRange(leap)![0], '2023-02-28', 'Feb 29 falls back to Feb 28 of the prior year');
  assert.strictEqual(previousRange(leap)![1], '2023-03-01', 'Mar 1 shifts cleanly');
});

// ---------------------------------------------------------------------------
// Dashboard summary (port of /dashboard/summary)
// ---------------------------------------------------------------------------

test('dashboard summary: statuses, growth, profit, stock', () => {
  resetIds();
  const b = bundle({
    orders: [
      order({ order_date: today, status: 'delivered', total_amount: 200, customer_id: 1 }), // counts TODAY + month
      order({ order_date: today, status: 'pending', total_amount: 500, customer_id: 1 }), // NOT today (delivered-only)
      order({ order_date: d(-1), status: 'shipped', total_amount: 300, customer_id: 1 }), // month (if in month) + active
      order({ order_date: addDays(firstLast, 4), status: 'shipped', total_amount: 1000, customer_id: 1 }), // last month
      order({ order_date: d(-1), status: 'cancelled', total_amount: 999, customer_id: 1 }), // excluded everywhere
    ],
    items: [
      item({ order_id: 1, product_id: 11, quantity: 2, unit_price: 100 }), // cost 40 -> profit 120
      item({ order_id: 2, product_id: 11, quantity: 5, unit_price: 100 }),
      item({ order_id: 3, product_id: 11, quantity: 3, unit_price: 100 }),
    ],
    products: [
      product({ id: 11, name: 'Chair', unit_price: 100, cost_price: 40, current_stock: 2, reorder_level: 3 }), // strictly low
      product({ id: 12, name: 'Table', unit_price: 50, cost_price: null, current_stock: 0, reorder_level: 1 }), // out
    ],
    customers: [customer({ id: 1, full_name: 'Grace', created_at: firstThis }), customer({ id: 2, full_name: 'Old', created_at: addDays(firstLast, 2) })],
  });

  const s = summary(b);
  assert.strictEqual(s.revenue_today, 200, 'today = delivered only');
  assert.strictEqual(s.orders_today, 1);
  // month = shipped+delivered in the current calendar month. Order 2 (pending,
  // 500) never counts; order 3 (300) lands in the current month unless today
  // is the 1st — keep the math date-robust.
  const order3InMonth = d(-1) >= firstThis;
  const monthRev = 200 + (order3InMonth ? 300 : 0);
  const lastRev = 1000 + (order3InMonth ? 0 : 300);
  assert.strictEqual(s.revenue_month, monthRev);
  assert.strictEqual(s.revenue_growth_percent, Math.round(((monthRev - lastRev) / lastRev) * 100 * 100) / 100);
  // profit = (100-40) x units over the month's ACTIVE lines: order 1 (2) +
  // order 3 (3, if in month). Order 2's 5 lines are pending -> excluded.
  assert.strictEqual(s.profit_month, 120 + (order3InMonth ? 180 : 0));
  assert.strictEqual(s.low_stock_count, 1, 'strictly low: 0 < stock <= reorder');
  assert.strictEqual(s.out_of_stock_count, 1);
  assert.strictEqual(s.customers_total, 2);
  assert.strictEqual(s.customers_new_month, 1);
  assert.strictEqual(s.products_count, 2);
});

test('timeseries omits missing days; by-category + top products semantics', () => {
  const b = bundle({
    orders: [
      order({ order_date: today, status: 'shipped', total_amount: 100 }),
      order({ order_date: d(-2), status: 'shipped', total_amount: 50 }),
      order({ order_date: d(-5), status: 'pending', total_amount: 10 }),
    ],
  });
  const ts = timeseries(b, 30);
  assert.deepStrictEqual(ts.map((p) => p.date), [d(-2), today].sort());
  assert.strictEqual(ts.reduce((s, p) => s + p.revenue, 0), 150, 'pending orders excluded');

  const b2 = bundle({
    products: [
      product({ id: 1, name: 'A', unit_price: 10, current_stock: 2, category: 'X' }),
      product({ id: 2, name: 'B', unit_price: 10, current_stock: 3, category: null }),
    ],
  });
  const cats = byCategory(b2);
  assert.strictEqual(cats[0].category, 'Uncategorized', 'null category bucketed + sorted by value');
  assert.strictEqual(cats[0].value, 30);

  // top products: ALL items (no order-status filter), ranked by units.
  const b3 = bundle({
    orders: [
      order({ order_date: today, status: 'cancelled', total_amount: 100 }),
      order({ order_date: today, status: 'shipped', total_amount: 50 }),
    ],
    items: [
      item({ order_id: 1, product_id: 11, quantity: 2, unit_price: 100 }),
      item({ order_id: 2, product_id: 11, quantity: 1, unit_price: 100 }),
    ],
  });
  const tops = topProducts(b3, 5);
  assert.strictEqual(tops[0].total_quantity, 3, 'cancelled-order items count too (server semantics)');
});

test('inventorySummary mirrors /inventory/summary', () => {
  const s = inventorySummary(bundle({ products: [
    product({ id: 1, name: 'A', unit_price: 10, cost_price: 4, current_stock: 2, reorder_level: 5, category: 'X' }),
    product({ id: 2, name: 'B', unit_price: 10, cost_price: null, current_stock: 0, category: null }),
  ] }));
  assert.strictEqual(s.products_count, 2);
  assert.strictEqual(s.inventory_value, 2 * 4, 'cost price wins over unit price');
  assert.strictEqual(s.low_stock_count, 1);
  assert.strictEqual(s.out_of_stock_count, 1);
  assert.strictEqual(s.categories_count, 1, 'only non-null categories count');
});

// ---------------------------------------------------------------------------
// Sales report (port of sales_report)
// ---------------------------------------------------------------------------

test('sales report: KPIs, comparison overlay, tables, empty note', () => {
  resetIds();
  const o1 = order({ order_date: today, status: 'shipped', total_amount: 210, customer_id: 1 });
  const o2 = order({ order_date: d(-1), status: 'delivered', total_amount: 100, customer_id: 2 });
  const o3 = order({ order_date: today, status: 'cancelled', total_amount: 500, customer_id: 1 }); // excluded
  const b = bundle({
    customers: [customer({ id: 1, full_name: 'Grace' }), customer({ id: 2, full_name: 'Sam' })],
    products: [
      product({ id: 11, name: 'Chair', unit_price: 100, cost_price: 40, category: 'Furniture' }),
      product({ id: 12, name: 'Cup', unit_price: 10, category: 'Kitchen' }),
    ],
    orders: [o1, o2, o3],
    items: [
      item({ order_id: o1.id, product_id: 11, quantity: 2, unit_price: 100 }),
      item({ order_id: o1.id, product_id: 12, quantity: 1, unit_price: 10 }),
      item({ order_id: o2.id, product_id: 11, quantity: 1, unit_price: 100 }),
      item({ order_id: o3.id, product_id: 11, quantity: 5, unit_price: 100 }), // cancelled order's line
    ],
  });
  const f = parseFilters({ from: d(-29), to: today, compare: 'previous_period' });
  const r = buildLocalReport(b, 'sales', f);
  const k = Object.fromEntries(r.kpis.map((x) => [x.key, x]));

  assert.strictEqual(k.revenue.value, 310, 'cancelled order excluded from revenue');
  assert.strictEqual(k.orders.value, 2);
  assert.strictEqual(k.units.value, 4);
  assert.strictEqual(k.aov.value, 155);
  // Previous window (empty here): revenue 0 -> change null (prev zero).
  assert.strictEqual(k.revenue.previous, 0);
  assert.strictEqual(k.revenue.change_percent, null, 'pctChange is null when previous is 0');

  const prodTable = r.tables.find((t) => t.title === 'Top products')!;
  assert.deepStrictEqual(prodTable.rows[0], ['Chair', 3, 300, '96.8%'], 'share = line revenue / total revenue');
  assert.strictEqual(r.tables.find((t) => t.title === 'Sales by category')!.rows.length, 2);
  const custTable = r.tables.find((t) => t.title === 'Top customers')!;
  assert.deepStrictEqual(custTable.rows[0], ['Grace', 1, 210]);
  assert.strictEqual(r.notes.length, 0);
  assert.strictEqual(r.chart.labels.length, 2, 'one bucket per active order day');

  // Empty period note.
  const empty = buildLocalReport(bundle({ orders: [], items: [] }), 'sales', parseFilters({ from: d(-29), to: today }));
  assert.deepStrictEqual(empty.notes, ['No sales in this period (or matching these filters).']);
});

test('sales report line-level category filter', () => {
  resetIds();
  const o1 = order({ order_date: today, status: 'shipped', total_amount: 110 });
  const b = bundle({
    products: [
      product({ id: 11, name: 'Chair', unit_price: 100, category: 'Furniture' }),
      product({ id: 12, name: 'Cup', unit_price: 10, category: 'Kitchen' }),
    ],
    orders: [o1],
    items: [
      item({ order_id: o1.id, product_id: 11, quantity: 1, unit_price: 100 }),
      item({ order_id: o1.id, product_id: 12, quantity: 1, unit_price: 10 }),
    ],
  });
  const f = parseFilters({ from: d(-29), to: today, category: 'Kitchen' });
  const r = buildLocalReport(b, 'sales', f);
  assert.strictEqual(r.kpis[0].value, 10, 'a "Kitchen" report is the money Kitchen lines made');
  assert.strictEqual(r.kpis[1].value, 1, '…and orders count the distinct orders with such lines');
});

// ---------------------------------------------------------------------------
// Profit & Loss (port of profit_loss_report)
// ---------------------------------------------------------------------------

test('P&L: COGS only from cost-priced lines; coverage note; margin points', () => {
  resetIds();
  const b = bundle({
    products: [
      product({ id: 11, name: 'Chair', unit_price: 100, cost_price: 40 }),
      product({ id: 12, name: 'Cup', unit_price: 10, cost_price: null }),
    ],
    orders: [order({ order_date: today, status: 'shipped', total_amount: 110 })],
    items: [
      item({ order_id: 1, product_id: 11, quantity: 1, unit_price: 100 }),
      item({ order_id: 1, product_id: 12, quantity: 1, unit_price: 10 }),
    ],
  });
  const r = buildLocalReport(b, 'profit-loss', parseFilters({ from: d(-29), to: today }));
  const k = Object.fromEntries(r.kpis.map((x) => [x.key, x]));
  assert.strictEqual(k.revenue.value, 110);
  assert.strictEqual(k.cogs.value, 40, 'only cost-priced lines enter COGS');
  assert.strictEqual(k.gross_profit.value, 70);
  assert.strictEqual(k.gross_margin.value, 63.6, 'margin to 1dp');
  assert.match(r.notes[1], /Cost data covers 91% of sold-line value/);

  // Margin delta is in percentage POINTS.
  const p1 = order({ order_date: today, status: 'shipped', total_amount: 100 });
  const p2 = order({ order_date: addDays(monthStart(addDays(firstThis, -1)), 3), status: 'shipped', total_amount: 100 });
  const b2 = bundle({
    products: [product({ id: 11, name: 'Chair', unit_price: 100, cost_price: 40 })],
    orders: [p1, p2],
    items: [
      item({ order_id: p1.id, product_id: 11, quantity: 1, unit_price: 100 }),
      item({ order_id: p2.id, product_id: 11, quantity: 1, unit_price: 100 }),
    ],
  });
  const f2 = parseFilters({ from: firstThis, to: today, compare: 'previous_month' });
  const r2 = buildLocalReport(b2, 'profit-loss', f2);
  const km = Object.fromEntries(r2.kpis.map((x) => [x.key, x]));
  assert.strictEqual(km.gross_margin.previous, 60, 'both months 60% margin');
  assert.strictEqual(km.gross_margin.change_percent, 0, 'points, not percent');
});

// ---------------------------------------------------------------------------
// Inventory report (port of inventory_report)
// ---------------------------------------------------------------------------

test('inventory report: KPIs, risk ordering, movers', () => {
  resetIds();
  const b = bundle({
    products: [
      product({ id: 1, name: 'Outy', unit_price: 10, cost_price: 4, current_stock: 0, reorder_level: 2 }),
      product({ id: 2, name: 'Lowy', unit_price: 10, cost_price: 4, current_stock: 1, reorder_level: 5 }),
      product({ id: 3, name: 'Fine', unit_price: 10, cost_price: 4, current_stock: 50, reorder_level: 5 }),
    ],
    orders: [order({ order_date: today, status: 'shipped', total_amount: 100 })],
    items: [item({ order_id: 1, product_id: 3, quantity: 2, unit_price: 50 })],
    movements: [
      { id: 1, product_id: 3, change: 20, reason: 'purchase', order_id: null, created_at: today },
      { id: 2, product_id: 3, change: -2, reason: 'order', order_id: 1, created_at: today },
    ],
  });
  const r = buildLocalReport(b, 'inventory', parseFilters({ from: d(-29), to: today }));
  const k = Object.fromEntries(r.kpis.map((x) => [x.key, x]));
  assert.strictEqual(k.value.value, 0 + 1 * 4 + 50 * 4);
  assert.strictEqual(k.units.value, 51);
  assert.strictEqual(k.low.value, 1);
  assert.strictEqual(k.out.value, 1);
  assert.match(r.notes[0], /1 product out of stock/);

  const risk = r.tables.find((t) => t.title === 'Stock risk')!;
  assert.deepStrictEqual(risk.rows.map((r) => r[0]), ['Outy', 'Lowy'], 'out first, then low by stock asc');

  const mv = r.tables.find((t) => t.title.startsWith('Stock movement'))!;
  assert.deepStrictEqual(mv.rows, [['Fine', 20, 2, 18]]);

  const fast = r.tables.find((t) => t.title.startsWith('Fast movers'))!;
  assert.deepStrictEqual(fast.rows, [['Fine', 2, 50]]);
  const slow = r.tables.find((t) => t.title.startsWith('Slow movers'))!;
  assert.deepStrictEqual(slow.rows, [['Lowy', 0, 1]], 'zero-sold products with stock on hand (out-of-stock excluded)');
});

// ---------------------------------------------------------------------------
// Customers report (port of customers_report)
// ---------------------------------------------------------------------------

test('customers report: new/repeat/lifetime/inactive', () => {
  resetIds();
  const b = bundle({
    customers: [
      customer({ id: 1, full_name: 'Grace', created_at: d(-5) }),
      customer({ id: 2, full_name: 'Quiet', created_at: d(-100) }),
    ],
    orders: [
      order({ order_date: today, status: 'shipped', total_amount: 100, customer_id: 1 }),
      order({ order_date: d(-1), status: 'delivered', total_amount: 50, customer_id: 1 }),
      order({ order_date: d(-40), status: 'delivered', total_amount: 200, customer_id: 2 }),
    ],
  });
  const r = buildLocalReport(b, 'customers', parseFilters({ from: d(-29), to: today }));
  const k = Object.fromEntries(r.kpis.map((x) => [x.key, x]));
  assert.strictEqual(k.total.value, 2);
  assert.strictEqual(k.new.value, 1, 'Grace created within the period');
  assert.strictEqual(k.repeat.value, 1, 'Grace has 2 period orders');
  assert.strictEqual(k.rev_per_cust.value, 150);

  const top = r.tables.find((t) => t.title === 'Top customers (period)')!;
  assert.deepStrictEqual(top.rows[0], ['Grace', 2, 150, 150, fmtDayYear(today)], 'last order is %b %-d, %Y');
  const inactive = r.tables.find((t) => t.title === 'Inactive 30+ days')!;
  assert.deepStrictEqual(inactive.rows, [['Quiet', dayDiff(d(-40), today), 200]]);
  const fresh = r.tables.find((t) => t.title === 'New in period')!;
  assert.deepStrictEqual(fresh.rows, [['Grace', fmtDayYear(d(-5)), 150]]);
  // The server does not conjugate the verb in the singular ("1 customer haven't")
  // — the port preserves that verbatim.
  assert.match(r.notes[0], /1 customer haven't ordered in 30\+ days/);
});

// ---------------------------------------------------------------------------
// Briefing (port of backend/briefing.py)
// ---------------------------------------------------------------------------

test('briefing: verbatim prose, severities, ordering', () => {
  resetIds();
  // Date-robust: Sam has a current-month order (rev_this) and a previous-
  // calendar-month order (rev_last); Grace's last order is always 40 days
  // ago (inactivity, regardless of day-of-month).
  const b = bundle({
    products: [
      product({ id: 11, name: 'Chair', unit_price: 100, cost_price: 90, current_stock: 1, reorder_level: 5 }),
      product({ id: 12, name: 'Gone', unit_price: 10, cost_price: 4, current_stock: 0 }),
    ],
    customers: [
      customer({ id: 1, full_name: 'Grace' }),
      customer({ id: 2, full_name: 'Sam' }),
    ],
    orders: [
      order({ order_date: addDays(firstThis, Math.min(2, dayDiff(firstThis, today))), status: 'shipped', total_amount: 100, customer_id: 2 }),
      order({ order_date: addDays(firstLast, 5), status: 'shipped', total_amount: 400, customer_id: 2 }),
      order({ order_date: d(-40), status: 'shipped', total_amount: 300, customer_id: 1 }),
    ],
    items: [
      item({ order_id: 1, product_id: 11, quantity: 1, unit_price: 100 }),
      item({ order_id: 2, product_id: 11, quantity: 4, unit_price: 100 }),
      item({ order_id: 3, product_id: 11, quantity: 3, unit_price: 100 }),
    ],
  });
  const bf = buildLocalBriefing(b);
  assert.strictEqual(bf.ready, true);
  assert.strictEqual(bf.history.total_revenue, 800);
  assert.strictEqual(bf.history.imported, false, 'import provenance is server-side (documented deviation)');

  const ids = bf.insights.map((i) => i.id);
  assert.ok(ids.includes('overview'));
  assert.ok(ids.includes('revenue-trend'), 'both months have revenue');
  assert.ok(ids.includes('top-product'));
  assert.ok(ids.includes('stock-risk'));
  assert.ok(ids.includes('margin'), 'all items have cost prices');
  assert.ok(ids.includes('inactive-vip'), 'Grace (the VIP) went quiet 40 days ago');

  // Severity ordering: critical first (we have an out-of-stock product).
  const first = bf.insights[0];
  assert.strictEqual(first.severity, 'critical');
  assert.strictEqual(first.id, 'stock-risk');

  // Verbatim prose checks (pin the port to the server's strings).
  const rev = bf.insights.find((i) => i.id === 'revenue-trend')!;
  assert.match(rev.title, /^Revenue is -?[\d.]+% this month vs last month$/);
  const stock = bf.insights.find((i) => i.id === 'stock-risk')!;
  // The server's combined branch does not pluralise the first count ("1 products")
  // — the port preserves that verbatim.
  assert.match(stock.title, /1 products out of stock and 1 at or below reorder level/);
  const top = bf.insights.find((i) => i.id === 'top-product')!;
  assert.strictEqual(top.title, '“Chair” drives 100% of your historic revenue');
  assert.match(top.body, /and it is currently low on stock\./);
  const margin = bf.insights.find((i) => i.id === 'margin')!;
  assert.match(margin.title, /^Blended margin is 10% \(\u20a680 profit\)$/);
  assert.strictEqual(margin.severity, 'warning', 'under 25% -> warning');
  const vip = bf.insights.find((i) => i.id === 'inactive-vip')!;
  assert.strictEqual(vip.title, "Grace hasn't ordered in 40 days");
  assert.ok(vip.action, 'the draft follow-up targets Grace with her most-bought product');
  assert.strictEqual(vip.action?.product?.name, 'Chair');
});

test('briefing: empty business -> ready false, no insights', () => {
  const bf = buildLocalBriefing(bundle({ orders: [], items: [], products: [], customers: [] }));
  assert.strictEqual(bf.ready, false);
  assert.strictEqual(bf.insights.length, 0);
  assert.strictEqual(bf.history.orders, 0);
});

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

test('money + date formatters match the server', () => {
  // Naira, not dollars: the server's money.fmt_compact prints the cedi-style
  // prefix and this port must agree with it, because the offline briefing and
  // the online dashboard describe the same number.
  assert.strictEqual(money(1234), '\u20a61,234');
  assert.strictEqual(money(1234.5), '\u20a61,234.50');
  assert.strictEqual(fmtDay('2026-08-03'), 'Aug 3', '%-d is not zero-padded');
});

test('recentOrders: newest first with customer names', () => {
  resetIds();
  const rows = recentOrders(
    bundle({
      customers: [customer({ id: 1, full_name: 'Grace' })],
      orders: [
        order({ order_date: d(-2), status: 'shipped', total_amount: 10, customer_id: 1 }),
        order({ order_date: today, status: 'pending', total_amount: 20, customer_id: 1 }),
      ],
    }),
    8,
  );
  assert.strictEqual(rows[0].id, 2, 'id desc like the server list');
  assert.deepStrictEqual(rows[0].customer, { full_name: 'Grace' });
});

// silence unused import warnings (dayOf, dayDiff used above in some branches)
void dayOf;
