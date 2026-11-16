/**
 * App-wide currency store (Task 9).
 *
 * The business currency is server-side state (GET /business/settings); this
 * tiny store mirrors it client-side so money formatting (formatCurrency)
 * follows the company setting without touching every call site. It is
 * seeded on load and refreshed after saving Settings. Defaults to NGN — the
 * only currency this edition supports (money is stored as integer kobo, so a
 * different exponent would mis-scale every amount).
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
