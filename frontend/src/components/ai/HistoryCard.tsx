import React, { useCallback, useEffect, useState } from 'react';
import { ClockCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { radius, type } from '../../theme';
import { tint } from '../../theme/colors';
import { useCoopTheme } from '../../theme-provider';
import { useApiClient } from '../../services/api/client';
import { CoopErrorState } from '../ui';
import { clearAiHistory, fetchAiHistory, type AiHistoryItem } from '../../ai/client';

const KIND_LABEL: Record<string, string> = {
  fact: 'Fact',
  calculation: 'Calculation',
  forecast: 'Forecast',
  suggestion: 'Suggestion',
  draft: 'Draft',
  clarify: 'Co-op',
};

/**
 * AI activity (AI Platform phase — "AI history" deliverable).
 *
 * The owner-visible, SERVER-SIDE record of what Zeno answered: one row
 * per completed /ai/chat turn (question, kind, short summary). Failed
 * requests are never listed — the history shows only what was actually
 * answered. Complements the local conversation sidebar (which lives in this
 * browser); this list follows the business, not the device.
 */
const HistoryCard: React.FC = () => {
  const { colors, isDark } = useCoopTheme();
  const api = useApiClient();
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [items, setItems] = useState<AiHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(() => {
    setState('loading');
    fetchAiHistory(api, 15)
      .then((page) => {
        setItems(page.items);
        setTotal(page.total);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      window.setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    clearAiHistory(api)
      .then(() => {
        setItems([]);
        setTotal(0);
      })
      .catch(() => undefined);
  };

  return (
    <div
      style={{
        border: `1px solid ${colors.borderSubtle}`,
        borderTop: `2px solid ${colors.secondaryContainer}`,
        borderRadius: radius.lg,
        background: colors.surfaceContainerLowest,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ ...type.sectionHeading, fontSize: 15, color: colors.onSurface }}>AI activity</span>
        {state === 'ready' && total > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear AI activity"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              border: 'none',
              background: confirmClear ? tint(colors.error, 0.14) : 'transparent',
              color: confirmClear ? colors.error : colors.outline,
              fontSize: 12,
              fontWeight: confirmClear ? 700 : 500,
              cursor: 'pointer',
              borderRadius: radius.md,
              padding: '5px 8px',
            }}
          >
            <DeleteOutlined style={{ fontSize: 11 }} />
            {confirmClear ? 'Really clear?' : 'Clear'}
          </button>
        )}
      </div>

      {state === 'loading' && (
        <div style={{ ...type.bodyCompact, color: colors.outline, padding: '8px 0' }}>Loading activity…</div>
      )}

      {state === 'error' && (
        <CoopErrorState title="Can't load AI activity" detail="The history service didn't respond. Try again." onRetry={load} />
      )}

      {state === 'ready' && total === 0 && (
        <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
          No AI answers yet. Ask Zeno something — every answer it gives will be listed here.
        </div>
      )}

      {state === 'ready' && total > 0 && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  padding: '9px 10px',
                  borderRadius: radius.md,
                  background: colors.surfaceContainerLow,
                }}
              >
                <div
                  style={{
                    ...type.bodyCompact,
                    fontSize: 13,
                    fontWeight: 600,
                    color: colors.onSurface,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {it.question}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 4,
                    flexWrap: 'wrap',
                    fontSize: 11.5,
                    color: colors.outline,
                  }}
                >
                  {it.answer_kind && (
                    <span
                      style={{
                        padding: '1px 7px',
                        borderRadius: radius.full,
                        fontWeight: 600,
                        background: tint(colors.primary, isDark ? 0.18 : 0.08),
                        color: isDark ? tint(colors.primary, 0.8) : tint(colors.primary, 0.9),
                      }}
                    >
                      {KIND_LABEL[it.answer_kind] ?? it.answer_kind}
                    </span>
                  )}
                  {it.answer_title && (
                    <span style={{ ...type.bodyCompact, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                      {it.answer_title}
                    </span>
                  )}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 'auto', flexShrink: 0 }}>
                    <ClockCircleOutlined style={{ fontSize: 10.5 }} />
                    {it.created_at ? dayjs(it.created_at).format('MMM D, HH:mm') : '—'}
                    {it.credits_used > 0 ? ` · ${it.credits_used} credit${it.credits_used > 1 ? 's' : ''}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {total > items.length && (
            <div style={{ ...type.bodyCompact, fontSize: 11.5, color: colors.outline, marginTop: 'auto' }}>
              Showing the {items.length} most recent of {total} answers.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default HistoryCard;
