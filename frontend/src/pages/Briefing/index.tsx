/**
 * Day 1 Morning Briefing (v1 "Instant Onboarding") — Pass 3 + 4 UI.
 *
 * Verified intelligence, not LLM guesses: the backend computes deterministic
 * analyses over real business data and returns phrased insight objects with
 * their evidence. This page renders them, links each to the relevant module,
 * and offers the controlled action (Draft Follow-up) that hands off to the
 * EXISTING order flow pre-filled — the user still reviews and confirms.
 */
import React, { useEffect, useState } from 'react';
import {
  DashboardOutlined,
  DollarOutlined,
  InboxOutlined,
  LineChartOutlined,
  ShoppingOutlined,
  TeamOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { radius, spacing, type, aiGradientBorder } from '../../theme';
import { colors as colorTokens } from '../../theme';

type Colors = typeof colorTokens;
import { useCoopTheme } from '../../theme-provider';
import { useApiClient, ApiError } from '../../services/api/client';
import { isLocalModeActive } from '../../repositories';
import { getLocalBundle } from '../../analytics/localData';
import { buildLocalBriefing } from '../../analytics/localBriefing';
import { CoopButton, CoopCard, CoopErrorState, CoopLoading, CoopBadge } from '../../components/ui';
import { SparkleIcon } from '../../components/ui/icons';
import { getCurrency } from '../../services/currency';

// ---------------------------------------------------------------------------
// Types (mirror the backend /dashboard/briefing payload)
// ---------------------------------------------------------------------------
interface BriefingAction {
  type: 'draft_followup';
  customer: { id: number; full_name: string; email: string };
  product: { id: number; name: string; sku: string; unit_price: number; current_stock: number } | null;
}

interface Insight {
  id: string;
  kind: 'overview' | 'revenue' | 'product' | 'customer' | 'inventory' | 'profit';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  evidence: string;
  link: string;
  action: BriefingAction | null;
}

interface BriefingPayload {
  ready: boolean;
  history: {
    first_order_date: string | null;
    last_order_date: string | null;
    span_months: number;
    orders: number;
    customers: number;
    products: number;
    total_revenue: number;
    imported?: boolean;
    latest_import?: { filename: string | null; date: string | null; rows: number } | null;
  };
  insights: Insight[];
}

const KIND_ICON: Record<Insight['kind'], React.ReactNode> = {
  overview: <DashboardOutlined />,
  revenue: <LineChartOutlined />,
  product: <ShoppingOutlined />,
  customer: <TeamOutlined />,
  inventory: <InboxOutlined />,
  profit: <DollarOutlined />,
};

const SEVERITY_COLOR: Record<Insight['severity'], 'primary' | 'warning' | 'error'> = {
  info: 'primary',
  warning: 'warning',
  critical: 'error',
};

const money = (v: number) =>
  v.toLocaleString(undefined, { style: 'currency', currency: getCurrency(), maximumFractionDigits: 0 });

const greeting = () => {
  const h = dayjs().hour();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

// ---------------------------------------------------------------------------
// Insight cards — one dominant hero, compact secondary rows
// ---------------------------------------------------------------------------
const SEV_LABEL: Record<Insight['severity'], string> = {
  critical: 'Needs attention',
  warning: 'Worth acting on',
  info: 'Good to know',
};

interface InsightCardProps {
  ins: Insight;
  colors: Colors;
  drafted: boolean;
  onDraft: () => void;
  onOpen: () => void;
}

/** The single most important insight — visually dominant, AI-advisor voice. */
const HeroInsight: React.FC<InsightCardProps> = ({ ins, colors, drafted, onDraft, onOpen }) => {
  const sev = SEVERITY_COLOR[ins.severity];
  const sevColor = sev === 'primary' ? colors.primary : sev === 'warning' ? colors.warning : colors.error;
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radius.xl,
        padding: '26px 28px 24px',
        boxShadow: '0 8px 28px rgba(20, 20, 40, 0.08)',
      }}
    >
      {/* AI advisor accent bar */}
      <div aria-hidden style={{ position: 'absolute', inset: '0 0 auto 0', height: 4, background: aiGradientBorder }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            background: `${sevColor}1a`,
            color: sevColor,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}
        >
          {KIND_ICON[ins.kind]}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CoopBadge variant={sev === 'primary' ? 'primary' : sev === 'warning' ? 'warning' : 'critical'}>
            {SEV_LABEL[ins.severity]}
          </CoopBadge>
          <span aria-hidden style={{ color: colors.outline, display: 'inline-flex' }}>
            <SparkleIcon size={14} />
          </span>
        </div>
      </div>

      <div style={{ ...type.sectionHeading, fontSize: 24, color: colors.onBackground, letterSpacing: '-0.01em', marginBottom: 10 }}>
        {ins.title}
      </div>
      <div style={{ ...type.bodyCompact, fontSize: 16, color: colors.onSurfaceVariant, lineHeight: '24px', maxWidth: 640 }}>
        {ins.body}
      </div>
      <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceMuted, marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden style={{ opacity: 0.7 }}>evidence:</span>
        <span>{ins.evidence}</span>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {ins.action?.type === 'draft_followup' && (
          <CoopButton onClick={onDraft} disabled={drafted} icon={<SparkleIcon size={15} />}>
            {drafted ? 'Draft opened in Create Order' : 'Draft Follow-up Order'}
          </CoopButton>
        )}
        <CoopButton variant="secondary" icon={<ArrowRightOutlined />} onClick={onOpen}>
          View in Co-op
        </CoopButton>
      </div>
    </div>
  );
};

/** Compact row for the secondary observations beneath the hero. */
const SecondaryInsight: React.FC<InsightCardProps> = ({ ins, colors, drafted, onDraft, onOpen }) => {
  const sev = SEVERITY_COLOR[ins.severity];
  const sevColor = sev === 'primary' ? colors.primary : sev === 'warning' ? colors.warning : colors.error;
  return (
    <div
      style={{
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderLeft: `3px solid ${sevColor}`,
        borderRadius: radius.lg,
        padding: '13px 18px',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: `${sevColor}18`,
          color: sevColor,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {KIND_ICON[ins.kind]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...type.titleMd, fontSize: 14, color: colors.onSurface, marginBottom: 2 }}>{ins.title}</div>
        <div style={{ ...type.bodyCompact, fontSize: 13, color: colors.onSurfaceVariant, lineHeight: '20px' }}>
          {ins.body}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {ins.action?.type === 'draft_followup' && (
            <CoopButton size="sm" onClick={onDraft} disabled={drafted}>
              {drafted ? 'Draft opened' : 'Draft Follow-up Order'}
            </CoopButton>
          )}
          <CoopButton size="sm" variant="secondary" onClick={onOpen}>
            View in Co-op
          </CoopButton>
        </div>
      </div>
    </div>
  );
};

const BriefingPage: React.FC = () => {
  const { colors } = useCoopTheme();
  const navigate = useNavigate();
  const api = useApiClient();
  const [data, setData] = useState<BriefingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [drafted, setDrafted] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // OFFLINE 3.5: local mode — the deterministic briefing engine over the
      // SQLite mirror (verbatim port of backend/briefing.py).
      if (isLocalModeActive()) {
        const b = await getLocalBundle();
        setData(buildLocalBriefing(b) as unknown as BriefingPayload);
        return;
      }
      const { data } = await api.get<BriefingPayload>('/dashboard/briefing');
      setData(data);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError('Could not load your briefing.'));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const draftFollowup = (ins: Insight) => {
    if (!ins.action) return;
    const a = ins.action;
    try {
      localStorage.setItem(
        'coop:ai-order-draft',
        JSON.stringify({
          customer: a.customer,
          lines: a.product
            ? [
                {
                  product_id: a.product.id,
                  name: a.product.name,
                  sku: a.product.sku,
                  quantity: 1,
                  unit_price: a.product.unit_price,
                },
              ]
            : [],
        }),
      );
    } catch {
      /* non-fatal */
    }
    setDrafted(ins.id);
    navigate('/orders/new');
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <CoopLoading height={320} label="Reading your business…" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <CoopErrorState title="Could not load your briefing" detail={error.message} onRetry={load} />
      </div>
    );
  }

  const h = data!.history;
  const ready = data!.ready;

  // ---------------------------------------------------------------------------
  // Hierarchy: ONE visually dominant insight (the thing that matters most
  // right now), secondary observations beneath it.
  //
  // Hero priority: critical (actionable first) > warning (actionable first)
  // > anything else. The "overview" insight is excluded — its content lives
  // in the "Co-op analyzed…" strip above.
  // ---------------------------------------------------------------------------
  const nonOverview = data!.insights.filter((i) => i.kind !== 'overview');
  const hero =
    nonOverview.find((i) => i.severity === 'critical' && i.action) ??
    nonOverview.find((i) => i.severity === 'critical') ??
    nonOverview.find((i) => i.severity === 'warning' && i.action) ??
    nonOverview.find((i) => i.severity === 'warning') ??
    nonOverview[0] ??
    null;
  const secondary = nonOverview.filter((i) => i.id !== hero?.id);

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      {/* Briefing header */}
      <div style={{ marginBottom: spacing.lg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span
            aria-hidden
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${colors.primaryContainer}, ${colors.secondaryContainer})`,
              color: colors.onPrimary,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SparkleIcon size={20} />
          </span>
          <div style={{ ...type.labelCaps, color: colors.onSurfaceMuted, letterSpacing: '0.1em' }}>
            {greeting()} · {dayjs().format('dddd, MMMM D')}
          </div>
        </div>
        <h1
          style={{
            margin: 0,
            ...type.pageTitle,
            fontSize: 30,
            color: colors.onBackground,
            letterSpacing: '-0.02em',
          }}
        >
          Your Day 1 Briefing
        </h1>
        {ready && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginTop: 12,
              ...type.bodyCompact,
              color: colors.onSurfaceVariant,
            }}
          >
            <span>
              Co-op analyzed{' '}
              <strong style={{ color: colors.onSurface }}>
                {h.span_months} month{h.span_months === 1 ? '' : 's'}
              </strong>{' '}
              of history · {h.orders} orders · {h.customers} customers · {h.products} products
              {h.total_revenue > 0 && (
                <>
                  {' '}· <strong style={{ color: colors.onSurface }}>{money(h.total_revenue)}</strong> historic
                  revenue
                </>
              )}
            </span>
            {h.imported && (
              <CoopBadge variant="neutral">
                based on imported history{h.latest_import?.date ? ` (${h.latest_import.date})` : ''}
              </CoopBadge>
            )}
          </div>
        )}
      </div>

      {!ready ? (
        <CoopCard>
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{ ...type.sectionHeading, color: colors.onSurface, marginBottom: 8 }}>
              Your briefing is waiting for your data
            </div>
            <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginBottom: 20 }}>
              Import your products, customers or sales history and Co-op will read the whole picture
              and brief you here — revenue trends, stock risk, quiet customers and margins.
            </div>
            <CoopButton onClick={() => navigate('/import')}>Import your business data</CoopButton>
          </div>
        </CoopCard>
      ) : (
        <>
          {/* Hero — the single most important insight, visually dominant */}
          {hero && (
            <HeroInsight
              ins={hero}
              colors={colors}
              drafted={drafted === hero.id}
              onDraft={() => draftFollowup(hero)}
              onOpen={() => navigate(hero.link)}
            />
          )}

          {/* Secondary observations */}
          {secondary.length > 0 && (
            <div style={{ marginTop: spacing.lg }}>
              <div
                style={{
                  ...type.labelCaps,
                  color: colors.outline,
                  letterSpacing: '0.08em',
                  marginBottom: 10,
                }}
              >
                Also worth knowing
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {secondary.map((ins) => (
                  <SecondaryInsight
                    key={ins.id}
                    ins={ins}
                    colors={colors}
                    drafted={drafted === ins.id}
                    onDraft={() => draftFollowup(ins)}
                    onOpen={() => navigate(ins.link)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Continue to dashboard */}
          <div
            style={{
              marginTop: spacing.lg,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <CoopButton size="lg" onClick={() => navigate('/')}>
              Continue to Dashboard
            </CoopButton>
          </div>
        </>
      )}
    </div>
  );
};

export default BriefingPage;
