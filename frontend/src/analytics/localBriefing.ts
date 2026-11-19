/**
 * OFFLINE 3.5 — local Day 1 Briefing.
 *
 * A verbatim port of backend/briefing.py (the deterministic insight engine):
 * same inputs (all non-deleted orders/items/products/customers), same math,
 * same prose, same insight ids and severities, same severity ordering.
 * The /briefing page and the Dashboard banner compute from the SQLite
 * mirror offline — identical to the server's briefing online.
 *
 * Documented deviation: `imported`/`latest_import` are server-side import
 * provenance (ImportBatch rows) that the local mirror does not track; the
 * local port reports imported=false, latest_import=null.
 */
import { formatMoneyCompact } from '../services/currency';
import { dayOf, monthStart, previousMonthStart, todayIso } from './localTypes';
import type { LocalBundle } from './localTypes';

export interface LBriefingAction {
  type: 'draft_followup';
  customer: { id: number; full_name: string; email: string };
  product: { id: number; name: string; sku: string; unit_price: number; current_stock: number } | null;
}

export interface LBriefingInsight {
  id: string;
  kind: 'overview' | 'revenue' | 'product' | 'customer' | 'inventory' | 'profit';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  evidence: string;
  link: string;
  action: LBriefingAction | null;
}

export interface LBriefing {
  ready: boolean;
  history: {
    first_order_date: string | null;
    last_order_date: string | null;
    span_months: number;
    orders: number;
    customers: number;
    products: number;
    total_revenue: number;
    imported: boolean;
    latest_import: null;
  };
  insights: LBriefingInsight[];
}

// Shared formatter: the same amount must not print as $ here and ₦ on the
// dashboard. See services/currency.
const money = (v: number): string => formatMoneyCompact(v);

const pct = (v: number): string => `${v.toFixed(1)}%`; // negatives keep their sign, like the server's _pct

export function buildLocalBriefing(b: LocalBundle): LBriefing {
  const today = todayIso();
  const curMonth = monthStart(today);
  const lastMonth = previousMonthStart(curMonth);

  const orders = b.orders;
  const customers = b.customers;
  const products = b.products;

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const prodById = new Map(products.map((p) => [p.id, p]));
  const custById = new Map(customers.map((c) => [c.id, c]));

  // History window.
  const dates = orders.map((o) => dayOf(o.order_date)).filter(Boolean) as string[];
  const firstDay = dates.length ? dates.reduce((a, z) => (a < z ? a : z)) : null;
  const lastDay = dates.length ? dates.reduce((a, z) => (a > z ? a : z)) : null;
  const spanDays = firstDay && lastDay ? Math.round((Date.parse(lastDay) - Date.parse(firstDay)) / 86400000) + 1 : 0;
  const spanMonths = spanDays ? Math.max(1, Math.round(spanDays / 30.4)) : 0;

  const totalRevenue = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const totalOrders = orders.length;
  const totalCustomers = customers.length;
  const totalProducts = products.length;

  const history = {
    first_order_date: firstDay,
    last_order_date: lastDay,
    span_months: spanMonths,
    orders: totalOrders,
    customers: totalCustomers,
    products: totalProducts,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    imported: false,
    latest_import: null,
  };

  if (totalOrders === 0 && totalProducts === 0 && totalCustomers === 0) {
    return { ready: false, history, insights: [] };
  }

  // Monthly revenue (calendar months, including the current one).
  const monthly = new Map<string, number>();
  const monthOrders = new Map<string, number>();
  for (const o of orders) {
    const day = dayOf(o.order_date);
    if (!day) continue;
    const m = monthStart(day);
    monthly.set(m, (monthly.get(m) ?? 0) + (o.total_amount || 0));
    monthOrders.set(m, (monthOrders.get(m) ?? 0) + 1);
  }
  const revThis = monthly.get(curMonth) ?? 0.0;
  const revLast = monthly.get(lastMonth) ?? 0.0;

  // Products: revenue by product, concentration, margin.
  const prodRevenue = new Map<number, number>();
  const prodUnits = new Map<number, number>();
  let marginTotal = 0.0;
  let marginRevenue = 0.0;
  let itemsWithCost = 0;
  for (const it of b.items) {
    if (!orderById.has(it.order_id)) continue; // items belong to this business's orders
    const p = prodById.get(it.product_id);
    prodRevenue.set(it.product_id, (prodRevenue.get(it.product_id) ?? 0) + (it.total_price || 0));
    prodUnits.set(it.product_id, (prodUnits.get(it.product_id) ?? 0) + (it.quantity || 0));
    if (p != null && p.cost_price != null) {
      marginTotal += (it.unit_price - p.cost_price) * it.quantity;
      marginRevenue += it.unit_price * it.quantity;
      itemsWithCost += 1;
    }
  }
  const ranked = [...prodRevenue.entries()].sort((a, z) => z[1] - a[1]);
  const topProducts = ranked.slice(0, 5).map(([pid, rv]) => {
    const p = prodById.get(pid);
    return {
      product_id: pid,
      name: p?.name || `Product #${pid}`,
      sku: p?.sku || '',
      revenue: Math.round(rv * 100) / 100,
      units: prodUnits.get(pid) ?? 0,
      share_pct: totalRevenue ? Math.round((rv / totalRevenue) * 100 * 10) / 10 : 0.0,
      unit_price: p?.unit_price ?? 0.0,
    };
  });
  const concentration = totalRevenue
    ? (topProducts.slice(0, 3).reduce((s, t) => s + t.revenue, 0) / totalRevenue) * 100
    : 0.0;
  const blendedMargin = marginRevenue ? (marginTotal / marginRevenue) * 100 : null;
  const costCoverage = b.items.length ? (itemsWithCost / b.items.length) * 100 : 0.0;

  // Customers: VIPs + inactivity.
  const custRevenue = new Map<number, number>();
  const custLast = new Map<number, string>();
  const custUnits = new Map<number, Map<number, number>>();
  for (const o of orders) {
    if (o.customer_id == null) continue;
    custRevenue.set(o.customer_id, (custRevenue.get(o.customer_id) ?? 0.0) + (o.total_amount || 0));
    const od = dayOf(o.order_date);
    if (od) {
      const prev = custLast.get(o.customer_id);
      if (prev == null || od > prev) custLast.set(o.customer_id, od);
    }
  }
  for (const it of b.items) {
    const o = orderById.get(it.order_id);
    if (o != null && o.customer_id != null) {
      const m = custUnits.get(o.customer_id) ?? new Map<number, number>();
      m.set(it.product_id, (m.get(it.product_id) ?? 0) + (it.quantity || 0));
      custUnits.set(o.customer_id, m);
    }
  }
  const vip = [...custRevenue.entries()].sort((a, z) => z[1] - a[1]).slice(0, 5);
  const vipList = vip.map(([cid, rv]) => ({
    customer_id: cid,
    name: custById.get(cid)?.full_name || `Customer #${cid}`,
    email: custById.get(cid)?.email || '',
    total: Math.round(rv * 100) / 100,
  }));
  const inactive: Array<{ customer_id: number; days: number; lifetime: number }> = [];
  for (const [cid, last] of custLast) {
    const days = Math.round((Date.parse(today) - Date.parse(last)) / 86400000);
    if (days >= 30 && custById.has(cid)) {
      inactive.push({ customer_id: cid, days, lifetime: custRevenue.get(cid) ?? 0.0 });
    }
  }
  inactive.sort((a, z) => z.lifetime - a.lifetime);
  const inactiveTop = inactive.slice(0, 5).map((t) => ({
    customer_id: t.customer_id,
    name: custById.get(t.customer_id)?.full_name || `Customer #${t.customer_id}`,
    email: custById.get(t.customer_id)?.email || '',
    days_since: t.days,
    lifetime: Math.round(t.lifetime * 100) / 100,
  }));

  // Inventory risk.
  const low = products
    .filter((p) => 0 < (p.current_stock || 0) && (p.current_stock || 0) <= (p.reorder_level || 0))
    .sort((a, z) => (z.current_stock || 0) - (a.current_stock || 0))
    .slice(0, 5);
  const out = products
    .filter((p) => (p.current_stock || 0) <= 0)
    .sort((a, z) => (prodUnits.get(z.id) ?? 0) - (prodUnits.get(a.id) ?? 0))
    .slice(0, 5);
  const lowCount = products.filter((p) => 0 < (p.current_stock || 0) && (p.current_stock || 0) <= (p.reorder_level || 0)).length;
  const outCount = products.filter((p) => (p.current_stock || 0) <= 0).length;

  // ------------------------------------------------------------------
  // Insight objects (verified, phrased deterministically — verbatim port).
  // ------------------------------------------------------------------
  const insights: LBriefingInsight[] = [];

  insights.push({
    id: 'overview',
    kind: 'overview',
    severity: 'info',
    title: totalOrders
      ? `Your history is loaded: ${totalOrders} orders and ${money(totalRevenue)} across ${totalCustomers} customers`
      : `Your catalog is loaded: ${totalProducts} products and ${totalCustomers} customers`,
    body: totalOrders
      ? `Based on your imported history — ${spanMonths} month${spanMonths !== 1 ? 's' : ''} of data (${firstDay ?? '—'} to ${lastDay ?? '—'}). Everything below is computed from that history; live activity you add in Co-op joins it from today.`
      : 'Import your sales history to unlock revenue and customer insights.',
    evidence: `${totalOrders} orders · ${totalProducts} products · ${totalCustomers} customers`,
    link: '/',
    action: null,
  });

  if (revThis && revLast) {
    const growth = ((revThis - revLast) / revLast) * 100;
    insights.push({
      id: 'revenue-trend',
      kind: 'revenue',
      severity: growth >= 0 ? 'info' : 'warning',
      title: `Revenue is ${pct(growth)} this month vs last month`,
      body: `${money(revThis)} so far this month (${monthOrders.get(curMonth) ?? 0} orders) vs ${money(revLast)} last month (${monthOrders.get(lastMonth) ?? 0} orders).`,
      evidence: `month-to-date: ${money(revThis)} · last month: ${money(revLast)}`,
      link: '/',
      action: null,
    });
  }

  if (topProducts.length) {
    const t1 = topProducts[0];
    const p1 = prodById.get(t1.product_id);
    let stockState: string | null = null;
    if (p1 != null) {
      if ((p1.current_stock || 0) <= 0) stockState = 'currently out of stock';
      else if (0 < (p1.current_stock || 0) && (p1.current_stock || 0) <= (p1.reorder_level || 0)) stockState = 'currently low on stock';
    }
    insights.push({
      id: 'top-product',
      kind: 'product',
      severity: stockState || concentration >= 60 ? 'warning' : 'info',
      title: `“${t1.name}” drives ${Math.round(t1.share_pct)}% of your historic revenue`,
      body: `${money(t1.revenue)} from ${t1.units} units sold${stockState ? ` — and it is ${stockState}.` : '.'}`,
      evidence: `top product of ${ranked.length} products with sales`,
      link: `/products?q=${t1.name.split(' ')[0] ?? ''}`,
      action: null,
    });
    if (concentration >= 60) {
      insights.push({
        id: 'concentration',
        kind: 'product',
        severity: 'warning',
        title: `Top 3 products make up ${Math.round(concentration)}% of revenue`,
        body: 'Your revenue is concentrated in a few products. If one of them runs out or demand shifts, a large share of your sales is exposed.',
        evidence: `top 3 share: ${Math.round(concentration)}%`,
        link: '/products',
        action: null,
      });
    }
  }

  if (vipList.length && inactiveTop.length) {
    const target = inactiveTop[0];
    let topProdId: number | null = null;
    for (const [pid] of [...(custUnits.get(target.customer_id) ?? new Map<number, number>()).entries()].sort((a, z) => z[1] - a[1])) {
      topProdId = pid;
      break;
    }
    const prod = topProdId != null ? prodById.get(topProdId) ?? null : null;
    insights.push({
      id: 'inactive-vip',
      kind: 'customer',
      severity: 'warning',
      title: `${target.name} hasn't ordered in ${target.days_since} days`,
      body: `${target.lifetime ? `They were worth ${money(target.lifetime)} in lifetime orders. ` : ''}${inactive.length} customer${inactive.length !== 1 ? 's' : ''} in your history have gone quiet for 30+ days — a check-in now is the cheapest growth you have.`,
      evidence: `last order ${target.days_since} days ago · ${inactive.length} inactive customers total`,
      link: '/customers',
      action:
        prod != null
          ? {
              type: 'draft_followup',
              customer: { id: target.customer_id, full_name: target.name, email: target.email },
              product: {
                id: prod.id,
                name: prod.name,
                sku: prod.sku || '',
                unit_price: prod.unit_price ?? 0,
                current_stock: prod.current_stock || 0,
              },
            }
          : null,
    });
  } else if (inactiveTop.length) {
    insights.push({
      id: 'inactive-customers',
      kind: 'customer',
      severity: 'info',
      title: `${inactiveTop.length} customer${inactiveTop.length !== 1 ? 's' : ''} haven't ordered in 30+ days`,
      body: 'A short check-in or a win-back offer is the cheapest growth available.',
      evidence: `most recent: ${inactiveTop[0].name} (${inactiveTop[0].days_since} days)`,
      link: '/customers',
      action: null,
    });
  }

  if (lowCount || outCount) {
    const skus = [...out, ...low].map((p) => p.sku).filter(Boolean).join(', ') || '—';
    insights.push({
      id: 'stock-risk',
      kind: 'inventory',
      severity: outCount ? 'critical' : 'warning',
      title:
        outCount && lowCount
          ? `${outCount} products out of stock and ${lowCount} at or below reorder level`
          : outCount
            ? `${outCount} product${outCount !== 1 ? 's' : ''} out of stock`
            : `${lowCount} product${lowCount !== 1 ? 's' : ''} at or below reorder level`,
      body: "These items can no longer be sold (or soon won't). Restock the top sellers first.",
      evidence: skus.slice(0, 120),
      link: '/inventory?stock=low',
      action: null,
    });
  }

  if (blendedMargin != null) {
    insights.push({
      id: 'margin',
      kind: 'profit',
      severity: blendedMargin >= 25 ? 'info' : 'warning',
      title: `Blended margin is ${Math.round(blendedMargin)}% (${money(marginTotal)} profit)`,
      body: `Compared ${money(marginRevenue)} of revenue against product cost prices (cost data covers ${Math.round(costCoverage)}% of sold lines). ${blendedMargin >= 25 ? '' : 'Margins under 25% leave little room for discounts or errors.'}`,
      evidence: `profit ${money(marginTotal)} on ${money(marginRevenue)} margin-relevant revenue`,
      link: '/products',
      action: null,
    });
  }

  const severityRank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  insights.sort((a, z) => severityRank[a.severity] - severityRank[z.severity]);

  return { ready: true, history, insights };
}

/** Convenience for the Dashboard banner: titles + severities only. */
export function briefingBanner(b: LocalBundle): { ready: boolean; insights: Array<{ title: string; severity: string }> } {
  const bf = buildLocalBriefing(b);
  return { ready: bf.ready, insights: bf.insights.map((i) => ({ title: i.title, severity: i.severity })) };
}
