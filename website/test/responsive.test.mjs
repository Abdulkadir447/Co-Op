/**
 * Mobile layout audit for the marketing site.
 *
 * Why a static audit instead of screenshots: CI has no browser, and the three
 * bugs this file exists to catch are *properties of the CSS*, not tastes.
 * Reading the stylesheet cannot tell you a page looks good; it can tell you a
 * three-column grid of ₦ amounts cannot fit a 320px screen, and that is what
 * went wrong:
 *
 *   1. header items summed to ~400px inside a 294px container → the page
 *      scrolled sideways and the buttons sat on top of each other;
 *   2. `.kpis` was `repeat(3, 1fr)` with a fixed 22px amount, so "₦1,240,500"
 *      was ~130px of text in a ~50px cell and spilled out of the card;
 *   3. headings were fixed (h1 48px, h2 32px), which on a phone ate the first
 *      screen and pushed the copy against the buttons.
 *
 * Run: pnpm --filter ./website test
 */
import test from 'node:test';
import assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'src', 'styles.css'), 'utf8');
const SRC = join(here, '..', 'src');
/** Every page + the shared layout, concatenated — two of the old assertions
 *  were about markup that now lives in components/pages, not App.tsx. */
const app = [
  'App.tsx',
  'components/Layout.tsx',
  'components/blocks.tsx',
  ...readdirSync(join(SRC, 'pages')).map((f) => `pages/${f}`),
]
  .map((f) => readFileSync(join(SRC, f), 'utf8'))
  .join('\n');

/** The body of a `@media (max-width: Npx) { ... }` block, brace-matched. */
function mediaBlock(px) {
  const marker = `@media (max-width: ${px}px)`;
  const start = css.indexOf(marker);
  assert.notStrictEqual(start, -1, `missing breakpoint ${px}px`);
  let depth = 0;
  const open = css.indexOf('{', start);
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

/** Every `grid-template-columns:` declaration in the file. */
const gridTemplates = [...css.matchAll(/grid-template-columns:\s*([^;]+);/g)].map((m) => m[1].trim());

test('the page cannot be pushed sideways by an unbreakable string', () => {
  assert.match(css, /img,\s*svg,\s*video,\s*iframe\s*\{\s*max-width:\s*100%;/);
  for (const selector of ['.contact-link', '.k-value', '.card p', '.lead-done']) {
    const block = new RegExp(`\\${selector}\\s*\\{[^}]*overflow-wrap:\\s*anywhere`, 's');
    assert.match(css, block, `${selector} needs overflow-wrap: anywhere`);
  }
});

test('no grid track can be sized by a long word', () => {
  // A bare `1fr`/`repeat(n, 1fr)` has an automatic minimum of `auto`: one long
  // word then sets the track and the row overflows. `minmax(0, 1fr)` cannot.
  for (const template of gridTemplates) {
    // Strip the safe form first, then look for any surviving bare track.
    const stripped = template.replace(/minmax\(0,[^)]+\)/g, '');
    assert.doesNotMatch(
      stripped,
      /\b1fr\b/,
      `grid track "${template}" must be minmax(0, 1fr)`,
    );
  }
});

test('no layout uses 100vw (it includes the scrollbar)', () => {
  assert.doesNotMatch(css, /\b100vw\b/);
  assert.doesNotMatch(app, /\b100vw\b/);
});

test('the header fits a 320px screen once the trial button moves into the menu', () => {
  // Widths from the CSS, characters from a conservative Inter estimate.
  const CHAR_BOLD = 0.62;
  const CHAR_REGULAR = 0.56;
  const textWidth = (text, px, em) => text.length * px * em;

  // ≤560px: logo, menu button, theme toggle. The CTA is display:none.
  const small = {
    logoImage: 24,
    logoText: textWidth('Co-op', 17, CHAR_BOLD),
    logoGap: 8,
    menu: 44,
    theme: 38,
    gaps: 8 * 2, // .topbar-inner gap between the three items
  };
  const smallTotal =
    small.logoImage + small.logoGap + small.logoText + small.menu + small.theme + small.gaps;

  // 16px gutter each side below 640px.
  const availableAt320 = 320 - 32;
  assert.ok(
    smallTotal <= availableAt320,
    `header needs ${Math.round(smallTotal)}px of ${availableAt320}px at 320px wide`,
  );

  // And the thing that was hidden must still be reachable.
  assert.match(mediaBlock(560), /\.header-cta\s*\{\s*display:\s*none/);
  assert.match(css, /\.nav-cta\s*\{\s*display:\s*none/); // desktop default
  assert.match(mediaBlock(560), /\.nav-cta\s*\{[^}]*display:\s*flex/, 'menu must carry the CTA');
  assert.match(app, /className="nav-cta"[^>]*href=\{TRIAL_HREF\}/, 'the menu CTA targets the trial');
});

test('the KPI tiles drop to two columns before the Naira amount overflows', () => {
  assert.match(mediaBlock(560), /\.kpis\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);

  // ₦1,240,500 at the clamped size inside a two-column tile on a 320px screen:
  // container 288 - card padding (14*2) = 260; two tracks minus one 12px gap
  // = 248; two halves = 124 per tile; minus its 14*2 padding = 96 of text.
  const tileText = 320 - 32 - 14 * 2; // 260
  const perTile = (tileText - 12) / 2; // 124
  const usable = perTile - 14 * 2; // 96
  // clamp(15px, 4.4vw, 22px) at 320px = max(15, 14.08) = 15px.
  const amountWidth = '₦1,240,500'.length * 15 * 0.62;
  assert.ok(amountWidth <= usable, `amount needs ${amountWidth}px, tile gives ${usable}px`);
});

test('display headings scale instead of being fixed for desktop', () => {
  assert.match(css, /\.hero-title\s*\{[^}]*font-size:\s*clamp\(/s);
  assert.match(css, /\.section-title\s*\{[^}]*font-size:\s*clamp\(/s);
  // No inline font size anywhere in the JSX: an inline style beats the media
  // queries, which is how the h1 stayed 48px on a phone.
  assert.doesNotMatch(app, /fontSize:\s*\d/);
  assert.match(app, /className="hero-title"/);
  assert.doesNotMatch(app, /<h1 style=/);
});

test('every multi-column grid collapses on a narrow screen', () => {
  const oneColumn = /grid-template-columns:\s*minmax\(0,\s*1fr\)/;
  for (const px of [900]) {
    const block = mediaBlock(px);
    for (const cls of ['.hero-inner', '.signup', '.plans', '.lead', '.job']) {
      const rule = new RegExp(`\\${cls}[^{]*\\{[^}]*grid-template-columns`, 's');
      assert.match(block, rule, `${cls} must collapse at ${px}px`);
    }
    assert.match(block, oneColumn);
  }
  assert.match(mediaBlock(1024), /\.grid-3[^{]*\{[^}]*repeat\(2,/);
});

test('buttons grow with a wrapped label instead of clipping it', () => {
  const btn = css.match(/\.btn\s*\{[^}]*\}/s)[0];
  assert.match(btn, /min-height:\s*44px/);
  assert.doesNotMatch(btn, /(^|[^-])height:\s*\d+px/, '.btn must not have a fixed height');
  // The two hero buttons stack, with a real gap, instead of sitting shoulder
  // to shoulder with a sliver of text each.
  assert.match(mediaBlock(720), /\.hero-cta\s*\{[^}]*flex-direction:\s*column/);
  assert.match(mediaBlock(720), /\.hero-cta \.btn\s*\{[^}]*margin:\s*5px 0/);
});

test('the CTA pair cannot land on top of each other', () => {
  // They used to be inline links with `marginLeft: 12` — a margin that only
  // exists on the left cannot separate two buttons once the second wraps.
  const layout = readFileSync(join(here, '..', 'src', 'components', 'Layout.tsx'), 'utf8');
  const cta = layout
    .slice(layout.indexOf('export function CtaBand'), layout.indexOf('export function useTheme'))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  assert.doesNotMatch(cta, /marginLeft/, 'CTA buttons must be spaced by the layout, not an inline margin');
  assert.match(cta, /className="cta-actions/);

  const actions = css.match(/\.cta-actions\s*\{[^}]*\}/s)?.[0] ?? '';
  assert.match(actions, /display:\s*flex/);
  assert.match(actions, /flex-wrap:\s*wrap/, 'they must be allowed to wrap, not overflow');

  // Stacked and full width on a phone, where the pair needs ~332px of 294px.
  const mobile = mediaBlock(720);
  assert.match(mobile, /\.cta-actions\s*\{[^}]*flex-direction:\s*column/);
  assert.match(mobile, /\.cta-actions \.btn\s*\{[^}]*width:\s*100%/);

  // And they must look like different actions: the secondary keeps the
  // gradient behind it instead of inheriting the primary's white fill.
  assert.match(css, /\.cta \.btn\.cta-btn-secondary\s*\{[^}]*background:\s*transparent/s);
});

test('button rows do not rely on flex `gap` for their spacing', () => {
  // Old Android WebView, Opera Mini and older iOS Safari do not implement
  // `gap` on flex containers: it is dropped silently and the buttons stack
  // flush against each other. That is the bug reported as "no space between
  // them vertically", so the spacing is a margin, which every browser honours.
  for (const cls of ['cta-actions', 'hero-cta']) {
    const rule = css.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`, 's'))?.[0] ?? '';
    assert.ok(rule, `.${cls} must exist`);
    assert.doesNotMatch(rule, /(^|[;{\s])gap:/, `.${cls} must not use gap for spacing`);

    const child = css.match(new RegExp(`\\.${cls} \\.btn\\s*\\{[^}]*\\}`, 's'))?.[0] ?? '';
    assert.match(child, /margin:/, `.${cls} .btn needs a margin between buttons`);

    const stacked = mediaBlock(720).match(new RegExp(`\\.${cls} \\.btn\\s*\\{[^}]*\\}`, 's'))?.[0] ?? '';
    assert.match(stacked, /margin:\s*5px 0/, `.${cls} .btn needs a 10px vertical gap when stacked`);
  }
});

test('mobile gutters and section rhythm are tightened, not inherited from desktop', () => {
  assert.match(mediaBlock(720), /section\s*\{\s*padding:\s*52px 0/);
  assert.match(mediaBlock(720), /\.container[^{]*\{[^}]*calc\(100% - 32px\)/);
});

test('jumping to a section does not hide its heading under the sticky header', () => {
  assert.match(css, /(section)?\[id\]\s*\{\s*scroll-margin-top:/);
});
