/**
 * Per-page <head>: title, description, canonical, Open Graph, and structured
 * data.
 *
 * Why this is a runtime module and not a template: the site is a static
 * prerender (scripts/prerender.mjs writes one HTML file per route, with these
 * tags already in it), and the same function runs in the browser when someone
 * navigates client-side. One implementation, so a crawler and a visitor always
 * see the same title.
 */
import { PRODUCT, SITE } from './site';
import type { RouteMeta } from './router';
import { faqSchema, softwareApplicationSchema } from './structured-data';

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function upsertJsonLd(id: string, data: unknown) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

const abs = (path: string) => `${SITE.url}${path === '/' ? '/' : path}`;

export function applyHead(route: RouteMeta) {
  if (typeof document === 'undefined') return;

  document.title = route.title;
  upsertMeta('meta[name="description"]', { name: 'description', content: route.description });
  // An alias (e.g. /signup → /trial) canonicalises to the real path, so the
  // two URLs are not indexed as duplicate content.
  upsertLink('canonical', abs(route.aliasOf ?? route.path));

  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
  upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: PRODUCT.name });
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: route.title });
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: route.description });
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: abs(route.path) });
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: abs('/og.png') });
  upsertMeta('meta[property="og:locale"]', { property: 'og:locale', content: 'en_NG' });
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: route.title });
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: route.description });
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: abs('/og.png') });

  upsertJsonLd('ld-app', softwareApplicationSchema());

  // A route with no visible FAQ must not inherit the previous page's FAQPage
  // markup: schema for questions that are not on the page is a violation, and
  // a client-side navigation used to leave it behind. <Faq> adds it back on the
  // routes that render one (its effect runs after this).
  if (route.path !== '/' && route.path !== '/pricing') clearFaqJsonLd();
}

export function setFaqJsonLd(faqs: ReadonlyArray<{ q: string; a: string }>) {
  if (typeof document === 'undefined') return;
  upsertJsonLd('ld-faq', faqSchema(faqs));
}

export function clearFaqJsonLd() {
  if (typeof document === 'undefined') return;
  document.getElementById('ld-faq')?.remove();
}
