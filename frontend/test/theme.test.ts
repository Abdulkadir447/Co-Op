/**
 * Theme regression tests.
 *
 * The dark theme is built by spreading the LIGHT `baseComponents` and then
 * re-declaring only the components that need dark values. Any component left
 * out keeps its light-palette values. That silently produced an unreadable
 * Select dropdown: `optionSelectedBg` stayed the light `#f5f2fe` while the
 * label was the dark-theme near-white `#f2effc` — 1.03:1 contrast, i.e. the
 * selected row looked blank. These tests pin the invariant.
 */
import test from 'node:test';
import assert from 'node:assert';
import { coopTheme } from '../src/theme';

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

const darkSelect = coopTheme.dark.components.Select as Record<string, string>;

test('dark Select overrides its own palette instead of inheriting the light one', () => {
  // The dropdown panel is the dark elevated surface; a selected row painted
  // with the light palette is indistinguishable from the panel and unreadable.
  assert.strictEqual(darkSelect.colorBgElevated, '#22222e');
  assert.strictEqual(darkSelect.optionSelectedBg, '#2b2b39');
  assert.strictEqual(darkSelect.optionSelectedColor, '#f2effc');
});

test('the selected dropdown option meets WCAG AA against its own background', () => {
  const ratio = contrast(darkSelect.optionSelectedColor, darkSelect.optionSelectedBg);
  assert.ok(ratio >= 4.5, `selected option contrast is ${ratio.toFixed(2)}:1, need >= 4.5:1`);
});

test('selected and hovered options are distinguishable from the panel', () => {
  const panel = darkSelect.colorBgElevated;
  assert.ok(contrast(darkSelect.optionSelectedBg, panel) > 1.05, 'selected row not visible');
  assert.ok(contrast(darkSelect.optionActiveBg, panel) > 1.02, 'hover row not visible');
});

test('no dark component token keeps a light-palette near-white background', () => {
  // Guards the whole class of leak, not just Select: any *Bg token in the dark
  // theme that is still near-white would be unreadable under near-white text.
  const offenders: string[] = [];
  for (const [name, tokens] of Object.entries(coopTheme.dark.components as Record<string, object>)) {
    for (const [key, value] of Object.entries(tokens)) {
      if (!/Bg$/.test(key) || typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) continue;
      if (luminance(value) > 0.7) offenders.push(`${name}.${key} = ${value}`);
    }
  }
  assert.deepStrictEqual(offenders, []);
});
