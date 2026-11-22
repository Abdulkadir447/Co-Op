/**
 * Trial lead capture.
 *
 * Posts one row to Supabase `trial_leads` with the publishable key, which has
 * INSERT and no SELECT on that table (see the migration). The row is the whole
 * point of the /trial page: it is what makes "arrival → form → download →
 * activation" measurable, and it is the only list we can email when a version
 * ships.
 *
 * Two constraints shape this file:
 *
 *   1. **No `returning`.** PostgREST's `insert ... returning=representation`
 *      reads the row back, which needs SELECT — and the site's role does not
 *      have it. Asking for the representation turns a working form into a
 *      42501 permission error. So we send `Prefer: return=minimal` and treat
 *      any 2xx as success. Verified against the live project.
 *
 *   2. **A failed save must not block the download.** The visitor came for an
 *      installer. If Supabase is unreachable, they still get it — we record the
 *      failure and tell them plainly instead of showing a spinner forever or a
 *      fake "check your email".
 */
import { LEAD_CAPTURE_ENABLED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './site';

export interface TrialLead {
  name: string;
  shopName: string;
  email: string;
  whatsapp: string;
  /** Which CTA sent them here: 'hero', 'pricing', 'cta-band'… */
  source?: string;
}

export type LeadResult =
  | { ok: true }
  | { ok: false; reason: 'disabled' | 'network' | 'rejected'; detail?: string };

/** Digits only, with Nigeria's leading 0 rewritten to +234. */
export function normaliseWhatsApp(input: string): string {
  const digits = input.replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  return `+${digits}`;
}

/** Good enough to catch a typo, deliberately not a spec-complete RFC check. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Nigerian mobile numbers are 10 digits after +234 (070, 080, 081, 090, 091). */
export function looksLikeNigerianMobile(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  const local = digits.startsWith('234') ? digits.slice(3) : digits.replace(/^0/, '');
  return /^[789][01]\d{8}$/.test(local);
}

/** Campaign attribution, read once per session so a later page keeps it. */
export function attribution(): Record<string, string> {
  // Guard on `document`, which is what this function actually reads. The old
  // check was on `window`, so any environment with a window and no document
  // (prerendering, a test harness) threw as soon as it ran.
  if (typeof window === 'undefined' || typeof document === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const value = params.get(key);
    if (value) out[key] = value.slice(0, 120);
  }
  // Referrer only when it is another site — a same-site referrer is noise.
  const ref = document.referrer;
  if (ref && !ref.startsWith(window.location.origin)) out.referrer = ref.slice(0, 300);
  out.landing_path = window.location.pathname;
  return out;
}

/** Save the lead. Never throws. */
export async function saveTrialLead(lead: TrialLead): Promise<LeadResult> {
  if (!LEAD_CAPTURE_ENABLED) {
    return { ok: false, reason: 'disabled' };
  }

  const body = {
    name: lead.name.trim().slice(0, 120),
    shop_name: lead.shopName.trim().slice(0, 160),
    email: lead.email.trim().slice(0, 254),
    whatsapp: normaliseWhatsApp(lead.whatsapp).slice(0, 24),
    source: lead.source?.slice(0, 60),
    ...attribution(),
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/trial_leads`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        // `return=minimal`: asking for the row back needs SELECT, which anon
        // does not have (see the migration) — a returned row is a 42501.
        //
        // `resolution=ignore-duplicates` turns a repeat submit into
        // ON CONFLICT DO NOTHING on the unique lower(email) index, which needs
        // only INSERT. `merge-duplicates` would be the obvious choice and is
        // wrong here: it becomes ON CONFLICT DO UPDATE, and that needs the
        // UPDATE grant this role deliberately does not have — so a visitor who
        // submitted twice (or refreshed and resubmitted) would be told the save
        // failed when their first submission had already worked.
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify(body),
      keepalive: true,
    });

    if (response.ok) return { ok: true };

    // A duplicate is success from the visitor's point of view: they are on the
    // list, and they should get their installer either way.
    if (response.status === 409) return { ok: true };

    return { ok: false, reason: 'rejected', detail: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, reason: 'network', detail: String(error).slice(0, 120) };
  }
}
