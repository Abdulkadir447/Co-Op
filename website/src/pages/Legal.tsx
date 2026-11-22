/**
 * Privacy, Terms and Status.
 *
 * These three are footer links, not navigation (per the brief). They are
 * written to be read rather than to be defensible in court: short, in plain
 * English, and with the same honesty as the rest of the site — including the
 * limits of what we can promise.
 *
 * NOTE TO THE OWNER: these describe what the software actually does today
 * (verified against the code: EU Postgres, Clerk sign-in, Paystack payments,
 * 30-day deletion window, encrypted backups). They are not a substitute for a
 * lawyer's review before taking real money.
 */
import { Link } from '../router';
import { Section, SectionHead } from '../components/Layout';
import { CONTACT, BILLING_TERMS, STATUS_URL } from '../site';

export function Privacy() {
  return (
    <Section className="legal">
      <SectionHead
        as="h1"
        eyebrow="Legal"
        title="Privacy policy"
        lede="Short version: your records are yours, we do not sell them, and you can take them with you at any time."
      />
      <div className="prose">
        <h2>What we collect</h2>
        <p>
          <strong>Your account:</strong> an email address and a display name, plus a user identifier from
          our sign-in provider (Clerk). We never see or store your password.
        </p>
        <p>
          <strong>Your business records:</strong> the products, stock movements, orders, customers,
          invoices, payments and team members you enter. These belong to you.
        </p>
        <p>
          <strong>Billing:</strong> handled by Paystack. We receive a reference, the amount and the
          status of a payment. We do not see or store card numbers.
        </p>
        <p>
          <strong>Operational logs:</strong> requests to our API, with the business id, the route and the
          result, kept to diagnose faults and detect abuse.
        </p>
        <p>
          <strong>This website:</strong> no advertising or tracking cookies. If analytics is enabled it
          records page paths and which button was clicked, not who you are.
        </p>

        <h2>What we do with it</h2>
        <p>
          Run the product, keep your data available to you, bill you, and fix faults. We do not sell
          data, do not share it with advertisers, and do not use your records to train a model that
          serves anyone else.
        </p>

        <h2>Where it lives</h2>
        <p>
          On your own computer, and in a Postgres database hosted by Supabase in the EU (Frankfurt).
          Every request is authorised against your business on the server; there is no client-side path
          to the database.
        </p>

        <h2>Subprocessors</h2>
        <p>Supabase (database and file storage), Clerk (sign-in), Paystack (payments). That is the whole list.</p>

        <h2>How long we keep it</h2>
        <p>
          While your account exists, plus 30 days after you ask us to delete it, so a mistaken deletion
          can be undone. Encrypted backups roll off within 35 days. Where Nigerian tax law requires
          financial records to be kept longer, we will tell you which records and for how long.
        </p>

        <h2>Your rights</h2>
        <p>
          Export everything from Settings as CSV, at any time, without asking. Ask us to correct or
          delete your data at <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>. If you are in a
          jurisdiction with a data-protection regulator, you can complain to it; we would rather you
          told us first.
        </p>

        <h2>Children</h2>
        <p>Co-op is business software and is not directed at anyone under 18.</p>

        <h2>Changes</h2>
        <p>
          If this policy changes materially we will email the address on your account before the change
          takes effect.
        </p>
      </div>
    </Section>
  );
}

export function Terms() {
  return (
    <Section className="legal">
      <SectionHead
        as="h1"
        eyebrow="Legal"
        title="Terms of service"
        lede="The deal, in plain English. If something here is unfair to you, tell us — this is not a document we are hiding behind."
      />
      <div className="prose">
        <h2>The trial</h2>
        <p>
          {BILLING_TERMS.trialDays} days, no card. Nothing is charged when it ends; the app stops
          accepting new entries until you choose a plan. Your records stay readable and exportable
          either way.
        </p>

        <h2>Plans and payment</h2>
        <p>
          Starter is ₦25,000 a month, Professional ₦75,000 a month, both 20% cheaper billed yearly.
          Prices are in Naira, include VAT, and are billed through Paystack. We will give 30 days’ notice
          before changing a price, and the new price only applies from your next billing period.
        </p>

        <h2>Cancelling</h2>
        <p>
          Cancel from inside the app or by email, any time. Cancelling stops the next charge; you keep
          access until the end of the period you have paid for. Nothing is deleted when you cancel.
        </p>

        <h2>Refunds</h2>
        <p>
          Email within {BILLING_TERMS.refundWindowDays} days of a payment and we refund it in full.
          After that, cancel and keep access to the end of the paid period.
        </p>

        <h2>Your data and your responsibilities</h2>
        <p>
          You own your records. You are responsible for who you give access to inside your business, for
          the accuracy of what you enter, and for keeping your sign-in credentials safe. Export a copy
          regularly if the records matter to you — Settings has a one-button export.
        </p>

        <h2>What we promise, and what we do not</h2>
        <p>
          We aim for the app to be available whenever you need it, and the offline design means a
          network outage does not stop you selling. What we do not promise is uninterrupted service:
          there is no SLA on Starter or Professional, and no public uptime history yet.
        </p>
        <p>
          To the extent the law allows, our liability for any claim is limited to what you paid us in
          the previous twelve months. We do not exclude liability for fraud or for anything that cannot
          lawfully be excluded.
        </p>

        <h2>Acceptable use</h2>
        <p>
          Do not use Co-op to break the law, to store other people’s data without their permission, or to
          attack the service. We can suspend an account that does, and we will tell you why.
        </p>

        <h2>Ending it</h2>
        <p>
          You can leave any time; ask and we will delete your data as described in the{' '}
          <Link to="/privacy">privacy policy</Link>. We can end an account for non-payment or abuse,
          with notice and with an export offered first.
        </p>

        <h2>Law</h2>
        <p>
          These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of
          Nigeria have jurisdiction.
        </p>
      </div>
    </Section>
  );
}

export function Status() {
  return (
    <Section className="legal">
      <SectionHead
        as="h1"
        eyebrow="Status"
        title="Uptime, honestly"
        lede="There is no public status page yet, so this page says what is monitored and what is not, rather than showing a green light nobody maintains."
      />
      <div className="prose">
        {STATUS_URL ? (
          <p>
            Live uptime and incident history: <a href={STATUS_URL}>{STATUS_URL}</a>
          </p>
        ) : (
          <>
            <h2>What is monitored today</h2>
            <p>
              The API exposes a health endpoint that the deployment checks on every start and that
              returns the database connection state. If the API cannot reach the database, that check
              fails.
            </p>

            <h2>What is not</h2>
            <p>
              There is no historical uptime record published, no automatic external probe from a second
              region, and no incident feed you can subscribe to. If you need those before you buy, we
              are not there yet — that is a fair reason to wait.
            </p>

            <h2>If something breaks</h2>
            <p>
              Email <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> or message us on WhatsApp.
              Because the app works offline, you can keep selling while the server is down, and the
              records sync when it returns.
            </p>
          </>
        )}
      </div>
    </Section>
  );
}
