/**
 * The home page.
 *
 * Structure, top to bottom, in the order a stranger makes up their mind:
 *   1. what this is and what it replaces, in one sentence (hero)
 *   2. the product — above the fold, not three screens down
 *   3. the specific outcome (before/after, not adjectives)
 *   4. what it does (features, scannable)
 *   5. price, in public
 *   6. the objections that stop a purchase
 *   7. the path for the not-ready crowd
 *   8. the CTA again
 *
 * Every section ends in the same action. There is no second "book a demo"
 * button competing with the trial in this page.
 */
import { Link } from '../router';
import { PRODUCT, BILLING_TERMS, TRIAL_HREF } from '../site';
import { track } from '../analytics';
import { Section, SectionHead, CtaBand } from '../components/Layout';
import { Faq, ProofStrip, ProofFacts, LeadCapture, AppPreview } from '../components/blocks';
import { FAQ } from '../site';

const FEATURES = [
  {
    title: 'Stock that keeps itself',
    body: 'Every sale, return and delivery moves the ledger. Low-stock shows up before you run out, and the count in the app is the count on the shelf.',
    to: '/features',
  },
  {
    title: 'Orders and invoices in one flow',
    body: 'Take an order, mark it paid by cash, transfer or POS, print the invoice with VAT — without re-typing anything into a second document.',
    to: '/features',
  },
  {
    title: 'Every customer’s history, one tap',
    body: 'What they bought, when, what they owe. Receivables that age, so you know who to call on Monday morning.',
    to: '/features',
  },
  {
    title: 'Ask a question, get your own numbers',
    body: '“Why was last week slow?” gets an answer built from your records — never invented, never from someone else’s shop.',
    to: '/features',
  },
  {
    title: 'Books that close themselves',
    body: 'Takings by payment type, gross margin, VAT owed, receivables by age — the end-of-day totals a notebook makes you add up twice, on one screen.',
    to: '/features',
  },
];

const BEFORE_AFTER = [
  { before: 'Takings added up in a notebook, checked twice', after: 'One screen showing the day’s revenue by payment type' },
  { before: 'Stock counted when something runs out', after: 'A reorder list before you sell the last carton' },
  { before: 'Invoices typed in Word, VAT worked out on a calculator', after: 'An invoice with 7.5% VAT, from the order, in one click' },
  { before: '“Who owes us?” answered by scrolling a WhatsApp group', after: 'Receivables by age, per customer, on one page' },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="container hero-inner">
          <div data-enter="hero-copy">
            <span className="eyebrow caps">Built for Nigerian retail · works offline</span>
            <h1 className="hero-title">
              Close your books in <span className="grad">20 minutes</span>, not 3 hours.
            </h1>
            <p className="lede">
              Co-op replaces the notebook, the WhatsApp thread and the calculator with one{' '}
              {PRODUCT.platform.toLowerCase()} app: stock, orders, customers and invoices — priced
              in Naira, working when the network does not.
            </p>
            <div className="hero-cta">
              <a
                className="btn btn-primary btn-lg"
                href={TRIAL_HREF}
                onClick={() => track('cta_click', 'hero', 'Start free trial')}
                {...(TRIAL_HREF.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
              >
                Start free trial
              </a>
              <Link to="/features" className="btn btn-ghost btn-lg" onClick={() => track('cta_click', 'hero', 'See what it does')}>
                See what it does
              </Link>
            </div>
            <p className="hero-note">
              No card for {BILLING_TERMS.trialDays} days · {BILLING_TERMS.notice}
            </p>
            <ProofFacts />
          </div>
          <div data-enter="hero-preview">
            <AppPreview />
          </div>
        </div>
      </section>

      <Section>
        <SectionHead
          eyebrow="What changes"
          title="Four jobs you stop doing by hand"
          lede="Not “streamline your operations”. These are the actual tasks an owner does at the end of a trading day."
        />
        <div className="before-after">
          <div className="ba-head" aria-hidden="true">
            <span>Before Co-op</span>
            <span>After</span>
          </div>
          {BEFORE_AFTER.map((row) => (
            <div className="ba-row" key={row.before}>
              <p className="ba-before">{row.before}</p>
              <p className="ba-after">
                <span className="tick" aria-hidden="true">
                  ✓
                </span>
                {row.after}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="band">
        <SectionHead eyebrow="What it does" title="Five systems, one window" />
        <div className="grid-2">
          {FEATURES.map((f) => (
            <Link to={f.to} className="card feature-card" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <span className="card-link">How it works →</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Proof" title="What we can and cannot show you yet" />
        <ProofStrip />
      </Section>

      <Section tone="band">
        <SectionHead
          eyebrow="Pricing"
          title="₦25,000 a month, published"
          lede="No “contact us for a quote”. Two prices, both on this page, both cancellable."
        />
        <div className="price-teaser">
          <div className="card">
            <h3>Starter</h3>
            <p className="price-line">
              <span className="amount">₦25,000</span>
              <span className="per">/month</span>
            </p>
            <p className="muted small">Up to 3 users, tax-ready invoices, 200 AI credits a month.</p>
          </div>
          <div className="card featured">
            <h3>
              Professional <span className="badge">Most shops pick this</span>
            </h3>
            <p className="price-line">
              <span className="amount">₦75,000</span>
              <span className="per">/month</span>
            </p>
            <p className="muted small">Unlimited users, 1,000 AI credits, priority support.</p>
          </div>
        </div>
        <p className="price-teaser-foot">
          <Link to="/pricing">
            Full pricing, annual discount and what is in each plan →
          </Link>
        </p>
      </Section>

      <Section>
        <SectionHead eyebrow="Questions" title="The five things people ask first" />
        <Faq items={FAQ.slice(0, 5)} surface="home" />
        <p className="faq-more">
          <Link to="/features#faq">All questions →</Link>
        </p>
      </Section>

      <Section tone="band">
        <LeadCapture surface="home" />
      </Section>

      <CtaBand surface="home" />
    </>
  );
}
