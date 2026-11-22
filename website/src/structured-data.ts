/**
 * Structured data (schema.org) for the site.
 *
 * Pure functions with no DOM access, because the same JSON has to be produced
 * in two places: `scripts/prerender.mjs` writes it into each page's HTML at
 * build time, and `head.ts` writes it into the document when someone navigates
 * client-side. Keeping one implementation is what stops the two disagreeing —
 * and it is the reason this is a separate module: it was previously built by a
 * `useEffect`, which never runs in a server render, so the built pages shipped
 * with no structured data at all despite the tests passing.
 */
import { PRODUCT, SITE } from './site';
import { PLAN_CATALOG } from '../../frontend/src/billing/plans';

/**
 * Structured data, scoped to what the page actually is.
 *
 * SoftwareApplication on every page describes the product (name, price range,
 * platform). FAQPage only on pages that really carry the FAQ — Google's own
 * guidance is explicit that FAQ markup on pages without visible Q&A is a
 * violation, so it is not sprinkled everywhere.
 */
export function softwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: PRODUCT.name,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Inventory and order management',
    operatingSystem: 'Windows',
    description: PRODUCT.tagline,
    url: SITE.url,
    // Prices come from the billing catalog, never from copy: Google will show
    // these to a searcher, and a stale number here is a stale number in a
    // search result.
    offers: PLAN_CATALOG.filter((plan) => plan.priceMonthly).map((plan) => ({
      '@type': 'Offer',
      name: plan.name,
      price: String(plan.priceMonthly),
      priceCurrency: 'NGN',
      description: 'Billed monthly. 10-day free trial, no card required.',
    })),
  };
}

export function faqSchema(faqs: ReadonlyArray<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
