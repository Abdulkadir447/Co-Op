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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

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
