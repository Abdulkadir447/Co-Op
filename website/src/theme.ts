// Maps the app's real design tokens (frontend/src/theme/*) onto :root CSS
// variables, for both the light and dark palettes. The website never hard-codes
// a colour — it reads the same source of truth the product does.
import { colors, aiGradient } from '../../frontend/src/theme/colors';
import { darkColors } from '../../frontend/src/theme/dark';
import { fontFamily } from '../../frontend/src/theme/typography';
import { radius, shadow } from '../../frontend/src/theme/tokens';

export type Mode = 'light' | 'dark';

const shape = {
  '--font': fontFamily,
  '--ai-gradient': aiGradient,
  '--radius-sm': `${radius.sm}px`,
  '--radius-md': `${radius.md}px`,
  '--radius-lg': `${radius.lg}px`,
  '--radius-xl': `${radius.xl}px`,
  '--radius-full': `${radius.full}px`,
  '--shadow-lift': shadow.lift,
  '--shadow-soft': shadow.soft,
  '--shadow-brand-tile': shadow.brandTile,
  '--shadow-overlay': shadow.overlay,
};

function palette(c: Record<keyof typeof colors, string>): Record<string, string> {
  return {
    '--primary': c.primary,
    '--on-primary': c.onPrimary,
    '--primary-container': c.primaryContainer,
    '--secondary-container': c.secondaryContainer,
    '--primary-fixed': c.primaryFixed,
    '--on-primary-fixed-variant': c.onPrimaryFixedVariant,
    '--surface': c.surface,
    '--surface-lowest': c.surfaceContainerLowest,
    '--surface-low': c.surfaceContainerLow,
    '--surface-container': c.surfaceContainer,
    '--surface-high': c.surfaceContainerHigh,
    '--on-surface': c.onSurface,
    '--on-surface-variant': c.onSurfaceVariant,
    '--outline': c.outline,
    '--outline-variant': c.outlineVariant,
    '--border-subtle': c.borderSubtle,
    '--success': c.success,
    '--warning': c.warning,
  };
}

export function applyTheme(mode: Mode): void {
  const style = document.documentElement.style;
  const vars = { ...shape, ...palette(mode === 'dark' ? darkColors : colors) };
  for (const [k, v] of Object.entries(vars)) style.setProperty(k, v);
  document.documentElement.setAttribute('data-theme', mode);
}
