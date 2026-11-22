/**
 * Security & trust.
 *
 * Written from `docs/SECURITY_AUDIT.md`, which is a row-by-row audit of this
 * codebase — so every claim here is checkable, and the gaps are listed next to
 * the strengths. A security page that only lists strengths is the one page on
 * a site nobody believes.
 *
 * The gap list is the honest part: no SOC 2, no public status page, no
 * independent penetration test, in-process rate limits. Saying so costs a few
 * enterprise deals and buys the trust of everyone who checks.
 */
import { Link } from '../router';
import { Section, SectionHead, CtaBand } from '../components/Layout';
import { STATUS_URL } from '../site';

const HAVE = [
  {
    title: 'Your data is not reachable from a browser',
    body: 'There is no client-side database access. No anon key in the bundle, no PostgREST path, no SQL from the client. Every read and write goes through a server route that resolves your business from your signed-in session — so there is no URL that returns another shop’s rows.',
  },
  {
    title: 'Row-level isolation, enforced at the database too',
    body: 'Twenty tenant tables carry row-level security policies with both USING and WITH CHECK, so the isolation does not rest on the API remembering to filter. Cross-tenant reads are asserted to return 404 in the test suite.',
  },
  {
    title: 'Encrypted in transit, and encrypted backups',
    body: 'TLS everywhere. Backups are encrypted with a key held by the server before they leave the device — a backup file on someone’s laptop is not a readable copy of your books.',
  },
  {
    title: 'Hosted in the EU',
    body: 'The Postgres database runs on Supabase in eu-central-1 (Frankfurt), Postgres 17. The application server is in the EU. Your records sit on your PC as well, which is the copy you can always export.',
  },
  {
    title: 'Payments never touch us',
    body: 'Card details go to Paystack, not to Co-op. We never see or store a card number; we receive a reference and a confirmed amount, and the amount is recomputed server-side before it is trusted.',
  },
  {
    title: 'Every write is authorised, and logged',
    body: 'One dependency resolves tenant and role on every request and refuses anything not explicitly allowed for that role. Writes are audited with who, what and when.',
  },
];

const GAPS = [
  {
    title: 'No SOC 2, ISO 27001 or PCI certificate',
    body: 'Those take an auditor and money we have not spent. If your procurement requires one, we are not the right vendor yet — and we would rather say so now.',
  },
  {
    title: 'No independent penetration test',
    body: 'The code has had an internal OWASP-style review (published in the repo) and a static analysis pass. That is not the same thing as a third party trying to break in.',
  },
  {
    title: 'No public status page yet',
    body: 'There is a health endpoint and uptime monitoring is next, but there is no page showing you last month’s uptime. Do not assume 99.9%.',
  },
  {
    title: 'Rate limits are per-process',
    body: 'They reset on restart and do not coordinate across instances. Fine for one server, which is what runs today; it is on the list before we scale out.',
  },
  {
    title: 'No formal data-processing agreement yet',
    body: 'If you need a DPA before you can use the product, ask and we will have one drafted rather than pretending one exists.',
  },
];

const DATA = [
  ['What we store', 'Your business records: products, stock movements, orders, customers, invoices, payments, team members. Your account email and business name.'],
  ['Where', 'On your computer, and backed up to a Postgres database in the EU (Frankfurt).'],
  ['Who can read it', 'You, the people you add to your business, and the small team that runs Co-op when you ask us for support. Not other customers — enforced in code and in the database.'],
  ['How long', 'While your account exists, plus 30 days after deletion so a mistaken deletion can be undone. After that, backups roll off within 35 days.'],
  ['Export', 'Everything, from Settings, at any time, as CSV. No request form and no waiting.'],
  ['Delete', `Ask us and we delete. Some financial records may be kept where Nigerian tax law requires it — we will tell you exactly which, and why, if it applies.`],
];

export default function Security() {
  return (
    <>
      <Section className="page-head">
        <SectionHead
          as="h1"
          eyebrow="Security & trust"
          title="What we protect, and what we do not have yet"
          lede="You are handing a business’s records to a small company. This page is the honest version: the architecture, the hosting, and a plain list of the certifications and guarantees we cannot offer."
        />
      </Section>

      <Section tone="band">
        <SectionHead eyebrow="How it works" title="Six things that are true today" />
        <div className="grid-2">
          {HAVE.map((h) => (
            <div className="card" key={h.title}>
              <h3>{h.title}</h3>
              <p className="muted">{h.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHead
          eyebrow="The gaps"
          title="What we do not have"
          lede="Written down so nobody has to guess, and updated when it changes."
        />
        <ul className="gap-list">
          {GAPS.map((g) => (
            <li key={g.title}>
              <span className="gap-mark" aria-hidden="true">
                ✕
              </span>
              <div>
                <strong>{g.title}</strong>
                <p className="muted small">{g.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="band">
        <SectionHead eyebrow="Your data" title="In one table, without the legal voice" />
        <div className="data-table">
          {DATA.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="card">
          <h3>Subprocessors</h3>
          <p className="muted">
            Three companies touch your data, each for one job: <strong>Supabase</strong> (database and
            file storage, EU), <strong>Clerk</strong> (sign-in; we store a user id, not a password), and{' '}
            <strong>Paystack</strong> (Naira payments). We do not run advertising pixels or sell data.
            Email goes through a transactional provider once the mailing system is live.
          </p>
          <p className="muted small">
            Found a problem? Email <a href="mailto:security@coop.example">security@coop.example</a> and we
            will answer within two working days. We do not have a paid bug bounty; we will credit
            anyone who reports something real.
          </p>
          {!STATUS_URL && (
            <p className="muted small">
              Uptime and incidents: <Link to="/status">see the status page</Link> — which currently
              explains what is and is not monitored, rather than showing a green light nobody checks.
            </p>
          )}
        </div>
      </Section>

      <CtaBand surface="security" />
    </>
  );
}
