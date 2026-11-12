import React, { Suspense } from 'react';
import type {
  ApexAxisChartSeries,
  ApexNonAxisChartSeries,
  ApexOptions,
} from 'apexcharts';

/**
 * Deferred ApexCharts boundary.
 *
 * `react-apexcharts` plus the ApexCharts core is ~270 kB gzipped — by far the
 * largest thing in the bundle, and it was in the *first* paint because the
 * Dashboard is the landing page. Everything else on that page is small enough
 * to render immediately, so the chart library now streams in after the shell
 * instead of blocking it. Same components, same options — only the timing
 * changes.
 *
 * The fallback keeps the chart's height so the card does not jump when the
 * library arrives (layout shift is the usual cost of lazy-loading a chart).
 */

// The full bundle on purpose — see ./chart.ts for why tree-shaking it broke
// column/donut rendering. Importing it here (not in each chart component)
// keeps exactly one instance of ApexCharts in the graph.
const ApexChart = React.lazy(() => import('./chart'));

export interface LazyChartProps {
  type: 'line' | 'area' | 'bar' | 'column' | 'donut' | 'pie';
  options: ApexOptions;
  series: ApexAxisChartSeries | ApexNonAxisChartSeries;
  height?: number;
  width?: number | string;
}

const LazyChart: React.FC<LazyChartProps> = ({ height = 320, ...props }) => (
  <Suspense fallback={<div style={{ height, width: '100%' }} aria-hidden />}>
    <ApexChart {...props} height={height} />
  </Suspense>
);

export default LazyChart;
