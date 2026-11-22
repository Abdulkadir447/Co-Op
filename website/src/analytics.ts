/**
 * Analytics — the four numbers this site is judged on.
 *
 * From the brief: visitor → signup, visitor → demo booking, pricing-page
 * conversion, and cost per lead by channel. A page-view counter answers none
 * of those, so every CTA on the site calls `track()` with an explicit event and
 * the surface it sat on. That is what makes "which CTA converts" answerable.
 *
 * There is no vendor SDK here on purpose: a 40KB analytics bundle on a 3G
 * connection costs more conversions than it measures. This ships as a thin
 * `sendBeacon`/`fetch` to whatever endpoint `ANALYTICS_URL` names — Plausible,
 * Umami, a Worker, a Postgres table — and records nothing until that is set.
 *
 * Until `ANALYTICS_URL` exists the events are kept in memory and exposed as
 * `window.__coopEvents` so the wiring can be verified (and tested) without
 * pretending data is being collected.
 */

export type EventName =
  | 'cta_click'
  | 'page_view'
  | 'pricing_view'
  | 'pricing_toggle'
  | 'plan_select'
  | 'signup_start'
  | 'trial_form_invalid'
  | 'lead_capture_failed'
  | 'download_click'
  | 'demo_book'
  | 'lead_capture'
  | 'contact_click'
  | 'faq_open'
  | 'outbound_click';

export interface TrackedEvent {
  name: EventName;
  /** Where on the page it happened, e.g. 'hero', 'pricing-card:starter'. */
  surface?: string;
  /** The label the visitor saw, verbatim — so copy A/B tests are readable. */
  label?: string;
  path?: string;
}

const buffer: TrackedEvent[] = [];

function endpoint(): string {
  // `?? {}` because the prerender bundles this as CJS, where `import.meta` is
  // undefined; in the browser Vite inlines the object and this never trips.
  const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
  return env.VITE_ANALYTICS_URL ?? '';
}

/** Fire-and-forget. Never throws: analytics must not break a sale. */
export function track(name: EventName, surface?: string, label?: string): void {
  const event: TrackedEvent = { name, surface, label, path: window.location.pathname };
  buffer.push(event);
  (window as unknown as { __coopEvents?: TrackedEvent[] }).__coopEvents = buffer;

  const url = endpoint();
  if (!url) return;

  const body = JSON.stringify({ ...event, ts: Date.now() });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    } else {
      void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } });
    }
  } catch {
    /* a blocked request is not the visitor's problem */
  }
}

/** Which channel a visit arrived on. Stored for the session, read by track(). */
export function channel(): string {
  try {
    const stored = sessionStorage.getItem('coop-web:channel');
    if (stored) return stored;
    const params = new URLSearchParams(window.location.search);
    const source = params.get('utm_source') ?? params.get('ref') ?? (document.referrer ? 'referral' : 'direct');
    sessionStorage.setItem('coop-web:channel', source);
    return source;
  } catch {
    return 'unknown';
  }
}
