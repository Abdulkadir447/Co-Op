/**
 * Zeno — backend client (AI Platform phase).
 *
 * Talks to /ai/chat and /ai/usage. The backend guarantees the trust model:
 * verified context -> model -> structured answer contract -> validated
 * action drafts -> metered usage. This client never invents data itself;
 * it just transports the verified, structured result.
 */
import type { AxiosInstance } from 'axios';

export interface AiChatLink {
  label: string;
  to: string;
}

export interface AiChatAction {
  type: string;
  /** DRAFT_ORDER: already the DraftOrder shape (resolved ids/prices). */
  parameters: {
    customer: { id: number; full_name: string; email: string };
    lines: Array<{ product_id: number; name: string; sku: string; quantity: number; unit_price: number }>;
    total: number;
    note?: string;
  };
}

export interface AiChatResult {
  type: 'answer' | 'clarify';
  kind: 'fact' | 'calculation' | 'forecast' | 'suggestion' | 'draft' | 'clarify' | 'error';
  title: string;
  message: string;
  basis: { period: string | null; sources: string[] };
  follow_ups: string[];
  links: AiChatLink[];
  actions: AiChatAction[];
  actions_rejected: Array<{ type: string; reason: string }>;
  source: 'assistant';
  model: string | null;
  credits_used: number;
}

export interface AiUsageMonth {
  month: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  credits_used: number;
}

/** The report the owner is looking at — FILTERS only; the backend rebuilds
 *  the verified data server-side and never trusts client numbers. */
export interface AiReportRef {
  key: string;
  title: string;
  from: string;
  to: string;
  compare: string;
  category: string | null;
  product_id: number | null;
  customer_id: number | null;
}

/** One grounded AI turn. Throws on 503 (assistant unavailable). */
export async function aiChat(
  api: AxiosInstance,
  question: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  report?: AiReportRef,
): Promise<AiChatResult> {
  const body: Record<string, unknown> = { question, history };
  if (report) {
    body.report = {
      key: report.key,
      from: report.from,
      to: report.to,
      compare: report.compare,
      category: report.category,
      product_id: report.product_id,
      customer_id: report.customer_id,
    };
  }
  const { data } = await api.post<AiChatResult>('/ai/chat', body);
  return data;
}

/** Real metered AI usage for the current month (billing's source of truth). */
export async function fetchAiUsage(api: AxiosInstance): Promise<AiUsageMonth> {
  const { data } = await api.get<AiUsageMonth>('/ai/usage');
  return data;
}

// ---------------------------------------------------------------------------
// AI Platform — forecasting + AI history (server-side, verified data)
// ---------------------------------------------------------------------------

/** One month of the verified revenue series (in-progress month included). */
export interface ForecastMonthPoint {
  key: string; // "2026-08"
  label: string; // "Aug"
  revenue: number;
  orders: number;
  in_progress: boolean;
}

/** The deterministic next-month revenue estimate (never an ML prediction). */
export interface AiForecast {
  available: boolean;
  reason: 'no_sales_history' | 'insufficient_history' | null;
  currency: string;
  as_of: string;
  method: string | null;
  months: ForecastMonthPoint[];
  completed_months: number;
  required_months: number;
  forecast: {
    period: string;
    period_label: string;
    estimated: number;
    low: number;
    high: number;
    trend_percent: number | null;
    completed_months_used: number;
  } | null;
}

/** One entry of the owner's AI activity (a completed /ai/chat turn). */
export interface AiHistoryItem {
  id: number;
  question: string;
  answer_kind: string | null;
  answer_title: string | null;
  answer_summary: string | null;
  report_key: string | null;
  model: string | null;
  credits_used: number;
  created_at: string | null;
}

export interface AiHistoryPage {
  items: AiHistoryItem[];
  total: number;
}

/** Deterministic revenue forecast (free, no model call — a calculation). */
export async function fetchForecast(api: AxiosInstance): Promise<AiForecast> {
  const { data } = await api.get<AiForecast>('/ai/forecast');
  return data;
}

/** The owner's AI activity, newest first. */
export async function fetchAiHistory(
  api: AxiosInstance,
  limit = 30,
  offset = 0,
): Promise<AiHistoryPage> {
  const { data } = await api.get<AiHistoryPage>('/ai/history', { params: { limit, offset } });
  return data;
}

/** Delete the AI activity (explicit owner action). */
export async function clearAiHistory(api: AxiosInstance): Promise<{ deleted: number }> {
  const { data } = await api.delete<{ deleted: number }>('/ai/history');
  return data;
}
