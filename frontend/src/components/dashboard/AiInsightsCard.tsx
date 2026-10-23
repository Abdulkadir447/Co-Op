import React from 'react';
import { AlertOutlined, BulbOutlined, WarningOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { useAiData } from '../../ai/data';
import { computeInsights } from '../../ai/insights';
import { CoopMark } from '../brand/CoopLogo';

const SEVERITY_ICON = {
  info: <BulbOutlined />,
  warning: <AlertOutlined />,
  critical: <WarningOutlined />,
};

/**
 * Co-op Insights (Stage 2.2, Layer 1) — the proactive layer.
 *
 * Replaces the honest "AI module pending" placeholder: these are REAL,
 * rule-based observations computed from the live data bundle, each with a
 * "why this matters" line, its evidence basis, and a link straight to the
 * relevant module. No data → an honest not-enough-yet state.
 */
const AiInsightsCard: React.FC = () => {
  const { colors, isDark } = useCoopTheme();
  const navigate = useNavigate();
  const { bundle, loading, error, retry } = useAiData();
  const insights = React.useMemo(() => computeInsights(bundle), [bundle]);

  const sevColor = (s: 'info' | 'warning' | 'critical') =>
    s === 'critical' ? colors.error : s === 'warning' ? colors.warning : colors.primary;

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radius.lg,
      }}
    >
      {/* Signature AI gradient top border (Stage R1) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${colors.primaryContainer}, ${colors.secondaryContainer}, ${colors.inversePrimary})`,
        }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '16px 20px 0',
        }}
      >
        <CoopMark size={30} title="Zeno" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...type.labelCaps, textTransform: 'uppercase', letterSpacing: '0.08em', color: colors.outline }}>
            Zeno · Live Insights
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/coop-ai')}
          style={{
            border: 'none',
            background: 'transparent',
            color: colors.primary,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: radius.md,
          }}
        >
          Ask Zeno →
        </button>
      </div>

      <div style={{ padding: '12px 20px 20px' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ height: 84, borderRadius: radius.lg, background: colors.surfaceContainer }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
            Insights are unavailable right now ({error.message}).{' '}
            <button type="button" onClick={retry} style={{ border: 'none', background: 'transparent', color: colors.primary, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              Retry
            </button>
          </div>
        ) : !bundle.sufficient ? (
          <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, padding: '8px 0' }}>
            Not enough data yet — insights switch on once you have products and orders. Create your first
            product and order, and Co-op will start noticing things.
          </div>
        ) : insights.length === 0 ? (
          <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, padding: '8px 0' }}>
            All quiet — no anomalies detected in your recent activity.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {insights.slice(0, 4).map((ins) => (
              <button
                key={ins.id}
                type="button"
                onClick={() => navigate(ins.link)}
                style={{
                  textAlign: 'left',
                  border: `1px solid ${colors.borderSubtle}`,
                  borderRadius: radius.lg,
                  padding: 14,
                  cursor: 'pointer',
                  background: colors.surfaceContainerLowest,
                  transition: 'border-color 150ms, box-shadow 150ms',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = colors.outlineVariant;
                  e.currentTarget.style.boxShadow = isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 12px rgba(91,95,239,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = colors.borderSubtle;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: sevColor(ins.severity), display: 'inline-flex' }}>{SEVERITY_ICON[ins.severity]}</span>
                  <span style={{ ...type.bodyCompact, fontWeight: 700, fontSize: 13.5, color: colors.onSurface, lineHeight: '18px' }}>
                    {ins.title}
                  </span>
                </span>
                <span style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.onSurfaceVariant, lineHeight: '19px' }}>
                  {ins.why}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                  <span style={{ ...type.bodyCompact, fontSize: 11, color: colors.outline, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ins.evidence}
                  </span>
                  <span style={{ ...type.bodyCompact, fontSize: 12, fontWeight: 600, color: colors.primary, whiteSpace: 'nowrap' }}>
                    {ins.linkLabel}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AiInsightsCard;
