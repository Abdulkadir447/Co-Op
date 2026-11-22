/**
 * Reusable content blocks: the FAQ accordion, the honest proof slots, the
 * lead-capture form, and the product preview.
 *
 * Each one is written to degrade to nothing rather than to a placeholder: no
 * customer testimonials exist yet, so the proof blocks render an explanation
 * instead of three grey "your logo here" boxes. A site that shows an empty
 * logo grid is telling the visitor the product is unfinished; a site that
 * shows nothing where social proof belongs at least is not lying.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { track } from '../analytics';
import { setFaqJsonLd, clearFaqJsonLd } from '../head';
import { LEAD_MAGNET, TESTIMONIALS, CUSTOMER_LOGOS, CONTACT } from '../site';

/* ── FAQ ──────────────────────────────────────────────────────────────────── */

export function Faq({ items, surface }: { items: ReadonlyArray<{ q: string; a: string }>; surface: string }) {
  const listRef = useRef<HTMLDivElement>(null);

  // FAQPage structured data, only where the questions are actually rendered.
  useEffect(() => {
    setFaqJsonLd(items);
    return () => clearFaqJsonLd();
  }, [items]);

  return (
    <div className="faq-list" ref={listRef}>
      {items.map((item, i) => (
        <details
          key={item.q}
          className="faq-item"
          // The first question starts open: it is the one most people ask.
          open={i === 0}
          onToggle={(e) => {
            // Accordion behaviour only. Tracking is on <summary> below: a
            // `toggle` event also fires when the element is created with the
            // `open` attribute, which counted one FAQ as "opened" on every
            // page load with nobody touching it.
            const el = e.currentTarget;
            if (!el.open) return;
            for (const other of listRef.current?.querySelectorAll('details') ?? []) {
              if (other !== el) other.open = false;
            }
          }}
        >
          <summary
            onClick={(e) => {
              // Only an opening counts: clicking an open question closes it.
              const details = (e.currentTarget as HTMLElement).parentElement as HTMLDetailsElement | null;
              if (details && !details.open) track('faq_open', surface, item.q);
            }}
          >
            {item.q}
          </summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  );
}

/* ── Proof ────────────────────────────────────────────────────────────────── */

/**
 * Real testimonials when they exist. Until then: a plain statement of where
 * the product is, which is more persuasive to a careful buyer than a stock
 * photo and a made-up name — and is the only version that survives being
 * checked.
 */
export function ProofStrip() {
  if (TESTIMONIALS.length > 0) {
    return (
      <div className="proof-grid">
        {TESTIMONIALS.map((t) => (
          <figure className="card quote" key={t.name + t.company}>
            {t.metric && <div className="quote-metric">{t.metric}</div>}
            <blockquote>“{t.quote}”</blockquote>
            <figcaption>
              {t.photo ? (
                <img src={t.photo} alt="" width={40} height={40} className="avatar" loading="lazy" />
              ) : (
                <span className="avatar avatar-initials" aria-hidden="true">
                  {t.name
                    .split(' ')
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')}
                </span>
              )}
              <span>
                <strong>{t.name}</strong>
                <br />
                <span className="muted small">
                  {t.role}, {t.company}
                </span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    );
  }

  if (CUSTOMER_LOGOS.length > 0) {
    return (
      <div className="logo-wall">
        {CUSTOMER_LOGOS.map((l) => (
          <img key={l.name} src={l.src} alt={l.name} height={32} loading="lazy" />
        ))}
      </div>
    );
  }

  return (
    <div className="proof-honest">
      <strong>No customer quotes yet — we will not invent them.</strong>
      <p>
        Co-op is new. Rather than fill this space with stock photos and names you cannot check, here is
        what we can show you: the product, the price, and a refund if it does not work for your shop.
        The first real case study will replace this paragraph, and it will name the shop and the owner.
      </p>
    </div>
  );
}

/** A single, checkable number where a logo wall would otherwise go. */
export function ProofFacts() {
  return (
    <ul className="facts">
      <li>
        <strong>10 days</strong>
        <span>free, no card</span>
      </li>
      <li>
        <strong>On your PC</strong>
        <span>your data stays put, synced</span>
      </li>
      <li>
        <strong>₦25,000</strong>
        <span>a month, cancel any time</span>
      </li>
    </ul>
  );
}

/* ── Lead capture ─────────────────────────────────────────────────────────── */

/**
 * The "not ready to buy" path. Most visitors will not start a trial today, and
 * the ones who leave an email are the only ones we can talk to later.
 *
 * There is no backend to post to yet, so the form hands off to a `mailto:`
 * with the guide request pre-filled. That is a real, working path today —
 * unlike a form that posts into a void and shows a fake "thanks!".
 */
export function LeadCapture({ surface = 'lead' }: { surface?: string }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    track('lead_capture', surface, LEAD_MAGNET.id);
    // There is no backend to post to, so the request goes out as a real email
    // the visitor can see, with their address in it. A form that shows
    // "thanks" and quietly drops the address is worse than no form.
    const subject = encodeURIComponent(`Guide: ${LEAD_MAGNET.title}`);
    const body = encodeURIComponent(`Please send the guide to ${email}.\n\n(From the Co-op website.)`);
    window.location.href = `mailto:${CONTACT.email}?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <div className="lead">
      <div className="lead-copy">
        <span className="caps eyebrow-text">Not ready to start?</span>
        <h3>{LEAD_MAGNET.title}</h3>
        <p className="muted">{LEAD_MAGNET.blurb}</p>
      </div>
      {sent ? (
        <p className="lead-done" role="status">
          Your email app should have opened with the request ready to send. There is no mailing list
          yet, so this goes to a person: {CONTACT.email}. If nothing opened, email that address with
          &ldquo;guide&rdquo; in the subject and you will get it within one working day.
        </p>
      ) : (
        <form ref={formRef} className="lead-form" onSubmit={submit} noValidate>
          <label htmlFor={id} className="sr-only">
            Your email address
          </label>
          <input
            id={id}
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@yourshop.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {/* Not btn-primary: this is a soft offer for the not-ready crowd, and
              an email capture styled like "Start free trial" competes with it. */}
          <button type="submit" className="btn btn-ghost">
            Send me the guide
          </button>
          <p className="small muted form-note">
            One email with the guide. No newsletter unless you ask for one.
          </p>
        </form>
      )}
    </div>
  );
}

/* ── Product screenshots ──────────────────────────────────────────────────── */

/**
 * The product shot above the fold.
 *
 * These are real PNGs rendered by `scripts/render-screenshots.py` from the
 * app's own design tokens and component geometry — not the CSS mock this used
 * to be, and not a photo of somebody else's software.
 *
 * They are still **mocks**, and the `figcaption` says so in the markup. That is
 * not hedging: they show plausible trade numbers, not your shop's. When someone
 * captures the running app, the note comes off — see
 * `public/screenshots/README.md`.
 *
 * The images are sized in the HTML because an unsized image in a two-column
 * hero is a layout shift on every load, and this one is above the fold.
 */
export function AppPreview({ dark = false }: { dark?: boolean }) {
  return (
    <figure className="shot">
      <img
        className="shot-img"
        src={dark ? '/screenshots/dashboard-dark.png' : '/screenshots/dashboard.png'}
        width={1120}
        height={700}
        alt="Co-op's Overview screen: four KPI tiles for revenue, orders, inventory health and products, a monthly revenue bar chart, and a recent-orders table with Naira amounts and status pills."
        loading="eager"
        decoding="async"
      />
      <figcaption className="shot-note">
        A mock of the Overview screen, drawn from the app's own design tokens. Not a
        photograph of a live shop.
      </figcaption>
    </figure>
  );
}

/**
 * The receivables screen, used where the page is about money owed rather than
 * the overview. Same honesty rule as above.
 */
export function ReceivablesShot() {
  return (
    <figure className="shot">
      <img
        className="shot-img"
        src="/screenshots/receivables.png"
        width={1120}
        height={600}
        alt="The Receivables screen: outstanding balance split into 0–30, 31–60 and 60+ day buckets, and a table of orders showing age, total, paid, balance due and whether each is paid, part paid or unpaid."
        loading="lazy"
        decoding="async"
      />
      <figcaption className="shot-note">
        A mock of the Receivables screen, drawn from the app's own design tokens.
      </figcaption>
    </figure>
  );
}
