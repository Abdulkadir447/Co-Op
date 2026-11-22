/**
 * Content and conversion rules, checked against the source.
 *
 * A marketing site rots quietly: someone adds a second CTA, a testimonial gets
 * invented in a hurry, the price on the site drifts from the price in the app.
 * None of that breaks a build, so it needs a test.
 *
 * These are assertions about *claims*, not about taste. Each one exists because
 * getting it wrong costs money or trust:
 *   · one primary CTA — competing CTAs reduce conversion;
 *   · no fabricated proof — a fake customer is the most damaging thing here;
 *   · prices match the billing catalog — quoting a price the product does not
 *     charge is a refund and a complaint;
 *   · every page has its own title and description — duplicate titles waste the
 *     only SEO the site has;
 *   · the honesty gates actually gate.
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const read = (p) => readFileSync(join(SITE, p), 'utf8');

/** Read width/height out of a PNG's IHDR chunk — no image library needed. */
function pngSize(file) {
  const buf = readFileSync(file);
  assert.equal(buf.subarray(1, 4).toString(), 'PNG', `${file} is not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const router = read('src/router.tsx');
const siteTs = read('src/site.ts');
const app = read('src/App.tsx');
const pages = readdirSync(join(SITE, 'src', 'pages')).map((f) => read(`src/pages/${f}`));
const allPages = pages.join('\n');
const layout = read('src/components/Layout.tsx');
const blocks = read('src/components/blocks.tsx');

/* ── The 8-page structure the brief asks for ─────────────────────────────── */

test('the site ships the eight conversion pages plus legal', () => {
  const required = [
    '/', '/pricing', '/signup', '/features', '/case-study', '/security', '/about', '/contact',
  ];
  for (const path of required) {
    assert.ok(router.includes(`path: '${path}'`), `${path} is missing from the route table`);
  }
  for (const legal of ['/privacy', '/terms', '/status']) {
    assert.ok(router.includes(`path: '${legal}'`), `${legal} is missing`);
    assert.ok(router.includes(`footer: 'Legal'`), 'legal pages belong in the footer');
  }
  // And not 20 pages: growth-phase pages are a later decision, not this commit.
  const count = (router.match(/\n    path: '/g) ?? []).length;
  assert.ok(count <= 11, `route table has ${count} entries — keep the core tight`);
});

test('legal pages are footer links, not navigation', () => {
  for (const legal of ['/privacy', '/terms', '/status']) {
    const block = router.slice(router.indexOf(`path: '${legal}'`));
    const entry = block.slice(0, block.indexOf('},'));
    assert.doesNotMatch(entry, /\bnav:/, `${legal} must not appear in the header nav`);
    assert.match(entry, /footer: 'Legal'/);
  }
});

/* ── One primary CTA ─────────────────────────────────────────────────────── */

test('the header has exactly one call to action', () => {
  const header = layout.slice(layout.indexOf('export function TopBar'), layout.indexOf('export function Footer'));
  // One label, repeated for the mobile panel and the desktop button.
  const labels = [...header.matchAll(/>\s*(Start [^<]+|Book [^<]+|Get [^<]+)\s*</g)].map((m) => m[1].trim());
  const unique = [...new Set(labels)];
  assert.deepEqual(
    unique,
    ['Start free trial'],
    `the header must offer one action, found: ${unique.join(' | ')}`,
  );
});

test('the built pages carry one primary action, named the same way', () => {
  // The old version of this test only looked at the header, and passed while
  // the CTA band said "Get started free" and the pricing cards said "Start Free
  // Trial" — three labels for one action. This reads the built HTML instead.
  const labels = new Set();
  const destinations = new Set();
  for (const file of ['index.html', 'pricing/index.html', 'features/index.html', 'about/index.html']) {
    const html = readFileSync(join(SITE, 'dist', file), 'utf8');
    for (const m of html.matchAll(/<a\b[^>]*class="[^"]*btn-primary[^"]*"[^>]*>[\s\S]{0,60}?<\/a>/g)) {
      const button = m[0];
      const text = button.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      // The accessible name is the button's real label. The compact header
      // button shows "Try free" on a phone but is announced as "Start free
      // trial" — same action, deliberately shorter where the space is 288px.
      const name = button.match(/aria-label="([^"]+)"/);
      labels.add(name ? name[1] : text);
      const href = button.match(/href="([^"]+)"/);
      if (href) destinations.add(href[1]);
    }
  }
  // One action, one name, one destination — however many times it is repeated
  // and however short the phone version has to be.
  assert.deepEqual([...labels], ['Start free trial'], `CTA labels: ${[...labels].join(' | ')}`);
  assert.deepEqual([...destinations], ['/trial'], `CTA destinations: ${[...destinations].join(' | ')}`);
});

test('the hero has one primary button and one secondary, in that order', () => {
  const hero = pages.find((p) => p.includes('function Home') || p.includes('export default function Home'));
  assert.ok(hero, 'home page not found');
  assert.match(hero, /btn btn-primary btn-lg[\s\S]{0,300}Start free trial/);
  // The secondary is a link to more information, not a competing conversion.
  assert.match(hero, /btn btn-ghost btn-lg[\s\S]{0,200}See what it does/);
  assert.doesNotMatch(hero, /Book a demo[\s\S]{0,80}btn-primary/, 'no competing primary CTA in the hero');
});

/* ── Honesty: no invented social proof ───────────────────────────────────── */

test('social proof is data-driven and starts empty, not faked', () => {
  // The arrays exist and are empty; the UI reads them rather than hard-coding
  // quotes. A hard-coded testimonial in JSX is how a fake customer ships.
  assert.match(siteTs, /export const TESTIMONIALS: Testimonial\[\] = \[\];/);
  assert.match(siteTs, /export const CUSTOMER_LOGOS: Array<\{ name: string; src: string \}> = \[\];/);
  assert.match(siteTs, /export const TEAM: Person\[\] = \[\];/);

  // No invented attribution: a quote is only real if it comes from
  // TESTIMONIALS, so no page may hard-code a named person plus praise.
  for (const page of pages) {
    assert.doesNotMatch(
      page,
      /name:\s*'[A-Z][a-z]+ [A-Z][a-z]+'[\s\S]{0,120}(quote|testimonial)/i,
      'a testimonial appears to be hard-coded rather than read from TESTIMONIALS',
    );
    assert.doesNotMatch(page, /(CEO|Founder|Owner) of [A-Z][a-z]+/);
  }
  // The proof block must fall back to an explanation, not an empty grid.
  assert.match(blocks, /No customer quotes yet/);
});

test('the site says it is a preview instead of pretending to be launched', () => {
  assert.match(siteTs, /CONTACT_IS_PLACEHOLDER/);
  assert.match(layout, /Preview build/);
  // `isPlaceholder` is now derived from whether a real host was configured, not
  // hard-coded: a literal `true` here outlived the day the host became real.
  assert.match(siteTs, /isPlaceholder:\s*!configuredUrl/);
  // And the fallback origin must be a host that resolves. `.example` is
  // reserved by RFC 2606 — canonicalising to it de-indexes the site and breaks
  // every link preview.
  const fallback = siteTs.match(/const FALLBACK_URL = '([^']+)'/);
  assert.ok(fallback, 'expected a FALLBACK_URL');
  assert.doesNotMatch(fallback[1], /\.example/, 'the fallback host must be real');
  assert.match(fallback[1], /^https:\/\//);
});

test('the case study page is honest about not having a customer yet', () => {
  const cs = read('src/pages/CaseStudy.tsx');
  assert.match(cs, /no paying customers yet|has no paying customers|not going to invent/i);
  assert.match(cs, /The first one is being written now/);
});

/* ── Prices match the billing catalog ────────────────────────────────────── */

test('prices on the site come from the billing catalog, never from copy', () => {
  // Any ₦ amount written by hand into a page is a price that can drift.
  const plans = readFileSync(join(HERE, '..', '..', 'frontend', 'src', 'billing', 'plans.ts'), 'utf8');
  for (const naira of ['25,000', '75,000']) {
    assert.ok(plans.includes(naira.replace(',', '_')) || plans.includes(naira), `catalog missing ${naira}`);
  }
  const pricing = read('src/pages/Pricing.tsx');
  assert.match(pricing, /from '\.\.\/\.\.\/\.\.\/frontend\/src\/billing\/plans'/, 'pricing page must import the catalog');
  assert.match(pricing, /displayPrice\(plan, annual\)/);
  for (const amount of ['₦25,000', '₦75,000', '₦20,000', '₦240,000']) {
    assert.ok(
      !pricing.includes(amount),
      `${amount} is typed into Pricing.tsx — read it from the catalog instead`,
    );
  }
});

/* ── SEO: one title and description per route ────────────────────────────── */

test('every route has a unique title and description', () => {
  const titles = [...router.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);
  const descriptions = [...router.matchAll(/description:\s*\n?\s*'([^']+)'/g)].map((m) => m[1]);
  assert.strictEqual(titles.length, descriptions.length, 'every route needs both a title and a description');

  // A title may repeat only where a route is declared an alias of another —
  // that is what an alias is. Anything else is two pages competing for the
  // same search result.
  const aliased = [...router.matchAll(/aliasOf: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(aliased, ['/trial'], 'only /signup → /trial is an alias');
  const duplicates = titles.filter((t, i) => titles.indexOf(t) !== i);
  assert.deepEqual(duplicates, ['Start your 10-day free trial | Co-op'], `duplicate titles: ${duplicates}`);
  for (const d of descriptions) {
    assert.ok(d.length >= 60 && d.length <= 320, `description length ${d.length} is out of range: ${d}`);
  }
});

test('structured data is generated for the product and the FAQ', () => {
  const data = read('src/structured-data.ts');
  assert.match(data, /SoftwareApplication/);
  assert.match(data, /FAQPage/);
  assert.match(data, /priceCurrency: 'NGN'/);
  // The offers read the billing catalog rather than restating a number.
  assert.match(data, /PLAN_CATALOG/);
  assert.doesNotMatch(data, /price: '\d+'/, 'offer prices must come from the catalog');
  // FAQ markup only where the questions are on screen (Google's rule).
  assert.match(blocks, /setFaqJsonLd\(items\)/);
});

test('every prerendered page has exactly one h1', () => {
  // Checked against the built HTML, because the bug this catches is invisible
  // in the source: SectionHead rendered every title as an <h2>, so nine of the
  // eleven pages shipped with no <h1> at all.
  for (const file of ['index.html', 'pricing/index.html', 'about/index.html']) {
    const html = readFileSync(join(SITE, 'dist', file), 'utf8');
    assert.strictEqual((html.match(/<h1[ >]/g) ?? []).length, 1, `${file} must have exactly one h1`);
  }
});

test('structured data is in the built HTML, not only built at runtime', () => {
  const home = readFileSync(join(SITE, 'dist', 'index.html'), 'utf8');
  const pricing = readFileSync(join(SITE, 'dist', 'pricing', 'index.html'), 'utf8');
  const blocks = (html) =>
    [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) =>
      JSON.parse(m[1]),
    );
  const homeBlocks = blocks(home);
  const pricingBlocks = blocks(pricing);
  assert.ok(homeBlocks.some((b) => b['@type'] === 'SoftwareApplication'), 'SoftwareApplication missing');
  assert.ok(homeBlocks.some((b) => b['@type'] === 'FAQPage'), 'FAQPage missing from the home page');
  assert.ok(pricingBlocks.some((b) => b['@type'] === 'FAQPage'), 'FAQPage missing from the pricing page');
  // Invisible FAQ markup is a schema violation, so the questions must be on
  // the page as text too.
  const faq = homeBlocks.find((b) => b['@type'] === 'FAQPage');
  for (const q of faq.mainEntity) {
    const visible = home.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&amp;|&quot;/g, (m) =>
      ({ '&#x27;': "'", '&amp;': '&', '&quot;': '"' })[m],
    );
    assert.ok(visible.includes(q.name), `FAQ markup for "${q.name}" has no visible question`);
  }
  // And the offer prices are the catalog's, not typed in.
  const app = homeBlocks.find((b) => b['@type'] === 'SoftwareApplication');
  assert.deepEqual(
    app.offers.map((o) => [o.name, o.price]),
    [['Starter', '25000'], ['Professional', '75000']],
  );
});

test('the build prerenders every route and emits a sitemap and robots', () => {
  const script = read('scripts/prerender.mjs');
  assert.match(script, /for \(const route of ROUTES\)/);
  assert.match(script, /sitemap\.xml/);
  assert.match(script, /robots\.txt/);
  assert.match(read('package.json'), /node scripts\/prerender\.mjs/);
});

/* ── Analytics: the four numbers from the brief ──────────────────────────── */

test('the events the brief asks for are all instrumented', () => {
  const events = read('src/analytics.ts');
  for (const e of ['cta_click', 'pricing_view', 'pricing_toggle', 'plan_select', 'signup_start', 'demo_book', 'lead_capture']) {
    assert.ok(events.includes(`'${e}'`), `event ${e} is not defined`);
  }
  // And actually fired, not just declared.
  assert.match(read('src/pages/Pricing.tsx'), /track\('pricing_view'/);
  assert.match(read('src/pages/Pricing.tsx'), /track\('pricing_toggle'/);
  assert.match(read('src/pages/Trial.tsx'), /track\('signup_start'/);
});

/* ── Objection handling ──────────────────────────────────────────────────── */

test('the FAQ covers price, cancellation, migration and security', () => {
  for (const topic of [/cost|price|₦/i, /cancel/i, /import|move my existing/i, /data, and who can see|safe|encrypt/i]) {
    assert.match(siteTs, topic, `the FAQ is missing an answer about ${topic}`);
  }
  // And it is rendered on the home page, not buried on a page nobody reads.
  assert.match(read('src/pages/Home.tsx'), /<Faq items=\{FAQ/);
});

test('a path exists for visitors who are not ready to buy', () => {
  assert.match(read('src/pages/Home.tsx'), /<LeadCapture/);
  assert.match(blocks, /Send me the guide/);
  assert.match(siteTs, /LEAD_MAGNET/);
});

/* ── The things the brief says to skip ───────────────────────────────────── */

test('the site skips the things the brief says to skip', () => {
  for (const [name, source] of [['pages', allPages], ['layout', layout], ['blocks', blocks]]) {
    assert.doesNotMatch(source, /carousel|autoplay\b/i, `${name} should not use a carousel or autoplay`);
    assert.doesNotMatch(source, /seamless|robust|cutting-edge|synerg/i, `${name} uses jargon`);
    assert.doesNotMatch(source, /coming soon/i, `${name} gates something behind "coming soon"`);
  }
  // No autoplaying audio anywhere.
  assert.doesNotMatch(allPages, /<audio[^>]*autoplay/);
});

test('no page is gated behind a form', () => {
  // Pricing, features and security must be readable with no email at all.
  for (const page of ['Pricing', 'Features', 'Security']) {
    const src = read(`src/pages/${page}.tsx`);
    assert.doesNotMatch(src, /<form[^>]*>[^<]*<input[^>]*type="email"[^>]*required/, `${page} is gated`);
  }
});

/* ── Product screenshots ──────────────────────────────────────────────────── */

test('every screenshot on the site exists, is the size the markup claims, and is labelled a mock', () => {
  const shot = read('src/components/blocks.tsx');
  const dir = join(SITE, 'public', 'screenshots');
  const files = readdirSync(dir).filter((f) => f.endsWith('.png'));
  assert.ok(files.length >= 2, 'expected the dashboard and receivables shots');

  for (const name of files) {
    // Referenced at all? `AppPreview` picks its file with a ternary, so the
    // name appears as a literal inside src={…} rather than after `src="`.
    const at = shot.indexOf(`/screenshots/${name}`);
    assert.ok(at > 0, `${name} is in public/ but nothing references it`);

    const { width, height } = pngSize(join(dir, name));
    // Width/height attributes are what reserve the box before the PNG decodes.
    // If they drift from the file, the hero shifts as it loads.
    const near = shot.slice(at, at + 700);
    const w = near.match(/width=\{(\d+)\}/);
    const h = near.match(/height=\{(\d+)\}/);
    assert.ok(w && h, `${name} needs explicit width and height attributes`);
    assert.equal(Number(w[1]), width, `${name}: attribute says ${w[1]}px, file is ${width}px`);
    assert.equal(Number(h[1]), height, `${name}: attribute says ${h[1]}px, file is ${height}px`);
  }

  // The honest bit. A screenshot that does not admit to being a mock is a fake
  // screenshot, which is the one thing this site must not ship.
  const captions = [...shot.matchAll(/shot-note[\s\S]{0,220}?<\/figcaption>/g)].map((m) => m[0]);
  assert.ok(captions.length >= 2, 'every figure needs a caption');
  for (const caption of captions) {
    assert.match(caption, /[Mm]ock/, `caption must say it is a mock: ${caption.slice(0, 80)}`);
  }

  // Alt text describes the screen, not the file. Scoped to the figures: the
  // testimonial and About avatars in this same file correctly use alt="" —
  // they are decorative, because the name is right beside them.
  const figures = [...shot.matchAll(/<figure className="shot"[\s\S]*?<\/figure>/g)].map((m) => m[0]);
  assert.equal(figures.length, 2, 'expected exactly the two product figures');
  for (const figure of figures) {
    const alt = (figure.match(/alt="([^"]*)"/) || [])[1];
    assert.ok(alt && alt.length > 30, `product image needs descriptive alt text: ${JSON.stringify(alt)}`);
    assert.doesNotMatch(alt, /\.png|screenshot of/i, 'alt must describe the screen, not the file');
  }
});

test('the site ships no CSS mock of the dashboard any more', () => {
  const app = read('src/components/blocks.tsx');
  // The old mock was divs with hard-coded Naira amounts. If it comes back, the
  // numbers on the marketing site are invented again — which is exactly the
  // thing `AppPreview` replaced it to avoid.
  assert.doesNotMatch(app, /className="kpis"/);
  assert.doesNotMatch(app, /₦1,240,500/);
  assert.doesNotMatch(read('src/styles.css'), /\.k-value\s*\{/);
});
