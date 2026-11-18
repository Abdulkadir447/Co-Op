/**
 * Co-op Design System — Color tokens (Stitch Stage R0, "Co-op Purple").
 *
 * The single source of truth for every color used in the app. Raw hex values
 * live ONLY here; components and the Ant Design bridge (theme.ts) consume the
 * named tokens below.
 *
 * Palette philosophy (DESIGN.md, Brand & Style):
 *   - A predominantly white / light-lavender canvas so the vibrant primary
 *     purple can act as a beacon for action.
 *   - Surface tiers create a clear "inner vs outer" mental model (canvas vs
 *     card).
 *   - Depth is expressed through tonal layers + low-contrast outlines, with
 *     diffused indigo-tinted shadows reserved for lift (hover/overlays).
 *   - The AI identity is carried by the signature gradient (5b5fef → 8a4cfc).
 */

export const colors = {
  // --- Brand ----------------------------------------------------------------
  primary: '#4143d5', // primary actions, active nav, links
  onPrimary: '#ffffff',
  primaryContainer: '#5b5fef', // hover/active fill, AI gradient start
  onPrimaryContainer: '#f9f6ff',
  surfaceTint: '#474adb',
  inversePrimary: '#c0c1ff',

  secondary: '#712ae2', // deeper accent (AI secondary)
  onSecondary: '#ffffff',
  secondaryContainer: '#8a4cfc', // AI gradient end, AI icon treatment
  onSecondaryContainer: '#fffbff',

  tertiary: '#904400',
  onTertiary: '#ffffff',
  tertiaryContainer: '#b55700',
  onTertiaryContainer: '#fff6f2',

  // --- Fixed (light-tinted) tones -------------------------------------------
  primaryFixed: '#e1e0ff', // soft purple fills (KPI tiles, chips, avatars)
  primaryFixedDim: '#c0c1ff',
  onPrimaryFixed: '#05006c',
  onPrimaryFixedVariant: '#2c2cc3',
  secondaryFixed: '#eaddff',
  secondaryFixedDim: '#d2bbff',
  onSecondaryFixed: '#25005a',
  onSecondaryFixedVariant: '#5a00c6',

  // --- Surfaces (canvas → raised) ---------------------------------------------
  surface: '#fcf8ff', // application canvas
  surfaceDim: '#dbd8e5',
  surfaceBright: '#fcf8ff',
  surfaceContainerLowest: '#ffffff', // cards, inputs, table
  surfaceContainerLow: '#f5f2fe', // icon tiles, row hover, active nav
  surfaceContainer: '#efecf9',
  surfaceContainerHigh: '#e9e6f3', // subtle borders, dividers
  surfaceContainerHighest: '#e4e1ed',
  surfaceVariant: '#e4e1ed',
  background: '#fcf8ff',
  onBackground: '#1b1b23',

  // --- Text -----------------------------------------------------------------
  onSurface: '#1b1b23',
  onSurfaceVariant: '#464555',
  inverseSurface: '#303039',
  inverseOnSurface: '#f2effc',

  // --- Outlines & borders -----------------------------------------------------
  outline: '#767586', // icon glyphs, placeholders, tertiary labels
  outlineVariant: '#c6c5d7', // input borders, strong dividers
  borderSubtle: '#e9e6f3', // card borders, row dividers (Level 1)

  // --- Semantic ---------------------------------------------------------------
  success: '#2e9e5b',
  onSuccess: '#ffffff',
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  warning: '#e0a106',
  onWarning: '#ffffff',
  info: '#2d8fd5', // "confirmed / shipped / processing" status
  onInfo: '#ffffff',

  // --- Semantic TEXT variants ------------------------------------------------
  // The hues above are tuned for fills, dots and glyphs (3:1 against a
  // surface). As 12–14px text on a 10% tint of themselves they measure
  // 2.1–3.1:1 and fail WCAG 1.4.3 (4.5:1). Use these for any text drawn in a
  // semantic colour; keep the base hue for fills. Measured on a white card:
  // successText 4.69:1, warningText 4.83:1, infoText 4.74:1, errorText 5.45:1.
  successText: '#1c7a43',
  warningText: '#8a6100',
  infoText: '#1c6ea8',
  errorText: '#ba1a1a',
  /** Tertiary / caption text — 6.0:1 on the canvas (base `outline` is 4.29:1). */
  onSurfaceMuted: '#5f5e6e',
} as const;

export type ColorToken = keyof typeof colors;

/** Signature AI identity gradient (135deg). */
export const aiGradient = 'linear-gradient(135deg, #5b5fef 0%, #8a4cfc 100%)';

/** Horizontal AI border-top gradient (Stage R1 AICard). */
export const aiGradientBorder = 'linear-gradient(90deg, #5b5fef, #8a4cfc, #c0c1ff)';

/**
 * 10% tint of a hex color for badge/pill backgrounds (Stage R1:
 * "light tinted background with high-contrast text").
 */
export function tint(hex: string, alpha = 0.1): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
