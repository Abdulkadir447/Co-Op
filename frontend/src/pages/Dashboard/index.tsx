import React, { useMemo, useState } from 'react';
import { Col, Row, Segmented } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { ApexOptions } from 'apexcharts';
import DashboardHeader from './DashboardHeader';
import BriefingBanner from '../../components/dashboard/BriefingBanner';
import { KPI_DEFINITIONS, formatCurrency } from './kpiConfig';
import { useDashboardData } from './useDashboardData';
import KpiCard from '../../components/dashboard/KpiCard';
import ChartCard from '../../components/dashboard/ChartCard';
import RecentOrdersTable, { OrderRow, OrderStatus } from '../../components/dashboard/RecentOrdersTable';
import AiInsightsCard from '../../components/dashboard/AiInsightsCard';
import InventoryBreakdownCard from '../../components/dashboard/InventoryBreakdownCard';
import QuickActionsCard from '../../components/dashboard/QuickActionsCard';
import TopProductsCard from '../../components/dashboard/TopProductsCard';
import { useCoopTheme } from '../../theme-provider';
import { CoopErrorState } from '../../components/ui';

/**
 * Co-op Dashboard — Stitch presentation (coop_business_dashboard_qa_polished)
 * over the EXISTING data architecture:
 *
 *   useDashboardData (unchanged loader)
 *     → KPI_DEFINITIONS (unchanged config layer)
 *       → NEW Stitch presentation (this file + the dashboard components)
 *
 * Layout (12-col):
 *   1. Briefing banner — Day 1 Briefing headline (dismissable)
 *   2. Header          — business identity + live "last updated"
 *   3. KPI row         — 4 stat cards (Revenue • Orders • Inventory • Products)
 *   4. AI insights     — Zeno · Live Insights (real rule-based
 *                        observations from the live data bundle + Ask Zeno)
 *   5. Charts row      — Revenue (Monthly/Weekly) + Inventory breakdown donut
 *   6. Bottom row      — Recent Orders + Quick Actions / Top Products
 *
 * Honesty rule: no fabricated numbers. Real zeros render as zeros, empty
 * series keep the native "no data" state, and the AI summary is a
 * placeholder until the AI module exists. Errors surface as a banner with
 * Retry (UXDS 9.23) without replacing the widgets.
 */

const DAYS_IN_CHART = 30;
const DAYS_WEEKLY = 7;

type RevenueRange = 'monthly' | 'weekly';

const DashboardPage: React.FC = () => {
  const { colors } = useCoopTheme();
  const navigate = useNavigate();
  const {
    loading,
    error,
    summary,
    timeseries,
    categories,
    orders,
    topProducts,
    business,
    lastUpdated,
    retry,
  } = useDashboardData();

  const [range, setRange] = useState<RevenueRange>('monthly');

  // ------------------------------------------------------------------
  // Revenue series (real data, zero-filled for missing days).
  //   monthly → last 30 days · weekly → last 7 days (same daily points).
  // ------------------------------------------------------------------
  const revenueSeries = useMemo(() => {
    const days = range === 'monthly' ? DAYS_IN_CHART : DAYS_WEEKLY;
    if (timeseries.length === 0) return { categories: [] as string[], data: [] as number[] };
    const byDate = new Map(timeseries.map((p) => [p.date, p.revenue]));
    const dayKeys = Array.from({ length: days }, (_, i) =>
      dayjs().subtract(days - 1 - i, 'day').format('YYYY-MM-DD'),
    );
    return {
      categories: dayKeys.map((d) => dayjs(d).format('MMM D')),
      data: dayKeys.map((d) => byDate.get(d) ?? 0),
    };
  }, [timeseries, range]);

  const revenueOptions: ApexOptions = useMemo(
    () => ({
      chart: { type: 'area' },
      colors: [colors.primary],
      stroke: { curve: 'monotoneCubic', width: 2.5 },
      fill: { type: 'gradient', gradient: { opacityFrom: 0.28, opacityTo: 0.02 } },
      xaxis: { categories: revenueSeries.categories },
      yaxis: { labels: { formatter: (v: number) => formatCurrency(v) } },
      tooltip: { y: { formatter: (v: number) => formatCurrency(v) } },
    }),
    [revenueSeries.categories, colors.primary],
  );

  // ------------------------------------------------------------------
  // KPI values from the summary payload (business calcs unchanged).
  // ------------------------------------------------------------------
  const kpiLive = useMemo(() => {
    if (!summary) return null;
    const healthPercent =
      summary.products_count > 0
        ? Math.round(((summary.products_count - summary.out_of_stock_count) / summary.products_count) * 100)
        : null;
    return {
      revenue: {
        value: formatCurrency(summary.revenue_month),
        trend:
          summary.revenue_growth_percent !== null
            ? { percent: summary.revenue_growth_percent, comparisonLabel: 'vs last month' }
            : null,
        caption: 'This month',
      },
      orders: { value: String(summary.orders_month), caption: `${summary.orders_today} today` },
      'inventory-health': { value: healthPercent !== null ? `${healthPercent}%` : '—', caption: 'Stock availability' },
      products: { value: String(summary.products_count), caption: 'Total active items' },
    } as Record<string, { value: string; trend?: { percent: number; comparisonLabel: string } | null; caption?: string }>;
  }, [summary]);

  const orderRows: OrderRow[] = useMemo(
    () =>
      orders.map((o) => ({
        id: o.id,
        orderNumber: `#ORD-${String(o.id).padStart(4, '0')}`,
        customer: o.customer?.full_name ?? '—',
        date: dayjs(o.order_date).format('MMM D, YYYY'),
        status: (o.status as OrderStatus) ?? 'pending',
        total: o.total_amount,
      })),
    [orders],
  );

  const renderKpiSub = (key: string): React.ReactNode | undefined => {
    if (!summary) return undefined;
    if (key === 'orders') {
      return <span>{summary.orders_today} today</span>;
    }
    if (key === 'inventory-health') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, color: colors.warning }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: colors.warning }} />
            {summary.low_stock_count} Low
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, color: colors.error }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: colors.error }} />
            {summary.out_of_stock_count} Out
          </span>
        </span>
      );
    }
    return undefined;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <BriefingBanner />
      <DashboardHeader business={business} lastUpdated={lastUpdated} />

      {/* Error banner (UXDS 9.23): widgets underneath stay visible. */}
      {error && (
        <CoopErrorState
          title={error.isAuthError ? 'Authentication required' : 'Unable to load dashboard data'}
          detail={error.message}
          onRetry={retry}
        />
      )}

      {/* KPI cards: 1 col (mobile) → 2 (tablet) → 4 (desktop) */}
      <section aria-label="Key performance indicators">
        <Row gutter={[16, 16]}>
          {KPI_DEFINITIONS.map((kpi) => {
            const live = kpiLive ? kpiLive[kpi.key] : undefined;
            return (
              <Col xs={24} sm={12} xl={6} key={kpi.key}>
                <KpiCard
                  title={kpi.title}
                  icon={kpi.icon}
                  accent={kpi.accent}
                  value={live?.value ?? '—'}
                  trend={live?.trend ?? null}
                  sub={renderKpiSub(kpi.key)}
                  caption={live?.caption}
                  isEmpty={!live}
                  loading={!kpiLive && loading}
                  onClick={kpi.route ? () => navigate(kpi.route as string) : undefined}
                />
              </Col>
            );
          })}
        </Row>
      </section>

      {/* Zeno live insights (Stage 2.2 Layer 1 — proactive) */}
      <section aria-label="Zeno insights">
        <AiInsightsCard />
      </section>

      {/* Charts row: Revenue (Monthly/Weekly) + Inventory breakdown */}
      <section aria-label="Analytics charts">
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={16}>
            <ChartCard
              title="Revenue Overview"
              subtitle={revenueSeries.data.length ? (range === 'monthly' ? 'Last 30 days' : 'Last 7 days') : 'Awaiting data'}
              type="area"
              options={revenueOptions}
              series={
                revenueSeries.data.length
                  ? [{ name: 'Revenue', data: revenueSeries.data }]
                  : [{ name: 'Revenue', data: [] }]
              }
              height={320}
              extra={
                <Segmented
                  size="small"
                  value={range}
                  onChange={(v) => setRange(v as RevenueRange)}
                  options={[
                    { label: 'Monthly', value: 'monthly' },
                    { label: 'Weekly', value: 'weekly' },
                  ]}
                />
              }
            />
          </Col>
          <Col xs={24} xl={8}>
            <InventoryBreakdownCard
              categories={categories}
              total={summary?.inventory_value ?? 0}
            />
          </Col>
        </Row>
      </section>

      {/* Bottom row: Recent Orders + right rail (Quick Actions / Top Products) */}
      <section aria-label="Recent orders and quick actions">
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={16}>
            <RecentOrdersTable orders={orderRows} />
          </Col>
          <Col xs={24} xl={8}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
              <QuickActionsCard />
              <TopProductsCard products={topProducts} />
            </div>
          </Col>
        </Row>
      </section>
    </div>
  );
};

export default DashboardPage;
