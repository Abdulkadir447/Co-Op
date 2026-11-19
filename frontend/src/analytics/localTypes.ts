/**
 * OFFLINE 3.5 — local analytics: shared row types.
 *
 * These are the shapes of the local SQLite mirror rows (electron/db schema)
 * as consumed by the local dashboard/report/briefing calculators. The
 * calculators are PORTS of the server's deterministic engines (backend/main.py
 * dashboard endpoints, backend/reports/service.py, backend/briefing.py) —
 * same inputs, same outputs, so the screen shows identical numbers online
 * and offline.
 */
import { formatMoneyCompact } from '../services/currency';

export interface LBusiness {
  id: number;
  name: string;
  currency: string;
}

export interface LOrder {
  id: number;
  customer_id: number | null;
  status: string;
  total_amount: number;
  /** ISO timestamp (UTC) — day parts are taken from the string. */
  order_date: string;
  created_at: string | null;
}

export interface LOrderItem {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface LProduct {
  id: number;
  /** Client-generated ULID (the stable identity used across sync). */
  client_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit_price: number | null;
  cost_price: number | null;
  current_stock: number;
  reorder_level: number;
}

export interface LCustomer {
  id: number;
  full_name: string;
  email: string | null;
  /** ISO or null (local rows created before a mirror may lack created_at). */
  created_at: string | null;
}

export interface LMovement {
  id: number;
  product_id: number;
  change: number;
  reason: string;
  order_id: number | null;
  created_at: string | null;
}

export interface LocalBundle {
  business: LBusiness;
  orders: LOrder[];
  items: LOrderItem[];
  products: LProduct[];
  customers: LCustomer[];
  movements: LMovement[];
}

// ---------------------------------------------------------------------------
// Date helpers (day-level, UTC, string-based — mirrors the server's date
// semantics without timezone drift; the UI already renders these strings).
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' from an ISO string, or null. */
export function dayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

/** Today as 'YYYY-MM-DD' (UTC — the mirror stores UTC instants). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' -> UTC ms of that day (for arithmetic). */
export function dayToMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** UTC ms -> 'YYYY-MM-DD'. */
export function msToDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Shift a 'YYYY-MM-DD' day by n days. */
export function addDays(day: string, n: number): string {
  return msToDay(dayToMs(day) + n * DAY_MS);
}

/** First day of the month containing `day`. */
export function monthStart(day: string): string {
  return day.slice(0, 7) + '-01';
}

/** Previous calendar month's first day, given a month-start day. */
export function previousMonthStart(ms: string): string {
  const [y, m] = ms.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  return prev + '-01';
}

/** Inclusive day difference (b - a) in days. */
export function dayDiff(a: string, b: string): number {
  return Math.round((dayToMs(b) - dayToMs(a)) / DAY_MS);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '%b %-d' (e.g. 'Aug 3') — the server's day bucket label. */
export function fmtDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`;
}

/** '%b %Y' (e.g. 'Aug 2026') — the server's month bucket label. */
export function fmtMonth(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** '%b %-d, %Y' (e.g. 'Aug 3, 2026'). */
export function fmtDayYear(day: string): string {
  const [y] = day.split('-');
  return `${fmtDay(day)}, ${y}`;
}

/**
 * The briefing engine's money formatter — `₦1,234` when the value is whole,
 * `₦1,234.56` when it is not.
 *
 * This used to hard-code `$` and say it was mirroring the server, which was
 * true once; the server moved to Naira and this did not, so the offline
 * briefing printed dollars next to a dashboard printing Naira. It now shares
 * the app's single formatter (`services/currency`), so it cannot drift again.
 */
export function money(v: number): string {
  return formatMoneyCompact(v);
}

/** Percentage like the server's _pct: '5.0%' / '-5.0%' (negative keeps its sign). */
export function pctSigned(v: number): string {
  return `${v.toFixed(1)}%`;
}
