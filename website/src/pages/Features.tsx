/**
 * Features / use cases.
 *
 * Organised by *job*, not by menu item: each block answers "what does this do
 * for me on a Tuesday". A feature list that mirrors the sidebar tells a buyer
 * nothing they could not guess from the screenshots.
 */
import { Link } from '../router';
import { Section, SectionHead, CtaBand } from '../components/Layout';
import { Faq, AppPreview, ReceivablesShot } from '../components/blocks';
import { FAQ } from '../site';
import { track } from '../analytics';

const JOBS = [
  {
    id: 'stock',
    eyebrow: 'Inventory',
    title: 'Know what is on the shelf without walking to it',
    body: [
      'Every sale, return, transfer and stock adjustment writes to one movement ledger. You can open any product and see the last twenty things that happened to it, who did them and when.',
      'Low-stock alerts are per product, so the reorder list is the things you actually sell — not everything you have ever bought.',
    ],
    bullets: ['Full movement ledger per product', 'Reorder list before you run out', 'Stock valuation at cost and at selling price', 'Category and supplier grouping'],
    link: { to: '/signup', label: 'Start with your stock' },
  },
  {
    id: 'orders',
    eyebrow: 'Orders & invoices',
    title: 'Take the order, take the money, print the paper',
    body: [
      'An order moves through one state machine — created, paid, fulfilled, cancelled — so it cannot be in two states at once and nobody has to remember which copy of the spreadsheet is current.',
      'Payment can be cash, transfer or POS, in part or in full. The invoice is generated from the order with 7.5% VAT, and prints or saves as a PDF with your own business details and logo.',
    ],
    bullets: ['Part payments and outstanding balances', 'VAT-computed invoices, printable or PDF', 'Order status that cannot contradict itself', 'Customer statement of account'],
    link: { to: '/features', label: '' },
  },
  {
    id: 'customers',
    eyebrow: 'Customers & receivables',
    title: 'Who owes you, how much, and for how long',
    body: [
      'Every customer has a history: what they bought, what they paid, what is outstanding. Receivables age, so a debt from three weeks ago looks different from one from yesterday.',
      'That is the difference between "we are owed some money" and a list of three people to call.',
    ],
    bullets: ['Purchase history per customer', 'Outstanding balances and ageing', 'Statement you can print or send', 'Search by name or phone'],
    link: { to: '/signup', label: 'Bring your customer list' },
  },
  {
    id: 'ai',
    eyebrow: 'The assistant',
    title: 'Ask a question in plain English, get an answer from your own books',
    body: [
      'The assistant is grounded in your records only. If you ask why last week was slow, the answer is computed from your sales — it does not guess, and it cannot see another shop’s data.',
      'It also drafts: an invoice from a sentence, a restock suggestion from what is actually moving. It never writes to your books without you confirming the action.',
    ],
    bullets: ['Answers are computed, not generated from nothing', 'Forecasts based on your own sales history', 'Proposes actions; you confirm each one', 'Scoped to your business, always'],
    link: { to: '/features#faq', label: 'How credits work' },
  },
  {
    id: 'offline',
    eyebrow: 'Offline',
    title: 'It keeps working when the network does not',
    body: [
      'Co-op is a desktop app. Selling, counting, invoicing and reporting run on your machine, so a dead connection stops your internet — not your shop.',
      'When the connection comes back, the records sync. Conflicts are surfaced instead of silently overwritten: you see both versions and choose.',
    ],
    bullets: ['Core operations run locally', 'Automatic sync when you reconnect', 'Conflicts shown, never silently resolved', 'Backups encrypted before they leave the machine'],
    link: { to: '/security', label: 'Where your data lives' },
  },
  {
    id: 'reports',
    eyebrow: 'Reports',
    title: 'The numbers, without building the spreadsheet',
    body: [
      'Sales, stock, customers and receivables reports with date filters, and an export to CSV or PDF for whoever asks for it.',
      'The dashboard is the same numbers, at a glance, the moment you open the app.',
    ],
    bullets: ['Sales by day, product and payment type', 'Stock and valuation reports', 'Customer and receivables reports', 'Export to CSV or PDF'],
    link: { to: '/signup', label: 'Start free' },
  },
];

export default function Features() {
  return (
    <>
      <Section className="page-head">
        <SectionHead
          as="h1"
          eyebrow="Features"
          title="What Co-op actually does"
          lede="Six jobs, described the way they happen in a shop — not the way they appear in a menu."
        />
        <AppPreview />
      </Section>

      {JOBS.map((job, i) => (
        <Section key={job.id} id={job.id} tone={i % 2 === 1 ? 'band' : 'plain'}>
          <div className="job">
            <div className="job-copy">
              <span className="caps eyebrow-text">{job.eyebrow}</span>
              <h2 className="section-title">{job.title}</h2>
              {job.body.map((p) => (
                <p key={p.slice(0, 24)} className="muted">
                  {p}
                </p>
              ))}
              {job.link.label && (
                <Link
                  to={job.link.to}
                  className="btn btn-ghost"
                  onClick={() => track('cta_click', `features:${job.id}`, job.link.label)}
                >
                  {job.link.label}
                </Link>
              )}
            </div>
            {job.id === 'customers' ? (
              // This section is about aging debt, so it shows the screen that
              // answers it instead of a list restating the paragraph.
              <ReceivablesShot />
            ) : (
              <ul className="job-list">
                {job.bullets.map((b) => (
                  <li key={b}>
                    <span className="tick" aria-hidden="true">
                      ✓
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      ))}

      <Section id="faq" tone="band">
        <SectionHead eyebrow="Questions" title="Everything people ask" />
        <Faq items={FAQ} surface="features" />
      </Section>

      <CtaBand surface="features" />
    </>
  );
}
