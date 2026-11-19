/**
 * App-wide currency store (Task 9) and the one money formatter.
 *
 * The business currency is server-side state (GET /business/settings); this
 * tiny store mirrors it client-side so money formatting follows the company
 * setting without touching every call site. It is seeded on load and refreshed
 * after saving Settings. Defaults to NGN — the only currency this edition
 * supports (money is stored as integer kobo, so a different exponent would
 * mis-scale every amount).
 *
 * **Every money string in the app comes from here.** Before this existed,
 * three modules had their own formatter and two of them hard-coded `$` while
 * the rest of the product used ₦ — the daily briefing would say "$4,200" about
 * the same revenue the dashboard showed as "₦4,200.00". A price or an amount
 * must never be assembled by hand at a call site; import one of these.
 */
import { useSyncExternalStore } from 'react';

let current = 'NGN';
const listeners = new Set<() => void>();

export const getCurrency = (): string => current;

export const setCurrency = (code: string): void => {
  if (!code || code === current) return;
  current = code;
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Reactive hook: re-renders the consumer when the currency changes. */
export const useCurrency = (): string =>
  useSyncExternalStore(subscribe, getCurrency, () => 'NGN');

/**
 * The symbol alone, for compact labels where Intl's full format is too wide
 * (a donut centre label, a KPI tile).
 *
 * Derived from Intl rather than a lookup table so it cannot disagree with
 * `formatMoney` — and so a currency this edition does not support still shows
 * something sensible instead of a bare number.
 */
export function currencySymbol(currency?: string): string {
  const code = currency ?? current;
  try {
    const parts = new Intl.NumberFormat(localeFor(code), {
      style: 'currency',
      currency: code,
      currencyDisplay: 'symbol',
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? `${code} `;
  } catch {
    return `${code} `;
  }
}

/**
 * NGN uses the Nigerian locale (₦1,234.56); everything else falls back to the
 * browser's own, because this edition only ever charges Naira.
 */
function localeFor(currency: string): string | undefined {
  return currency === 'NGN' ? 'en-NG' : undefined;
}

/** `₦1,234.56` — the default money string. */
export function formatMoney(value: number, currency?: string): string {
  const code = currency ?? current;
  return value.toLocaleString(localeFor(code), { style: 'currency', currency: code });
}

/**
 * `₦1,234` when the value is whole, `₦1,234.56` when it is not.
 *
 * Mirrors `backend/money.py::fmt_compact` exactly, because the same numbers are
 * printed by the server (emails, the daily briefing) and by the app; two rules
 * would mean two answers for one amount. Built from the symbol rather than by
 * editing Intl's output: stripping ".00" out of a formatted string breaks for
 * locales that put the symbol after the number.
 */
export function formatMoneyCompact(value: number, currency?: string): string {
  const code = currency ?? current;
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  const digits = whole ? 0 : 2;
  const num = Math.abs(value).toLocaleString(localeFor(code), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${value < 0 ? '-' : ''}${currencySymbol(code)}${num}`;
}
