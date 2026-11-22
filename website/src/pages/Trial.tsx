/**
 * /trial — the page every "Start free trial" button actually goes to.
 *
 * It exists because the previous destination was GitHub, which is three
 * problems at once: a shop owner has never heard of it, the browser leaves the
 * site, and nothing is captured. Four fields and a download is the minimum that
 * fixes all three.
 *
 * Design rules, in order of importance:
 *   · Four fields, all of them ones we will actually use. No "how did you hear
 *     about us", no company size, no phone-verification dance.
 *   · The installer is handed over on this page, by us — not by sending the
 *     visitor somewhere else to find it.
 *   · If the save fails they still get the installer, and the page says what
 *     happened. A form that silently loses a lead is worse than no form.
 *   · Nothing here promises an email that does not exist. The confirmation
 *     says what actually happens next.
 */
import { useEffect, useId, useState } from 'react';
import { Link } from '../router';
import { track } from '../analytics';
import {
  BILLING_TERMS,
  CONTACT,
  CONTACT_IS_PLACEHOLDER,
  DOWNLOAD_URL,
  PRODUCT,
  TRIAL_PATH,
  whatsappHref,
} from '../site';
import { looksLikeEmail, looksLikeNigerianMobile, saveTrialLead, type LeadResult } from '../trial';
import { Section, SectionHead } from '../components/Layout';
import { Faq } from '../components/blocks';

/** Which CTA brought them here, so the funnel can attribute the lead. */
function inboundSource(): string {
  if (typeof window === 'undefined') return 'direct';
  const from = new URLSearchParams(window.location.search).get('from');
  return from ? from.slice(0, 60) : 'direct';
}

const STEPS = [
  'The installer downloads — a Windows app, about the size of a photo album.',
  'Open it and sign in. One screen: business name, Naira, VAT rate.',
  'Add twenty products by hand, or import a CSV and fix the rows it flags.',
  'Sell something. That is the whole loop; everything else is built around it.',
];

export default function Trial() {
  const id = useId();
  const [form, setForm] = useState({ name: '', shopName: '', email: '', whatsapp: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<LeadResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    track('signup_start', 'trial', inboundSource());
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Please type your name.';
    if (form.shopName.trim().length < 2) next.shopName = 'What is the shop called?';
    if (!looksLikeEmail(form.email)) next.email = 'That email is missing something.';
    if (!looksLikeNigerianMobile(form.whatsapp)) next.whatsapp = 'A Nigerian mobile number, e.g. 0801 234 5678.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      track('trial_form_invalid', 'trial', Object.keys(errors).join(','));
      return;
    }
    setSubmitting(true);
    const saved = await saveTrialLead({ ...form, source: inboundSource() });
    setResult(saved);
    setSubmitting(false);
    track(saved.ok ? 'lead_capture' : 'lead_capture_failed', 'trial', saved.ok ? 'trial_form' : saved.reason);
    // The installer is handed over on this page, so the download button is
    // right there. We do not auto-navigate: the browser would block it, and a
    // visitor should see the confirmation before the download sheet appears.
  };

  const done = result !== null && (result.ok || result.reason !== 'disabled');

  return (
    <>
      <Section className="page-head">
        <div className="signup">
          <div>
            <span className="caps eyebrow-text">Free trial</span>
            <h1 className="hero-title-sm">
              {BILLING_TERMS.trialDays} days. No card. Nothing to cancel.
            </h1>
            <p className="lede">
              Four details so we can reach you if the install goes wrong, then the installer — right
              here, not on another site.
            </p>

            {done ? (
              <div className="trial-done" role="status">
                <h2 className="card-title">
                  {result?.ok ? 'You are on the list.' : 'The download is ready — but saving your details failed.'}
                </h2>
                <p className="muted">
                  {result?.ok
                    ? 'Your details are saved. Download the installer below and you are in. If anything goes wrong in the first week, reply to the WhatsApp number you gave us and a person will answer.'
                    : 'Something went wrong on our side. Take the download anyway — then message us on WhatsApp so we can put you on the list by hand.'}
                </p>
                <a
                  className="btn btn-primary btn-lg"
                  href={DOWNLOAD_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => track('download_click', 'trial', 'installer')}
                >
                  Download for {PRODUCT.platform.replace(' desktop', '')}
                </a>
                <p className="small muted form-note">
                  Approx. 90 MB · {PRODUCT.platform} 10 or newer ·{' '}
                  <a href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
                    all versions and checksums
                  </a>
                </p>
                {!result?.ok && CONTACT.whatsapp && (
                  <p className="notice-strip warn">
                    <strong>Please tell us.</strong>{' '}
                    <a href={whatsappHref(`I tried to start the trial but the form failed.`)}>
                      Message us on WhatsApp
                    </a>{' '}
                    with your shop name and we will set you up manually.
                  </p>
                )}
              </div>
            ) : (
              <form className="trial-form" onSubmit={submit} noValidate>
                <div className="field">
                  <label htmlFor={`${id}-name`}>Your name</label>
                  <input
                    id={`${id}-name`}
                    name="name"
                    autoComplete="name"
                    value={form.name}
                    onChange={set('name')}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? `${id}-name-err` : undefined}
                  />
                  {errors.name && (
                    <p className="field-error" id={`${id}-name-err`}>
                      {errors.name}
                    </p>
                  )}
                </div>

                <div className="field">
                  <label htmlFor={`${id}-shop`}>Shop name</label>
                  <input
                    id={`${id}-shop`}
                    name="shopName"
                    autoComplete="organization"
                    value={form.shopName}
                    onChange={set('shopName')}
                    aria-invalid={Boolean(errors.shopName)}
                    aria-describedby={errors.shopName ? `${id}-shop-err` : undefined}
                  />
                  {errors.shopName && (
                    <p className="field-error" id={`${id}-shop-err`}>
                      {errors.shopName}
                    </p>
                  )}
                </div>

                <div className="field">
                  <label htmlFor={`${id}-wa`}>WhatsApp number</label>
                  <input
                    id={`${id}-wa`}
                    name="whatsapp"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0801 234 5678"
                    value={form.whatsapp}
                    onChange={set('whatsapp')}
                    aria-invalid={Boolean(errors.whatsapp)}
                    aria-describedby={`${id}-wa-hint${errors.whatsapp ? ` ${id}-wa-err` : ''}`}
                  />
                  <p className="field-hint" id={`${id}-wa-hint`}>
                    Where we answer questions during the trial. Not a mailing list.
                  </p>
                  {errors.whatsapp && (
                    <p className="field-error" id={`${id}-wa-err`}>
                      {errors.whatsapp}
                    </p>
                  )}
                </div>

                <div className="field">
                  <label htmlFor={`${id}-email`}>Email</label>
                  <input
                    id={`${id}-email`}
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={set('email')}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? `${id}-email-err` : undefined}
                  />
                  {errors.email && (
                    <p className="field-error" id={`${id}-email-err`}>
                      {errors.email}
                    </p>
                  )}
                </div>

                <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Start free trial'}
                </button>

                <p className="small muted form-note">
                  We use these four things to help you get set up and to tell you when something
                  changes — nothing else. No newsletter unless you ask for one. Your business records
                  stay yours: see <Link to="/privacy">Privacy</Link>.
                </p>

                {result && !result.ok && result.reason === 'disabled' && (
                  <p className="notice-strip warn">
                    <strong>Lead capture is not configured.</strong> The installer still works, but
                    this build has no database behind the form, so nothing was saved.
                  </p>
                )}
              </form>
            )}

            {!done && (
              <p className="hero-note">
                {PRODUCT.platform} · {BILLING_TERMS.trialDays}-day trial · {BILLING_TERMS.notice}
              </p>
            )}
          </div>

          <aside>
            <h2 className="card-title">What happens when you install it</h2>
            <ol className="steps steps-tight">
              {STEPS.map((step, i) => (
                <li key={step}>
                  <span className="step-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <p className="muted small">{step}</p>
                </li>
              ))}
            </ol>

            {!CONTACT_IS_PLACEHOLDER && (
              <p className="small muted form-note">
                Stuck before you start?{' '}
                <a href={whatsappHref('I have a question before starting the Co-op trial.')}>
                  WhatsApp us
                </a>
                .
              </p>
            )}
          </aside>
        </div>
      </Section>

      <Section tone="band">
        <SectionHead eyebrow="Before you click" title="What people ask before starting" />
        <Faq items={TRIAL_FAQ} surface="trial" />
      </Section>
    </>
  );
}

const TRIAL_FAQ = [
  {
    q: 'Why do you want my number?',
    a: 'Because when the install fails or the first import goes wrong, WhatsApp is how we fix it in minutes instead of emails over two days. We do not add you to a marketing list, and you can tell us to stop at any point.',
  },
  {
    q: 'Do you take a card for the trial?',
    a: `No. The trial does not ask for payment details, which also means there is nothing to cancel on day ${BILLING_TERMS.trialDays} — the app simply stops accepting new entries until you choose a plan.`,
  },
  {
    q: 'Is this a demo build?',
    a: 'No. The installer is the product. Everything described on the Features page is in it, including the parts that are still rough.',
  },
  {
    q: 'What if I would rather not fill a form?',
    a: `Download it straight from the releases page — it is public. The form exists so we can help when something breaks, not to gate the software.`,
  },
];

export { TRIAL_PATH };
