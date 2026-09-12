import React, { useState } from 'react';
import { message } from 'antd';
import {
  CreditCardOutlined,
  CustomerServiceOutlined,
  ExclamationCircleFilled,
  FileTextOutlined,
  InfoCircleFilled,
  ReloadOutlined,
} from '@ant-design/icons';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { displayPrice } from '../../billing/plans';
import { useBilling } from '../../billing/useBilling';
import PageHeader from '../../components/layout/PageHeader';
import {
  CoopButton,
  CoopCard,
  CoopBadge,
  CoopErrorState,
  CoopLoading,
  SparkleIcon,
} from '../../components/ui';
import PricingView from './PricingView';

/**
 * Billing & Subscription (Real Billing phase).
 *
 * Real (server-side state, honest in one place):
 *  - active plan, monthly credit allowance, credits used (the AI ledger),
 *    remaining balance — all computed server-side, none of it invented here.
 *  - plan changes are real (enforcement updates immediately).
 * Still preview, by design:
 *  - payment collection — no provider connected, nothing charged; the UI
 *    says so in one banner instead of faking invoices or cards.
 */
const BillingPage: React.FC = () => {
  const { colors } = useCoopTheme();
  const [view, setView] = useState<'subscription' | 'pricing'>('subscription');
  const {
    plan, currentPlan, summary, localUsage, loadError, paymentConnected,
    trial, trialDays, action, cancelToFree, dismissResult, retry, refresh,
    payments, payment, paymentCurrency, verifyReference, pendingReference,
  } = useBilling();
  const [cancelOpen, setCancelOpen] = useState(false);

  if (view === 'pricing') {
    return <PricingView onBack={() => setView('subscription')} />;
  }

  const price = displayPrice(plan, true);
  const processing = action.status === 'processing';
  const result =
    action.status === 'success' || action.status === 'failure'
      ? {
          target: action.target,
          kind: action.kind,
          ok: action.status === 'success',
          reason: action.status === 'failure' ? action.reason : undefined,
        }
      : null;

  const stat = (label: string, value: React.ReactNode, sub?: string) => (
    <div key={label}>
      <div style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.outline, marginBottom: 4 }}>{label}</div>
      <div style={{ ...type.sectionHeading, fontSize: 20, color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ ...type.bodyCompact, fontSize: 11.5, color: colors.outline, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const creditLine = summary
    ? summary.unlimited
      ? 'Unlimited AI credits'
      : `${summary.remaining} of ${summary.granted} credits left`
    : '—';
  const creditPct = summary && !summary.unlimited && summary.granted
    ? Math.max(0, Math.min(100, ((summary.remaining ?? 0) / summary.granted) * 100))
    : 100;

  return (
    <div>
      <PageHeader
        title="Billing & Subscription"
        subtitle="Your plan, real AI credits, and this month's usage."
        actions={
          <CoopButton variant="secondary" onClick={() => setView('pricing')}>
            View Pricing
          </CoopButton>
        }
      />

      {/* Trial state — active countdown, or an honest "it ended" notice.
          Both read straight from the server; expiry is never computed here. */}
      {trial?.active && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: radius.lg,
            background: 'rgba(46,158,91,0.08)',
            border: '1px solid rgba(46,158,91,0.28)',
            marginBottom: 16,
            ...type.bodyCompact,
            color: colors.onSurfaceVariant,
          }}
        >
          <SparkleIcon size={16} color={colors.success} />
          <span style={{ flex: 1 }}>
            <strong style={{ color: colors.onSurface }}>
              {trial.days_remaining} {trial.days_remaining === 1 ? 'day' : 'days'} left in your free{' '}
              {trial.label} trial.
            </strong>{' '}
            You have the full {trial.label} credit allowance until{' '}
            {new Date(trial.ends_at ?? '').toLocaleDateString()}. The trial can’t be cancelled — it
            runs to the end, and when it does you keep the paid features only by subscribing.
          </span>
          <CoopButton size="sm" onClick={() => setView('pricing')} disabled={processing}>
            Choose a plan
          </CoopButton>
        </div>
      )}
      {trial?.expired && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: radius.lg,
            background: colors.surfaceContainerLow,
            border: `1px solid ${colors.outlineVariant}`,
            marginBottom: 16,
            ...type.bodyCompact,
            color: colors.onSurfaceVariant,
          }}
        >
          <InfoCircleFilled style={{ color: colors.outline }} />
          <span style={{ flex: 1 }}>
            <strong style={{ color: colors.onSurface }}>
              Your free {trial.label} trial has ended.
            </strong>{' '}
            You're back on the Free plan and your business data is untouched — only the AI credit
            allowance changed.
          </span>
          <CoopButton size="sm" onClick={() => setView('pricing')} disabled={processing}>
            View plans
          </CoopButton>
        </div>
      )}

      {/* Payment honesty banner (hidden once a provider is connected) */}
      {!paymentConnected && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 16px',
            borderRadius: radius.lg,
            background: colors.surfaceContainerLow,
            border: `1px solid ${colors.outlineVariant}`,
            marginBottom: 16,
            ...type.bodyCompact,
            color: colors.onSurfaceVariant,
          }}
        >
          <InfoCircleFilled style={{ color: colors.primary, marginTop: 2 }} />
          <span>
            <strong style={{ color: colors.onSurface }}>Plans and credits are live.</strong> Your plan,
            credit balance and enforcement are real — but no payment provider is connected yet, so
            nothing is charged. Invoices and payment methods appear here when billing goes live.
          </span>
        </div>
      )}

      {/* Result (success/failure) after a plan change */}
      {result && (
        <div
          role={result.ok ? 'status' : 'alert'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            borderRadius: radius.lg,
            marginBottom: 16,
            background: result.ok ? 'rgba(46,158,91,0.1)' : 'rgba(186,26,26,0.08)',
            border: `1px solid ${result.ok ? 'rgba(46,158,91,0.3)' : 'rgba(186,26,26,0.25)'}`,
          }}
        >
          {result.ok ? (
            <span style={{ color: colors.success, fontSize: 18 }}><InfoCircleFilled /></span>
          ) : (
            <span style={{ color: colors.error, fontSize: 18 }}><ExclamationCircleFilled /></span>
          )}
          <div style={{ flex: 1, ...type.bodyCompact, color: colors.onSurfaceVariant }}>
            {result.ok
              ? result.kind === 'trial'
                ? `Your ${trialDays}-day free trial of the ${result.target} plan has started. No card, nothing charged — you keep the full allowance until it ends.`
                : result.target === 'free'
                  ? 'Subscription cancelled — you are on the Free plan. Your credits follow the free allowance.'
                  : `You are now on the ${result.target} plan. Your credit allowance updated immediately. ${!paymentConnected ? 'No payment was taken.' : ''}`
              : result.kind === 'trial'
                ? `Couldn't start the free trial: ${result.reason ?? 'unknown reason'}`
                : `Plan change failed: ${result.reason ?? 'unknown reason'}`}
          </div>
          {!result.ok && (
            <CoopButton size="sm" variant="secondary" icon={<ReloadOutlined />} onClick={retry}>
              Try Again
            </CoopButton>
          )}
          <CoopButton size="sm" variant="ghost" onClick={dismissResult}>
            Dismiss
          </CoopButton>
        </div>
      )}

      {loadError && !summary ? (
        <CoopErrorState title="Couldn't load billing" detail={loadError} onRetry={refresh} />
      ) : !summary ? (
        <CoopLoading height={280} label="Loading your plan and credits…" />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {/* Current plan + credits */}
            <CoopCard
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  {plan.name} Plan
                  <CoopBadge
                    variant={
                      trial?.active ? 'success' : currentPlan === 'free' ? 'neutral' : 'primary'
                    }
                  >
                    {trial?.active
                      ? `Trial — ${trial.days_remaining}d left`
                      : currentPlan === 'free'
                        ? 'Free'
                        : 'Active'}
                  </CoopBadge>
                </span>
              }
              extra={
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...type.sectionHeading, fontSize: 24, color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>
                    {price.amount}
                    {plan.priceMonthly != null && plan.priceMonthly > 0 && (
                      <span style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}> /mo</span>
                    )}
                  </div>
                  <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}>{price.note}</div>
                </div>
              }
            >
              <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginBottom: 12 }}>
                {plan.tagline}
              </div>

              {/* Real credit balance — computed server-side from the ledger */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: radius.lg,
                  background: colors.surfaceContainerLow,
                  border: `1px solid ${colors.borderSubtle}`,
                  marginBottom: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', ...type.bodyCompact }}>
                  <span style={{ color: colors.onSurfaceVariant, fontSize: 13 }}>AI credits this month</span>
                  <span style={{ color: colors.onSurface, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {creditLine}
                  </span>
                </div>
                {!summary.unlimited && (
                  <div aria-hidden style={{ height: 6, borderRadius: radius.full, background: colors.surfaceContainer, overflow: 'hidden', marginTop: 8 }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${creditPct}%`,
                        background: `linear-gradient(90deg, ${colors.primaryContainer}, ${colors.secondaryContainer})`,
                        transition: 'width 400ms cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    />
                  </div>
                )}
                <div style={{ ...type.bodyCompact, fontSize: 11.5, color: colors.outline, marginTop: 8 }}>
                  Refreshes {summary.period.start} – {summary.period.end} · usage is metered by Co-op, not this device
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                  gap: 16,
                  padding: '14px 0',
                  borderTop: `1px solid ${colors.borderSubtle}`,
                }}
              >
                {stat('Credits used', summary.used, `of ${summary.granted ?? '∞'} this month`)}
                {stat('AI requests', summary.usage_month.requests, 'metered')}
                {stat(
                  'Plan',
                  plan.name,
                  trial?.active
                    ? `free trial — ${trial.days_remaining}d left`
                    : paymentConnected
                      ? 'billed'
                      : 'preview — not charged',
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <CoopButton icon={<CreditCardOutlined />} onClick={() => setView('pricing')} disabled={processing}>
                  Manage Plan
                </CoopButton>
                {trial?.active ? (
                  /* A started trial cannot be stopped: it runs to the end and
                     the only way to keep the paid features is to subscribe. */
                  <span style={{ ...type.bodyCompact, color: colors.outline }}>
                    Trial runs to {new Date(trial.ends_at ?? '').toLocaleDateString()} — subscribe to continue.
                  </span>
                ) : (
                  currentPlan !== 'free' && (
                    <button
                      type="button"
                      onClick={() => setCancelOpen(true)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: colors.error,
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        padding: '6px 4px',
                      }}
                    >
                      Cancel subscription
                    </button>
                  )
                )}
              </div>
            </CoopCard>

            {/* AI usage — metered ledger + this device's activity */}
            <CoopCard
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <SparkleIcon size={16} color={colors.secondaryContainer} />
                  AI Usage
                </span>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'AI requests served', value: summary.usage_month.requests },
                  { label: 'Credits consumed', value: summary.usage_month.credits_used },
                  { label: 'Input tokens', value: summary.usage_month.input_tokens },
                  { label: 'Output tokens', value: summary.usage_month.output_tokens },
                ].map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', ...type.bodyCompact, color: colors.onSurfaceVariant }}>
                    <span>{row.label}</span>
                    <span style={{ fontWeight: 700, color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>
                      {row.value.toLocaleString()}
                    </span>
                  </div>
                ))}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: `1px solid ${colors.borderSubtle}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', ...type.bodyCompact, color: colors.onSurfaceVariant }}>
                    <span>Questions asked (this device)</span>
                    <span style={{ fontWeight: 700, color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>{localUsage.aiQueries}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', ...type.bodyCompact, color: colors.onSurfaceVariant }}>
                    <span>Conversations (this device)</span>
                    <span style={{ fontWeight: 700, color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>{localUsage.conversations}</span>
                  </div>
                </div>
                <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}>
                  Requests, tokens and credits are metered by the Co-op backend — the same ledger
                  that enforces your plan. Device activity is shown for context only.
                </div>
              </div>
            </CoopCard>

            {/* Invoice history — honest not-connected state */}
            <CoopCard
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <FileTextOutlined style={{ color: colors.outline }} />
                  Invoice History
                </span>
              }
            >
              <div style={{ textAlign: 'center', padding: '18px 8px', ...type.bodyCompact, color: colors.onSurfaceVariant }}>
                <FileTextOutlined style={{ fontSize: 26, color: colors.outline, marginBottom: 10, display: 'inline-block' }} />
                <div style={{ marginBottom: 4 }}>No invoices yet</div>
                <div style={{ fontSize: 12.5 }}>
                  Billing invoices will appear here once a payment provider connects. AI-generated
                  order invoices are available from each order's detail page.
                </div>
              </div>
            </CoopCard>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {/* Payment method — honest state */}
            <CoopCard
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <CreditCardOutlined style={{ color: colors.outline }} />
                  Payment Method
                </span>
              }
            >
              {paymentConnected ? (
                <>
                  <div
                    style={{
                      borderRadius: radius.lg,
                      border: `1px solid ${colors.borderSubtle}`,
                      padding: '14px 16px',
                      ...type.bodyCompact,
                      color: colors.onSurfaceVariant,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CreditCardOutlined style={{ color: colors.primary }} />
                      <strong style={{ color: colors.onSurface }}>Paystack</strong>
                      <span style={{ color: colors.outline }}>· charges in {paymentCurrency}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: colors.outline, marginTop: 6 }}>
                      Card, bank transfer and USSD at checkout. Co-op only sees the confirmed
                      result — card details never touch this app.
                    </div>
                  </div>

                  {/* Charge history — the ledger the backend keeps */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ ...type.labelCaps, color: colors.outline, marginBottom: 8 }}>
                      Payment history
                    </div>
                    {payments.length === 0 ? (
                      <div style={{ ...type.bodyCompact, color: colors.outline }}>
                        No payments yet.
                      </div>
                    ) : (
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {payments.slice(0, 5).map((row) => (
                          <li
                            key={row.reference}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              ...type.bodyCompact,
                              color: colors.onSurfaceVariant,
                            }}
                          >
                            <span>
                              {row.plan.charAt(0).toUpperCase() + row.plan.slice(1)}
                              <span style={{ color: colors.outline }}> · {row.interval}</span>
                            </span>
                            <span
                              style={{
                                ...type.labelCaps,
                                color:
                                  row.status === 'success'
                                    ? colors.success
                                    : row.status === 'failed'
                                      ? colors.error
                                      : colors.outline,
                              }}
                            >
                              {row.status === 'success'
                                ? 'Paid'
                                : row.status === 'failed'
                                  ? 'Failed'
                                  : 'Pending'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {pendingReference && (
                      <div style={{ marginTop: 12 }}>
                        <CoopButton
                          size="sm"
                          variant="secondary"
                          icon={<ReloadOutlined />}
                          onClick={() => void verifyReference(pendingReference)}
                        >
                          Check payment status
                        </CoopButton>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    borderRadius: radius.lg,
                    border: `1px dashed ${colors.outlineVariant}`,
                    padding: '16px',
                    ...type.bodyCompact,
                    color: colors.onSurfaceVariant,
                  }}
                >
                  No payment method on file.
                  <div style={{ fontSize: 12.5, color: colors.outline, marginTop: 4 }}>
                    Payment connects when a provider is added — until then, nothing is charged.
                  </div>
                </div>
              )}
            </CoopCard>

            {/* Credit period — real */}
            <CoopCard
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ReloadOutlined style={{ color: colors.outline }} />
                  Credit Period
                </span>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...type.bodyCompact }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: colors.outline }}>Period</span>
                  <span style={{ color: colors.onSurface, fontWeight: 600 }}>
                    {summary.period.start} → {summary.period.end}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: colors.outline }}>Allowance</span>
                  <span style={{ color: colors.onSurface, fontWeight: 600 }}>
                    {summary.unlimited ? 'Unlimited' : `${summary.granted} credits / month`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: colors.outline }}>Remaining</span>
                  <span style={{ color: colors.onSurface, fontWeight: 600 }}>
                    {summary.unlimited ? 'Unlimited' : `${summary.remaining} credits`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: colors.outline }}>Plan</span>
                  <span style={{ color: colors.onSurface, fontWeight: 600 }}>{summary.label}</span>
                </div>
              </div>
            </CoopCard>

            {/* Support */}
            <CoopCard
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <CustomerServiceOutlined style={{ color: colors.outline }} />
                  Support
                </span>
              }
            >
              <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
                Need dedicated support or a custom plan?
                <div style={{ marginTop: 12 }}>
                  <CoopButton
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      message.info(
                        payment?.plans?.enterprise?.checkout_url
                          ? 'Enterprise checkout opens in your browser — tell us if you need invoicing instead.'
                          : 'Talk to us about Enterprise — we will tailor seats, invoicing and support.',
                      )
                    }
                  >
                    Contact Sales
                  </CoopButton>
                </div>
              </div>
            </CoopCard>
          </div>
        </div>
      )}

      {/* Cancel confirmation (real plan state, no payment in this phase) */}
      {cancelOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(27,27,35,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setCancelOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              background: colors.surfaceContainerLowest,
              borderRadius: radius.xl,
              border: `1px solid ${colors.borderSubtle}`,
              borderTop: `3px solid ${colors.error}`,
              padding: 28,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                background: 'rgba(186,26,26,0.1)',
                color: colors.error,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                marginBottom: 14,
              }}
            >
              <ExclamationCircleFilled />
            </div>
            <div style={{ ...type.sectionHeading, color: colors.onSurface, marginBottom: 8 }}>
              Cancel {plan.name} plan?
            </div>
            <p style={{ margin: 0, ...type.bodyCompact, color: colors.onSurfaceVariant }}>
              You'll move to the Free plan. Your business data, orders and AI history stay exactly as
              they are — only your plan and its credit allowance change{!paymentConnected ? ' (and no payment was ever taken)' : ''}.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <CoopButton variant="secondary" onClick={() => setCancelOpen(false)}>
                Keep Plan
              </CoopButton>
              <CoopButton
                variant="danger"
                loading={processing}
                onClick={async () => {
                  setCancelOpen(false);
                  await cancelToFree();
                }}
              >
                Cancel Subscription
              </CoopButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingPage;
