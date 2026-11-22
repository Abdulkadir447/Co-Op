/**
 * WCAG contrast, checked on the tokens rather than on a screenshot.
 *
 * The palette is the app's, and the app's `--primary` is tuned for *link text*
 * on a dark surface. Filling a button with it and putting white on top is only
 * 3.48:1 — under the 4.5:1 floor for normal text, and invisible to anyone who
 * is not looking for it. That is exactly the kind of thing a colour picker
 * misses and a maths check does not.
 *
 * Both themes are checked, because a dark mode that is only tested by eye is a
 * dark mode with contrast bugs.
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, '..', 'src', 'tokens.css'), 'utf8');

function block(name) {
  const start = name === 'light' ? css.indexOf(':root {') : css.indexOf("[data-theme='dark']");
  return css.slice(start, css.indexOf('}', start));
}

function token(theme, name) {
  const m = block(theme).match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`));
  assert.ok(m, `--${name} missing from the ${theme} theme`);
  return m[1];
}

/** Relative luminance, per WCAG 2.1. */
function luminance(hex) {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every pair that carries text, and the size class it is used at. */
const TEXT_PAIRS = [
  ['on-surface', 'surface', 'body text', 4.5],
  ['on-surface', 'surface-lowest', 'body text on a card', 4.5],
  ['on-surface-variant', 'surface', 'secondary text', 4.5],
  ['on-surface-variant', 'surface-lowest', 'secondary text on a card', 4.5],
  ['primary', 'surface', 'links', 4.5],
  ['primary', 'surface-lowest', 'links on a card', 4.5],
  ['on-primary', 'primary-fill', 'primary button label', 4.5],
  ['success-text', 'surface', 'success message', 4.5],
  ['warning-text', 'surface', 'warning message', 4.5],
];

for (const theme of ['light', 'dark']) {
  test(`${theme} theme: every text pair clears WCAG AA`, () => {
    for (const [fg, bg, label, min] of TEXT_PAIRS) {
      const ratio = contrast(token(theme, fg), token(theme, bg));
      assert.ok(
        ratio >= min,
        `${label} is ${ratio.toFixed(2)}:1 in ${theme} (needs ${min}:1) — ${fg} on ${bg}`,
      );
    }
  });
}

test('the primary button is filled with the token that can carry white text', () => {
  const styles = readFileSync(join(HERE, '..', 'src', 'styles.css'), 'utf8');
  const rule = styles.match(/\.btn-primary\s*\{[^}]*\}/s)[0];
  assert.match(rule, /background:\s*var\(--primary-fill\)/, 'the button must use --primary-fill');
  // --primary is for link text; using it as a fill is the specific bug.
  assert.doesNotMatch(rule, /background:\s*var\(--primary\)/);
});

test('no stylesheet rule uses the icon colour for body-sized text', () => {
  const styles = readFileSync(join(HERE, '..', 'src', 'styles.css'), 'utf8');
  // --outline is 4.29:1 on the light canvas — fine for icons, short for text.
  // One deliberate exception: a line-through decoration, not glyphs.
  const offenders = styles
    .split('\n')
    .filter((line) => /color:\s*var\(--outline\)/.test(line));
  assert.deepEqual(offenders, [], `use --on-surface-variant for text:\n${offenders.join('\n')}`);
});
