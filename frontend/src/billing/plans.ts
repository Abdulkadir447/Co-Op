/**
 * Co-op Billing — plan catalog (Stage 2.3).
 *
 * ⚠️ PROVISIONAL DISPLAY VALUES.
 * The final pricing / AI-credit economics are DELIBERATELY NOT LOCKED IN.
 * This file is the single place the billing UI reads plan names, prices,
 * features and comparison rows from — when the pricing model is finalized,
 * it plugs in HERE (or replaces this file with a provider-supplied catalog).
 * No other component may hard-code a price or a credit rule.
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
  /** Provisional display price (USD/month). null = custom quote. */
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
      { label: 'Basic analytics', included: true },
      { label: 'Community support', included: true },
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
      { label: 'Zeno Insights', included: true, ai: true },
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
  if (annual && plan.annualDiscountPct > 0) {
    const m = Math.round(plan.priceMonthly * (1 - plan.annualDiscountPct / 100));
    return { amount: `$${m}`, note: 'Billed annually' };
  }
  return { amount: `$${plan.priceMonthly}`, note: annual ? 'Billed annually' : 'Billed monthly' };
}
