/**
 * Co-op Billing — state/service layer (Real Billing phase).
 *
 * What is REAL now (server-side state, shared across devices):
 *   - the active plan (subscriptions)
 *   - credits granted (plan allowance, config-driven)
 *   - credits used (the ai_usage ledger — single source of truth)
 *   - remaining balance (computed: allowance − ledger)
 *   - plan changes (enforcement updates immediately)
 *
 * What is still preview (by design, until a payment provider connects):
 *   - collecting payment — nothing is charged; the UI says so honestly.
 *
 * The UI never knows where plans or credits come from — it renders what
 * the backend reports. Selecting a plan is async and can succeed/fail, so
 * both result screens exist and are wired.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiClient } from '../services/api/client';
import { PLAN_CATALOG, PlanId, getPlan, type Plan } from './plans';
import { clearReferenceFromUrl, openExternal, referenceFromSearch } from './checkout';

// ---------------------------------------------------------------------------
// Backend contract
// ---------------------------------------------------------------------------

/**
 * Free-trial position, as reported by the server. The trial is a window,
 * never a plan mutation — so `plan` below is the EFFECTIVE plan (the
 * trialled one while the window is open) and `base_plan` is what the
 * business actually owns. The UI must never compute expiry itself.
 */
export interface TrialState {
  /** Can a trial be started right now? (never used + feature enabled) */
  available: boolean;
  active: boolean;
  used: boolean;
  /** The window has closed — say so instead of silently reverting. */
  expired: boolean;
  plan: PlanId | null;
  label: string | null;
  days: number;
  days_remaining: number;
  started_at: string | null;
  ends_at: string | null;
}

export interface BillingSummary {
  /** Effective plan — includes an active trial grant. */
  plan: PlanId;
  label: string;
  unlimited: boolean;
  granted: number | null;
  used: number;
  remaining: number | null;
  period: { start: string; end: string };
  /** The plan owned regardless of any trial. */
  base_plan: PlanId;
  trial: TrialState | null;
  trial_days: number;
  plans: Array<{
    key: PlanId;
    label: string;
    credits_per_month: number | null;
    trialable: boolean;
  }>;
  usage_month: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
    credits_used: number;
  };
  payment_connected: boolean;
  business_id: number;
}

// ---------------------------------------------------------------------------
// Payments (Paystack) — the server tells us what it can actually charge for.
// ---------------------------------------------------------------------------

/** `GET /billing/payment-config` — no secret ever crosses this line. */
export interface PaymentConfig {
  provider: string | null;
  enabled: boolean;
  currency: string;
  intervals: string[];
  plans: Partial<Record<PlanId, { checkout_url: string | null; prices_kobo: Record<string, number> }>>;
  /** True when the backend can confirm a charge itself (not just redirect). */
  verification: boolean;
}

/** One row of the charge ledger (`GET /billing/payments`). */
export interface PaymentRecord {
  id: number;
  reference: string;
  plan: PlanId;
  interval: string;
  mode: 'page' | 'api' | null;
  amount_kobo: number | null;
  currency: string | null;
  status: 'pending' | 'success' | 'failed';
  provider_status: string | null;
  channel: string | null;
  paid_at: string | null;
  created_at: string | null;
}

export interface CheckoutResult {
  reference: string;
  mode: 'page' | 'api';
  url: string;
  plan: PlanId;
  interval: string;
  amount_kobo: number | null;
  currency: string;
  callback_url: string | null;
}

export interface VerifyResult {
  payment: PaymentRecord;
  applied: boolean;
  already_applied: boolean;
  summary: BillingSummary;
}

// Local (this device) conversation activity — real, but not metered billing.
export interface LocalAiUsage {
  month: string;
  aiQueries: number;
  conversations: number;
}

export type BillingResult = { ok: true } | { ok: false; reason: string };

const AI_CONVERSATIONS_KEY = 'coop:ai-conversations';

function readLocalAiUsage(): LocalAiUsage {
  const now = new Date();
  const month = now.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let aiQueries = 0;
  let conversations = 0;
  try {
    const raw = localStorage.getItem(AI_CONVERSATIONS_KEY);
    if (raw) {
      const convs = JSON.parse(raw) as Array<{ created: number; messages: Array<{ role: string }> }>;
      for (const c of convs) {
        if (c.created >= startOfMonth) conversations++;
        aiQueries += c.messages.filter((m) => m.role === 'user').length;
      }
    }
  } catch {
    /* corrupted store → zero usage, not a crash */
  }
  return { month, aiQueries, conversations };
}

// ---------------------------------------------------------------------------
// Hook — the only surface the billing UI consumes
// ---------------------------------------------------------------------------

export type PlanActionKind = 'plan' | 'trial' | 'checkout';

export type PlanActionState =
  | { status: 'idle' }
  | { status: 'processing'; target: PlanId | 'free'; kind: PlanActionKind }
  | { status: 'success'; target: PlanId | 'free'; kind: PlanActionKind }
  | { status: 'failure'; target: PlanId | 'free'; kind: PlanActionKind; reason: string };

export function useBilling() {
  const api = useApiClient();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localUsage, setLocalUsage] = useState<LocalAiUsage>(readLocalAiUsage);
  const [action, setAction] = useState<PlanActionState>({ status: 'idle' });
  // What the backend can actually charge for, and what it has already charged.
  const [payment, setPayment] = useState<PaymentConfig | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  /** Set when we sent the owner off to pay; used to verify on return. */
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  /** The charge a verify confirmed — the success screen renders its receipt. */
  const [lastPayment, setLastPayment] = useState<PaymentRecord | null>(null);
  // A returned ?reference= must be verified once, even under StrictMode.
  const verifyingRef = useRef<string | null>(null);

  const loadPayments = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: PaymentRecord[] }>('/billing/payments');
      setPayments(data.items ?? []);
    } catch {
      /* history is a nice-to-have; never fail the screen over it */
    }
  }, [api]);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const { data } = await api.get<BillingSummary>('/billing/summary');
      setSummary(data);
      setLocalUsage(readLocalAiUsage());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load billing.');
    }
    try {
      const { data } = await api.get<PaymentConfig>('/billing/payment-config');
      setPayment(data);
    } catch {
      setPayment(null);
    }
    await loadPayments();
  }, [api, loadPayments]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Confirm a charge with the backend. This is what actually moves the plan —
   * the browser coming back from Paystack proves nothing on its own.
   */
  const verifyReference = useCallback(async (reference: string): Promise<VerifyResult | null> => {
    try {
      const { data } = await api.post<VerifyResult>('/billing/payments/verify', { reference });
      setSummary(data.summary);
      if (data.payment) setLastPayment(data.payment);
      await loadPayments();
      return data;
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setAction({
        status: 'failure',
        target: 'free',
        kind: 'checkout',
        reason:
          typeof detail === 'string'
            ? detail
            : e instanceof Error
              ? e.message
              : 'Could not confirm the payment.',
      });
      return null;
    }
  }, [api, loadPayments]);

  // The owner came back from Paystack with ?reference=… on the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reference = referenceFromSearch(window.location.search) ?? pendingReference;
    if (!reference || verifyingRef.current === reference) return;
    verifyingRef.current = reference;
    clearReferenceFromUrl();
    void verifyReference(reference).then((result) => {
      if (result?.applied) {
        setAction({ status: 'success', target: result.payment.plan, kind: 'checkout' });
      } else if (result && !result.already_applied) {
        setAction({
          status: 'failure',
          target: result.payment.plan,
          kind: 'checkout',
          reason:
            result.payment.status === 'pending'
              ? 'Paystack has not confirmed this payment yet. If you completed it, it will appear here shortly.'
              : 'This payment was not completed.',
        });
      }
    });
  }, [pendingReference, verifyReference]);

  /**
   * Send the owner to Paystack. The backend creates the pending charge first
   * and hands back the URL; the desktop app opens it in the real browser
   * (the renderer is not allowed to navigate anywhere).
   */
  const checkout = useCallback(async (plan: PlanId, interval: string = 'monthly') => {
    setAction({ status: 'processing', target: plan, kind: 'checkout' });
    try {
      const { data } = await api.post<CheckoutResult>('/billing/checkout', {
        plan,
        interval,
        return_url: typeof window === 'undefined' ? undefined : window.location.href.split('?')[0],
      });
      setPendingReference(data.reference);
      await openExternal(data.url);
      setAction({ status: 'success', target: plan, kind: 'checkout' });
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setAction({
        status: 'failure',
        target: plan,
        kind: 'checkout',
        reason:
          typeof detail === 'string'
            ? detail
            : e instanceof Error
              ? e.message
              : 'Could not start the payment.',
      });
    }
  }, [api]);

  const applyPlan = useCallback(async (plan: PlanId | 'free') => {
    setAction({ status: 'processing', target: plan, kind: 'plan' });
    try {
      const { data } = await api.post<BillingSummary>('/billing/plan', { plan });
      setSummary(data);
      setAction({ status: 'success', target: plan, kind: 'plan' });
    } catch (e) {
      setAction({
        status: 'failure',
        target: plan,
        kind: 'plan',
        reason: e instanceof Error ? e.message : 'Plan change failed.',
      });
    }
  }, [api]);

  /**
   * Start the business's one free trial. The server is the only authority
   * on eligibility (409 when already used / not on Free), so we surface its
   * message rather than pre-judging it here.
   */
  const startTrial = useCallback(async (plan: PlanId) => {
    setAction({ status: 'processing', target: plan, kind: 'trial' });
    try {
      const { data } = await api.post<BillingSummary>('/billing/trial', { plan });
      setSummary(data);
      setAction({ status: 'success', target: plan, kind: 'trial' });
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: { message?: string } } } })
        ?.response?.data?.detail;
      setAction({
        status: 'failure',
        target: plan,
        kind: 'trial',
        reason: detail?.message ?? (e instanceof Error ? e.message : 'Could not start trial.'),
      });
    }
  }, [api]);

  const selectPlan = useCallback((plan: PlanId) => applyPlan(plan), [applyPlan]);
  const cancelToFree = useCallback(() => applyPlan('free'), [applyPlan]);

  const dismissResult = useCallback(() => setAction({ status: 'idle' }), []);
  const retry = useCallback(async () => {
    if (action.status !== 'failure') return;
    if (action.kind === 'trial' && action.target !== 'free') {
      await startTrial(action.target);
      return;
    }
    if (action.kind === 'checkout' && action.target !== 'free') {
      await checkout(action.target);
      return;
    }
    await applyPlan(action.target);
  }, [action, applyPlan, checkout, startTrial]);

  const currentPlan: PlanId = summary?.plan ?? 'free';
  const plan: Plan = getPlan(currentPlan);
  const trial: TrialState | null = summary?.trial ?? null;
  const trialDays = summary?.trial_days ?? 10;
  /** Can this plan be bought right now (a payment page or API is wired up)? */
  const canCheckout = useCallback(
    (id: PlanId): boolean =>
      Boolean(payment?.enabled && payment.plans?.[id]?.checkout_url),
    [payment],
  );

  /** CTA label for a pricing card: paid upgrade > trial > sales. */
  const ctaFor = useCallback((id: PlanId): string => {
    if (id === currentPlan) return 'Current Plan';
    if (canCheckout(id)) return id === 'enterprise' ? 'Subscribe' : 'Upgrade';
    if (id === 'enterprise') return 'Contact Sales';
    if (trial?.available) return `Start ${trialDays}-Day Free Trial`;
    return getPlan(id).cta;
  }, [canCheckout, currentPlan, trial, trialDays]);
  // True when the backend has a payment provider wired up (Paystack).
  const paymentConnected = summary?.payment_connected ?? payment?.enabled ?? false;
  /** Interval the toggle maps to when buying: the pricing screen's own state. */
  const paymentCurrency = payment?.currency ?? 'NGN';

  return {
    plans: PLAN_CATALOG,
    plan,
    currentPlan,
    summary,
    localUsage,
    loadError,
    paymentConnected,
    payment,
    payments,
    lastPayment,
    paymentCurrency,
    pendingReference,
    canCheckout,
    checkout,
    verifyReference,
    trial,
    trialDays,
    ctaFor,
    action,
    startTrial,
    selectPlan,
    cancelToFree,
    dismissResult,
    retry,
    refresh,
  };
}
