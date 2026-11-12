import React from 'react';
import Chart from './LazyChart';
import { radius, spacing, type as typeScale } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import type {
  ApexAxisChartSeries,
  ApexNonAxisChartSeries,
  ApexOptions,
} from 'apexcharts';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Optional header-extra node (e.g. range switch). */
  extra?: React.ReactNode;
  type: 'line' | 'area' | 'bar' | 'column' | 'donut' | 'pie';
  options: ApexOptions;
  series: ApexAxisChartSeries | ApexNonAxisChartSeries;
  height?: number;
}

/** True when a hex color reads as "dark" (WCAG-style luminance heuristic). */
function isDarkColor(hex?: string): boolean {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/**
 * Co-op analytics chart card (Stitch "Revenue Overview" pattern).
 *
 * - CoopCard chrome (title-md heading + muted subtitle + extra slot).
 * - Chart text/grid/tooltip colors follow the light Co-op palette.
 * - Empty state is handled natively by ApexCharts' `chart.noData` option.
 */
const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  extra,
  type,
  options,
  series,
  height = 320,
}) => {
  const { colors, isDark } = useCoopTheme();
  const dark = isDarkColor(colors.surface) || isDark;

  const baseOptions: ApexOptions = {
    chart: {
      fontFamily: 'Inter, sans-serif',
      foreColor: colors.onSurfaceVariant,
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 220 },
    },
    // ApexCharts v6: `noData` is a top-level option — native empty state.
    noData: {
      text: 'No data available yet',
      align: 'center',
      verticalAlign: 'middle',
      style: { color: colors.outline, fontSize: '14px' },
    },
    grid: { borderColor: colors.borderSubtle, strokeDashArray: 4 },
    dataLabels: { enabled: false },
    tooltip: { theme: dark ? 'dark' : 'light' },
    xaxis: {
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: colors.outline } },
    },
    yaxis: { labels: { style: { colors: colors.outline } } },
  };

  // Shallow-merge per chart group so caller options win where provided.
  const merged: ApexOptions = { ...baseOptions, ...options };
  merged.chart = { ...baseOptions.chart, ...options.chart };
  merged.grid = { ...baseOptions.grid, ...options.grid };
  merged.tooltip = { ...baseOptions.tooltip, ...options.tooltip };
  if (options.xaxis) merged.xaxis = { ...baseOptions.xaxis, ...options.xaxis };
  if (options.yaxis) merged.yaxis = { ...baseOptions.yaxis, ...options.yaxis };

  return (
    <div
      style={{
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radius.lg,
        padding: 20,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ ...typeScale.titleMd, color: colors.onSurface }}>{title}</div>
          {subtitle && (
            <div style={{ ...typeScale.bodyCompact, fontSize: 12, color: colors.outline, marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
        {extra}
      </div>
      <div style={{ flex: 1 }}>
        {/* 'column' is supported by ApexCharts at runtime (vertical bars);
            the react wrapper's type union just doesn't list it. */}
        <Chart options={merged} series={series} type={type as Exclude<typeof type, 'column'>} height={height} />
      </div>
    </div>
  );
};

export default ChartCard;
