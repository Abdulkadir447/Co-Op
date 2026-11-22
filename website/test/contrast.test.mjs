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
  // The states, which were never checked and that is how hover shipped at
  // 3.86:1 in dark and the CTA band shipped at 1.25:1 on hover.
  ['on-primary', 'primary-fill-hover', 'primary button label on hover', 4.5],
  ['on-primary', 'primary-fill-active', 'primary button label while pressed', 4.5],
  ['cta-btn-label', 'cta-white', 'CTA-band button label', 4.5],
  ['cta-btn-label-hover', 'cta-white', 'CTA-band button label on hover', 4.5],
  ['success-text', 'surface', 'success message', 4.5],
  ['warning-text', 'surface', 'warning message', 4.5],
];

/** A literal colour, for the one fill that is white in both themes. */
const ctaWhite = () => '#ffffff';

for (const theme of ['light', 'dark']) {
  test(`${theme} theme: every text pair clears WCAG AA`, () => {
    for (const [fg, bg, label, min] of TEXT_PAIRS) {
      const colour = (name) => (name === 'cta-white' ? ctaWhite() : token(theme, name));
      const ratio = contrast(colour(fg), colour(bg));
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

/* ── Button states ─────────────────────────────────────────────────────────── */

/**
 * The bug these tests exist for: `.btn-primary` is an `<a>`, and a bare
 * `a:hover { color: var(--primary) }` has specificity (0,1,1) — higher than
 * `.btn-primary:hover` (0,1,0). So hovering a primary button repainted its
 * white label purple on a purple fill: 1.25:1, an invisible button. Every
 * other state was unaudited, and `:active` did not exist at all, which meant a
 * press had no visual feedback beyond the browser's default.
 */
test('the generic link hover cannot override a button label', () => {
  const styles = readFileSync(join(HERE, '..', 'src', 'styles.css'), 'utf8');

  // The rule must be scoped away from anything that colours its own label.
  const generic = styles.match(/[^{}\n]*:hover\s*\{[^}]*color:\s*var\(--primary\)[^}]*\}/g) ?? [];
  const unscoped = generic.filter((rule) => /^a:hover|^\s*a:hover/.test(rule));
  assert.deepEqual(
    unscoped,
    [],
    `a bare a:hover re-colours every link-shaped button; scope it with :where(...):not(.btn):\n${unscoped.join('\n')}`,
  );
});

test('every button state is defined, not just the resting one', () => {
  const styles = readFileSync(join(HERE, '..', 'src', 'styles.css'), 'utf8');
  const states = ['hover', 'focus-visible', 'active', 'disabled'];
  for (const state of states) {
    assert.match(
      styles,
      new RegExp(`\\.btn-primary:${state}`),
      `.btn-primary has no :${state} state — a press with no feedback reads as a dead button`,
    );
  }
  // A pressed button must also move or lose its shadow, or the press is
  // invisible on a touch screen where there is no hover to compare against.
  const active = styles.match(/\.btn-primary:active\s*\{[^}]*\}/s)[0];
  assert.match(active, /transform:\s*translateY|box-shadow:\s*none/, 'pressed state needs feedback');
  // And it must re-declare its colour: a state that changes the background
  // without restating the label is how purple-on-purple happens.
  assert.match(active, /color:\s*var\(--on-primary\)/);
  // Anchored to the rule header; an unanchored search ran past the closing
  // brace and matched the *next* rule's colour, which is a false pass waiting
  // to happen.
  const hover = styles.match(/^\s*\.btn-primary:hover,[\s\S]*?\{[^}]*\}/m)[0];
  assert.match(hover, /color:\s*var\(--on-primary\)/);
});

test('the CTA band button is legible in every state it can be in', () => {
  const styles = readFileSync(join(HERE, '..', 'src', 'styles.css'), 'utf8');
  // It sits on a white fill in BOTH themes, so using --primary as its label is
  // 3.48:1 on dark before any hover is involved.
  for (const rule of styles.match(/\.cta \.btn-primary[^{]*\{[^}]*\}/gs) ?? []) {
    assert.doesNotMatch(rule, /color:\s*var\(--primary\)\s*;/, `CTA button uses --primary on white: ${rule}`);
    assert.match(rule, /color:\s*var\(--cta-btn-label(-hover)?\)/);
  }
  // Hover must not leave the label colour behind while the fill moves.
  const hover = styles.match(/\.cta \.btn-primary:hover[^{]*\{[^}]*\}/s)[0];
  assert.match(hover, /background:\s*#fff/, 'the fill must stay white in both themes');
  assert.match(hover, /color:\s*var\(--cta-btn-label-hover\)/);
});

test('no button declares !important to win a colour fight', () => {
  const styles = readFileSync(join(HERE, '..', 'src', 'styles.css'), 'utf8');
  const decls = styles
    .split('\n')
    .filter((line) => line.includes('!important') && !line.trimStart().startsWith('/*'));
  assert.deepEqual(decls, [], `!important on a colour is a specificity bug in disguise:\n${decls.join('\n')}`);
});
