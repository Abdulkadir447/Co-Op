/**
 * Co-op Billing — plan catalog (Stage 2.3).
 *
 * List prices are in **Naira** and must match `paystack.prices_kobo` in
 * config/<env>.json — that file is what the card is actually charged (in
 * kobo), this one is what the customer reads. Changing a price means changing
 * both. Both are Naira because Co-op sells to Nigerian retailers: a dollar
 * list price from a Nigerian entity needs USD enabled on the Paystack account
 * and a domiciliary settlement account, and Paystack charges 3.9% on those
 * against 1.5% + ₦100 locally.
 *
 * This file is the single place the billing UI (app and website) reads plan
 * names, prices, features and comparison rows from; no other component may
 * hard-code a price or a credit rule.
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
   * Price per month in Naira. null = custom quote.
   *
   * Naira-native: the customer pays in Naira and the price on the card is the
   * price on the statement, with no exchange rate in between. The reasoning
   * behind the level is in docs/BUSINESS_PLAN.md section 5 — in short,
   * Starter (₦25,000/mo) undercuts the Nigerian Zoho Books entry tier while
   * sitting above the free tools, and Professional (₦75,000/mo) is the whole
   * back office for a shop that would otherwise buy two or three products.
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
    priceMonthly: 25000,
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
    priceMonthly: 75000,
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
  // Naira, formatted the way every other amount in the product is (en-NG gives
  // the ₦ prefix and Naira grouping). The annual note states the actual yearly
  // total: on a ₦25,000 plan "save 20%" is less informative than "₦240,000 a
  // year", and it is the number that leaves the customer's account.
  if (annual && plan.annualDiscountPct > 0) {
    const monthly = Math.round(plan.priceMonthly * (1 - plan.annualDiscountPct / 100));
    const yearly = Math.round(plan.priceMonthly * 12 * (1 - plan.annualDiscountPct / 100));
    return {
      amount: naira(monthly),
      note: `Billed annually (${naira(yearly)}/year)`,
    };
  }
  return {
    amount: naira(plan.priceMonthly),
    note: annual ? 'Billed annually' : 'Billed monthly',
  };
}

/** `₦25,000` — no decimals: both list prices are whole Naira. */
const naira = (n: number): string => `\u20a6${n.toLocaleString('en-NG')}`;
