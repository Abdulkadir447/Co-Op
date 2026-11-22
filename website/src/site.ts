/**
 * Everything the site needs to know, in one place.
 *
 * The rule this file enforces: **a section that cannot be backed is not
 * rendered.** There is no "add a testimonial here" empty state and no invented
 * logo wall. Each claim below is either true of the shipped product or absent,
 * and the flags say which — so nobody can ship a fake customer by accident.
 *
 * The honesty gates (`SOCIAL_PROOF_READY`, `TEAM_READY`, `STATUS_READY`, …)
 * are computed, not remembered: fill in the data and the section appears.
 */

/** Brand + product facts. */
export const PRODUCT = {
  name: 'Co-op',
  /** What it is, in six words. Used in titles and schema. */
  category: 'Business management software',
  /** The one-line promise, used under the logo and in the footer. */
  tagline: 'Inventory, orders, customers and invoicing in one app for Nigerian retail.',
  platform: 'Windows desktop',
  /**
   * The claim the hero makes. Specific, names the buyer and the outcome, and
   * is true of the shipped product: an owner reconciles a day's takings from
   * one screen instead of four notebooks.
   */
  promise: 'Close your books in 20 minutes, not 3 hours.',
} as const;

/**
 * The site's own address.
 *
 * TEMPORARY — `.example` is reserved by RFC 2606 and can never resolve, so a
 * placeholder link here cannot send anyone to a stranger's server. Change this
 * one line when the real domain exists (and the same host in index.html).
 */
export const SITE = {
  url: 'https://coop.example',
  /** Set from `VITE_PUBLIC_URL` at build time when a real host is configured. */
  isPlaceholder: true,
};

/**
 * Contact details — TEMPORARY PLACEHOLDERS.
 * `coop.example` cannot receive mail and `+234 800 000 0000` is not routable.
 * Deliberately obvious: a visitor who tries them learns nothing false.
 */
export const CONTACT = {
  email: 'hello@coop.example',
  phone: '+234 800 000 0000',
  whatsapp: '2348000000000',
  /** A calendar link (Cal.com, Calendly) for "book a demo". Empty = no demo. */
  demoUrl: '',
  address: '',
};

/**
 * A wa.me link with a pre-filled message.
 *
 * One function because the number appears in four places (header, pricing,
 * contact, trial) and a second hand-rolled `wa.me` string is how one of them
 * ends up pointing at a number nobody reads.
 *
 * Returns '' when the number is the placeholder: an empty href is better than a
 * link to a stranger's phone.
 */
export function whatsappHref(message = 'Hi — I have a question about Co-op'): string {
  const digits = CONTACT.whatsapp.replace(/[^0-9]/g, '');
  if (!digits || CONTACT_IS_PLACEHOLDER) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export const CONTACT_IS_PLACEHOLDER =
  CONTACT.email.endsWith('.example') || CONTACT.whatsapp.startsWith('234800');

/** Where the product actually is today. Keep this honest. */
export const DOWNLOAD_URL = 'https://github.com/Abdulkadir447/Co-Op/releases';
export const ISSUES_URL = 'https://github.com/Abdulkadir447/Co-Op/issues';
export const REPO_URL = 'https://github.com/Abdulkadir447/Co-Op';

/**
 * Where "Start free trial" sends someone.
 *
 * Empty means there is no web sign-up yet — the honest destination is the
 * Windows installer, which is what a trial of a desktop app actually is.
 * Set this to '/signup' (or an app URL) when a web sign-up exists and every
 * trial CTA on the site moves at once.
 */
export const SIGNUP_URL = '';

/**
 * Where every trial CTA points.
 *
 * Changed on purpose: this used to be the GitHub releases page. A shop owner in
 * Kano does not know what GitHub is, and — the expensive part — that route
 * captured nothing. Nobody to email when a version ships, no way to tell which
 * channel produced a trial, no idea how many people start a download and stop.
 *
 * `/trial` asks four questions, then hands over the installer. GitHub stays as
 * the build artefact mirror, one line further down the page, for anyone who
 * wants it.
 */
export const TRIAL_PATH = '/trial';
export const TRIAL_HREF = SIGNUP_URL || TRIAL_PATH;

/** Public status page. Empty = the page explains the situation instead. */
export const STATUS_URL = '';

/**
 * Where the trial form writes a lead.
 *
 * Supabase, with the **publishable** key: the marketing site has no Clerk
 * session, so the row is inserted by `anon`. That role has INSERT and nothing
 * else on `trial_leads` — no SELECT — which is what stops one visitor reading
 * another's email or phone number. See
 * supabase/migrations/20261122000000_trial_leads.sql.
 *
 * These two values are public by design (they ship in the bundle, like any
 * Supabase anon key). The secret key lives only in Vercel's env and never
 * reaches the site.
 */
/**
 * `import.meta.env` is replaced by Vite in the browser build, but the
 * prerender bundles these modules as CJS — where `import.meta` is undefined and
 * reading through it throws at build time. Vite also inlines the object, so
 * `?? {}` is dead code in the browser and load-bearing in Node.
 */
const ENV = (import.meta.env ?? {}) as Record<string, string | undefined>;

export const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? 'https://clowtikdlkyjxopksash.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  ENV.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_KNeLhGBB5taEFdoGSsnUPg_0UkKAPv1';

/** True when the trial form can actually store a lead. */
export const LEAD_CAPTURE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/**
 * Analytics. Empty until a real endpoint is configured, so the site does not
 * pretend to measure anything. `track()` is called on every CTA either way —
 * the wiring is done, the destination is not.
 */
export const ANALYTICS_URL = '';

/**
 * Social proof.
 *
 * EMPTY ON PURPOSE. Co-op has zero paying customers (see docs/BUSINESS_PLAN.md),
 * so there is nothing true to put here yet. A fabricated testimonial is the
 * single most damaging thing this site could do: it is the first thing a
 * careful buyer checks, and when it fails the rest of the page fails with it.
 *
 * When the first real customer exists, fill this in and the section appears
 * automatically — no code change, no flag to remember.
 */
export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  /** Path under /public to a real photo. Empty renders initials instead. */
  photo?: string;
  /** A number the customer agreed to be quoted on, e.g. '3 hours → 20 minutes'. */
  metric?: string;
}

export const TESTIMONIALS: Testimonial[] = [];

/** Customer logos. Real files only; empty = no logo wall. */
export const CUSTOMER_LOGOS: Array<{ name: string; src: string }> = [];

/** Named humans. Empty = the About page says so rather than inventing people. */
export interface Person {
  name: string;
  role: string;
  bio: string;
  photo?: string;
  link?: string;
}

export const TEAM: Person[] = [];

/**
 * The free tool / lead magnet for people who are not ready to buy.
 * A written guide is a real asset we can actually produce, so it is the one
 * promised here — not a calculator we have not built.
 */
export const LEAD_MAGNET = {
  id: 'stocktake',
  title: 'The stocktake that takes one evening, not one week',
  blurb:
    'A 9-page guide: how to count a shop without closing it, what to do with what you find, and the three numbers to write down before you start.',
  /** Empty = the form shows and the copy is emailed when it exists. */
  fileUrl: '',
};

export const FAQ = [
  {
    q: 'Does it work without internet?',
    a: 'Yes. Inventory, orders, customers and the dashboard all run on your computer. When you reconnect, your records sync to your account, encrypted in transit.',
  },
  {
    q: 'What happens when the 10-day trial ends?',
    a: 'Nothing is deleted and nothing is charged. You keep every record you entered. If you do not subscribe, Co-op stops accepting new entries until you do — you can export everything, or pick up where you left off by subscribing later.',
  },
  {
    q: 'What does it cost after the trial?',
    a: 'Starter is ₦25,000 a month, Professional ₦75,000 a month, both 20% cheaper billed yearly. The trial is the full product, not a cut-down version. There is no setup fee and no per-order charge.',
  },
  {
    q: 'Can I cancel?',
    a: 'Yes, at any time, from inside the app or by emailing us. Cancelling stops the next charge; you keep access until the end of the period you have paid for. No retention call, no cancellation fee.',
  },
  {
    q: 'How do I move my existing records in?',
    a: 'Import a CSV of your products and customers — Co-op maps the columns and shows you any rows it cannot read before anything is saved. For a large catalog we will do the first import with you on a call.',
  },
  {
    q: 'Where is my data, and who can see it?',
    a: 'Your records live on your computer and are backed up to a Postgres database in the EU (Frankfurt), which only your business can read. Every request is authorised server-side per business — there is no shared or public path to another shop’s data. See Security for the details, including what we do not yet have.',
  },
  {
    q: 'What if the laptop is stolen or dies?',
    a: 'Your data is backed up off the machine, so you sign in on a new one and carry on. Backups are encrypted before they leave the device. Export a full copy at any time from Settings.',
  },
  {
    q: 'Which countries and currencies?',
    a: 'Nigeria, priced and billed in Naira through Paystack — card, transfer or USSD, no dollar card needed. VAT at 7.5% is handled on invoices.',
  },
] as const;

/**
 * Billing terms. These are the words a buyer will hold us to, so they are
 * derived from the shipped behaviour, not aspirational: the trial needs no
 * card, cancelling is self-serve, and nothing is deleted on non-payment.
 */
export const BILLING_TERMS = {
  trialDays: 10,
  cardUpFront: false,
  refundWindowDays: 14,
  notice: 'Cancel any time. Nothing is deleted when you cancel or when a payment fails.',
} as const;
