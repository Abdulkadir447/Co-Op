/**
 * Co-op Design System — central theme (Stitch Stage R0 "Co-op Purple").
 *
 * This file is the single source of truth that maps the Co-op design tokens
 * (`theme/*.ts`) onto Ant Design 5's ConfigProvider. Pages and components
 * should never hard-code colors, radii or fonts — they consume either the
 * raw tokens (from `theme/index`) or the antd token via
 * `antdTheme.useToken()`, which is guaranteed to reflect this config.
 *
 * Compatibility note: the legacy `brand`, `neutral` and `semantic` exports
 * are kept (re-derived from the new palette) so existing modules keep
 * working while they are migrated to the named tokens.
 */

import type { ThemeConfig } from 'antd';
import { theme as antdTheme } from 'antd';
import { colors, tint } from './theme/colors';
import { darkColors } from './theme/dark';
import { fontFamily, type } from './theme/typography';
import { radius, shadow, z } from './theme/tokens';

// ---------------------------------------------------------------------------
// Compatibility aliases (re-derived from the Co-op Purple palette)
// ---------------------------------------------------------------------------
export const brand = {
  primary: colors.primary,
  primaryHover: colors.primaryContainer,
  primaryActive: '#3335b8',
  primarySurface: colors.surfaceContainerLow,
};

export const neutral: Record<number, string> = {
  0: colors.surfaceContainerLowest,
  50: colors.surfaceContainerLow,
  100: colors.surfaceContainer,
  200: colors.borderSubtle,
  300: colors.outlineVariant,
  400: colors.outline,
  500: colors.onSurfaceVariant,
  600: '#3a3949',
  700: '#2a2937',
  800: colors.inverseSurface,
  900: colors.onSurface,
  950: '#101017',
};

export const semantic = {
  success: colors.success,
  successBg: tint(colors.success, 0.1),
  warning: colors.warning,
  warningBg: tint(colors.warning, 0.12),
  error: colors.error,
  errorBg: tint(colors.error, 0.08),
  info: colors.info,
  infoBg: tint(colors.info, 0.1),
};

// ---------------------------------------------------------------------------
// Shared token block
// ---------------------------------------------------------------------------
const baseTokens = {
  fontFamily,
  // Default UI size is body-compact (14); paragraphs use body-default (16).
  fontSize: type.bodyCompact.fontSize,
  // antd expects a unitless ratio here (lineHeight × fontSize); the token
  // itself is a px string ('20px'), so parse it back to a number.
  lineHeight: parseFloat(type.bodyCompact.lineHeight) / type.bodyCompact.fontSize,
  colorText: colors.onSurface,
  colorTextSecondary: colors.onSurfaceVariant,
  colorTextTertiary: colors.outline,
  colorTextQuaternary: tint(colors.outline, 0.45),
  colorBorder: colors.outlineVariant,
  colorBorderSecondary: colors.borderSubtle,
  colorBgLayout: colors.surface,
  colorFillQuaternary: colors.surfaceContainerLow,
  borderRadius: radius.lg,
  borderRadiusLG: radius.xl,
  borderRadiusSM: radius.md,
  controlHeight: 36,
  controlHeightLG: 44,
  controlHeightSM: 28,
  motionDurationMid: '0.2s',
  motionDurationSlow: '0.3s',
};

// ---------------------------------------------------------------------------
// Component-level mapping (Stitch Stage R1 patterns)
// ---------------------------------------------------------------------------
const baseComponents: ThemeConfig['components'] = {
  Layout: {
    headerBg: colors.surfaceContainerLowest,
    bodyBg: colors.surface,
    siderBg: colors.surfaceContainerLowest,
    headerHeight: 64,
    headerPadding: '0 24px',
  },
  Menu: {
    itemBorderRadius: 10,
    itemSelectedBg: colors.surfaceContainerLow,
    itemSelectedColor: colors.primary,
    itemHoverBg: colors.surfaceContainerLow,
    itemHoverColor: colors.primary,
    itemColor: colors.onSurfaceVariant,
    iconSize: 18,
  },
  Button: {
    borderRadius: radius.lg,
    controlHeight: 36,
    fontWeight: 600,
    primaryShadow: 'none',
    defaultBg: colors.surfaceContainerLowest,
    defaultBorderColor: colors.outlineVariant,
    defaultColor: colors.onSurfaceVariant,
    defaultHoverBg: colors.surfaceContainerLow,
    defaultHoverBorderColor: colors.outlineVariant,
    defaultHoverColor: colors.primary,
  },
  Card: {
    borderRadiusLG: radius.lg,
    colorBorderSecondary: colors.borderSubtle,
    paddingLG: 16,
    headerFontSize: type.titleMd.fontSize,
    headerBg: 'transparent',
  },
  Table: {
    headerBg: 'transparent',
    headerColor: colors.outline,
    headerSplitColor: 'transparent',
    borderColor: colors.borderSubtle,
    rowHoverBg: colors.surfaceContainerLow,
    cellPaddingBlock: 12,
    cellPaddingBlockMD: 10,
    headerBorderRadius: 0,
    fontSize: 14,
  },
  Modal: {
    borderRadiusLG: radius.xl,
    headerBg: 'transparent',
    titleFontSize: 18,
    contentBg: colors.surfaceContainerLowest,
    footerBg: 'transparent',
  },
  Input: {
    borderRadius: radius.lg,
    activeBorderColor: colors.primary,
    hoverBorderColor: colors.primaryContainer,
    activeShadow: `0 0 0 3px ${tint(colors.primary, 0.15)}`,
  },
  InputNumber: {
    borderRadius: radius.lg,
  },
  Select: {
    borderRadius: radius.lg,
    optionSelectedBg: colors.surfaceContainerLow,
    optionSelectedFontWeight: 600,
  },
  Alert: {
    borderRadius: radius.lg,
  },
  Tag: {
    borderRadiusSM: radius.md,
  },
  Pagination: {
    itemActiveBg: 'transparent',
    colorPrimary: colors.primary,
    borderRadius: radius.md,
  },
  Spin: {
    colorPrimary: colors.primary,
  },
  Segmented: {
    itemSelectedBg: colors.surfaceContainerLowest,
    trackBg: colors.surfaceContainerLow,
  },
  Radio: {
    buttonBg: colors.surfaceContainerLowest,
    buttonCheckedBg: colors.primary,
    buttonSolidCheckedColor: colors.onPrimary,
  },
  Divider: {
    colorSplit: colors.borderSubtle,
  },
  Empty: {
    colorText: colors.outline,
  },
  Drawer: {
    paddingLG: radius.lg,
  },
  Dropdown: {
    borderRadiusLG: radius.lg,
  },
  Tooltip: {
    borderRadius: radius.md,
  },
  Skeleton: {
    gradientFromColor: colors.surfaceContainer,
    gradientToColor: colors.surfaceContainerLow,
  },
};

// ---------------------------------------------------------------------------
// Light theme — the Co-op design system (Stitch Stage R0)
// ---------------------------------------------------------------------------
export const light: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    ...baseTokens,
    colorPrimary: colors.primary,
    colorPrimaryHover: colors.primaryContainer,
    colorPrimaryActive: brand.primaryActive,
    colorPrimaryBg: tint(colors.primary, 0.1),
    colorInfo: colors.info,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.error,
    colorLink: colors.primary,
    colorLinkHover: colors.primaryContainer,
    colorLinkActive: brand.primaryActive,
    colorBgBase: colors.surfaceContainerLowest,
    colorBgContainer: colors.surfaceContainerLowest,
    colorBgElevated: colors.surfaceContainerLowest,
    colorErrorBg: tint(colors.error, 0.08),
    colorSuccessBg: tint(colors.success, 0.1),
    colorWarningBg: tint(colors.warning, 0.12),
    colorInfoBg: tint(colors.info, 0.1),
    borderRadiusOuter: radius.lg,
    boxShadow: shadow.overlay,
    boxShadowSecondary: shadow.lift,
    boxShadowTertiary: shadow.soft,
    zIndexPopupBase: z.topBar + 10,
    fontSizeHeading1: type.pageTitle.fontSize,
    fontSizeHeading2: type.pageTitleMobile.fontSize,
    fontSizeHeading3: type.sectionHeading.fontSize,
    fontSizeHeading4: type.titleMd.fontSize,
    colorBgTextHover: colors.surfaceContainerLow,
  },
  components: baseComponents,
};

// ---------------------------------------------------------------------------
// Dark theme (Stage 2) — built from the dark palette; the app ships with
// light as the default and honors the OS preference.
// ---------------------------------------------------------------------------
export const dark: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...baseTokens,
    colorPrimary: darkColors.primaryContainer,
    colorPrimaryHover: darkColors.secondaryContainer,
    colorPrimaryActive: darkColors.primary,
    colorPrimaryBg: tint('#5b5fef', 0.16),
    colorInfo: darkColors.info,
    colorSuccess: darkColors.success,
    colorWarning: darkColors.warning,
    colorError: darkColors.error,
    colorLink: darkColors.primary,
    colorLinkHover: darkColors.secondary,
    colorLinkActive: darkColors.primaryContainer,
    colorBgBase: darkColors.surfaceContainerLowest,
    colorBgLayout: darkColors.surface,
    colorBgContainer: darkColors.surfaceContainerLowest,
    colorBgElevated: darkColors.surfaceContainerLow,
    colorErrorBg: tint(darkColors.error, 0.14),
    colorSuccessBg: tint(darkColors.success, 0.14),
    colorWarningBg: tint(darkColors.warning, 0.14),
    colorInfoBg: tint(darkColors.info, 0.14),
    colorText: darkColors.onSurface,
    colorTextSecondary: darkColors.onSurfaceVariant,
    colorTextTertiary: darkColors.outline,
    colorBorder: darkColors.outlineVariant,
    colorBorderSecondary: darkColors.borderSubtle,
    colorFillQuaternary: darkColors.surfaceContainerLow,
    colorBgTextHover: darkColors.surfaceContainerLow,
    colorBgSpotlight: 'rgba(123, 125, 240, 0.28)',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
    boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.4)',
    fontSizeHeading1: type.pageTitle.fontSize,
    fontSizeHeading2: type.pageTitleMobile.fontSize,
    fontSizeHeading3: type.sectionHeading.fontSize,
    fontSizeHeading4: type.titleMd.fontSize,
  },
  components: {
    ...baseComponents,
    Layout: {
      headerBg: darkColors.surfaceContainerLowest,
      bodyBg: darkColors.surface,
      siderBg: darkColors.surfaceContainerLowest,
    },
    Menu: {
      itemSelectedBg: darkColors.surfaceContainerLow,
      itemSelectedColor: darkColors.primary,
      itemHoverBg: darkColors.surfaceContainerLow,
      itemHoverColor: darkColors.primary,
      itemColor: darkColors.onSurfaceVariant,
    },
    Button: {
      defaultBg: darkColors.surfaceContainerLow,
      defaultBorderColor: darkColors.outlineVariant,
      defaultColor: darkColors.onSurfaceVariant,
      defaultHoverBg: darkColors.surfaceContainer,
      defaultHoverColor: darkColors.primary,
    },
    Card: {
      colorBorderSecondary: darkColors.borderSubtle,
      headerBg: 'transparent',
    },
    Table: {
      borderColor: darkColors.borderSubtle,
      rowHoverBg: darkColors.surfaceContainerLow,
    },
    Modal: {
      contentBg: darkColors.surfaceContainerLowest,
    },
    // baseComponents carries LIGHT-palette values, so anything not re-declared
    // here keeps them. Select was the visible casualty: the dropdown panel is
    // surfaceContainerLow, but optionSelectedBg stayed the light-palette
    // surfaceContainerLow too — a near-white label on a near-white fill, i.e.
    // the selected row was unreadable. Give selected/hover their own steps
    // above the panel background and pin the label colour explicitly.
    Select: {
      colorBgElevated: darkColors.surfaceContainerLow,
      optionActiveBg: darkColors.surfaceContainer,
      optionSelectedBg: darkColors.surfaceContainerHigh,
      optionSelectedColor: darkColors.onSurface,
      optionSelectedFontWeight: 600,
    },
    Input: {
      activeBorderColor: darkColors.primary,
      hoverBorderColor: darkColors.primaryContainer,
      activeShadow: `0 0 0 3px ${tint(darkColors.primary, 0.28)}`,
    },
    Pagination: {
      colorPrimary: darkColors.primary,
    },
    Spin: {
      colorPrimary: darkColors.primary,
    },
    Segmented: {
      itemSelectedBg: darkColors.surfaceContainerLowest,
      trackBg: darkColors.surfaceContainerLow,
    },
    Radio: {
      buttonBg: darkColors.surfaceContainerLow,
      buttonCheckedBg: darkColors.primaryContainer,
      buttonSolidCheckedColor: darkColors.onPrimary,
    },
    Divider: {
      colorSplit: darkColors.borderSubtle,
    },
    Empty: {
      colorText: darkColors.outline,
    },
    Dropdown: {
      colorBgElevated: darkColors.surfaceContainerLow,
    },
    Tooltip: {
      colorBgSpotlight: darkColors.surfaceContainerHigh,
    },
    Skeleton: {
      gradientFromColor: darkColors.surfaceContainer,
      gradientToColor: darkColors.surfaceContainerLow,
    },
  },
};

export const coopTheme = { light, dark };
export type ThemeMode = 'light' | 'dark' | 'system';

// ---------------------------------------------------------------------------
// Token re-exports — `src/theme.ts` (this file) is the module that shadows
// the `src/theme/` directory in resolution, so every consumer keeps the
// familiar `import { colors, type, radius } from '../../theme'` shape while
// the raw tokens themselves live in `theme/*.ts`.
// ---------------------------------------------------------------------------
export * from './theme/index';
