/**
 * Reports — chart card (reuses the Dashboard ChartCard + tree-shaken Apex).
 * Maps the backend ReportChart {kind, labels, series, money} onto ApexCharts.
 */
import React from 'react';
import ChartCard from '../../components/dashboard/ChartCard';
import type { ApexOptions, ApexAxisChartSeries, ApexNonAxisChartSeries } from 'apexcharts';
import type { ReportChart } from './reportConfig';
import { useCoopTheme } from '../../theme-provider';

const PALETTE = ['#5b5fef', '#8a4cfc', '#c0c1ff', '#2e9e5b', '#e0a106'];

const ReportChartCard: React.FC<{ chart: ReportChart; title?: string }> = ({ chart, title }) => {
  const { colors } = useCoopTheme();

  if (chart.kind === 'donut') {
    // ApexCharts v6 pie/donut requires object data points ({ x, y }); a flat
    // number array is rejected ("Expected object data point") and the failed
    // parse then crashes the renderer. Labels are derived from the x values.
    const values = chart.series[0]?.data ?? [];
    const series: ApexNonAxisChartSeries = [
      {
        data: chart.labels.map((label, i) => ({ x: label, y: values[i] ?? 0 })),
      },
    ];
    const options: ApexOptions = {
      colors: PALETTE,
      legend: { show: true, position: 'right', labels: { colors: colors.onSurfaceVariant } },
      plotOptions: { pie: { donut: { size: '62%' } } },
    };
    return (
      <ChartCard
        title={title ?? 'Breakdown'}
        type="donut"
        series={series}
        options={options}
        height={300}
      />
    );
  }

  // line / bar
  const series: ApexAxisChartSeries = chart.series.map((s) => ({ name: s.name, data: s.data }));
  const options: ApexOptions = {
    colors: PALETTE,
    chart: { stacked: false },
    legend: { show: chart.series.length > 1, position: 'top', horizontalAlign: 'right' },
    xaxis: { categories: chart.labels },
    yaxis: {
      labels: {
        formatter: (v: number) =>
          chart.money
            ? `$${v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : v.toFixed(0)}`
            : v.toLocaleString(),
      },
    },
    tooltip: {
      y: {
        formatter: (v: number) =>
          chart.money
            ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : v.toLocaleString(),
      },
    },
  };

  return (
    <ChartCard
      title={title ?? 'Trend'}
      type={chart.kind === 'bar' ? 'column' : 'area'}
      series={series}
      options={options}
      height={320}
    />
  );
};

export default ReportChartCard;
