/**
 * ApexCharts bootstrap for CO OP.
 *
 * We import the FULL `react-apexcharts` bundle so every chart type
 * (line, area, bar, column, pie, donut) is registered against a single
 * ApexCharts core instance.
 *
 * Why not tree-shake? The previous setup (`react-apexcharts/core` plus
 * per-type side-effect imports like `apexcharts/bar` / `apexcharts/pie`) is
 * fragile: in dev, Vite can pre-bundle the wrapper's core separately from the
 * per-type entries, so a chart type's controller registers on one ApexCharts
 * instance while the chart renders against another. The result is exactly the
 * "duplicate bundle" pitfall — some types (we saw column + donut) silently
 * render nothing. The full bundle trades a little size for guaranteed
 * correctness, which is the right call for the Reports/Dashboard charts.
 *
 * All chart components MUST import Chart from this module so the app never
 * mixes the full bundle with per-type entries.
 */
import Chart from 'react-apexcharts';

export default Chart;
