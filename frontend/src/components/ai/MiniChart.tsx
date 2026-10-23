import React from 'react';
import type { ApexOptions } from 'apexcharts';
import Chart from '../dashboard/chart';
import { useCoopTheme } from '../../theme-provider';

export interface MiniChartProps {
  labels: string[];
  data: number[];
  height?: number;
  /** Money-formatted axis/tooltip. */
  money?: boolean;
}

/**
 * Small area chart for Ask Zeno answers (revenue trend). Reuses the
 * dashboard's tree-shaken ApexCharts bootstrap.
 */
const MiniChart: React.FC<MiniChartProps> = ({ labels, data, height = 160, money = false }) => {
  const { colors, isDark } = useCoopTheme();

  const options: ApexOptions = {
    chart: {
      type: 'area',
      fontFamily: 'Inter, sans-serif',
      foreColor: colors.outline,
      toolbar: { show: false },
      zoom: { enabled: false },
    },
    colors: [colors.primary],
    stroke: { curve: 'monotoneCubic', width: 2 },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.25, opacityTo: 0.02 } },
    grid: { borderColor: colors.borderSubtle, strokeDashArray: 4 },
    dataLabels: { enabled: false },
    tooltip: {
      theme: isDark ? 'dark' : 'light',
      ...(money
        ? {
            y: {
              formatter: (v: number) =>
                v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
            },
          }
        : {}),
    },
    xaxis: { categories: labels, axisBorder: { show: false }, labels: { show: labels.length <= 10 || true, style: { colors: colors.outline, fontSize: '11px' }, rotate: -45 } },
    yaxis: {
      labels: {
        style: { colors: colors.outline, fontSize: '11px' },
        ...(money
          ? {
              formatter: (v: number) =>
                v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)),
            }
          : {}),
      },
    },
  };

  return <Chart options={options} series={[{ name: 'value', data }]} type="area" height={height} />;
};

export default MiniChart;
