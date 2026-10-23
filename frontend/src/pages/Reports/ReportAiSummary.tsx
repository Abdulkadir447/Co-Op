/**
 * Reports — "Ask Zeno about this report" (Reports phase, Pass 8).
 *
 * Hands the CURRENT report (its key + exact filters) to the Zeno page.
 * The backend rebuilds the verified report data from those filters, so the
 * assistant explains the same numbers the owner is looking at — it never
 * computes them itself.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SparkleIcon } from '../../components/ui/icons';
import { useCoopTheme } from '../../theme-provider';
import { radius } from '../../theme';
import type { ReportFilterState } from './reportConfig';

export interface ReportAiSummaryProps {
  reportKey: string;
  title: string;
  filters: ReportFilterState;
}

const ReportAiSummary: React.FC<ReportAiSummaryProps> = ({ reportKey, title, filters }) => {
  const navigate = useNavigate();
  const { colors } = useCoopTheme();

  const ask = () => {
    navigate('/coop-ai', {
      state: {
        report: {
          key: reportKey,
          title,
          from: filters.from,
          to: filters.to,
          compare: filters.compare,
          category: filters.category || null,
          product_id: filters.product_id,
          customer_id: filters.customer_id,
        },
      },
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        padding: '14px 18px',
        borderRadius: radius.lg,
        background: `linear-gradient(135deg, ${colors.primaryContainer}22, ${colors.secondaryContainer}22), ${colors.surfaceContainerLowest}`,
        border: `1px solid ${colors.borderSubtle}`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          background: colors.secondaryContainer,
          color: colors.onSecondaryContainer,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <SparkleIcon size={19} />
      </span>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: colors.onSurface }}>
          Want Co-op to make sense of this?
        </div>
        <div style={{ fontSize: 13, color: colors.onSurfaceVariant, marginTop: 2 }}>
          Ask what changed, what matters most, and what to investigate — grounded in this exact report.
        </div>
      </div>
      <button
        type="button"
        onClick={ask}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 40,
          padding: '0 18px',
          borderRadius: radius.lg,
          border: 'none',
          background: colors.primary,
          color: colors.onPrimary,
          fontWeight: 700,
          fontSize: 13.5,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <SparkleIcon size={15} />
        Ask Zeno about this report
      </button>
    </div>
  );
};

export default ReportAiSummary;
