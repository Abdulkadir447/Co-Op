/**
 * Co-op Notifications (Stage 2 + Daily Business Summary).
 *
 * Two distinct kinds of content, both grounded in real data:
 *
 *  1. "Today at a glance" — the verified daily business summary
 *     (/notifications/daily-summary), computed by the reporting/briefing
 *     engine. It is an informational digest, NOT an alert: it never drives
 *     the unread dot and never looks like a system push.
 *  2. Inventory alerts — low/out-of-stock rows derived from
 *     /products?stock=low|out, jump to the filtered Inventory module, and
 *     drive the unread dot (session-only, as before).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Popover, Skeleton } from 'antd';
import {
  ArrowRightOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
  InboxOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { radius, spacing, type } from '../../theme';
import { tint } from '../../theme/colors';
import { useCoopTheme } from '../../theme-provider';
import { useApiClient } from '../../services/api/client';
import { formatCurrency } from '../../pages/Dashboard/kpiConfig';
import { useDailySummary, type DailySummary, type DailySummaryState } from '../../notifications/useDailySummary';
import { getNotificationPrefs, subscribeNotificationPrefs } from '../../notifications/prefs';

interface AlertItem {
  id: number;
  name: string;
  sku: string;
  current_stock: number;
  reorder_level: number;
}

interface AlertsData {
  low: AlertItem[];
  out: AlertItem[];
}

type PanelState = AlertsData | 'loading' | 'error';

// ---------------------------------------------------------------------------
// Daily summary section
// ---------------------------------------------------------------------------

const DailySummarySection: React.FC<{ summary: DailySummaryState; enabled: boolean }> = ({
  summary,
  enabled,
}) => {
  const { colors } = useCoopTheme();

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div style={{ padding: `${spacing.sm + 2}px ${spacing.md}px ${spacing.sm}px` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ ...type.titleMd, color: colors.onSurface }}>Today at a glance</span>
        <span style={{ ...type.labelCaps, color: colors.outline }}>{dateLabel}</span>
      </div>

      {!enabled ? (
        <div style={{ padding: '10px 0 2px', ...type.bodyCompact, color: colors.onSurfaceVariant }}>
          Daily summary is paused — turn it back on in Settings → Notifications.
        </div>
      ) : (
        <>
          {summary.status === 'loading' && (
            <div style={{ padding: '10px 0 4px' }}>
              <Skeleton active paragraph={{ rows: 2 }} title={false} />
            </div>
          )}

          {summary.status === 'ready' && summary.data && <DailySummaryBody summary={summary.data} />}
        </>
      )}
      {/* A summary error is silent here — inventory alerts below remain the
          working notification surface; we don't stack error states. */}
      <div aria-hidden style={{ height: 8 }} />
      <div aria-hidden style={{ height: 1, background: colors.borderSubtle, margin: `0 ${-spacing.md}px` }} />
      <div aria-hidden style={{ height: 4 }} />
    </div>
  );
};

const DailySummaryBody: React.FC<{ summary: DailySummary }> = ({ summary: s }) => {
  const { colors } = useCoopTheme();
  const navigate = useNavigate();
  const money = (v: number) => formatCurrency(v, s.business.currency);

  // Honest empty states (no data yet / genuinely quiet day).
  if (!s.notable) {
    return (
      <div style={{ padding: '8px 0 2px', ...type.bodyCompact, color: colors.onSurfaceVariant }}>
        {s.empty_message ?? 'Nothing notable today.'}
      </div>
    );
  }

  const vsYesterday = s.comparison.vs_yesterday;
  const mtd = s.comparison.month_to_date;
  const sevColor = (sev: string) =>
    sev === 'critical' ? colors.error : sev === 'warning' ? colors.warning : colors.primary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0 2px' }}>
      {/* Headline: today's revenue + orders */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', ...type.bodyCompact }}>
        <span style={{ ...type.sectionHeading, fontSize: 20, color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>
          {money(s.today.revenue)}
        </span>
        <span style={{ color: colors.onSurfaceVariant }}>revenue today</span>
        {vsYesterday.change_percent !== null && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontWeight: 700,
              fontSize: 12.5,
              color: vsYesterday.change_percent >= 0 ? colors.success : colors.error,
            }}
          >
            {vsYesterday.change_percent >= 0 ? <RiseOutlined /> : <FallOutlined />}
            {vsYesterday.change_percent > 0 ? '+' : ''}
            {vsYesterday.change_percent.toFixed(0)}% vs yesterday
          </span>
        )}
        <span style={{ color: colors.outline }}>· {s.today.orders} order{s.today.orders === 1 ? '' : 's'}</span>
      </div>

      {/* Notable change (deterministic threshold) */}
      {s.notable_change && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            ...type.bodyCompact,
            fontSize: 12.5,
            color: s.notable_change.direction === 'up' ? colors.success : colors.error,
          }}
        >
          {s.notable_change.direction === 'up' ? <RiseOutlined /> : <FallOutlined />}
          {s.notable_change.message}
        </div>
      )}

      {/* Month-to-date context */}
      {mtd.revenue > 0 && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, ...type.bodyCompact, fontSize: 12.5, color: colors.onSurfaceVariant }}>
          This month: <strong style={{ color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>{money(mtd.revenue)}</strong>
          {mtd.change_percent !== null && mtd.previous_period_revenue !== null && (
            <span style={{ color: mtd.change_percent >= 0 ? colors.success : colors.error, fontWeight: 600 }}>
              ({mtd.change_percent > 0 ? '+' : ''}
              {mtd.change_percent.toFixed(0)}% vs {money(mtd.previous_period_revenue)} last month)
            </span>
          )}
        </div>
      )}

      {/* Inventory risk */}
      {(s.inventory.low_count > 0 || s.inventory.out_count > 0) && (
        <button
          type="button"
          onClick={() => navigate(s.inventory.out_count > 0 ? '/inventory?stock=out' : '/inventory?stock=low')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            ...type.bodyCompact,
            fontSize: 12.5,
            color: colors.onSurfaceVariant,
            textAlign: 'left',
          }}
        >
          <ExclamationCircleFilled style={{ color: s.inventory.out_count > 0 ? colors.error : colors.warning }} />
          {s.inventory.out_count > 0 && (
            <span style={{ color: colors.error, fontWeight: 600 }}>
              {s.inventory.out_count} out of stock
            </span>
          )}
          {s.inventory.out_count > 0 && s.inventory.low_count > 0 && ' · '}
          {s.inventory.low_count > 0 && (
            <span style={{ color: colors.warning, fontWeight: 600 }}>
              {s.inventory.low_count} low on stock
            </span>
          )}
          <ArrowRightOutlined style={{ fontSize: 10, color: colors.outline }} />
        </button>
      )}

      {/* New customers */}
      {s.customers.new_today > 0 && (
        <div style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.onSurfaceVariant }}>
          {s.customers.new_today} new customer{s.customers.new_today === 1 ? '' : 's'} today
          {s.customers.new_names.length > 0 && (
            <span style={{ color: colors.onSurface }}>
              {' '}— {s.customers.new_names.join(', ')}
            </span>
          )}
        </div>
      )}

      {/* Verified insights from the briefing engine (top 2) */}
      {s.insights.slice(0, 2).map((i) => (
        <button
          key={i.title}
          type="button"
          onClick={() => navigate(i.link)}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
            ...type.bodyCompact,
            fontSize: 12.5,
            color: colors.onSurfaceVariant,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: sevColor(i.severity),
              marginTop: 6,
              flexShrink: 0,
            }}
          />
          <span>
            {i.title}
            {i.evidence && <span style={{ color: colors.outline }}> — {i.evidence}</span>}
          </span>
        </button>
      ))}

      {/* Full briefing */}
      <button
        type="button"
        onClick={() => navigate('/briefing')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          border: 'none',
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
          color: colors.primary,
          fontWeight: 600,
          fontSize: 12.5,
          alignSelf: 'flex-start',
        }}
      >
        View full briefing <ArrowRightOutlined style={{ fontSize: 11 }} />
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inventory alerts section (unchanged behaviour)
// ---------------------------------------------------------------------------

const AlertsSection: React.FC<{ data: PanelState; paused?: boolean }> = ({ data, paused }) => {
  const { colors } = useCoopTheme();
  const navigate = useNavigate();

  const go = (stock: 'low' | 'out') => {
    navigate(`/inventory?stock=${stock}`);
  };

  if (data === 'loading') {
    return (
      <div style={{ padding: spacing.md, width: 320 }}>
        <Skeleton active paragraph={{ rows: 2 }} />
      </div>
    );
  }

  if (data === 'error') {
    return (
      <div style={{ padding: spacing.lg, width: 320, textAlign: 'center' }}>
        <InboxOutlined style={{ fontSize: 24, color: colors.outline }} />
        <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginTop: 8 }}>
          Unable to load notifications right now.
        </div>
      </div>
    );
  }

  const rows: Array<{ key: string; item: AlertItem; kind: 'low' | 'out' }> = paused
    ? []
    : [
        ...data.out.map((item) => ({ key: `out-${item.id}`, item, kind: 'out' as const })),
        ...data.low.map((item) => ({ key: `low-${item.id}`, item, kind: 'low' as const })),
      ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${spacing.sm + 2}px ${spacing.md}px ${spacing.sm}px`,
        }}
      >
        <span style={{ ...type.titleMd, color: colors.onSurface }}>Notifications</span>
        <span style={{ ...type.labelCaps, color: colors.outline }}>{rows.length} alerts</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: `${spacing.lg}px ${spacing.md}px`, textAlign: 'center' }}>
          <CheckCircleFilled style={{ fontSize: 26, color: paused ? colors.outline : colors.success }} />
          <div style={{ ...type.titleMd, color: colors.onSurface, marginTop: 8 }}>
            {paused ? 'Stock alerts are paused' : "You're all caught up"}
          </div>
          <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceVariant, marginTop: 4 }}>
            {paused
              ? 'Turn stock alerts back on in Settings → Notifications.'
              : 'No low-stock or out-of-stock items right now.'}
          </div>
        </div>
      ) : (
        <>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {rows.slice(0, 8).map(({ key, item, kind }) => (
              <button
                key={key}
                type="button"
                onClick={() => go(kind)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  width: '100%',
                  padding: `10px ${spacing.md}px`,
                  border: 'none',
                  borderBottom: `1px solid ${colors.borderSubtle}`,
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 120ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceContainerLow)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  aria-hidden
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: radius.md,
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    background: kind === 'out' ? tint(colors.error, 0.1) : tint(colors.warning, 0.14),
                    color: kind === 'out' ? colors.error : colors.warning,
                  }}
                >
                  {kind === 'out' ? <ExclamationCircleFilled /> : <InboxOutlined />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontWeight: 600,
                      fontSize: 13,
                      color: colors.onSurface,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {kind === 'out' ? 'Out of stock' : 'Low stock'} — {item.name}
                  </span>
                  <span style={{ ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceVariant, display: 'block' }}>
                    {item.sku} · {item.current_stock} left · reorder at {item.reorder_level}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div style={{ padding: `8px ${spacing.md}px 10px` }}>
            <button
              type="button"
              onClick={() => go('low')}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                color: colors.primary,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                padding: 6,
                borderRadius: radius.md,
              }}
            >
              View in Inventory →
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Popover shell
// ---------------------------------------------------------------------------

const NotificationsPopover: React.FC = () => {
  const { colors } = useCoopTheme();
  const api = useApiClient();
  const summary = useDailySummary();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PanelState>('loading');
  const [seen, setSeen] = useState(false);
  const [hover, setHover] = useState(false);
  const [lowStockEnabled, setLowStockEnabled] = useState<boolean>(() => getNotificationPrefs().lowStock);

  // Settings → Notifications toggle gates the stock-alert fetch itself.
  useEffect(() => subscribeNotificationPrefs(() => setLowStockEnabled(getNotificationPrefs().lowStock)), []);

  const load = useCallback(async () => {
    if (!getNotificationPrefs().lowStock) {
      setData({ low: [], out: [] });
      return;
    }
    try {
      const [low, out] = await Promise.all([
        api.get('/products', { params: { stock: 'low', limit: 4 } }).then((r) => r.data.items as AlertItem[]),
        api.get('/products', { params: { stock: 'out', limit: 4 } }).then((r) => r.data.items as AlertItem[]),
      ]);
      setData({ low, out });
    } catch {
      setData('error');
    }
  }, [api]);

  // Initial load (badge count) + refresh each time the panel opens.
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (open && (data === 'loading' || data === 'error')) void load();
    if (open && summary.status === 'loading') void summary.reload();
  }, [open, data, load, summary]);

  // The unread dot reflects ALERTS only — the daily summary is an
  // informational digest and must not create fake urgency.
  const hasAlerts =
    lowStockEnabled && data !== 'loading' && data !== 'error' && (data.low.length > 0 || data.out.length > 0);
  const showDot = hasAlerts && !seen;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSeen(true);
      }}
      trigger={['click']}
      placement="bottomRight"
      arrow={false}
      styles={{ body: { padding: 0, borderRadius: radius.lg } }}
      content={
        <div style={{ width: 360 }}>
          <DailySummarySection summary={summary} enabled={summary.enabled} />
          <AlertsSection data={data} paused={!lowStockEnabled} />
        </div>
      }
    >
      <button
        type="button"
        aria-label={showDot ? 'Notifications (unread alerts)' : 'Notifications'}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: 'none',
          background: hover ? colors.surfaceContainerLow : 'transparent',
          color: colors.onSurfaceVariant,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 150ms',
        }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3a6 6 0 0 0-6 6v3.2l-1.2 2.4A1 1 0 0 0 5.7 16h12.6a1 1 0 0 0 .9-1.4L18 12.2V9a6 6 0 0 0-6-6Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {showDot && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 8,
              right: 9,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: colors.error,
              border: `1.5px solid ${colors.surfaceContainerLowest}`,
            }}
          />
        )}
      </button>
    </Popover>
  );
};

export default NotificationsPopover;
