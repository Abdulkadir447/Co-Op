import React, { useState } from 'react';
import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import { message } from 'antd';
import { radius, tint, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import {
  COMPARISON_SECTIONS,
  displayPrice,
  type Plan,
  type PlanId,
} from '../../billing/plans';
import { useBilling, type PaymentRecord } from '../../billing/useBilling';
import { CoopButton, SparkleIcon } from '../../components/ui';

/**
 * Pricing + plan comparison (Stitch coop_pricing_plans_qa_polished +
 * coop_plan_comparison).
 *
 * Every number on this screen comes from the plan catalog config — the
 * provisional display values in src/billing/plans.ts. Plan selection goes
 * through the billing service layer (draft → confirm → provider result),
 * and in preview mode the UI says so honestly.
 */

const cellValue = (v: string | boolean) =>
  v === true ? (
    <CheckCircleFilled style={{ color: 'currentColor' }} />
  ) : v === false ? (
    <span aria-label="not included">—</span>
  ) : (
    v
  );

const PlanCard: React.FC<{
  plan: Plan;
  annual: boolean;
  currentPlan: PlanId;
  onSelect: (plan: PlanId) => void;
  /** Start the free trial on this plan (only passed when one is available). */
  onTrial?: (plan: PlanId) => void;
  /** Pay for this plan with Paystack (only passed when payments are live). */
  onCheckout?: (plan: PlanId) => void;
  /** The paid CTA's label, from the billing service. */
  ctaLabel: string;
  /** Currency the charge will be taken in (shown under a paid CTA). */
  currency: string;
  trialDays: number;
  processing: boolean;
}> = ({
  plan, annual, currentPlan, onSelect, onTrial, onCheckout, ctaLabel, currency,
  trialDays, processing,
}) => {
  const { colors, isDark } = useCoopTheme();
  const price = displayPrice(plan, annual);
  const isCurrent = currentPlan === plan.id;
  const highlight = Boolean(plan.highlight);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: colors.surfaceContainerLowest,
        border: `1px solid ${highlight ? colors.primary : colors.borderSubtle}`,
        borderRadius: radius.lg,
        padding: 24,
        boxShadow: highlight ? (isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 24px rgba(91,95,239,0.12)') : 'none',
      }}
    >
      {highlight && (
        <span
          style={{
            position: 'absolute',
            top: -11,
            left: '50%',
            transform: 'translateX(-50%)',
            background: colors.primary,
            color: colors.onPrimary,
            ...type.labelCaps,
            textTransform: 'uppercase',
            padding: '3px 12px',
            borderRadius: radius.full,
            whiteSpace: 'nowrap',
          }}
        >
          Best Value
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...type.sectionHeading, color: colors.onSurface }}>{plan.name}</span>
        {plan.id === 'professional' && <SparkleIcon size={16} color={colors.secondaryContainer} />}
      </div>
      <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginTop: 6, minHeight: 40 }}>{plan.tagline}</div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 10 }}>
        <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', color: colors.onSurface }}>{price.amount}</span>
        {plan.priceMonthly != null && <span style={{ ...type.bodyCompact, color: colors.outline }}>/mo</span>}
      </div>
      <div style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.outline, marginTop: 4 }}>{price.note}</div>

      <div style={{ marginTop: 16, marginBottom: 18 }}>
        {plan.priceMonthly == null ? (
          <CoopButton variant="secondary" block disabled>
            {plan.cta}
          </CoopButton>
        ) : isCurrent ? (
          <CoopButton variant="secondary" block disabled>
            Current Plan
          </CoopButton>
        ) : onCheckout ? (
          /* Payments are live: the honest primary CTA is the paid upgrade,
             with the free trial kept as the no-card alternative. */
          <>
            <CoopButton
              block
              loading={processing}
              onClick={() => onCheckout(plan.id)}
              icon={plan.id === 'professional' ? <SparkleIcon size={14} color={colors.onPrimary} /> : undefined}
            >
              {ctaLabel}
            </CoopButton>
            {onTrial && (
              <button
                type="button"
                onClick={() => onTrial(plan.id)}
                disabled={processing}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 8,
                  border: 'none',
                  background: 'transparent',
                  color: colors.outline,
                  ...type.bodyCompact,
                  fontSize: 12.5,
                  cursor: processing ? 'default' : 'pointer',
                }}
              >
                {`Or try ${plan.name} free for ${trialDays} days`}
              </button>
            )}
          </>
        ) : onTrial ? (
          /* A trial is still available and payments are not wired up: leading
             with the trial is the honest CTA, so "buy" would not be a lie. */
          <>
            <CoopButton
              block
              loading={processing}
              onClick={() => onTrial(plan.id)}
              icon={plan.id === 'professional' ? <SparkleIcon size={14} color={colors.onPrimary} /> : undefined}
            >
              {`Start ${trialDays}-Day Free Trial`}
            </CoopButton>
            <button
              type="button"
              onClick={() => onSelect(plan.id)}
              disabled={processing}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 8,
                border: 'none',
                background: 'transparent',
                color: colors.outline,
                ...type.bodyCompact,
                fontSize: 12.5,
                cursor: processing ? 'default' : 'pointer',
              }}
            >
              Switch to {plan.name} without a trial
            </button>
          </>
        ) : (
          <CoopButton
            block
            loading={processing}
            onClick={() => onSelect(plan.id)}
            icon={plan.id === 'professional' ? <SparkleIcon size={14} color={colors.onPrimary} /> : undefined}
          >
            {plan.cta}
          </CoopButton>
        )}
        {onTrial && !onCheckout && (
          <div style={{ ...type.bodyCompact, fontSize: 11.5, color: colors.outline, marginTop: 8, textAlign: 'center' }}>
            No card required · cancel anytime
          </div>
        )}
        {onCheckout && (
          <div style={{ ...type.bodyCompact, fontSize: 11.5, color: colors.outline, marginTop: 8, textAlign: 'center' }}>
            {`Secure checkout by Paystack · billed in ${currency}`}
          </div>
        )}
      </div>

      <div style={{ ...type.labelCaps, color: colors.outline, textTransform: 'uppercase', marginBottom: 10 }}>
        {plan.includesLabel}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {plan.features.map((f) => (
          <div
            key={f.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              ...type.bodyCompact,
              color: f.included ? colors.onSurfaceVariant : colors.outline,
              opacity: f.included ? 1 : 0.6,
            }}
          >
            {f.included ? (
              f.ai ? (
                <SparkleIcon size={15} color={colors.secondaryContainer} />
              ) : (
                <CheckCircleFilled style={{ color: colors.primary, fontSize: 15 }} />
              )
            ) : (
              <span style={{ width: 15, display: 'inline-block', textAlign: 'center' }}>—</span>
            )}
            {f.label}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Result panel — payment success/failure, built to the Stitch
 * coop_payment_success_failure screen: an icon disc on a soft glow, a heading
 * and sub-line, and — on a paid success — the Amount Paid / Transaction ID /
 * Date receipt card; on failure a "Reason" callout with Contact Support and
 * Try Again. The receipt comes from the verified charge, never from the URL.
 */
const ResultPanel: React.FC<{
  target: PlanId | 'free';
  /** 'trial' = the free trial was started, not a paid plan change. */
  kind: 'plan' | 'trial' | 'checkout';
  trialDays: number;
  ok: boolean;
  reason?: string;
  paymentConnected: boolean;
  /** The verified charge, when this result is a paid checkout. */
  payment?: PaymentRecord | null;
  onRetry?: () => void;
  onClose: () => void;
}> = ({ target, kind, trialDays, ok, reason, paymentConnected, payment, onRetry, onClose }) => {
  const { colors } = useCoopTheme();
  const planName = target === 'free' ? 'Free' : target.charAt(0).toUpperCase() + target.slice(1);
  const paidSuccess = ok && kind === 'checkout' && payment?.status === 'success';

  const money = (kobo: number | null | undefined, cur: string | null | undefined) => {
    if (kobo == null) return '—';
    const sym = cur === 'NGN' ? '₦' : cur ? `${cur} ` : '';
    return `${sym}${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  };
  const when = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString('en-US', {
          month: 'short', day: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : '—';

  const heading = ok
    ? kind === 'trial'
      ? `Your ${trialDays}-day ${planName} trial has started`
      : kind === 'checkout'
        ? 'Payment Successful'
        : target === 'free'
          ? 'Subscription cancelled'
          : `Moved to ${planName}`
    : kind === 'trial'
      ? 'Could not start your free trial'
      : kind === 'checkout'
        ? 'Payment Failed'
        : 'Plan change failed';

  const sub = ok
    ? kind === 'checkout'
      ? 'Your transaction has been processed securely.'
      : kind === 'trial'
        ? 'The paid allowance is live until the trial ends. No card was taken.'
        : `Your plan has been updated on Co-op${target === 'free' ? ' — you’re on the Free plan' : ''}.${!paymentConnected ? ' No payment was taken.' : ''}`
    : kind === 'checkout'
      ? "We couldn't process your transaction."
      : reason ?? 'We could not complete the change.';

  return (
    <div
      role={ok ? 'status' : 'alert'}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radius.xl,
        padding: '48px 32px 32px',
        textAlign: 'center',
        boxShadow: '0 12px 40px rgba(27,27,35,0.08)',
      }}
    >
      {/* Decorative glow, as on the Stitch screen. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -96,
          [ok ? 'right' : 'left']: -96,
          width: 192,
          height: 192,
          borderRadius: '50%',
          background: ok ? tint(colors.success, 0.16) : tint(colors.error, 0.14),
          filter: 'blur(48px)',
          opacity: 0.5,
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'relative',
          width: 80,
          height: 80,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 40,
          background: ok ? tint(colors.success, 0.2) : colors.errorContainer,
          color: ok ? colors.success : colors.error,
          marginBottom: 24,
        }}
      >
        {ok ? <CheckCircleFilled /> : <CloseCircleFilled />}
      </span>

      <div style={{ ...type.sectionHeading, fontSize: 20, color: colors.onSurface, position: 'relative' }}>
        {heading}
      </div>
      <p style={{ margin: '8px auto 0', maxWidth: 420, ...type.bodyDefault, color: colors.onSurfaceVariant, position: 'relative' }}>
        {sub}
      </p>

      {/* Receipt — only when a real charge was confirmed. */}
      {paidSuccess && payment && (
        <div
          style={{
            width: '100%',
            background: colors.surfaceContainerLow,
            border: `1px solid ${colors.borderSubtle}`,
            borderRadius: radius.lg,
            padding: 24,
            marginTop: 32,
            textAlign: 'left',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: `1px solid ${colors.borderSubtle}`, paddingBottom: 8 }}>
            <span style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>Amount Paid</span>
            <span style={{ ...type.sectionHeading, fontSize: 20, color: colors.onSurface }}>
              {money(payment.amount_kobo, payment.currency)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>Transaction ID</span>
            <span style={{ ...type.bodyCompact, color: colors.onSurface, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', textTransform: 'uppercase' }}>
              {payment.reference}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>Date</span>
            <span style={{ ...type.bodyCompact, color: colors.onSurface }}>{when(payment.paid_at)}</span>
          </div>
        </div>
      )}

      {/* Reason callout on a failed paid checkout. */}
      {!ok && kind === 'checkout' && (
        <div
          style={{
            width: '100%',
            background: tint(colors.error, 0.08),
            border: `1px solid ${colors.errorContainer}`,
            borderRadius: radius.lg,
            padding: 16,
            marginTop: 32,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
            textAlign: 'left',
            position: 'relative',
          }}
        >
          <CloseCircleFilled style={{ color: colors.error, marginTop: 2 }} />
          <div>
            <div style={{ ...type.labelCaps, color: colors.error, marginBottom: 4 }}>Reason</div>
            <p style={{ margin: 0, ...type.bodyCompact, color: colors.onSurfaceVariant }}>
              {reason ?? "We couldn't confirm this charge. If you completed it, it will appear shortly; otherwise try a different card or contact your bank."}
            </p>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 32, position: 'relative' }}>
        {!ok && kind === 'checkout' && (
          <CoopButton variant="secondary" onClick={() => onClose()}>
            Contact Support
          </CoopButton>
        )}
        {!ok && onRetry && (
          <CoopButton onClick={onRetry}>Try Again</CoopButton>
        )}
        {ok && (
          <CoopButton onClick={onClose}>{kind === 'checkout' ? 'Back to Billing' : 'Done'}</CoopButton>
        )}
        {!ok && kind !== 'checkout' && (
          <CoopButton variant="secondary" onClick={onClose}>Close</CoopButton>
        )}
      </div>
    </div>
  );
};


export interface PricingViewProps {
  onBack: () => void;
}

const PricingView: React.FC<PricingViewProps> = ({ onBack }) => {
  const { colors } = useCoopTheme();
  const {
    plans, currentPlan, action, selectPlan, dismissResult, retry, paymentConnected,
    trial, trialDays, startTrial, canCheckout, checkout, ctaFor, paymentCurrency, lastPayment,
  } = useBilling();
  const [annual, setAnnual] = useState(true);

  const result =
    action.status === 'success' || action.status === 'failure'
      ? {
          target: action.target,
          kind: action.kind,
          ok: action.status === 'success',
          reason: action.status === 'failure' ? action.reason : undefined,
        }
      : null;
  const processing = action.status === 'processing';

  const contactSales = () =>
    message.info('Talk to us about Enterprise — we will tailor seats, invoicing and support to your team.');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Hero + billing toggle */}
      <div style={{ textAlign: 'center' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            border: 'none',
            background: 'transparent',
            color: colors.outline,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            padding: 0,
            marginBottom: 14,
          }}
        >
          ← Back to Billing
        </button>
        <h1 style={{ margin: 0, ...type.pageTitle, fontSize: 32, color: colors.onBackground, letterSpacing: '-0.02em' }}>
          Simple, transparent pricing
        </h1>
        <p style={{ margin: '10px auto 0', maxWidth: 520, ...type.bodyCompact, color: colors.onSurfaceVariant }}>
          Unlock the full potential of your business with Co-op. Choose the plan that best fits your needs.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 18 }}>
          <span style={{ ...type.bodyCompact, color: annual ? colors.outline : colors.onSurface, fontWeight: annual ? 400 : 600 }}>
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            aria-label="Bill annually"
            onClick={() => setAnnual((a) => !a)}
            style={{
              width: 44,
              height: 24,
              borderRadius: radius.full,
              border: 'none',
              background: annual ? colors.primary : colors.outlineVariant,
              position: 'relative',
              cursor: 'pointer',
              transition: 'background-color 200ms',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: 3,
                left: annual ? 23 : 3,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: colors.surfaceContainerLowest,
                transition: 'left 200ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          </button>
          <span style={{ ...type.bodyCompact, color: annual ? colors.onSurface : colors.outline, fontWeight: annual ? 600 : 400 }}>
            Annually
          </span>
          <span
            style={{
            ...type.labelCaps,
            background: colors.primaryFixed,
            color: colors.onPrimaryFixedVariant,
            borderRadius: radius.full,
            padding: '3px 8px',
            }}
          >
            −20%
          </span>
        </div>
      </div>

      {/* Result (success/failure) */}
      {result && (
        <div style={{ maxWidth: 560, margin: '0 auto', width: '100%' }}>
          <ResultPanel
            target={result.target}
            kind={result.kind}
            trialDays={trialDays}
            ok={result.ok}
            reason={result.reason}
            paymentConnected={paymentConnected}
            payment={lastPayment}
            onRetry={retry}
            onClose={dismissResult}
          />
        </div>
      )}

      {/* Plan cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 20,
          alignItems: 'stretch',
        }}
      >
        {plans.map((p) => (
          <PlanCard
            key={p.id}
            plan={p}
            annual={annual}
            currentPlan={currentPlan}
            processing={processing}
            trialDays={trialDays}
            // Enterprise is a sales conversation, and the current plan needs
            // no CTA — everything else can start the one free trial.
            onTrial={
              trial?.available && p.id !== 'enterprise' && p.id !== currentPlan
                ? (id) => void startTrial(id)
                : undefined
            }
            onCheckout={
              canCheckout(p.id) && p.id !== currentPlan ? (id) => void checkout(id) : undefined
            }
            ctaLabel={ctaFor(p.id)}
            currency={paymentCurrency}
            onSelect={(id) => {
              if (id === 'enterprise' && !canCheckout(id)) {
                contactSales();
                return;
              }
              void selectPlan(id);
            }}
          />
        ))}
      </div>

      {/* Comparison table */}
      <div
        style={{
          border: `1px solid ${colors.borderSubtle}`,
          borderRadius: radius.lg,
          overflowX: 'auto',
          background: colors.surfaceContainerLowest,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr style={{ background: colors.surfaceContainerLow }}>
              <th style={{ padding: '14px 18px', textAlign: 'left', ...type.titleMd, fontSize: 15, color: colors.onSurface }}>
                Features
              </th>
              {plans.map((p) => (
                <th
                  key={p.id}
                  style={{
                    padding: '14px 18px',
                    textAlign: 'center',
                    ...type.titleMd,
                    fontSize: 15,
                    color: p.id === 'professional' ? colors.primary : colors.onSurface,
                  }}
                >
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_SECTIONS.map((section) => (
              <React.Fragment key={section.title}>
                <tr style={{ background: section.ai ? colors.surfaceContainerLow : 'transparent' }}>
                  <td
                    colSpan={4}
                    style={{
                      padding: '10px 18px',
                      ...type.titleMd,
                      fontSize: 14,
                      color: colors.onSurface,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    {section.ai && <SparkleIcon size={14} color={colors.secondaryContainer} />}
                    {section.title}
                  </td>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.feature} style={{ borderTop: `1px solid ${colors.borderSubtle}` }}>
                    <td style={{ padding: '12px 18px', ...type.bodyCompact, color: colors.onSurfaceVariant }}>
                      {row.feature}
                    </td>
                    {row.values.map((v, i) => (
                      <td
                        key={i}
                        style={{
                          padding: '12px 18px',
                          textAlign: 'center',
                          ...type.bodyCompact,
                          color: v === true ? colors.primary : row.highlight && i === 2 ? colors.primary : colors.onSurfaceVariant,
                          fontWeight: row.highlight ? 600 : 400,
                        }}
                      >
                        {cellValue(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            padding: '14px 18px',
            background: colors.surfaceContainerLow,
            borderTop: `1px solid ${colors.borderSubtle}`,
            ...type.bodyCompact,
            color: colors.onSurfaceVariant,
          }}
        >
          Need a custom plan?
          <CoopButton size="sm" variant="secondary" onClick={contactSales}>
            Contact Sales
          </CoopButton>
        </div>
      </div>
    </div>
  );
};

export default PricingView;
