/**
 * Co-op Design System — dark palette (Stage 2: Light/dark theme).
 *
 * Same token names as the light palette (theme/colors.ts) so the resolved
 * palette from `useCoopTheme()` is interchangeable. Dark mode keeps the
 * "Co-op Purple" identity: elevated dark-lavender surfaces, brighter brand
 * hues for contrast, and the same AI gradient (it already reads well on
 * dark). Semantic colors are lightened to keep AA contrast on dark
 * surfaces.
 */
export const darkColors = {
  // --- Brand ----------------------------------------------------------------
  primary: '#7b7df0', // brighter for text/links on dark surfaces
  onPrimary: '#ffffff',
  primaryContainer: '#5b5fef',
  onPrimaryContainer: '#f9f6ff',
  surfaceTint: '#8a8df5',
  inversePrimary: '#2e2f6b',

  secondary: '#a678f5',
  onSecondary: '#ffffff',
  secondaryContainer: '#8a4cfc',
  onSecondaryContainer: '#fffbff',

  tertiary: '#ffb582',
  onTertiary: '#3a1d00',
  tertiaryContainer: '#b55700',
  onTertiaryContainer: '#fff6f2',

  // --- Fixed (tinted) tones — dark surfaces need deeper fills ---------------
  primaryFixed: '#2b2c5e',
  primaryFixedDim: '#33347c',
  onPrimaryFixed: '#d9d9ff',
  onPrimaryFixedVariant: '#c0c1ff',
  secondaryFixed: '#3a2a52',
  secondaryFixedDim: '#54386e',
  onSecondaryFixed: '#eed9ff',
  onSecondaryFixedVariant: '#d2bbff',

  // --- Surfaces ---------------------------------------------------------------
  surface: '#14141c',
  surfaceDim: '#101017',
  surfaceBright: '#1e1e28',
  surfaceContainerLowest: '#1c1c26',
  surfaceContainerLow: '#22222e',
  surfaceContainer: '#262633',
  surfaceContainerHigh: '#2b2b39',
  surfaceContainerHighest: '#313140',
  surfaceVariant: '#2b2b39',
  background: '#14141c',
  onBackground: '#f2effc',

  // --- Text -----------------------------------------------------------------
  onSurface: '#f2effc',
  onSurfaceVariant: '#b9b7c9',
  inverseSurface: '#f2effc',
  inverseOnSurface: '#303039',

  // --- Outlines & borders ------------------------------------------------------
  outline: '#8d8b9d',
  outlineVariant: '#3d3d4c',
  borderSubtle: '#2a2a36',

  // --- Semantic (lightened for dark surfaces) ---------------------------------
  success: '#3fbf72',
  onSuccess: '#06281a',
  error: '#e35d5d',
  onError: '#ffffff',
  errorContainer: '#4a1a1a',
  onErrorContainer: '#ffb4ab',
  warning: '#f0b429',
  onWarning: '#2c1f00',
  info: '#4da3f5',
  onInfo: '#04263c',

  // --- Semantic TEXT variants ------------------------------------------------
  // Already lighter than the light palette, but still short of 4.5:1 as 12px
  // text on a 20% tint (error measured 3.73:1). These pass on the dark card:
  // successText 4.97:1, warningText 5.95:1, infoText 4.52:1, errorText 6.29:1.
  successText: '#3fbf72',
  warningText: '#f0b429',
  infoText: '#4da3f5',
  errorText: '#ffb4ab',
  /** Tertiary / caption text on dark surfaces. */
  onSurfaceMuted: '#b9b7c9',
} as const;

export type DarkColorToken = keyof typeof darkColors;
