/**
 * Zeno — proactive insights engine (Stage 2.2, Layer 1).
 *
 * Rule-based analysis over the real data bundle. Every insight is grounded:
 * it states the evidence it used and where to look at it in Co-op.
 * Nothing here is fabricated — if a signal is too thin to compute, the
 * insight is simply not emitted.
 */
import dayjs from 'dayjs';
import type { AiDataBundle } from './data';
import type { Insight } from './types';
import { formatCurrency } from '../pages/Dashboard/kpiConfig';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Simple trend estimate (transparent math, never ML):
 * average of the last 7 non-zero revenue days, projected over 30 days,
 * with a ±25% range. Requires ≥ 14 points of history.
 */
export function simpleTrendEstimate(timeseries: { revenue: number }[]): {
  estimate: number;
  low: number;
  high: number;
} | null {
  if (timeseries.length < 14) return null;
  const last7 = timeseries.slice(-7);
  const nonzero = last7.filter((p) => p.revenue > 0).map((p) => p.revenue);
  if (nonzero.length < 3) return null; // too sparse to project honestly
  const avg = nonzero.reduce((s, v) => s + v, 0) / nonzero.length;
  const estimate = Math.round(avg * 30);
  return { estimate, low: Math.round(estimate * 0.75), high: Math.round(estimate * 1.25) };
}

export function computeInsights(b: AiDataBundle): Insight[] {
  const insights: Insight[] = [];
  const now = Date.now();

  // 1 — Sales trend (real month-over-month growth from the API) -----------
  const growth = b.summary?.revenue_growth_percent ?? null;
  if (growth !== null) {
    const up = growth >= 0;
    insights.push({
      id: 'revenue-trend',
      severity: !up && growth <= -15 ? 'critical' : !up && growth < -5 ? 'warning' : 'info',
      kind: up ? 'fact' : 'suggestion',
      title: `Sales ${up ? 'up' : 'down'} ${Math.abs(growth).toFixed(1)}% vs last month`,
      why: up
        ? `Revenue is ${formatCurrency(b.summary!.revenue_month)} this month. Riding this trend — keep the top sellers stocked.`
        : `Revenue is ${formatCurrency(b.summary!.revenue_month)} this month, below last month. A look at what changed (pricing, stock-outs, seasonality) is worth doing this week.`,
      evidence: `Month-to-date revenue ${formatCurrency(b.summary!.revenue_month)}, ${b.summary!.orders_month} orders.`,
      link: '/',
      linkLabel: 'View dashboard',
      basis: 'Dashboard summary, month-to-date',
    });
  }

  // 2 — Inventory risk (real at/below-reorder and out-of-stock SKUs) -------
  if (b.inventory && b.inventory.out_of_stock_count > 0) {
    const names = b.outOfStock.slice(0, 3).map((p) => p.sku).join(', ');
    insights.push({
      id: 'stock-out',
      severity: 'critical',
      kind: 'suggestion',
      title: `${b.inventory.out_of_stock_count} product${b.inventory.out_of_stock_count === 1 ? '' : 's'} out of stock`,
      why: 'Out-of-stock items can no longer be sold and may be losing you orders. Restock the top sellers first.',
      evidence: names ? `At zero: ${names}${b.inventory.out_of_stock_count > 3 ? '…' : ''}.` : 'See inventory for the full list.',
      link: '/inventory?stock=out',
      linkLabel: 'View out of stock',
      basis: 'Inventory summary + product stock',
    });
  }
  if (b.inventory && b.inventory.low_stock_count > 0) {
    const names = b.lowStock.slice(0, 3).map((p) => p.sku).join(', ');
    insights.push({
      id: 'stock-low',
      severity: 'warning',
      kind: 'suggestion',
      title: `${b.inventory.low_stock_count} product${b.inventory.low_stock_count === 1 ? '' : 's'} at or below reorder level`,
      why: 'These items are still sellable but will run out soon at current velocity. Reordering now avoids a stock-out.',
      evidence: names ? `At reorder point: ${names}${b.inventory.low_stock_count > 3 ? '…' : ''}.` : 'See inventory for the full list.',
      link: '/inventory?stock=low',
      linkLabel: 'View low stock',
      basis: 'Inventory summary + product stock',
    });
  }

  // 3 — Top-product concentration (real share of units sold) ----------------
  if (b.topProducts.length >= 2) {
    const totalUnits = b.topProducts.reduce((s, p) => s + p.total_quantity, 0);
    const top = b.topProducts[0];
    const share = totalUnits > 0 ? Math.round((top.total_quantity / totalUnits) * 100) : 0;
    if (share >= 40) {
      insights.push({
        id: 'concentration',
        severity: 'info',
        kind: 'calculation',
        title: `${top.product_name} drives ${share}% of units sold`,
        why: 'Heavy reliance on one product is fine — but if it ever goes out of stock, a large share of revenue stops with it. Know its supply chain.',
        evidence: `${top.total_quantity} of ${totalUnits} units sold across your top ${b.topProducts.length} products.`,
        link: `/products?q=${encodeURIComponent(top.product_name)}`,
        linkLabel: 'View product',
        basis: `Top products by units (top ${b.topProducts.length})`,
      });
    }
  }

  // 4 — Customer inactivity (bounded window, stated honestly) ---------------
  if (b.customers.length > 0 && b.recentOrders.length > 0) {
    const cutoff = now - 60 * DAY;
    const recentBuyerIds = new Set(
      b.recentOrders
        .filter((o) => new Date(o.order_date).getTime() >= cutoff)
        .map((o) => o.customer_id),
    );
    const inactive = b.customers.filter((c) => !recentBuyerIds.has(c.id));
    if (inactive.length >= 3) {
      insights.push({
        id: 'customer-inactive',
        severity: 'info',
        kind: 'calculation',
        title: `${inactive.length} customers haven't ordered in 60 days`,
        why: 'Lapsed customers are the cheapest growth you have — a check-in or offer now is far cheaper than acquiring a new customer.',
        evidence: `Based on your most recent ${b.recentOrders.length} orders and ${b.customers.length} customers.`,
        link: '/customers',
        linkLabel: 'View customers',
        basis: 'Recent orders window (last 60 days)',
      });
    }
  }

  // 5 — Forecast (transparent simple-trend estimate) ------------------------
  const trend = simpleTrendEstimate(b.timeseries);
  if (trend) {
    insights.push({
      id: 'forecast',
      severity: 'info',
      kind: 'forecast',
      title: `Projected ${formatCurrency(trend.low)}–${formatCurrency(trend.high)} for the next 30 days`,
      why: 'A simple trend estimate from your last 7 selling days — plan stock and capacity against the middle of the range.',
      evidence: `Middle estimate ${formatCurrency(trend.estimate)}; based on recent daily revenue.`,
      link: '/',
      linkLabel: 'View revenue',
      basis: 'Last 30 days of daily revenue (simple trend, not ML)',
    });
  }

  return insights;
}

/** Day label helper shared by chart answers. */
export function dayLabel(iso: string): string {
  return dayjs(iso).format('MMM D');
}
