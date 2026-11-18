import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownOutlined, ArrowUpOutlined, LineChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { radius, type } from '../../theme';
import { tint } from '../../theme/colors';
import { useCoopTheme } from '../../theme-provider';
import { useApiClient } from '../../services/api/client';
import { formatCurrency } from '../../pages/Dashboard/kpiConfig';
import MiniChart from './MiniChart';
import { CoopErrorState } from '../ui';
import { fetchForecast, type AiForecast } from '../../ai/client';

/**
 * Revenue forecast (AI Platform phase — "Forecasting" deliverable).
 *
 * Server-side and deterministic: a transparent least-squares trend over the
 * business's verified monthly order data — never a black-box ML prediction,
 * and never presented as one. Free and instant (no model call, no credits).
 * The three honest states are all first-class: no history, not enough
 * history, and a real estimate with its range and its method on the record.
 */
const ForecastCard: React.FC = () => {
  const { colors, isDark } = useCoopTheme();
  const api = useApiClient();
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [data, setData] = useState<AiForecast | null>(null);

  const load = useCallback(() => {
    setState('loading');
    fetchForecast(api)
      .then((d) => {
        setData(d);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const border = `1px solid ${colors.borderSubtle}`;
  const forecast = data?.forecast ?? null;

  return (
    <div
      style={{
        border,
        borderTop: `2px solid ${colors.primary}`,
        borderRadius: radius.lg,
        background: colors.surfaceContainerLowest,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Header: title + forecast badge (same language as answer cards) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...type.sectionHeading, fontSize: 15, color: colors.onSurface }}>
          Revenue forecast
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 10px',
            borderRadius: radius.full,
            fontSize: 12,
            fontWeight: 600,
            background: tint(colors.warning, isDark ? 0.16 : 0.14),
            color: colors.warningText,
          }}
        >
          <LineChartOutlined style={{ fontSize: 11 }} />
          Estimate, not a fact
        </span>
      </div>

      {state === 'loading' && (
        <div style={{ ...type.bodyCompact, color: colors.onSurfaceMuted, padding: '8px 0' }}>
          Calculating from your sales history…
        </div>
      )}

      {state === 'error' && (
        <CoopErrorState
          title="Can't load the forecast"
          detail="The forecast service didn't respond. Your data is fine — try again."
          onRetry={load}
        />
      )}

      {state === 'ready' && data && !data.available && (
        <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
          {data.reason === 'no_sales_history'
            ? 'No sales history yet. Once your orders start coming in, I will project your next month from them.'
            : `Not enough history yet — I need ${data.required_months} completed months of sales (I have ${data.completed_months} so far). The forecast unlocks itself as you keep selling.`}
        </div>
      )}

      {state === 'ready' && data && data.available && forecast && (
        <>
          {/* The estimate */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: colors.onSurface,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatCurrency(forecast.estimated, data.currency)}
            </span>
            <span style={{ ...type.bodyCompact, color: colors.onSurfaceMuted }}>
              expected for {forecast.period_label}
            </span>
            {forecast.trend_percent !== null && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  color: forecast.trend_percent >= 0 ? colors.successText : colors.errorText,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {forecast.trend_percent >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                {Math.abs(forecast.trend_percent).toFixed(1)}% vs last month
              </span>
            )}
          </div>

          <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>
            Expected range {formatCurrency(forecast.low, data.currency)} – {formatCurrency(forecast.high, data.currency)}
          </div>

          {/* Verified actuals the estimate is built from (in-progress month marked) */}
          {data.months.length > 0 && (
            <MiniChart
              labels={data.months.map((m) => (m.in_progress ? `${m.label} (to date)` : m.label))}
              data={data.months.map((m) => m.revenue)}
              height={130}
              money
            />
          )}

          <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceMuted, marginTop: 'auto' }}>
            {data.method} Built on {forecast.completed_months_used} completed months · as of{' '}
            {dayjs(data.as_of).format('MMM D, YYYY')}
          </div>
        </>
      )}
    </div>
  );
};

export default ForecastCard;
