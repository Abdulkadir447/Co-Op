/**
 * Zeno — conversation state + history (Stage 2.2, AI Platform phase).
 *
 * Conversations persist locally (localStorage) so history survives reloads
 * — the assistant itself stays stateless and data-driven. `ask` runs the
 * smart orchestration: deterministic engine first (instant, free, grounded),
 * then the real assistant (verified context on the server) for what the
 * engine can't ground. It never fails — worst case the honest engine answer.
 */
import { useCallback, useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { askCoopSmart } from './ask';
import type { AiDataBundle } from './data';
import type { AiReportRef } from './client';
import type { Answer, AiMessage, Conversation } from './types';

const STORAGE_KEY = 'coop:ai-conversations';
const MAX_CONVERSATIONS = 20;
const MAX_MESSAGES = 100;

let seq = 0;
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

function loadStored(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useConversation(bundle: AiDataBundle, api: AxiosInstance) {
  const [conversations, setConversations] = useState<Conversation[]>(loadStored);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)));
    } catch {
      /* storage full/blocked — history is a nicety */
    }
  }, [conversations]);

  const startNew = useCallback(() => {
    const c: Conversation = {
      id: uid(),
      title: 'New conversation',
      messages: [],
      created: Date.now(),
      updated: Date.now(),
    };
    setConversations((prev) => [c, ...prev].slice(0, MAX_CONVERSATIONS));
    setActiveId(c.id);
    return c.id;
  }, []);

  const select = useCallback((id: string) => setActiveId(id), []);

  const remove = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setActiveId((cur) => (cur === id ? null : cur));
    },
    [],
  );

  const clearAll = useCallback(() => {
    setConversations([]);
    setActiveId(null);
  }, []);

  /**
   * Ask a question: appends the user message immediately, then the grounded
   * answer (engine or assistant — the caller keeps its "thinking" state up
   * until this resolves).
   */
  const ask = useCallback(
    async (question: string, report?: AiReportRef): Promise<Answer | null> => {
      const text = question.trim();
      if (!text || busy) return null;

      let convId = activeId;
      if (!convId) {
        const c: Conversation = {
          id: uid(),
          title: text.length > 42 ? `${text.slice(0, 42)}…` : text,
          messages: [],
          created: Date.now(),
          updated: Date.now(),
        };
        convId = c.id;
        setConversations((prev) => [c, ...prev].slice(0, MAX_CONVERSATIONS));
        setActiveId(c.id);
      }

      const userMsg: AiMessage = { id: uid(), role: 'user', text, ts: Date.now() };

      // Hand the assistant recent conversation context (verified answers are
      // summarised as "title — body" so follow-ups make sense).
      const history = (active?.messages ?? [])
        .slice(-8)
        .map((m) =>
          m.role === 'user'
            ? { role: 'user' as const, content: m.text ?? '' }
            : m.answer
              ? { role: 'assistant' as const, content: `${m.answer.title} — ${m.answer.body}` }
              : null,
        )
        .filter(Boolean) as Array<{ role: 'user' | 'assistant'; content: string }>;

      setBusy(true);
      const append = (answer: Answer) => {
        const coopMsg: AiMessage = { id: uid(), role: 'coop', answer, ts: Date.now() };
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  updated: Date.now(),
                  // Title a fresh conversation with its first question.
                  title:
                    c.messages.length === 0 && c.title === 'New conversation'
                      ? text.length > 42
                        ? `${text.slice(0, 42)}…`
                        : text
                      : c.title,
                  messages: [...c.messages, userMsg, coopMsg].slice(-MAX_MESSAGES),
                }
              : c,
          ),
        );
      };

      try {
        const answer = await askCoopSmart(text, bundle, api, history, report);
        append(answer);
        return answer;
      } finally {
        setBusy(false);
      }
    },
    [activeId, active, bundle, api, busy],
  );

  return { conversations, active, busy, startNew, select, remove, clearAll, ask };
}
