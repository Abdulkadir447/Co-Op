/**
 * The site's tokens must match the app's tokens.
 *
 * `src/tokens.css` is a committed copy of `frontend/src/theme/*`, made
 * alongside the app it describes. A copy drifts — someone adjusts a brand
 * colour in the product, the site keeps the old one, and the two stop looking
 * like the same company. This test is what keeps the copy honest.
 *
 * It reads the TypeScript token modules as text (no bundler, no build step)
 * and compares the values that matter: the brand palette, the radii, the
 * shadows, and the AI gradient.
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const ROOT = join(HERE, '..', '..');
const read = (p) => readFileSync(join(SITE, p), 'utf8');

const css = readFileSync(join(HERE, '..', 'src', 'tokens.css'), 'utf8');
const light = readFileSync(join(ROOT, 'frontend', 'src', 'theme', 'colors.ts'), 'utf8');
const dark = readFileSync(join(ROOT, 'frontend', 'src', 'theme', 'dark.ts'), 'utf8');
const tokens = readFileSync(join(ROOT, 'frontend', 'src', 'theme', 'tokens.ts'), 'utf8');

/** Pull `name: '#rrggbb'` out of a token module. */
function token(src, name) {
  const m = src.match(new RegExp(`\\b${name}:\\s*'(#[0-9a-fA-F]{6})'`));
  assert.ok(m, `could not find ${name} in the app tokens`);
  return m[1].toLowerCase();
}

/** Pull `--name: #rrggbb` out of the site stylesheet. */
function declared(name) {
  const block = css.slice(css.indexOf(':root {'));
  const m = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`));
  assert.ok(m, `--${name} is not declared in website/src/tokens.css`);
  return m[1].toLowerCase();
}

const PAIRS = [
  ['primary', 'primary'],
  ['on-primary', 'onPrimary'],
  ['primary-container', 'primaryContainer'],
  ['secondary-container', 'secondaryContainer'],
  ['primary-fixed', 'primaryFixed'],
  ['on-primary-fixed-variant', 'onPrimaryFixedVariant'],
  ['surface', 'surface'],
  ['surface-lowest', 'surfaceContainerLowest'],
  ['on-surface', 'onSurface'],
  ['on-surface-variant', 'onSurfaceVariant'],
  ['outline', 'outline'],
  ['outline-variant', 'outlineVariant'],
  ['border-subtle', 'borderSubtle'],
  ['success', 'success'],
  ['success-text', 'successText'],
  ['warning', 'warning'],
  ['warning-text', 'warningText'],
];

test('every colour on the site matches the app light palette', () => {
  for (const [cssName, tsName] of PAIRS) {
    assert.strictEqual(declared(cssName), token(light, tsName), `--${cssName} drifted from colors.${tsName}`);
  }
});

test('the dark palette matches the app dark palette', () => {
  const block = css.slice(css.indexOf("[data-theme='dark']"));
  for (const [cssName, tsName] of [
    ['primary', 'primary'],
    ['surface', 'surface'],
    ['on-surface', 'onSurface'],
    ['border-subtle', 'borderSubtle'],
    ['success', 'success'],
  ]) {
    const m = block.match(new RegExp(`--${cssName}:\\s*(#[0-9a-fA-F]{6});`));
    assert.ok(m, `--${cssName} missing from the dark block`);
    assert.strictEqual(m[1].toLowerCase(), token(dark, tsName), `dark --${cssName} drifted from dark.${tsName}`);
  }
});

test('radii match the app shape language', () => {
  // Scope to the `radius` object: `spacing` also has sm/md/lg/xl keys, and
  // matching the first one in the file compared the wrong scale.
  const radiusBlock = tokens.slice(tokens.indexOf('export const radius'));
  const radius = (name) => {
    const m = radiusBlock.slice(0, radiusBlock.indexOf('} as const')).match(new RegExp(`\\b${name}:\\s*(\\d+)`));
    assert.ok(m, `radius.${name} not found`);
    return m[1];
  };
  for (const name of ['sm', 'md', 'lg', 'xl']) {
    const m = css.match(new RegExp(`--radius-${name}:\\s*(\\d+)px;`));
    assert.ok(m, `--radius-${name} missing`);
    assert.strictEqual(m[1], radius(name), `--radius-${name} drifted from radius.${name}`);
  }
});

test('the brand gradient is the app gradient', () => {
  const gradient = light.match(/aiGradient\s*=\s*'([^']+)'/)[1];
  const stops = [...gradient.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toLowerCase());
  const declaredStops = [...css.match(/--ai-gradient:[^;]+;/)[0].matchAll(/#[0-9a-fA-F]{6}/g)].map((m) =>
    m[0].toLowerCase(),
  );
  assert.deepEqual(declaredStops, stops, 'the site gradient is not the app gradient');
});

test('the font stack is the app font stack', () => {
  const typography = readFileSync(join(ROOT, 'frontend', 'src', 'theme', 'typography.ts'), 'utf8');
  const inter = typography.includes("'Inter'");
  assert.ok(inter, 'the app uses Inter; check typography.ts before changing this test');
  assert.match(css, /--font:\s*'Inter'/, 'the site must use the same font family');
});

// ── The palette has to actually ship ────────────────────────────────────────

/**
 * `tokens.css` was read by every other test in this folder and imported by
 * nothing. 148 `var(--…)` uses compiled against zero definitions, the theme
 * toggle flipped `data-theme` on an already-dark-less stylesheet, and the whole
 * suite passed because it checked the file on disk instead of the bundle.
 *
 * These tests assert the two things that were false: that the token sheet is
 * wired into the stylesheet the browser loads, and that both palettes define
 * every property the layout uses. The built-CSS check in the second test is the
 * one that would have caught it.
 */
test('the stylesheet imports the design tokens, first', () => {
  const css = read('src/styles.css');
  const firstImport = css.match(/@import\s+'([^']+)'/);
  assert.ok(firstImport, 'styles.css must @import the token sheet');
  assert.equal(firstImport[1], './tokens.css', 'tokens must be the first import');
  // It must precede any *rule* that reads a variable. Comments are stripped
  // first: the doc block above the import explains `var(--…)` in prose, and
  // matching that would make the assertion fail on its own documentation.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    withoutComments.indexOf(firstImport[0]) < withoutComments.indexOf('var(--'),
    'the import must precede the first var() use',
  );
});

test('every custom property the layout reads is defined, in both palettes', () => {
  const styles = read('src/styles.css');
  const tokens = read('src/tokens.css');
  const used = new Set([...styles.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]));
  assert.ok(used.size > 20, 'expected the layout to use the token set');

  const lightBlock = tokens.slice(tokens.indexOf(':root'), tokens.indexOf("[data-theme='dark']"));
  const darkBlock = tokens.slice(tokens.indexOf("[data-theme='dark']"));
  const defs = (block) => new Set([...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));

  const light = defs(lightBlock);
  const dark = defs(darkBlock);

  // Everything must resolve from :root, which cascades into both themes.
  assert.deepEqual([...used].filter((p) => !light.has(p)), [], 'used but missing from :root');

  // The dark block only needs to restate colour. Type and geometry (--font,
  // --radius-*) are palette-independent on purpose — restating them invites
  // them drifting apart, and this test would then be asserting the bug.
  // --ai-gradient is a brand gradient with fixed hex stops: it is the same
  // swatch in both themes, so restating it would only let the two drift.
  const PALETTE_FREE = new Set([
    '--font',
    '--radius-sm',
    '--radius-md',
    '--radius-lg',
    '--radius-full',
    '--radius-xl',
    '--ai-gradient',
  ]);
  const themed = [...used].filter((p) => !PALETTE_FREE.has(p));
  assert.deepEqual(
    themed.filter((p) => !dark.has(p)),
    [],
    'colour used but missing a dark value — the toggle would flip to nothing',
  );
});

test('the built stylesheet contains the token sheet, not just its consumers', () => {
  // This is the assertion that was absent. It is deliberately weak on values and
  // strong on presence: if the import is severed, this fails and says why.
  const assets = join(SITE, 'dist/assets');
  if (!existsSync(assets)) return; // `pnpm test` without a build: covered above.
  const css = readdirSync(assets)
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(join(assets, f), 'utf8'))
    .join('\n');
  assert.ok(css.length > 0, 'expected a built stylesheet');
  assert.match(css, /--primary\s*:\s*#4143d5/i, 'light --primary missing from the bundle');
  assert.match(css, /\[data-theme=['"]?dark['"]?\]/, 'dark palette missing from the bundle');
});
