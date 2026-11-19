/**
 * Reports — KPI strip.
 *
 * Each KPI shows its verified value plus (when a comparison period is
 * selected) the deterministic change versus that period. Arrow colouring
 * respects the KPI's `good_when` (e.g. out-of-stock going UP is bad).
 */
import React from 'react';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { fmtValue, type ReportKpi } from './reportConfig';
import { useCoopTheme } from '../../theme-provider';
import { radius, type } from '../../theme';

const ReportKpis: React.FC<{ kpis: ReportKpi[]; currency?: string }> = ({ kpis, currency }) => {
  const { colors } = useCoopTheme();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 12,
      }}
    >
      {kpis.map((k) => {
        const chg = k.change_percent;
        let deltaTone: 'good' | 'bad' | 'neutral' = 'neutral';
        if (chg !== null && chg !== undefined && k.good_when !== 'neutral') {
          const improving = k.good_when === 'up' ? chg > 0 : chg < 0;
          deltaTone = chg === 0 ? 'neutral' : improving ? 'good' : 'bad';
        }
        const deltaColor =
          deltaTone === 'good' ? colors.successText : deltaTone === 'bad' ? colors.errorText : colors.onSurfaceMuted;

        return (
          <div
            key={k.key}
            style={{
              padding: '14px 16px',
              background: colors.surfaceContainerLowest,
              border: `1px solid ${colors.borderSubtle}`,
              borderRadius: radius.lg,
            }}
          >
            <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceVariant, marginBottom: 6 }}>
              {k.label}
            </div>
            <div
              style={{
                ...type.sectionHeading,
                fontSize: 22,
                color: colors.onSurface,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtValue(k, currency)}
            </div>
            {chg !== null && chg !== undefined && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 6,
                  ...type.bodyCompact,
                  fontSize: 12,
                  fontWeight: 700,
                  color: deltaColor,
                }}
              >
                {chg > 0 ? <ArrowUpOutlined /> : chg < 0 ? <ArrowDownOutlined /> : null}
                {chg > 0 ? '+' : ''}
                {chg.toFixed(1)}%
                <span style={{ fontWeight: 400, color: colors.outline }}>vs previous</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ReportKpis;
