/**
 * Reports (Reports phase, Pass 3) — one verified reporting system.
 *
 * Four report types (Sales, Profit & Loss, Inventory, Customers) share one
 * page structure: Report selector → Filters → KPIs → Chart → Tables →
 * Notes, plus Export (CSV/XLSX/PDF of exactly what's shown) and
 * "Ask Zeno about this report" (the AI explains this verified data).
 *
 * All numbers come from the backend reporting engine — the same engine that
 * powers exports and the AI context, so nothing here is computed twice.
 */
import React, { useState } from 'react';
import { InfoCircleFilled } from '@ant-design/icons';
import { useCoopTheme } from '../../theme-provider';
import { spacing, type } from '../../theme';
import PageHeader from '../../components/layout/PageHeader';
import { CoopErrorState, CoopLoading } from '../../components/ui';
import {
  REPORT_META,
  type ReportKey,
} from './reportConfig';
import { useReport } from './useReport';
import ReportFilters from './ReportFilters';
import ReportKpis from './ReportKpis';
import ReportChartCard from './ReportChart';
import ReportTable from './ReportTable';
import ExportMenu from './ExportMenu';
import ReportAiSummary from './ReportAiSummary';

const REPORT_KEYS: ReportKey[] = ['sales', 'profit-loss', 'inventory', 'customers'];

const ReportsPage: React.FC = () => {
  const { colors } = useCoopTheme();
  const [key, setKey] = useState<ReportKey>('sales');
  const {
    data, loading, error, retry, meta, filters,
    setPreset, setCustomRange, setCompare, setCategory,
  } = useReport(key);

  const reportMeta = REPORT_META[key];

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Verified, deterministic business analysis — the same numbers power your exports and Co-op's explanations."
        actions={<ExportMenu reportKey={key} filters={filters} data={data} />}
      />

      {/* Report selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: spacing.md }}>
        {REPORT_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKey(k)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 40,
              padding: '0 16px',
              borderRadius: 9999,
              border: `1px solid ${key === k ? colors.primary : colors.outlineVariant}`,
              background: key === k ? colors.primary : colors.surfaceContainerLowest,
              color: key === k ? colors.onPrimary : colors.onSurfaceVariant,
              fontWeight: 600,
              fontSize: 13.5,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background-color 150ms',
            }}
          >
            {REPORT_META[k].label}
          </button>
        ))}
      </div>

      <div style={{ ...type.bodyCompact, color: colors.outline, marginBottom: spacing.md }}>
        {reportMeta.blurb}
      </div>

      <ReportFilters
        preset={filters.preset}
        from={filters.from}
        to={filters.to}
        compare={filters.compare}
        category={filters.category}
        categories={meta?.categories ?? []}
        onPreset={setPreset}
        onCustomRange={setCustomRange}
        onCompare={setCompare}
        onCategory={setCategory}
      />

      {loading ? (
        <div style={{ marginTop: spacing.md }}>
          <CoopLoading height={320} label="Crunching the numbers…" />
        </div>
      ) : error ? (
        <div style={{ marginTop: spacing.md }}>
          <CoopErrorState title="Couldn't load this report" detail={error} onRetry={retry} />
        </div>
      ) : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginTop: spacing.md }}>
          {/* KPIs */}
          <ReportKpis kpis={data.kpis} />

          {/* Chart */}
          <ReportChartCard chart={data.chart} />

          {/* AI bridge */}
          <ReportAiSummary reportKey={key} title={data.title} filters={filters} />

          {/* Tables */}
          {data.tables.map((t) => (
            <ReportTable key={t.title} table={t} />
          ))}

          {/* Honest notes (e.g. gross P&L positioning, cost coverage) */}
          {data.notes.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '12px 16px',
                borderRadius: 12,
                background: colors.surfaceContainerLow,
                border: `1px solid ${colors.borderSubtle}`,
              }}
            >
              {data.notes.map((n) => (
                <div key={n} style={{ display: 'flex', gap: 8, ...type.bodyCompact, fontSize: 12.5, color: colors.onSurfaceVariant }}>
                  <InfoCircleFilled style={{ color: colors.outline, marginTop: 2, flexShrink: 0 }} />
                  {n}
                </div>
              ))}
            </div>
          )}

          <div style={{ ...type.bodyCompact, fontSize: 11.5, color: colors.outline, textAlign: 'right' }}>
            {data.period_label} · verified by Co-op · generated {data.generated_at.replace('T', ' ')}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ReportsPage;
