/**
 * Reports — filter bar (one filter contract, shared with exports + AI).
 *
 * Changing any control updates the report immediately (the hook re-fetches).
 * "Export exactly what I'm looking at" holds because exports reuse the same
 * filter state.
 */
import React from 'react';
import {
  COMPARE_OPTIONS,
  PERIOD_PRESETS,
  type CompareMode,
  type PeriodPreset,
} from './reportConfig';
import { useCoopTheme } from '../../theme-provider';
import type { CoopThemeContextValue } from '../../theme-provider';
import { radius, type } from '../../theme';

export interface ReportFiltersProps {
  preset: PeriodPreset;
  from: string;
  to: string;
  compare: CompareMode;
  category: string;
  categories: string[];
  onPreset: (p: PeriodPreset) => void;
  onCustomRange: (from: string, to: string) => void;
  onCompare: (c: CompareMode) => void;
  onCategory: (c: string) => void;
}

const selectStyle = (colors: CoopThemeContextValue['colors']): React.CSSProperties => ({
  border: `1px solid ${colors.outlineVariant}`,
  borderRadius: radius.md,
  padding: '7px 10px',
  background: colors.surfaceContainerLowest,
  color: colors.onSurface,
  fontSize: 13,
  fontFamily: 'inherit',
});

const ReportFilters: React.FC<ReportFiltersProps> = ({
  preset, from, to, compare, category, categories,
  onPreset, onCustomRange, onCompare, onCategory,
}) => {
  const { colors } = useCoopTheme();

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radius.lg,
      }}
    >
      {/* Period presets */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPreset(p.key)}
            style={{
              border: `1px solid ${preset === p.key ? colors.primary : colors.outlineVariant}`,
              background: preset === p.key ? colors.primary : 'transparent',
              color: preset === p.key ? colors.onPrimary : colors.onSurfaceVariant,
              fontWeight: 600,
              fontSize: 12,
              borderRadius: radius.full,
              padding: '6px 12px',
              cursor: 'pointer',
              transition: 'background-color 150ms',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom range (always available; drives from/to directly) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="date"
          value={from}
          onChange={(e) => onCustomRange(e.target.value, to)}
          aria-label="From date"
          style={selectStyle(colors)}
        />
        <span style={{ color: colors.outline, fontSize: 12 }}>to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onCustomRange(from, e.target.value)}
          aria-label="To date"
          style={selectStyle(colors)}
        />
      </div>

      <div aria-hidden style={{ width: 1, height: 26, background: colors.borderSubtle }} />

      {/* Comparison */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceVariant }}>
        Compare
        <select value={compare} onChange={(e) => onCompare(e.target.value as CompareMode)} aria-label="Comparison period" style={selectStyle(colors)}>
          {COMPARE_OPTIONS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </label>

      {/* Category */}
      {categories.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceVariant }}>
          Category
          <select value={category} onChange={(e) => onCategory(e.target.value)} aria-label="Category filter" style={selectStyle(colors)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
};

export default ReportFilters;
