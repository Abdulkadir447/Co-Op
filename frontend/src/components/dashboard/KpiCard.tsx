import React, { useState } from 'react';
import { Skeleton } from 'antd';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { TrendDownIcon, TrendUpIcon } from '../ui/icons';

/** Signed percentage vs. the comparison period (e.g. +18.4). */
export interface KpiTrend {
  percent: number;
  /** Label such as "vs last month". */
  comparisonLabel?: string;
}

export interface KpiCardProps {
  title: string;
  /** Icon element; rendered in the top-right tile (UXDS 9.8 "Icon"). */
  icon: React.ReactNode;
  /** 'solid' = filled brand tile (hero metric), 'soft' = tinted tile. */
  accent?: 'solid' | 'soft';
  /** Formatted value; pass '—' when no data exists yet. */
  value: string;
  /** Trend row (↑/↓ % + comparison label). */
  trend?: KpiTrend | null;
  /** Custom sub-row (e.g. inventory low/out dots). Overrides trend. */
  sub?: React.ReactNode;
  /** Quiet caption when no trend/sub applies. */
  caption?: string;
  /** True when backend data does not exist yet. */
  isEmpty?: boolean;
  /** True while backend data is being fetched. */
  loading?: boolean;
  /** UXDS 9.9 — clicking a KPI card navigates to its module. */
  onClick?: () => void;
}

/**
 * Co-op KPI stat card (Stitch coop_business_dashboard_qa_polished):
 * label + icon tile on one row, dominant value, then trend / sub line.
 *
 * Interaction (UXDS 9.9 / 9.25): interactive cards lift with a border +
 * shadow on hover and keep a visible focus ring + Enter/Space activation
 * (UXDS 9.27/9.28). Colors resolve from the active theme (light/dark).
 */
const KpiCard: React.FC<KpiCardProps> = ({
  title,
  icon,
  accent = 'soft',
  value,
  trend,
  sub,
  caption,
  isEmpty = false,
  loading = false,
  onClick,
}) => {
  const { colors, isDark } = useCoopTheme();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const interactive = Boolean(onClick);
  const trendUp = (trend?.percent ?? 0) >= 0;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!interactive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.();
    }
  };

  const solid = accent === 'solid';

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`${title}: ${isEmpty ? 'no data yet' : value}`}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 20,
        background: colors.surfaceContainerLowest,
        border: `1px solid ${focused ? colors.primary : hovered && interactive ? colors.outlineVariant : colors.borderSubtle}`,
        borderRadius: radius.lg,
        cursor: interactive ? 'pointer' : 'default',
        outline: 'none',
        boxShadow: hovered && interactive
          ? isDark
            ? '0 8px 24px rgba(0, 0, 0, 0.4)'
            : '0 8px 24px rgba(21, 24, 29, 0.06)'
          : 'none',
        transition:
          'border-color 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Label + icon tile */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ ...type.bodyDefault, fontSize: 14.5, color: colors.onSurfaceVariant, fontWeight: 500 }}>
          {title}
        </span>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: radius.md,
            background: solid
              ? isDark
                ? colors.primaryContainer
                : colors.primary
              : isDark
                ? colors.surfaceContainerLow
                : colors.surfaceContainerLow,
            color: solid ? colors.onPrimary : colors.primary,
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      </div>

      {/* Dominant value */}
      {loading ? (
        <Skeleton.Input active size="large" style={{ width: 130, height: 32 }} />
      ) : (
        <div
          style={{
            fontSize: 28,
            lineHeight: '34px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: colors.onSurface,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </div>
      )}

      {/* Trend / sub / caption row */}
      {!loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            fontSize: 12.5,
            color: colors.outline,
          }}
        >
          {sub ? (
            sub
          ) : !isEmpty && trend ? (
            <>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontWeight: 700,
                  color: trendUp ? colors.success : colors.error,
                }}
              >
                {trendUp ? <TrendUpIcon size={12} color="currentColor" /> : <TrendDownIcon size={12} color="currentColor" />}
                {Math.abs(trend.percent).toFixed(1)}%
              </span>
              {trend.comparisonLabel && <span>{trend.comparisonLabel}</span>}
            </>
          ) : (
            <span>{isEmpty ? 'No data yet' : caption}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default KpiCard;
