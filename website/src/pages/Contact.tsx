/**
 * Contact.
 *
 * The brief asks for a live chat or a fast contact path. A chat widget that
 * nobody answers is worse than a WhatsApp number that someone does — so this
 * page leads with WhatsApp (where this market actually lives), then email, then
 * a booked call.
 *
 * The placeholder notice stays visible until real details are filled in. It is
 * computed in site.ts, so it disappears the moment the placeholders are
 * replaced, with no flag to remember.
 */
import { Link } from '../router';
import { Section, SectionHead } from '../components/Layout';
import { CONTACT, CONTACT_IS_PLACEHOLDER, ISSUES_URL } from '../site';
import { track } from '../analytics';

export default function Contact() {
  const wa = CONTACT.whatsapp.replace(/[^0-9]/g, '');
  const waHref = wa ? `https://wa.me/${wa}?text=${encodeURIComponent('Hi — I have a question about Co-op')}` : '';

  return (
    <>
      <Section className="page-head">
        <SectionHead
          as="h1"
          eyebrow="Contact"
          title="Talk to a person"
          lede="Questions about pricing, moving your data in, or whether Co-op fits your shop. We answer on WhatsApp during the working day, and by email otherwise."
        />

        {CONTACT_IS_PLACEHOLDER && (
          <p className="notice-strip warn">
            <strong>Preview build.</strong> These contact details are placeholders and go nowhere yet.
            Until they are replaced, the fastest real route is{' '}
            <a href={ISSUES_URL} target="_blank" rel="noreferrer">
              the issue tracker
            </a>
            .
          </p>
        )}

        <div className="contact-grid">
          {waHref && (
            <a
              className="card contact-item"
              href={waHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => track('contact_click', 'contact', 'whatsapp')}
            >
              <h2 className="card-title">WhatsApp</h2>
              <p className="muted small">Fastest — usually a reply the same working day.</p>
              <span className="contact-link">{CONTACT.phone || CONTACT.whatsapp}</span>
            </a>
          )}

          {CONTACT.email && (
            <a
              className="card contact-item"
              href={`mailto:${CONTACT.email}?subject=${encodeURIComponent('Question about Co-op')}`}
              onClick={() => track('contact_click', 'contact', 'email')}
            >
              <h2 className="card-title">Email</h2>
              <p className="muted small">For anything longer, or if you want a written answer.</p>
              <span className="contact-link">{CONTACT.email}</span>
            </a>
          )}

          {CONTACT.demoUrl ? (
            <a
              className="card contact-item"
              href={CONTACT.demoUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => track('demo_book', 'contact', 'calendar')}
            >
              <h2 className="card-title">Book a 20-minute call</h2>
              <p className="muted small">
                Pick a time; we will show you the app with your own products in it.
              </p>
              <span className="contact-link">Choose a time →</span>
            </a>
          ) : (
            <div className="card contact-item muted-card">
              <h2 className="card-title">Book a call</h2>
              <p className="muted small">
                No calendar link yet. Say so in your WhatsApp message and we will send two or three
                times that suit you — quicker than a booking tool nobody maintains.
              </p>
            </div>
          )}
        </div>

        {CONTACT.address && <p className="muted small address">{CONTACT.address}</p>}
      </Section>

      <Section tone="band">
        <div className="card">
          <h2 className="card-title">Before you write</h2>
          <p className="muted">
            Three things you can answer without us: <Link to="/pricing">prices are published here</Link>
            ; the <Link to="/security">security page</Link> says where your data lives and what we do
            not have; and <Link to="/signup">the trial</Link> needs no card, so you can judge the app
            before you speak to anyone.
          </p>
          <p className="muted small">
            Reporting a bug?{' '}
            <a href={ISSUES_URL} target="_blank" rel="noreferrer">
              The issue tracker
            </a>{' '}
            gets it in front of the right person fastest.
          </p>
        </div>
      </Section>
    </>
  );
}
