/**
 * One case study — and it has to be one.
 *
 * The brief asks for a case study page. There is no customer to write one
 * about yet, and inventing a shop, an owner and a metric is the fastest way to
 * lose the readers who matter: the ones who check. So this page is honest
 * about being a preview, and it does something more useful than a fake: it
 * documents the *method* we will use, in public, and shows exactly what the
 * first real one will contain.
 *
 * When the first customer agrees to be named, this file gets their numbers and
 * the preview block is deleted. Nothing else on the site has to change.
 */
import { Link } from '../router';
import { Section, SectionHead, CtaBand } from '../components/Layout';
import { track } from '../analytics';

const PLAN_OF_RECORD = [
  { step: 'Week 0 — the count', detail: 'A full stocktake with the shop closed for one evening. What was on the shelf, what the books said, and the gap between them.' },
  { step: 'Week 0 — the import', detail: 'Products and customers in by CSV, on a call. Every row that cannot be read is shown before anything is saved.' },
  { step: 'Weeks 1–2 — one job only', detail: 'Orders and takings. Not reports, not the assistant. The point is that the till loop becomes habit before anything else is added.' },
  { step: 'Weeks 3–4 — the weekly number', detail: 'The owner reads the dashboard on Sunday evening instead of adding up notebooks. We time both, with a stopwatch, and write down the number.' },
  { step: 'Week 6 — the verdict', detail: 'Does it stay? What got used, what did not, and what the owner would change. Including the parts that were worse than the notebook.' },
];

export default function CaseStudy() {
  return (
    <>
      <Section className="page-head">
        <SectionHead
          as="h1"
          eyebrow="Case study"
          title="The first one is being written now"
          lede="Co-op has no paying customers yet, so there is no case study to show you — and we are not going to invent a shop, an owner and a percentage."
        />
        <div className="case-honest card">
          <h2 className="card-title">What that means for you</h2>
          <p className="muted">
            If you are the kind of buyer who wants to see proof before paying, that is the correct
            instinct and this page cannot satisfy it yet. What we can offer instead: a free trial with
            no card, a refund within 14 days if it does not work, and a direct line to the people who
            built it — including for the parts that are still rough.
          </p>
          <p className="muted">
            When the first shop agrees to be named, this page will carry their real numbers: how long
            the stocktake took, what the evening reconciliation went from and to, and what they stopped
            using. Not a logo and a compliment.
          </p>
          <div className="cta-actions left">
            <Link to="/signup" className="btn btn-primary" onClick={() => track('cta_click', 'case-study', 'Start free trial')}>
              Start free trial
            </Link>
            <Link to="/contact" className="btn btn-ghost" onClick={() => track('cta_click', 'case-study', 'Be the first case study')}>
              Be the first case study
            </Link>
          </div>
        </div>
      </Section>

      <Section tone="band">
        <SectionHead
          eyebrow="Method"
          title="Exactly how the first case study will be produced"
          lede="Published in advance so that when it appears, you can check it against this plan."
        />
        <ol className="timeline">
          {PLAN_OF_RECORD.map((p) => (
            <li key={p.step}>
              <strong>{p.step}</strong>
              <p className="muted">{p.detail}</p>
            </li>
          ))}
        </ol>
        <p className="muted small">
          If the numbers turn out badly, they get published too. A case study that only appears when
          the result is flattering is advertising, not evidence.
        </p>
      </Section>

      <CtaBand surface="case-study" />
    </>
  );
}
