/**
 * Signup / free trial.
 *
 * This is the conversion page, so it does the least: says what happens when you
 * click, what it costs, what we need from you, and gives one button. No
 * newsletter checkbox, no "tell us about your business" form, no card field.
 *
 * Honest limit, stated on the page: there is no web sign-up yet. The trial is
 * the Windows app, so the button downloads the installer. When a web sign-up
 * exists, `SIGNUP_URL` in site.ts switches every CTA to it at once.
 */
import { useEffect } from 'react';
import { Link } from '../router';
import { TRIAL_HREF, DOWNLOAD_URL, BILLING_TERMS, SIGNUP_URL, PRODUCT } from '../site';
import { track } from '../analytics';
import { Section, SectionHead } from '../components/Layout';
import { Faq } from '../components/blocks';

const STEPS = [
  {
    n: '1',
    title: 'Download the app',
    body: `A ${PRODUCT.platform} installer, about the size of a photo album. It installs to your own computer — there is no server to wait for.`,
  },
  {
    n: '2',
    title: 'Sign in and name your business',
    body: 'One screen: business name, currency (Naira), VAT rate. You can change all of it later in Settings.',
  },
  {
    n: '3',
    title: 'Add your products or import a CSV',
    body: 'Twenty products typed in, or a spreadsheet mapped column by column. Co-op shows you every row it cannot read before anything is saved.',
  },
  {
    n: '4',
    title: 'Sell something',
    body: 'Create an order, mark it paid, print the invoice. That is the whole loop — everything else in the app is built around it.',
  },
];

const SIGNUP_FAQ = [
  {
    q: 'Do you take a card?',
    a: 'No. The trial does not ask for payment details, which also means there is nothing to cancel on day 10 — the app simply stops accepting new entries until you choose a plan.',
  },
  {
    q: 'What do you do with my business data?',
    a: 'Your records are yours. They sit on your machine and are backed up to a database only your business can read. You can export everything from Settings at any time, and see exactly where it lives on the Security page.',
  },
  {
    q: 'Will it work on my laptop?',
    a: `Co-op runs on ${PRODUCT.platform} 10 or later, on a machine with 4GB of RAM. If it is running a modern Word, it will run Co-op.`,
  },
  {
    q: 'What if I need help getting set up?',
    a: 'Email or WhatsApp us and we will do the first import with you on a call. That is included, not a paid extra.',
  },
];

export default function Signup() {
  useEffect(() => {
    track('signup_start', 'signup', SIGNUP_URL ? 'web' : 'download');
  }, []);

  return (
    <>
      <Section className="page-head">
        <div className="signup">
          <div>
            <span className="caps eyebrow-text">Free trial</span>
            <h1 className="hero-title-sm">{BILLING_TERMS.trialDays} days. No card. Nothing to cancel.</h1>
            <p className="lede">
              Install Co-op, put your real stock in it, and run a normal week. If it does not save you
              more time than it costs, walk away — your records stay readable and exportable either way.
            </p>
            <div className="hero-cta">
              <a
                className="btn btn-primary btn-lg"
                href={TRIAL_HREF}
                onClick={() => track('download_click', 'signup', 'Download for Windows')}
                {...(TRIAL_HREF.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
              >
                {SIGNUP_URL ? 'Start free trial' : 'Download for Windows'}
              </a>
              <Link to="/pricing" className="btn btn-ghost btn-lg" onClick={() => track('cta_click', 'signup', 'See pricing first')}>
                See pricing first
              </Link>
            </div>
            <p className="hero-note">
              {PRODUCT.platform} · {BILLING_TERMS.trialDays}-day trial · {BILLING_TERMS.notice}
            </p>
            {!SIGNUP_URL && (
              <p className="notice-strip">
                <strong>No web sign-up yet.</strong> The trial is the desktop app, so the button above
                downloads the installer from our GitHub releases. That is the whole product — not a
                demo build.
              </p>
            )}
          </div>

          <h2 className="sr-only">What happens when you install it</h2>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="step-n" aria-hidden="true">
                  {s.n}
                </span>
                <div>
                  <h3>{s.title}</h3>
                  <p className="muted small">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section tone="band">
        <SectionHead eyebrow="Before you click" title="Four questions about starting" />
        <Faq items={SIGNUP_FAQ} surface="signup" />
      </Section>

      <Section>
        <p className="muted center">
          Trouble downloading? <Link to="/contact">Tell us</Link> and we will send the installer
          directly.
          {DOWNLOAD_URL && (
            <>
              {' '}
              Older versions are on{' '}
              <a href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
                the releases page
              </a>
              .
            </>
          )}
        </p>
      </Section>
    </>
  );
}
