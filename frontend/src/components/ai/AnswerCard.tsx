import React from 'react';
import {
  ArrowRightOutlined,
  CalculatorOutlined,
  FileTextOutlined,
  LineChartOutlined,
  SafetyCertificateOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { radius, type } from '../../theme';
import { tint } from '../../theme/colors';
import { useCoopTheme } from '../../theme-provider';
import type { CoopThemeContextValue } from '../../theme-provider';
import type { Answer } from '../../ai/types';
import MiniChart from './MiniChart';
import { DraftCard } from './DraftCard';

const KIND_META: Record<
  Answer['kind'],
  { label: string; icon: React.ReactNode; tone: 'primary' | 'info' | 'warning' | 'secondary' | 'neutral' }
> = {
  fact: { label: 'Fact', icon: <SafetyCertificateOutlined />, tone: 'primary' },
  calculation: { label: 'Calculation', icon: <CalculatorOutlined />, tone: 'info' },
  forecast: { label: 'Forecast', icon: <LineChartOutlined />, tone: 'warning' },
  suggestion: { label: 'Suggestion', icon: <StarOutlined />, tone: 'secondary' },
  draft: { label: 'Draft — review before it happens', icon: <FileTextOutlined />, tone: 'primary' },
  clarify: { label: 'Co-op', icon: <StarOutlined />, tone: 'neutral' },
  error: { label: 'Error', icon: <FileTextOutlined />, tone: 'warning' },
};

// Badge tone palettes. Fixed tones use the design palette directly
// (primaryFixed / secondaryFixed families); info & warning derive their
// tints from the palette colors with contrast-paired text colors.
type TonePalette = CoopThemeContextValue['colors'] & { isDark: boolean };

const TONE_STYLE: Record<string, { bg: (c: TonePalette) => string; fg: (c: TonePalette) => string }> = {
  primary: { bg: (c) => c.primaryFixed, fg: (c) => c.onPrimaryFixedVariant },
  info: {
    bg: (c) => tint(c.info, c.isDark ? 0.18 : 0.1),
    fg: (c) => (c.isDark ? tint(c.info, 0.75) : tint(c.info, 0.8)),
  },
  warning: {
    bg: (c) => tint(c.warning, c.isDark ? 0.16 : 0.14),
    fg: (c) => (c.isDark ? c.warning : tint(c.warning, 0.9)),
  },
  secondary: { bg: (c) => c.secondaryFixed, fg: (c) => c.onSecondaryFixedVariant },
  neutral: { bg: (c) => c.surfaceVariant, fg: (c) => c.onSurfaceVariant },
};

/**
 * Ask Zeno answer bubble — renders the grounded answer with its kind badge,
 * basis note, optional chart/table, follow-ups, and (for drafts) the review
 * card. Facts, calculations, forecasts and suggestions are visually distinct
 * by design.
 */
const AnswerCard: React.FC<{
  answer: Answer;
  onFollowUp: (q: string) => void;
}> = ({ answer, onFollowUp }) => {
  const { colors, isDark } = useCoopTheme();
  const navigate = useNavigate();
  const meta = KIND_META[answer.kind];
  const tone = TONE_STYLE[meta.tone];

  return (
    <div
      style={{
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radius.lg,
        padding: 16,
        maxWidth: 720,
      }}
    >
      {/* Kind badge + basis */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 10px',
            borderRadius: radius.lg,
            background: tone.bg({ ...colors, isDark }),
            color: tone.fg({ ...colors, isDark }),
            ...type.labelCaps,
            textTransform: 'uppercase',
          }}
        >
          {meta.icon}
          {meta.label}
        </span>
        {answer.basis && (
          <span style={{ ...type.bodyCompact, fontSize: 11.5, color: colors.outline }}>{answer.basis}</span>
        )}
      </div>

      <div style={{ ...type.titleMd, fontSize: 16, color: colors.onSurface, marginBottom: 6 }}>{answer.title}</div>
      <div
        style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, lineHeight: '21px', whiteSpace: 'pre-line' }}
      >
        {answer.body}
      </div>

      {/* Where the evidence lives in Co-op (verified, allow-listed targets) */}
      {answer.links && answer.links.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {answer.links.map((l) => (
            <button
              key={l.to}
              type="button"
              onClick={() => navigate(l.to)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: `1px solid ${colors.outlineVariant}`,
                background: colors.surfaceContainerLow,
                color: colors.primary,
                fontWeight: 600,
                fontSize: 12.5,
                borderRadius: radius.full,
                padding: '6px 12px',
                cursor: 'pointer',
                transition: 'background-color 150ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceContainer)}
              onMouseLeave={(e) => (e.currentTarget.style.background = colors.surfaceContainerLow)}
            >
              {l.label}
              <ArrowRightOutlined style={{ fontSize: 11 }} />
            </button>
          ))}
        </div>
      )}

      {answer.chart && answer.chart.data.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <MiniChart labels={answer.chart.labels} data={answer.chart.data} money />
        </div>
      )}

      {answer.table && answer.table.rows.length > 0 && (
        <div style={{ marginTop: 12, border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.lg, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: colors.surfaceContainerLow }}>
                {answer.table.columns.map((c, i) => (
                  <th
                    key={c}
                    style={{
                      padding: '9px 12px',
                      textAlign: i === 0 ? 'left' : 'right',
                      ...type.labelCaps,
                      color: colors.outline,
                    }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {answer.table.rows.map((row, ri) => (
                <tr key={ri} style={{ borderTop: `1px solid ${colors.borderSubtle}` }}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: '9px 12px',
                        textAlign: ci === 0 ? 'left' : 'right',
                        ...type.bodyCompact,
                        color: ci === 0 ? colors.onSurface : colors.onSurfaceVariant,
                        fontWeight: ci === 0 ? 600 : 400,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Draft review (action boundary) */}
      {(answer.invoiceDraft || answer.orderDraft) && (
        <DraftCard invoice={answer.invoiceDraft} order={answer.orderDraft} />
      )}

      {/* Follow-ups */}
      {answer.followUps && answer.followUps.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {answer.followUps.slice(0, 4).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFollowUp(f)}
              style={{
                border: `1px solid ${colors.outlineVariant}`,
                background: 'transparent',
                color: colors.primary,
                fontWeight: 600,
                fontSize: 12.5,
                borderRadius: radius.full,
                padding: '6px 12px',
                cursor: 'pointer',
                transition: 'background-color 150ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceContainerLow)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnswerCard;
