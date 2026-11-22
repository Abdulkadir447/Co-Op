/**
 * The pricing FAQ.
 *
 * It lives outside the page component because two things need it: the page
 * renders the questions, and `scripts/prerender.mjs` writes the FAQPage
 * structured data for them into the HTML. Duplicating the list to get the
 * markup would eventually ship markup for questions that are no longer on the
 * page, which is a schema.org violation Google does check.
 *
 * Every number in here is derived from the billing catalog. A price typed into
 * prose is a price that drifts.
 */
import { BILLING_TERMS } from './site';
import { STARTER, PRO, annualMonthlyRate, annualTotal } from './prices';

/**
 * A price stated in prose must be derived from the catalog, or it is a number
 * waiting to drift. `displayPrice` gives the exact monthly/annual split the
 * pricing cards show; the FAQ reuses it.
 */

const PRICING_FAQ = [
  {
    q: 'Is there really no card for the trial?',
    a: `Correct. The ${BILLING_TERMS.trialDays}-day trial starts when you install the app. We do not take a card up front, so there is nothing to forget to cancel.`,
  },
  {
    q: 'What happens on day 11 if I do nothing?',
    a: 'The app stops accepting new entries. Every record you entered stays, readable and exportable. Nothing is charged and nothing is deleted. Subscribe later and you carry on where you stopped.',
  },
  {
    q: 'How does the annual discount work?',
    a: `Pay for twelve months up front and the monthly equivalent drops by 20%: Starter becomes ${annualMonthlyRate(
      STARTER,
    )}/month, Professional ${annualMonthlyRate(PRO)}/month. That is ${annualTotal(STARTER)} for Starter and ${annualTotal(
      PRO,
    )} for Professional, paid once.`,
  },
  {
    q: 'Do you charge per order, per user or for support?',
    a: 'No. Starter includes up to 3 users; Professional is unlimited. There is no per-order fee, no setup fee, and support is included on every paid plan.',
  },
  {
    q: 'Can I change plan later?',
    a: 'Yes, up or down. Moving down takes effect at the end of the period you have paid for; moving up is immediate and pro-rated.',
  },
  {
    q: 'Refunds?',
    a: `If Co-op does not work for your shop, email us within ${BILLING_TERMS.refundWindowDays} days of a payment and we refund it in full, no questions. After that, cancel any time and you keep access to the end of the period paid for.`,
  },
  {
    q: 'How do I pay — I do not have a dollar card?',
    a: 'You do not need one. Payment is in Naira through Paystack: any Nigerian debit card, a bank transfer, or USSD. Naira in, Naira out, no exchange rate in the middle.',
  },
  {
    q: 'Are the prices inclusive of VAT?',
    a: 'Yes. The price you see is the amount that leaves your account. VAT on your own sales is calculated on your invoices separately, at 7.5%.',
  },
];

export { PRICING_FAQ };
