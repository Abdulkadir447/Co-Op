/**
 * Zeno — shared types (Stage 2.2).
 *
 * Architectural rule: this layer (and the UI that renders it) talks ONLY to
 * the existing domain APIs through useApiClient. It never touches the
 * database and never invents data — every insight/answer carries the basis
 * (data window) it was computed from, and every kind is explicit:
 *
 *   fact        — a value read straight from the API
 *   calculation — derived from API data (totals, shares, recency)
 *   forecast    — an estimate, always labelled as such (simple trend math,
 *                 never presented as an ML prediction)
 *   suggestion  — a recommendation, always labelled as such
 *   draft       — a proposed business action (review → explicit confirm →
 *                 existing API executes)
 */

export type InsightSeverity = 'info' | 'warning' | 'critical';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  /** "Why this matters" explanation. */
  why: string;
  /** Where the evidence lives in Co-op. */
  evidence: string;
  /** Navigation target for the evidence link. */
  link: string;
  linkLabel: string;
  kind: 'fact' | 'calculation' | 'forecast' | 'suggestion';
  /** Data window the insight was computed from. */
  basis: string;
}

export type AnswerKind = 'fact' | 'calculation' | 'forecast' | 'suggestion' | 'draft' | 'clarify' | 'error';

export interface DraftLine {
  product_id: number;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
}

export interface DraftCustomer {
  id: number;
  full_name: string;
  email: string;
}

export interface DraftInvoice {
  customer: DraftCustomer | null;
  lines: DraftLine[];
  total: number;
}

export interface DraftOrder {
  customer: DraftCustomer | null;
  lines: DraftLine[];
  total: number;
}

export interface Answer {
  kind: AnswerKind;
  title: string;
  body: string;
  /** Data window / source note, shown under the kind badge. */
  basis?: string;
  /** Where the evidence lives in Co-op (verified, allow-listed targets). */
  links?: Array<{ label: string; to: string }>;
  /** Suggested follow-up prompts. */
  followUps?: string[];
  /** Mini chart points (revenue trend answers). */
  chart?: { labels: string[]; data: number[] } | null;
  /** Table answer (top products). */
  table?: { columns: string[]; rows: string[][] } | null;
  /** Drafts for the action boundary (invoice / order). */
  invoiceDraft?: DraftInvoice | null;
  orderDraft?: DraftOrder | null;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'coop';
  text?: string;
  answer?: Answer;
  ts: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: AiMessage[];
  created: number;
  updated: number;
}
