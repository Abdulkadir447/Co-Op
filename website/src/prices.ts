/**
 * The two paid plans, and the handful of formatted values the site quotes.
 *
 * One module so `Pricing.tsx` and `faq.ts` cannot disagree about what a plan
 * costs. Nothing here is a number: every value is computed from
 * `frontend/src/billing/plans.ts`, which is the catalog the app actually bills
 * from (and whose amounts are mirrored in `config/<env>.json` for Paystack).
 */
import { PLAN_CATALOG, displayPrice, type Plan } from '../../frontend/src/billing/plans';

export const STARTER: Plan = PLAN_CATALOG.find((p) => p.id === 'starter')!;
export const PRO: Plan = PLAN_CATALOG.find((p) => p.id === 'professional')!;

/** The list price — "₦25,000". */
export const listPrice = (plan: Plan): string => displayPrice(plan, false).amount;

/** The monthly rate when twelve months are paid up front — "₦20,000". */
export const annualMonthlyRate = (plan: Plan): string => displayPrice(plan, true).amount;

/** The yearly total, bare — "₦240,000". */
export const annualTotal = (plan: Plan): string =>
  displayPrice(plan, true).note.replace(/^Billed annually \(/, '').replace(/\)$/, '');
