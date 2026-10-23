/**
 * Zeno — Ask Zeno engine (Stage 2.2, Layer 2).
 *
 * A deterministic intent router over the real data bundle. This is the
 * pre-LLM form of the assistant: it recognizes a curated set of business
 * questions, answers them ONLY with data from the existing APIs, labels
 * every answer (fact / calculation / forecast / suggestion / draft), and
 * states its basis. Questions it cannot ground get an honest capability
 * answer — no hallucinated numbers, ever.
 *
 * The seam for a real model later: swap `askCoop`'s internals for an LLM
 * call that is constrained to the same bundle + the same answer contract.
 */
import type { AiDataBundle } from './data';
import { simpleTrendEstimate, dayLabel } from './insights';
import type { Answer, DraftCustomer, DraftInvoice, DraftLine, DraftOrder } from './types';
import type { Customer } from '../pages/Customers/useCustomers';
import type { Product } from '../pages/Products/useProducts';
import { formatCurrency } from '../pages/Dashboard/kpiConfig';

const STOP = new Set(['the', 'a', 'an', 'for', 'with', 'have', 'has', 'from', 'this', 'that', 'was', 'were', 'been', 'is', 'are', 'did', 'do', 'how', 'much', 'many', 'what', 'which', 'who', 'our', 'we', 'me', 'my']);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Fuzzy name match: how many of the name's words appear in the question. */
function nameScore(name: string, q: string): number {
  const words = norm(name).split(' ').filter((w) => w.length >= 3 && !STOP.has(w));
  if (words.length === 0) return 0;
  let score = 0;
  for (const w of words) {
    if (q.includes(w) || q.includes(`${w}s`) || (w.endsWith('s') && q.includes(w.slice(0, -1)))) score++;
  }
  return score;
}

function bestMatch<T extends { name?: string; full_name?: string }>(
  candidates: T[],
  q: string,
  getName: (t: T) => string,
): { item: T | null; score: number } {
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const s = nameScore(getName(c), q);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return { item: best, score: bestScore };
}

/** Quantity like "3 keyboards" / "2x chairs" immediately before ANY product word. */
function quantityBefore(q: string, productName: string): number {
  const words = norm(productName)
    .split(' ')
    .filter((w) => w.length >= 3)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  for (const w of words) {
    const m = q.match(new RegExp(`(\\d+)\\s*(?:x|×)?\\s*${w}`));
    if (m) return Math.max(1, parseInt(m[1], 10));
  }
  return 1;
}

const basisNote = (b: AiDataBundle) =>
  `Live data: ${b.summary ? `${b.summary.orders_month} orders this month` : 'no orders yet'} · last 30 days of activity`;

export function askCoop(question: string, b: AiDataBundle): Answer {
  const q = norm(question);

  // ------------------------------------------------------------------
  // ACTION intents (draft → review → execute boundary)
  // ------------------------------------------------------------------
  const wantsInvoice = /invoice/.test(q);
  const wantsOrder = /\b(create|new)\b/.test(q) && /\border\b/.test(q) && !wantsInvoice;

  if (wantsInvoice || wantsOrder) {
    const cust = bestMatch(b.customers, q, (c: Customer) => c.full_name);
    // Products: match against the union of top sellers + anything in recent orders
    const productCandidates: Product[] = Array.from(
      new Map(b.recentOrders.flatMap((o) => o.items).map((i) => [i.product_id, {
        id: i.product_id,
        sku: '',
        name: i.product_name ?? `Product #${i.product_id}`,
        unit_price: i.unit_price,
        current_stock: 0,
        reorder_level: 0,
      } as Product])).values(),
    );
    const prod = bestMatch(productCandidates, q, (p: Product) => p.name);

    if (!cust.item || cust.score === 0) {
      return {
        kind: 'clarify',
        title: 'Which customer?',
        body: `I can draft that, but I couldn't match a customer in your list. Try naming them — e.g. "Invoice for ${b.customers[0]?.full_name ?? 'your customer'} for 2 ${b.topProducts[0]?.product_name ?? 'keyboards'}".`,
        followUps: b.customers.slice(0, 3).map((c) => `Invoice for ${c.full_name} for 1 ${b.topProducts[0]?.product_name ?? 'product'}`),
      };
    }

    const lines: DraftLine[] = [];
    if (prod.item && prod.score > 0) {
      lines.push({
        product_id: prod.item.id,
        name: prod.item.name,
        sku: prod.item.sku,
        quantity: quantityBefore(q, prod.item.name),
        unit_price: prod.item.unit_price,
      });
    }
    const customer: DraftCustomer = {
      id: cust.item.id,
      full_name: cust.item.full_name,
      email: cust.item.email,
    };
    const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

    if (wantsInvoice) {
      const draft: DraftInvoice = { customer, lines, total };
      return {
        kind: 'draft',
        title: `Invoice draft for ${customer.full_name}`,
        body: lines.length
          ? `Drafted from your catalog — ${lines.map((l) => `${l.quantity} × ${l.name}`).join(', ')}. Nothing has been created yet: review the draft, then confirm to generate the invoice.`
          : `I matched the customer but no product in your recent catalog. Tell me what to invoice — e.g. "2 keyboards".`,
        basis: 'Matched against your customers and product catalog',
        invoiceDraft: draft,
        followUps: lines.length ? [] : [`Invoice for ${customer.full_name} for 1 ${b.topProducts[0]?.product_name ?? 'product'}`],
      };
    }

    const draft: DraftOrder = { customer, lines, total };
    return {
      kind: 'draft',
      title: `Order draft for ${customer.full_name}`,
      body: lines.length
        ? `Drafted from your catalog — ${lines.map((l) => `${l.quantity} × ${l.name}`).join(', ')}. I won't create it yet: open the draft in Create Order, review the lines, and confirm there. The order is only written when you press Confirm Order.`
        : `I matched the customer but no product. Tell me what to order — e.g. "create an order for ${customer.full_name} with 2 keyboards".`,
      basis: 'Matched against your customers and product catalog',
      orderDraft: draft,
      followUps: lines.length ? [] : [`Create an order for ${customer.full_name} with 1 ${b.topProducts[0]?.product_name ?? 'product'}`],
    };
  }

  // ------------------------------------------------------------------
  // FACT / CALCULATION intents
  // ------------------------------------------------------------------

  // Revenue / sales
  if (/(revenue|sales|how much (did|do) we (make|earn)|money)/.test(q)) {
    if (!b.summary) {
      return { kind: 'fact', title: 'No sales recorded yet', body: 'Once orders exist, I can report revenue, growth and trends here.', basis: 'Dashboard summary' };
    }
    const s = b.summary;
    return {
      kind: 'fact',
      title: `Revenue: ${formatCurrency(s.revenue_month)} this month`,
      body:
        `${s.orders_month} orders so far this month (revenue today: ${formatCurrency(s.revenue_today)}). ` +
        (s.revenue_growth_percent !== null
          ? `That's ${s.revenue_growth_percent >= 0 ? 'up' : 'down'} ${Math.abs(s.revenue_growth_percent).toFixed(1)}% vs last month.`
          : 'No last-month baseline yet.'),
      basis: basisNote(b),
      chart:
        b.timeseries.length > 0
          ? { labels: b.timeseries.map((p) => dayLabel(p.date)), data: b.timeseries.map((p) => p.revenue) }
          : null,
      followUps: ['Top products this month', 'Forecast next 30 days'],
    };
  }

  // Top products
  if (/(top|best|most).*(product|sell|sold|moving)/.test(q)) {
    if (b.topProducts.length === 0) {
      return { kind: 'fact', title: 'No sales yet', body: 'Once orders exist, I can rank your best sellers here.', basis: 'Top products endpoint' };
    }
    const totalUnits = b.topProducts.reduce((s, p) => s + p.total_quantity, 0);
    return {
      kind: 'calculation',
      title: `Top ${b.topProducts.length} products by units sold`,
      body: 'Ranked across all recorded orders, with share of total units sold.',
      basis: `Top ${b.topProducts.length} products, all-time units`,
      table: {
        columns: ['Product', 'Units', 'Share', 'Revenue'],
        rows: b.topProducts.map((p) => [
          p.product_name,
          String(p.total_quantity),
          totalUnits > 0 ? `${Math.round((p.total_quantity / totalUnits) * 100)}%` : '—',
          formatCurrency(p.total_revenue),
        ]),
      },
      followUps: ['What is my inventory status?', 'Create an order for my top seller'],
    };
  }

  // Inventory / stock
  if (/(stock|inventory|inventory health|low|out of)/.test(q)) {
    const inv = b.inventory;
    if (!inv) {
      return { kind: 'fact', title: 'No inventory data', body: 'Add products to see stock health here.', basis: 'Inventory summary' };
    }
    if (inv.low_stock_count === 0 && inv.out_of_stock_count === 0) {
      return {
        kind: 'fact',
        title: 'Inventory is healthy',
        body: `All ${inv.products_count} products are above their reorder levels — nothing to restock right now.`,
        basis: 'Inventory summary',
        followUps: ['How is sales trending?', 'Top products this month'],
      };
    }
    const parts: string[] = [];
    if (inv.out_of_stock_count > 0) parts.push(`${inv.out_of_stock_count} out of stock${b.outOfStock.length ? ` (${b.outOfStock.map((p) => p.sku).join(', ')})` : ''}`);
    if (inv.low_stock_count > 0) parts.push(`${inv.low_stock_count} at or below reorder level${b.lowStock.length ? ` (${b.lowStock.map((p) => p.sku).join(', ')})` : ''}`);
    return {
      kind: parts.some((p) => p.startsWith(String(inv.out_of_stock_count))) && inv.out_of_stock_count > 0 ? 'suggestion' : 'fact',
      title: `Inventory: ${parts.join(' · ')}`,
      body:
        inv.out_of_stock_count > 0
          ? 'Restock the out-of-stock top sellers first — every day out of stock is a day of lost sales. The low-stock items are your next reorders.'
          : 'These items are at or below their reorder levels — queue the reorders to avoid stock-outs.',
      basis: 'Inventory summary + product stock',
      followUps: ['What is my inventory value?', 'Top products this month'],
    };
  }

  // Inventory value
  if (/(inventory value|stock value|how much is (my|our) (inventory|stock))/i.test(question)) {
    const inv = b.inventory;
    return {
      kind: 'fact',
      title: inv ? `Inventory value: ${formatCurrency(inv.inventory_value)}` : 'No inventory value yet',
      body: inv ? `Across ${inv.products_count} products, valued at cost price.` : 'Add products with stock to see valuation.',
      basis: 'Inventory summary',
    };
  }

  // Customers
  if (/(customer|client)/.test(q) && /(not|no|haven|hasn|inactive|lapsed|lost|churn)/.test(q)) {
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const recentBuyers = new Set(b.recentOrders.filter((o) => new Date(o.order_date).getTime() >= cutoff).map((o) => o.customer_id));
    const inactive = b.customers.filter((c) => !recentBuyers.has(c.id));
    return {
      kind: 'calculation',
      title: `${inactive.length} customers with no order in the last 60 days`,
      body:
        inactive.length > 0
          ? `Of your last ${b.customers.length} customers, ${inactive.slice(0, 5).map((c) => c.full_name).join(', ')}${inactive.length > 5 ? '…' : ''} haven't ordered recently. A check-in or win-back offer is the cheapest growth you have.`
          : 'Everyone in your recent customer base has ordered within 60 days — nice retention.',
      basis: `Window: last 60 days across your most recent ${b.recentOrders.length} orders and ${b.customers.length} customers`,
      followUps: ['How many customers do I have?', 'How is sales trending?'],
    };
  }
  if (/(customer|client)s?/.test(q) && /(how many|total|count)/.test(q)) {
    const s = b.summary;
    return {
      kind: 'fact',
      title: s ? `${s.customers_total} customers total` : 'No customers yet',
      body: s ? `${s.customers_new_month} new this month.` : 'Add customers to start tracking your base.',
      basis: 'Dashboard summary',
    };
  }
  if (/(customer|client)/.test(q)) {
    const s = b.summary;
    return {
      kind: 'fact',
      title: s ? `Customers: ${s.customers_total} total, ${s.customers_new_month} new this month` : 'No customers yet',
      body: 'Ask "how many customers do I have?" or "who hasn\'t ordered recently?" for more.',
      basis: 'Dashboard summary',
      followUps: ['Who hasn\'t ordered recently?', 'How is sales trending?'],
    };
  }

  // Orders
  if (/(order)/.test(q) && /(how many|today|this month|count|status)/.test(q)) {
    const s = b.summary;
    return {
      kind: 'fact',
      title: s ? `${s.orders_month} orders this month (${s.orders_today} today)` : 'No orders yet',
      body: s ? `Total month value ${formatCurrency(s.revenue_month)}.` : 'Create your first order to start tracking.',
      basis: 'Dashboard summary',
      followUps: ['What are my top products?', 'Create an order for my customer'],
    };
  }

  // Forecast
  if (/(forecast|predict|project|next (month|30 days)|expect|estimate)/.test(q)) {
    const t = simpleTrendEstimate(b.timeseries);
    if (!t) {
      return {
        kind: 'forecast',
        title: 'Not enough history to forecast',
        body: 'I need at least two weeks of sales history to project forward. Keep ordering — the forecast unlocks itself.',
        basis: 'Requires ≥ 14 days of revenue data',
      };
    }
    return {
      kind: 'forecast',
      title: `Next 30 days: ${formatCurrency(t.low)} – ${formatCurrency(t.high)}`,
      body: `Middle estimate ${formatCurrency(t.estimate)}. This is a transparent trend calculation from your last 7 selling days — not a machine-learning forecast. Plan against the middle of the range.`,
      basis: 'Last 30 days of daily revenue (simple trend)',
      followUps: ['How is sales trending?', 'What is my inventory status?'],
    };
  }

  // Help
  if (/(help|what can you do|how do you work)/.test(q)) {
    return {
      kind: 'clarify',
      title: 'Here\'s what I can do',
      body: 'I answer business questions using your live data, label what is a fact, a calculation, a forecast or a suggestion — and I can draft orders and invoices for you to review before anything is created.',
      followUps: [
        'How is revenue trending this month?',
        'What are my top products?',
        'What is my inventory status?',
        'Who hasn\'t ordered recently?',
        'Forecast the next 30 days',
        'Invoice for my customer',
      ],
    };
  }

  // Fallback — honest, no invented numbers
  return {
    kind: 'clarify',
    title: 'I can help with that business area',
    body: "I couldn't match that to something I can compute from your data yet. Try one of the questions below — or rephrase: I work best on revenue, products, inventory, customers, orders and forecasts.",
    followUps: [
      'How is revenue trending this month?',
      'What are my top products?',
      'What is my inventory status?',
      'Who hasn\'t ordered recently?',
      'Forecast the next 30 days',
    ],
  };
}

// ---------------------------------------------------------------------------
// AI Platform orchestration (Pass 2) — deterministic engine + real assistant
//
//   question
//     ↓ deterministic engine first (instant, free, fully grounded)
//     ↓ curated intent matched? → answer directly (no model call, no cost)
//     ↓ otherwise → /ai/chat (verified context → model → structured answer)
//     ↓ model unavailable? → honest deterministic fallback (AI never blocks)
//
// The model is the reasoning/language layer; it is never the database layer.
// ---------------------------------------------------------------------------
import type { AxiosInstance } from 'axios';
import { ApiError } from '../services/api/client';
import { aiChat, type AiChatResult, type AiReportRef } from './client';

const PERIOD_LABELS: Record<string, string> = {
  this_month: 'this month',
  last_month: 'last month',
  last_30_days: 'last 30 days',
  previous_30_days: 'previous 30 days',
  all_history: 'all history',
};

// Session-level memo: if the backend said the assistant is unavailable,
// don't pay a round-trip for it on every question (re-check after 5 min).
let aiUnavailableUntil = 0;
export function aiBackendCurrentlyUnavailable(): boolean {
  return Date.now() < aiUnavailableUntil;
}

/** Map a verified assistant result onto the existing Answer contract. */
export function toAssistantAnswer(res: AiChatResult): Answer {
  const orderAction = res.actions.find((a) => a.type === 'DRAFT_ORDER');
  const basis = res.basis
    ? `verified ${res.basis.period ? PERIOD_LABELS[res.basis.period] ?? res.basis.period : 'data'} · ${
        res.basis.sources.length ? res.basis.sources.join(', ') : 'business data'
      } · ${res.model ?? 'assistant'}`
    : undefined;
  return {
    kind: res.kind === 'error' ? 'clarify' : res.kind,
    title: res.title || 'Co-op answer',
    body: res.message,
    basis,
    links: res.links && res.links.length ? res.links : undefined,
    followUps: res.follow_ups.length ? res.follow_ups : undefined,
    orderDraft: orderAction ? orderAction.parameters : null,
  };
}

/**
 * Ask Zeno, smart: deterministic engine first; the real assistant (grounded
 * in the verified business context on the server) answers what the curated
 * engine can't. Never fails the user — degrades to the honest engine answer.
 */
export async function askCoopSmart(
  question: string,
  b: AiDataBundle,
  api: AxiosInstance,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  report?: AiReportRef,
): Promise<Answer> {
  const det = askCoop(question, b);

  // No attached report: curated intent matched (or a help question) → answer
  // directly: instant, free and fully grounded. The model earns its keep on
  // everything else. With an attached report the engine is skipped — it can't
  // explain report-level changes — so the assistant takes over with the
  // verified report data the server rebuilt from those exact filters.
  if (!report && (det.kind !== 'clarify' || /(help|what can you do|how do you work)/.test(question.toLowerCase()))) {
    return det;
  }

  if (aiBackendCurrentlyUnavailable()) {
    return report
      ? {
          kind: 'clarify',
          title: 'Zeno is unavailable',
          body: "Co-op can't narrate this report right now — Zeno is unreachable. Every number on the report is still verified by Co-op.",
        }
      : det;
  }

  try {
    const res = await aiChat(api, question, history, report);
    return toAssistantAnswer(res);
  } catch (e) {
    // Out of credits is NOT "assistant unavailable" — it's a plan limit.
    // Show the honest billing state with a path to upgrade, don't memoise.
    if (e instanceof ApiError && e.status === 402) {
      return {
        kind: 'clarify',
        title: 'You\u2019re out of AI credits this month',
        body: e.message ||
          'You\u2019ve used the AI credits on your current plan this month. Upgrade for a bigger allowance \u2014 credits refresh at the start of each month.',
        links: [{ label: 'View billing & upgrade', to: '/billing' }],
      };
    }
    aiUnavailableUntil = Date.now() + 5 * 60 * 1000;
    if (report) {
      return {
        kind: 'clarify',
        title: 'Zeno is unavailable',
        body: `Co-op couldn't reach Zeno, so it can't narrate the ${report.title} just now. Every number on it is still verified by Co-op — try again in a moment.`,
      };
    }
    // Honest degradation: the engine's capabilities answer, with a note.
    return {
      ...det,
      body: `${det.body}\n\n(Zeno is unavailable right now — answers above come from Co-op's verified data engine.)`,
    };
  }
}
