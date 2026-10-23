import React, { useEffect, useRef, useState } from 'react';
import { DeleteOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAiData } from '../../ai/data';
import { useConversation } from '../../ai/useConversation';
import type { AiReportRef } from '../../ai/client';
import { useApiClient } from '../../services/api/client';
import { SparkleIcon } from '../../components/ui/icons';
import { CoopMark } from '../../components/brand/CoopLogo';
import AnswerCard from '../../components/ai/AnswerCard';
import ForecastCard from '../../components/ai/ForecastCard';
import HistoryCard from '../../components/ai/HistoryCard';
import { CoopErrorState, CoopLoading } from '../../components/ui';

const SUGGESTIONS = [
  'How is revenue trending this month?',
  'What are my top products?',
  'What is my inventory status?',
  'Who hasn\u2019t ordered recently?',
  'Forecast the next 30 days',
  'Invoice for my customer',
];

/**
 * Ask Zeno — the reactive layer (Stage 2.2, Layer 2).
 *
 * A conversation UI over the grounded intent engine: every answer is
 * computed from the live data bundle and labelled (fact / calculation /
 * forecast / suggestion / draft). Drafts for orders and invoices go through
 * the review → explicit-confirm → existing-API boundary.
 */
const CoopAiPage: React.FC = () => {
  const { colors } = useCoopTheme();
  const api = useApiClient();
  const { bundle, loading, error, retry } = useAiData();
  const { conversations, active, startNew, select, remove, clearAll, ask } = useConversation(bundle, api);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages.length, thinking]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    setInput('');
    setThinking(true);
    // The engine answers instantly; the assistant path may take a moment.
    // A short floor keeps the "Thinking…" state perceptible either way.
    void ask(q).finally(() => setThinking(false));
  };

  const navigate = useNavigate();
  const location = useLocation();

  // "Ask Zeno about this report" (from the Reports page): when this page is
  // opened carrying a report context, fire that question once the data
  // bundle is ready, then clear the navigation state so it fires exactly once.
  useEffect(() => {
    const st = (location.state as { report?: AiReportRef } | null)?.report;
    if (st && !loading && !error) {
      setThinking(true);
      void ask(
        `Explain the ${st.title}: what changed, what matters most, and what should I investigate?`,
        st,
      ).finally(() => setThinking(false));
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, loading, error, ask, navigate, location.pathname]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 480 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CoopMark size={40} title="Zeno" />
          <div>
            <div style={{ ...type.sectionHeading, color: colors.onSurface, letterSpacing: '-0.01em' }}>Zeno</div>
            <div style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.outline }}>
              Notices what's happening · answers from your live data · drafts, never acts
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {conversations.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              aria-label="Clear all conversations"
              title="Clear all conversations"
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.md,
                border: `1px solid ${colors.outlineVariant}`,
                background: 'transparent',
                color: colors.onSurfaceVariant,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DeleteOutlined style={{ fontSize: 14 }} />
            </button>
          )}
          <button
            type="button"
            onClick={startNew}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              height: 36,
              padding: '0 14px',
              borderRadius: radius.md,
              border: `1px solid ${colors.outlineVariant}`,
              background: colors.surfaceContainerLowest,
              color: colors.primary,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <PlusOutlined style={{ fontSize: 12 }} />
            New Conversation
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
        {/* History */}
        {conversations.length > 0 && (
          <div
            className="coop-ai-history"
            style={{
              width: 220,
              flexShrink: 0,
              overflowY: 'auto',
              border: `1px solid ${colors.borderSubtle}`,
              borderRadius: radius.lg,
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              background: colors.surfaceContainerLowest,
            }}
          >
            {conversations.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => select(c.id)}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    border: 'none',
                    background: c.id === active?.id ? colors.surfaceContainerLow : 'transparent',
                    color: c.id === active?.id ? colors.primary : colors.onSurfaceVariant,
                    fontWeight: c.id === active?.id ? 600 : 400,
                    fontSize: 13,
                    borderRadius: radius.md,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  aria-label="Delete conversation"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: colors.outline,
                    cursor: 'pointer',
                    padding: 6,
                    flexShrink: 0,
                  }}
                >
                  <DeleteOutlined style={{ fontSize: 11 }} />
                </button>
              </div>
            ))}
            <div style={{ ...type.bodyCompact, fontSize: 11, color: colors.outline, padding: '8px 10px 2px' }}>
              {dayjs(active?.updated ?? Date.now()).format('MMM D')} · stored locally
            </div>
          </div>
        )}

        {/* Conversation column */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            border: `1px solid ${colors.borderSubtle}`,
            borderRadius: radius.lg,
            background: colors.surfaceContainerLowest,
            overflow: 'hidden',
          }}
        >
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {loading ? (
              <CoopLoading height={240} label="Loading your business data…" />
            ) : error ? (
              <CoopErrorState
                title="Can't reach your business data"
                detail={error.message}
                onRetry={retry}
              />
            ) : (
              <>
                {/* Empty state: suggestions */}
                {(!active || active.messages.length === 0) && (
                  <div style={{ padding: '24px 8px' }}>
                    <div style={{ ...type.sectionHeading, fontSize: 18, color: colors.onSurface, marginBottom: 6 }}>
                      What would you like to know?
                    </div>
                    <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginBottom: 18 }}>
                      I answer from your live data — every answer is labelled as a fact, calculation, forecast or
                      suggestion. For anything that changes data, I only ever draft it for you to confirm.
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => send(s)}
                          style={{
                            border: `1px solid ${colors.outlineVariant}`,
                            background: colors.surfaceContainerLow,
                            color: colors.primary,
                            fontWeight: 600,
                            fontSize: 13,
                            borderRadius: radius.full,
                            padding: '8px 14px',
                            cursor: 'pointer',
                            transition: 'background-color 150ms',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceContainer)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = colors.surfaceContainerLow)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>

                    {/* AI Platform: the verified forecast + the AI activity
                        ledger (server-side — follows the business, not the
                        browser). Both are independent of the conversation. */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 18 }}>
                      <ForecastCard />
                      <HistoryCard />
                    </div>
                  </div>
                )}

                {/* Messages */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
                  {active?.messages.map((m) =>
                    m.role === 'user' ? (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div
                          style={{
                            maxWidth: 480,
                            background: colors.primary,
                            color: colors.onPrimary,
                            borderRadius: '14px 14px 4px 14px',
                            padding: '10px 14px',
                            ...type.bodyCompact,
                          }}
                        >
                          {m.text}
                        </div>
                      </div>
                    ) : m.answer ? (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <AnswerCard answer={m.answer} onFollowUp={send} />
                      </div>
                    ) : null,
                  )}
                  {thinking && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div
                        style={{
                          background: colors.surfaceContainerLow,
                          border: `1px solid ${colors.borderSubtle}`,
                          borderRadius: radius.lg,
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          color: colors.onSurfaceVariant,
                          ...type.bodyCompact,
                        }}
                      >
                        <SparkleIcon size={15} color={colors.secondaryContainer} />
                        Thinking…
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              </>
            )}
          </div>

          {/* Composer */}
          <div style={{ borderTop: `1px solid ${colors.borderSubtle}`, padding: 14 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: `1px solid ${colors.outlineVariant}`,
                borderRadius: radius.lg,
                padding: '6px 6px 6px 14px',
                background: colors.surface,
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send(input)}
                placeholder="Ask about revenue, stock, customers, orders, forecasts — or say “invoice for…” / “create an order for…”"
                aria-label="Ask Zeno"
                disabled={loading || Boolean(error)}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: colors.onSurface, fontFamily: 'inherit', fontSize: 14 }}
              />
              <button
                type="button"
                onClick={() => send(input)}
                disabled={!input.trim() || thinking || loading || Boolean(error)}
                aria-label="Send"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.md,
                  border: 'none',
                  background: colors.primary,
                  color: colors.onPrimary,
                  cursor: input.trim() && !thinking ? 'pointer' : 'not-allowed',
                  opacity: input.trim() && !thinking ? 1 : 0.5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SendOutlined style={{ fontSize: 14 }} />
              </button>
            </div>
            <div style={{ ...type.bodyCompact, fontSize: 11, color: colors.outline, marginTop: 8, textAlign: 'center' }}>
              Zeno answers from live business data and labels every claim. It drafts actions — you confirm them.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoopAiPage;
