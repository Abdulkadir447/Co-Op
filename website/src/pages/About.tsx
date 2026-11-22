/**
 * About.
 *
 * The brief is right that a faceless company reads as a side project — and
 * also right that a fake team photo is worse. `TEAM` is empty, so this page
 * says who is accountable (a real, checkable email and a public repository)
 * instead of inventing colleagues.
 *
 * What it does have is the thing a buyer actually wants from an About page: a
 * clear statement of who the product is for, who it is not for, and what the
 * people building it believe.
 */
import { Link } from '../router';
import { Section, SectionHead, CtaBand } from '../components/Layout';
import { TEAM, CONTACT, REPO_URL, PRODUCT } from '../site';

const BELIEFS = [
  {
    title: 'A shop owner’s time is the scarcest thing in the business',
    body: 'Every screen is judged by whether it saves a minute at the end of a trading day. Features that only impress in a demo do not ship.',
  },
  {
    title: 'Naira in, Naira out',
    body: 'A Nigerian retailer should not need a dollar card to buy software that manages Naira. Prices are in Naira, billed in Naira, and the invoice says so.',
  },
  {
    title: 'The network is not guaranteed, so the app cannot depend on it',
    body: 'Selling, counting and invoicing run on your machine. If the internet is down, the shop still works — that is a design constraint, not a feature.',
  },
  {
    title: 'Numbers must be explainable',
    body: 'If the assistant says revenue fell, it should be able to show the rows that made it say so. An answer nobody can check is a rumour.',
  },
  {
    title: 'Say what is not built',
    body: 'This site lists its own gaps — no SOC 2, no customer case study yet, no public status page. You can make a decision with that; you cannot with a logo wall of strangers.',
  },
];

const NOT_FOR = [
  'Businesses with hundreds of SKUs across several warehouses and a full ERP team.',
  'Anyone who needs multi-currency consolidation today: Co-op is Naira-only by decision.',
  'Shops that want a web-only tool with no install — the desktop app is the product.',
];

export default function About() {
  return (
    <>
      <Section className="page-head">
        <SectionHead
          as="h1"
          eyebrow="About"
          title={`Why ${PRODUCT.name} exists`}
          lede="Nigerian retail runs on notebooks, WhatsApp and memory. That works until it does not — and the failures are expensive: stock that was never there, invoices that were never sent, customers who owe money nobody chased."
        />
        <div className="about-lede">
          <p>
            Co-op is a {PRODUCT.platform} app that puts the five things a shop does — stock, orders,
            customers, invoices and the numbers — in one place, and keeps working when the network
            does not. It is priced in Naira, sold to Nigerian retailers, and built so that the person
            running the shop can use it without training.
          </p>
          <p className="muted">
            It is early. There are no paying customers yet and the site says so on the page where a
            case study belongs. What exists is the product, in the open, with its security review and
            its gaps published alongside it.
          </p>
        </div>
      </Section>

      <Section tone="band">
        <SectionHead eyebrow="Who builds it" title="Accountable people, not a brand" />
        {TEAM.length > 0 ? (
          <div className="team-grid">
            {TEAM.map((p) => (
              <div className="card" key={p.name}>
                {p.photo ? <img className="avatar-lg" src={p.photo} alt="" loading="lazy" /> : null}
                <h3>{p.name}</h3>
                <p className="muted small">{p.role}</p>
                <p className="muted">{p.bio}</p>
                {p.link && (
                  <a href={p.link} target="_blank" rel="noreferrer" className="card-link">
                    Contact →
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="card">
            <h3>The team page is short because the team is</h3>
            <p className="muted">
              Co-op is built by a small group, and no one has agreed to have their name and photo on a
              marketing page yet. Rather than fill this with stock portraits, here is what you can
              check: the code is public, the security review is public, and the person who answers{' '}
              <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> is the person who writes it.
            </p>
            <p className="muted">
              If you want to know who you would be buying from before you pay, ask on the{' '}
              <Link to="/contact">contact page</Link> and we will answer with names.
            </p>
            <a className="card-link" href={REPO_URL} target="_blank" rel="noreferrer">
              The repository →
            </a>
          </div>
        )}
      </Section>

      <Section>
        <SectionHead eyebrow="What we believe" title="Five opinions that shape the product" />
        <div className="beliefs">
          {BELIEFS.map((b) => (
            <div key={b.title}>
              <h3>{b.title}</h3>
              <p className="muted">{b.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="band">
        <SectionHead eyebrow="Honesty" title="Who this is not for" />
        <ul className="not-for">
          {NOT_FOR.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="muted small">
          If you recognise yourself in that list, tell us on the{' '}
          <Link to="/contact">contact page</Link> — knowing what we are not helps us decide what to
          build next.
        </p>
      </Section>

      <CtaBand surface="about" />
    </>
  );
}
