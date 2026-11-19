/**
 * Brand mark consistency.
 *
 * There are now four copies of the Co-op mark that must stay identical in
 * geometry: brand/coop-mark.svg (source of truth), the app's <CoopMark>
 * component, the website's, and the single-colour print version. They live in
 * different build targets (TS app, TS site, SVG asset, PNG assets) so they
 * cannot import each other — which means nothing but this test stops them
 * drifting apart. A drifted logo is the most visible possible bug.
 *
 * It also pins the reasons the old mark was replaced, so it cannot come back:
 * the three-petal "weave" with a white spark.
 */
import test from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The repo root, found by walking up from whatever directory this file was
 * compiled into (`tsc` puts it in test-build/test/), until the brand source
 * appears. Hard-coding `../../` breaks the moment the output layout changes.
 */
const ROOT = (() => {
  let dir = __dirname;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, 'brand', 'coop-mark.svg'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('could not find brand/coop-mark.svg above ' + __dirname);
})();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const svg = read('brand/coop-mark.svg');
const mono = read('brand/coop-mark-mono.svg');
const appMark = read('frontend/src/components/brand/CoopLogo.tsx');
const siteMark = read('website/src/App.tsx');
const siteHtml = read('website/index.html');

// The two numbers that define the mark.
const RING = 'M33.4 13.2 A14.2 14.2 0 1 0 33.4 34.8';
const CRATE = 'x="21.4" y="17.2" width="15.2" height="13.6" rx="4.8"';

test('the mark is the C that holds the shop, in every copy', () => {
  assert.ok(svg.includes(RING), 'source SVG ring geometry');
  assert.ok(svg.includes(CRATE), 'source SVG crate geometry');
  assert.ok(appMark.includes(RING), 'app component ring geometry');
  assert.ok(siteMark.includes(RING), 'website ring geometry');
  assert.ok(appMark.includes('x="21.4"'), 'app component crate geometry');
});

test('the mark uses the design system gradient, not an invented palette', () => {
  for (const file of [svg, appMark, siteMark]) {
    assert.ok(file.includes('#5b5fef'), 'gradient start');
    assert.ok(file.includes('#8a4cfc'), 'gradient end');
  }
});

test('the old three-petal weave is gone for good', () => {
    // The retired mark: three rounded rects plus a white four-point spark.
    const retired = 'M24 17 Q26.6 22.4 30.5 25 Q26.6 27.6 24 33 Q21.4 27.6 17.5 25';
  const copies: Array<[string, string]> = [
    ['app', appMark],
    ['site', siteMark],
    ['svg', svg],
  ];
  for (const [name, file] of copies) {
    assert.ok(!file.includes(retired), `${name} still renders the retired spark`);
    assert.ok(!file.includes('rect x="14" y="5"'), `${name} still renders a retired petal`);
  }
});

test('a single-colour version ships for print', () => {
  // Uses currentColor so it can be printed black or inverted without edits.
  assert.ok(mono.includes('currentColor'));
  // And it keeps a knocked-out gap, or the crate merges into the ring.
  assert.ok(mono.includes('<mask'));
});

test('every icon a browser or a phone will ask for is declared', () => {
  for (const href of [
    '/coop-mark.svg',
    '/favicon-32.png',
    '/favicon-16.png',
    '/logo.png',
    '/manifest.webmanifest',
  ]) {
    assert.ok(siteHtml.includes(href), `${href} is not linked from website/index.html`);
  }
});
