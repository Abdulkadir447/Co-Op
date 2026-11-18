/**
 * Design-token and accessibility invariants that a type checker cannot see.
 *
 * These are cheap, deterministic guards against the exact regressions the
 * frontend review found (docs/FRONTEND_REVIEW_2026-10-23.md):
 *
 *   A9  fractional font sizes (12.5px) — soft text on every screen
 *   A10 `colors.outline` used as a TEXT colour — 4.29:1, below the 4.5:1 AA
 *       floor for body text; it is legal for borders and icons (3:1)
 *   A1  a missing `<html lang>` on the app shell
 *   A4  a semantic TEXT token that has drifted below 4.5:1
 *
 * They read the source tree rather than importing components, because most of
 * these values only exist inside JSX style objects at runtime. A failure here
 * names the file and line so the fix is mechanical.
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { colors } from '../src/theme/colors';
import { type } from '../src/theme/typography';
import { darkColors } from '../src/theme/dark';

// Compiled to CommonJS by `npm test`, so use __dirname rather than
// import.meta (which tsc rejects under --module commonjs). The build lands in
// test-build/test/, two levels below frontend/.
const FRONTEND_ROOT = resolve(__dirname, '../..');
const SRC = join(FRONTEND_ROOT, 'src');
const APP_HTML = join(FRONTEND_ROOT, 'index.html');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(full)) out.push(full);
  }
  return out;
}

const files = walk(SRC).map((path) => ({
  path: relative(SRC, path).replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8'),
}));

/** Line numbers of every match, 1-based, so a failure points at the code. */
function linesMatching(re: RegExp): string[] {
  const hits: string[] = [];
  for (const file of files) {
    file.text.split('\n').forEach((line, i) => {
      if (re.test(line)) hits.push(`${file.path}:${i + 1}  ${line.trim().slice(0, 90)}`);
    });
  }
  return hits;
}

// --- WCAG contrast helper (same formula as the review) ----------------------
const luminance = (hex: string): number => {
  const c = hex.replace('#', '');
  const channel = (i: number) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('no fractional font sizes (they render soft on fractional device pixels)', () => {
  const hits = linesMatching(/fontSize:\s*\d+\.\d+/);
  assert.deepStrictEqual(hits, [], `Fractional font sizes found:\n${hits.join('\n')}`);
});

test('colors.outline is never used as TEXT (4.29:1, below the 4.5:1 AA floor)', () => {
  // A text style is a `...type.*` spread on the same line as the colour.
  // Borders, icon strokes and placeholder glyphs legitimately keep `outline`.
  const hits = linesMatching(/\.\.\.type\.[A-Za-z]+.*color:\s*colors\.outline\b/);
  assert.deepStrictEqual(hits, [], `Use colors.onSurfaceMuted for text:\n${hits.join('\n')}`);
});

test('the app shell declares a language', () => {
  const html = readFileSync(APP_HTML, 'utf8');
  assert.match(html, /<html[^>]*\slang="[a-z]{2}/i, 'index.html needs <html lang="en">');
});

test('semantic TEXT tokens clear 4.5:1 on the surfaces they are drawn on', () => {
  const pairs: Array<[string, string, string]> = [];
  for (const [name, palette] of [
    ['light', colors],
    ['dark', darkColors],
  ] as const) {
    const surface = palette.surface;
    for (const token of ['successText', 'warningText', 'infoText', 'errorText', 'onSurfaceMuted'] as const) {
      pairs.push([`${name}.${token}`, (palette as Record<string, string>)[token], surface]);
    }
  }
  const failures = pairs
    .map(([label, fg, bg]) => ({ label, ratio: contrast(fg, bg) }))
    .filter((p) => p.ratio < 4.5)
    .map((p) => `${p.label} = ${p.ratio.toFixed(2)}:1 (needs 4.5:1)`);

  assert.deepStrictEqual(failures, [], `Contrast regressions:\n${failures.join('\n')}`);
});

test('every type token carries a px line-height that fits its font size (A14)', () => {
  // A type scale whose line-heights live as fixed px is only safe if a test
  // ties them to the size: a previous bug turned `lineHeight: 20` (unitless =
  // 20x the font size) into a 260px line box. Body copy needs 1.4x or more to
  // be readable; display sizes are deliberately tighter (32/40 = 1.25), and
  // the dense table step is 18/13 = 1.38 on purpose.
  const problems: string[] = [];
  for (const [name, style] of Object.entries(type)) {
    if (!/^\d+(?:\.\d+)?px$/.test(style.lineHeight)) {
      problems.push(`${name}.lineHeight = ${style.lineHeight} — must be a px string, not a multiplier`);
      continue;
    }
    const ratio = parseFloat(style.lineHeight) / style.fontSize;
    const floor = /^body(Default|Compact)$/.test(name) ? 1.4 : 1.15;
    if (ratio < floor) {
      problems.push(
        `${name}: ${style.fontSize}px / ${style.lineHeight} = ${ratio.toFixed(2)} (needs ${floor})`,
      );
    }
  }
  assert.deepStrictEqual(problems, [], `Type-scale regressions:\n${problems.join('\n')}`);
});

test('every theme exposes the same token names (light/dark cannot drift)', () => {
  const light = Object.keys(colors).sort();
  const dark = Object.keys(darkColors).sort();
  const missingFromDark = light.filter((k) => !dark.includes(k));
  const missingFromLight = dark.filter((k) => !light.includes(k));
  assert.deepStrictEqual(
    { missingFromDark, missingFromLight },
    { missingFromDark: [], missingFromLight: [] },
    'A token present in one palette but not the other resolves to undefined in that mode',
  );
});
