/**
 * Reports — configuration-driven definitions (Reports phase, Pass 3).
 *
 * The page is generic over report KEY; each report's shape (KPIs, chart,
 * tables) comes from the backend reporting engine, so this file only holds
 * presentation metadata + the shared data contract the UI renders.
 * Adding a report = add it in the backend engine + one entry here.
 */

export type ReportKey = 'sales' | 'profit-loss' | 'inventory' | 'customers';
export type KpiFormat = 'number' | 'money' | 'percent';
export type GoodWhen = 'up' | 'down' | 'neutral';

export interface ReportKpi {
  key: string;
  label: string;
  value: number | string | null;
  format: KpiFormat;
  previous: number | null;
  change_percent: number | null;
  good_when: GoodWhen;
}

export interface ReportChartSeries {
  name: string;
  data: number[];
}

export interface ReportChart {
  kind: 'line' | 'bar' | 'donut';
  labels: string[];
  series: ReportChartSeries[];
  money: boolean;
}

export interface ReportTable {
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
  numeric_cols: number[];
}

/**
 * The compact filters dict the engine returns (server ReportFilters
 * .to_query_dict() / local port) — NOT the UI's ReportFilterState.
 */
export interface ReportFiltersDict {
  from: string;
  to: string;
  compare: string;
  category: string | null;
  product_id: number | null;
  customer_id: number | null;
}

export interface ReportData {
  key: string;
  title: string;
  period_label: string;
  compare: string;
  filters: ReportFiltersDict;
  generated_at: string;
  kpis: ReportKpi[];
  chart: ReportChart;
  tables: ReportTable[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Filter state — the ONE contract shared by the screen, exports and the AI.
// ---------------------------------------------------------------------------

export type PeriodPreset = '30d' | '90d' | 'month' | 'last_month' | 'all' | 'custom';
export type CompareMode = 'none' | 'previous_period' | 'previous_month' | 'previous_year';

export interface ReportFilterState {
  preset: PeriodPreset;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  compare: CompareMode;
  category: string; // '' = all
  product_id: number | null;
  customer_id: number | null;
}

export const REPORT_META: Record<ReportKey, { label: string; blurb: string }> = {
  sales: {
    label: 'Sales',
    blurb: 'Revenue, orders, units and the mix behind them.',
  },
  'profit-loss': {
    label: 'Profit & Loss',
    blurb: 'Revenue vs cost of goods — gross profit and margin.',
  },
  inventory: {
    label: 'Inventory',
    blurb: 'What you hold, what’s at risk, and how it moves.',
  },
  customers: {
    label: 'Customers',
    blurb: 'Who you sell to, who is new, and who has gone quiet.',
  },
};

export const PERIOD_PRESETS: Array<{ key: PeriodPreset; label: string }> = [
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'all', label: 'All time' },
];

export const COMPARE_OPTIONS: Array<{ key: CompareMode; label: string }> = [
  { key: 'none', label: 'No comparison' },
  { key: 'previous_period', label: 'Previous period' },
  { key: 'previous_month', label: 'Previous month' },
  { key: 'previous_year', label: 'Previous year' },
];

/** Compute from/to (YYYY-MM-DD) for a preset relative to today. */
export function presetDates(preset: PeriodPreset, today = new Date()): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const to = iso(today);
  switch (preset) {
    case '30d':
      return { from: iso(new Date(today.getTime() - 29 * 86400000)), to };
    case '90d':
      return { from: iso(new Date(today.getTime() - 89 * 86400000)), to };
    case 'month':
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to };
    case 'last_month': {
      const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastPrev = new Date(firstThis.getTime() - 86400000);
      return { from: iso(new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1)), to: iso(lastPrev) };
    }
    case 'all':
      return { from: '2000-01-01', to };
    default:
      // 'custom' ranges are set directly via setCustomRange; this fallback
      // keeps presetDates total just in case.
      return { from: iso(new Date(today.getTime() - 29 * 86400000)), to };
  }
}

/** Currency formatting that mirrors the rest of the app (Naira). */
export function fmtMoney(v: number | null | undefined, currency = 'NGN'): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(v) ? 0 : 2,
  });
}

export function fmtNumber(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function fmtValue(k: ReportKpi, currency = 'NGN'): string {
  if (k.value === null || k.value === undefined) return '—';
  if (k.format === 'money') return fmtMoney(k.value as number, currency);
  if (k.format === 'percent') return `${fmtNumber(k.value as number)}%`;
  return fmtNumber(k.value as number);
}
