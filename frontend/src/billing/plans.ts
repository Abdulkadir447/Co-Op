/**
 * Co-op Billing — plan catalog (Stage 2.3).
 *
 * List prices are USD and must match `paystack.prices_kobo` in
 * config/<env>.json — that file is what the card is actually charged, this one
 * is what the customer reads. Changing a price means changing both.
 * This file is the single place the billing UI reads plan names, prices,
 * features and comparison rows from; no other component may hard-code a price
 * or a credit rule.
 *
 * Visual spec: coop_pricing_plans_qa_polished + coop_plan_comparison.
 */

export type PlanId = 'free' | 'starter' | 'professional' | 'enterprise';

export interface PlanFeature {
  label: string;
  included: boolean;
  /** AI-marked feature (sparkle) in the pricing card. */
  ai?: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /**
   * Price per month in USD. null = custom quote.
   *
   * USD-native on purpose: Co-op sells to English-speaking small businesses in
   * dollar-billed markets, so the list price must be the price the card is
   * charged. $29 sits between Zoho Books Standard ($15-20/mo billed annually)
   * and QuickBooks Online Simple Start ($38/mo); $99 is above FreshBooks
   * Premium ($70/mo) and below QuickBooks Plus ($115/mo). See
   * docs/BUSINESS_PLAN.md section 5 and docs/PRODUCT_MARKET_FIT_AUDIT.md
   * section 3 for the compared list prices.
   */
  priceMonthly: number | null;
  /** Annual billing discount (provisional display). */
  annualDiscountPct: number;
  /** CTA label on the pricing card. */
  cta: string;
  /** Highlighted card ("BEST VALUE"). */
  highlight?: boolean;
  /** "INCLUDES:" / "EVERYTHING IN X, PLUS:" line. */
  includesLabel: string;
  features: PlanFeature[];
}

export const PLAN_CATALOG: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Essential tools for small teams getting started.',
    priceMonthly: 29,
    annualDiscountPct: 20,
    cta: 'Start Free Trial',
    includesLabel: 'Includes:',
    features: [
      { label: 'Up to 3 users', included: true },
      { label: 'Tax-ready invoices & receivables', included: true },
      { label: 'Offline desktop app', included: true },
      { label: '200 AI credits / month', included: true, ai: true },
      { label: 'Advanced integrations', included: false },
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    tagline: 'Advanced features and AI capabilities for growing businesses.',
    priceMonthly: 99,
    annualDiscountPct: 20,
    cta: 'Start Free Trial',
    highlight: true,
    includesLabel: 'Everything in Starter, plus:',
    features: [
      { label: 'Unlimited users', included: true },
      { label: '1,000 AI credits / month', included: true, ai: true },
      { label: 'Zeno Insights — adapts to how you work', included: true, ai: true },
      { label: 'Advanced integrations', included: true },
      { label: 'Priority support', included: true },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom solutions for large-scale operations.',
    priceMonthly: null,
    annualDiscountPct: 0,
    cta: 'Contact Sales',
    includesLabel: 'Everything in Pro, plus:',
    features: [
      { label: 'Dedicated account manager', included: true },
      { label: 'Custom security policies', included: true },
      { label: 'SLA guarantee', included: true },
    ],
  },
];

/** The base plan every workspace starts on (no billing backend exists yet). */
export const FREE_PLAN: Plan = {
  id: 'free',
  name: 'Free',
  tagline: 'Core business management, no subscription.',
  priceMonthly: 0,
  annualDiscountPct: 0,
  cta: 'Current Plan',
  includesLabel: 'Includes:',
  features: [
    { label: 'Products, inventory & orders', included: true },
    { label: 'Customers & dashboard', included: true },
    { label: 'Zeno (basic usage)', included: true, ai: true },
  ],
};

export function getPlan(id: PlanId): Plan {
  if (id === 'free') return FREE_PLAN;
  return PLAN_CATALOG.find((p) => p.id === id) ?? FREE_PLAN;
}

// ---------------------------------------------------------------------------
// Plan comparison (coop_plan_comparison) — display values, provisional.
// ---------------------------------------------------------------------------
export interface ComparisonRow {
  feature: string;
  values: [string | boolean, string | boolean, string | boolean]; // starter, pro, enterprise
  highlight?: boolean;
}

export interface ComparisonSection {
  title: string;
  ai?: boolean;
  rows: ComparisonRow[];
}

export const COMPARISON_SECTIONS: ComparisonSection[] = [
  {
    title: 'Core Capabilities',
    rows: [
      { feature: 'Number of users', values: ['Up to 5', 'Up to 25', 'Unlimited'] },
      { feature: 'Inventory limits', values: ['1,000 SKUs', '10,000 SKUs', 'Unlimited'] },
      { feature: 'Warehouses', values: ['1', 'Up to 5', 'Unlimited'] },
    ],
  },
  {
    title: 'AI & Analytics',
    ai: true,
    rows: [
      { feature: 'AI insights level', values: ['Basic reporting', 'Predictive analytics', 'Custom models'], highlight: true },
      { feature: 'Automated reordering', values: [false, true, true] },
      { feature: 'Custom dashboards', values: [false, '3 included', 'Unlimited'] },
    ],
  },
  {
    title: 'Support & Service',
    rows: [
      { feature: 'Support response time', values: ['48 hours', '24 hours', '1 hour (24/7)'] },
      { feature: 'Dedicated account manager', values: [false, false, true] },
    ],
  },
];

/**
 * Display price helper — the ONLY place a price string is produced.
 * `annual` applies the provisional discount.
 */
export function displayPrice(plan: Plan, annual: boolean): { amount: string; note: string } {
  if (plan.priceMonthly == null) return { amount: 'Custom', note: 'Let\u2019s talk' };
  // The catalog is USD because the product is sold in dollars; en-US keeps the
  // currency marker unambiguous ($) for every dollar-billed market.
  const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
  if (annual && plan.annualDiscountPct > 0) {
    const m = Math.round(plan.priceMonthly * (1 - plan.annualDiscountPct / 100));
    return { amount: usd(m), note: 'Billed annually' };
  }
  return {
    amount: usd(plan.priceMonthly),
    note: annual ? 'Billed annually' : 'Billed monthly',
  };
}
