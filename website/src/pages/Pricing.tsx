/**
 * The pricing page — the highest-intent page on the site.
 *
 * Rules it follows, from the brief and from how Nigerian buyers actually behave:
 *   · the price is visible, in Naira, before any form;
 *   · monthly/yearly is a toggle, not two separate pages;
 *   · the annual total is stated in Naira, not just "save 20%";
 *   · the FAQ lives under the cards, where doubt happens;
 *   · every card's button says what it does — "Start free trial", not "Choose".
 *
 * Prices come from `frontend/src/billing/plans.ts`, the same catalog the app
 * bills from, so the site cannot quote a number the product does not charge.
 */
import { useEffect, useState } from 'react';
import { PLAN_CATALOG, FREE_PLAN, displayPrice, type Plan } from '../../../frontend/src/billing/plans';
import { TRIAL_HREF, CONTACT, whatsappHref } from '../site';
import { PRICING_FAQ } from '../faq';
import { STARTER, listPrice } from '../prices';
import { track } from '../analytics';
import { Link } from '../router';
import { Section, SectionHead, CtaBand } from '../components/Layout';
import { Faq } from '../components/blocks';

function PlanCard({ plan, annual }: { plan: Plan; annual: boolean }) {
  const price = displayPrice(plan, annual);
  const isFree = plan.priceMonthly === 0;
  const isCustom = plan.priceMonthly == null;
  return (
    <div className={`card plan${plan.highlight ? ' featured' : ''}`}>
      {plan.highlight && <span className="badge">Most shops pick this</span>}
      <p className="plan-name">{plan.name}</p>
      <p className="muted small plan-tagline">{plan.tagline}</p>
      <div className="price">
        <span className="amount">{price.amount}</span>
        {!isFree && !isCustom && <span className="per">/month</span>}
      </div>
      <p className="muted small price-note">{price.note}</p>
      <ul>
        {plan.features.map((f) => (
          <li key={f.label} className={f.included ? '' : 'off'}>
            <span className="tick" aria-hidden="true">
              {f.included ? '✓' : '—'}
            </span>
            {f.included ? f.label : <s>{f.label}</s>}
          </li>
        ))}
      </ul>
      {isCustom ? (
        <Link
          to="/contact"
          className="btn btn-ghost"
          onClick={() => track('cta_click', 'pricing-card:enterprise', 'Talk to us')}
        >
          {plan.cta}
        </Link>
      ) : (
        <a
          className={`btn ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`}
          href={TRIAL_HREF}
          onClick={() => track('plan_select', `pricing-card:${plan.id}`, `${plan.name} ${annual ? 'annual' : 'monthly'}`)}
          {...(TRIAL_HREF.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {plan.priceMonthly === 0 ? plan.cta : 'Start free trial'}
        </a>
      )}
    </div>
  );
}


export default function Pricing() {
  const waHref = whatsappHref('Hi — I have a question about whether Co-op suits my shop.');
  // Default to annual: it is the cheaper option and the one that reflects a
  // year of use, which is how a shop actually runs.
  const [annual, setAnnual] = useState(true);

  useEffect(() => {
    track('pricing_view', 'pricing', annual ? 'annual' : 'monthly');
  }, []); // once per visit

  return (
    <>
      <Section className="page-head">
        <SectionHead
          as="h1"
          eyebrow="Pricing"
          title="Two prices. Both on this page."
          lede="Every plan starts with a 10-day free trial and no card. Cancel from inside the app; nothing is deleted when you do."
        />

        <div className="billing-toggle" role="group" aria-label="Billing period">
          <button
            type="button"
            aria-pressed={!annual}
            onClick={() => {
              setAnnual(false);
              track('pricing_toggle', 'pricing', 'monthly');
            }}
          >
            Monthly
          </button>
          <button
            type="button"
            aria-pressed={annual}
            onClick={() => {
              setAnnual(true);
              track('pricing_toggle', 'pricing', 'annual');
            }}
          >
            Yearly <span className="save">save 20%</span>
          </button>
        </div>

        <div className="plans">
          {PLAN_CATALOG.map((plan) => (
            <PlanCard key={plan.id} plan={plan} annual={annual} />
          ))}
        </div>

        <p className="muted small billing-foot">
          Prices are in Naira and include VAT, billed through Paystack by card, transfer or USSD. The
          free plan ({FREE_PLAN.features.length} core features, 25 AI credits) exists for anyone testing
          one screen at a time. <Link to="/terms">Billing terms</Link>.
        </p>

        {/* The question that stops a purchase is usually not answerable by a
            page — "will this work for my kind of shop?". WhatsApp is where
            that gets answered, and it is one tap from the prices. */}
        {waHref && (
          <p className="pricing-wa">
            <a
              className="btn btn-ghost"
              href={waHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => track('contact_click', 'pricing', 'whatsapp')}
            >
              <span aria-hidden="true">💬</span> Ask about your shop on WhatsApp
            </a>
            <span className="small muted">A person answers, usually the same working day.</span>
          </p>
        )}
      </Section>

      <Section tone="band">
        <SectionHead eyebrow="Before you pay" title="Pricing questions, answered plainly" />
        <Faq items={PRICING_FAQ} surface="pricing" />
      </Section>

      <Section>
        <div className="compare-note card">
          <h2 className="card-title">Cheaper than what you are using now?</h2>
          <p className="muted">
            A part-time bookkeeper in Lagos is several times {listPrice(STARTER)} a month, and a spreadsheet costs
            you the evening. If you are weighing Co-op against a specific tool, tell us which one on
            the contact page and we will tell you honestly whether we are the better fit —
            including when we are not.
          </p>
          <Link to="/contact" className="btn btn-ghost" onClick={() => track('cta_click', 'pricing:compare', 'Ask about a specific tool')}>
            Ask us on WhatsApp
          </Link>
          {CONTACT.demoUrl && <span className="muted small"> or book a 20-minute call</span>}
        </div>
      </Section>

      <CtaBand surface="pricing" />
    </>
  );
}
