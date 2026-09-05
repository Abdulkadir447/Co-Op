/**
 * Co-op auth appearance (Stage 3) — the Stitch auth screens mapped onto
 * Clerk's `appearance` API.
 *
 * IMPORTANT: this file only changes PRESENTATION. All authentication logic
 * (email code, password, SSO/OAuth, account recovery, error handling,
 * loading states) remains Clerk's — the `SignIn`/`SignUp` hosted components
 * receive this skin via the `appearance` prop. Nothing about the auth flow
 * is re-implemented here.
 *
 * Design source: coop_sign_in_refactored, coop_sign_up_refactored,
 * coop_recover_account_refactored, coop_sign_in_mobile_refactored
 * (Stitch foundation). Colors resolve per theme mode (light/dark).
 */
import type { ClerkAppearanceTheme } from '@clerk/shared/types';
import { tint } from '../theme/colors';

type CoopAppearance = ClerkAppearanceTheme;

// ---------------------------------------------------------------------------
// Brand logo — the gradient sparkle tile, rendered through Clerk's logo
// slot (options.logoPlacement) so the design's brand mark sits exactly
// where the Stitch cards show it, inside the card.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Brand logo — the Co-op mark ("two partners, one spark": two overlapping
// partner tiles, a deeper shared overlap, and a four-point spark), rendered
// through Clerk's logo slot so the mark sits inside the auth card.
// ---------------------------------------------------------------------------
const COOP_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><defs><linearGradient id="cA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b5fef"/><stop offset="1" stop-color="#4143d5"/></linearGradient><linearGradient id="cB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a4cfc"/><stop offset="1" stop-color="#712ae2"/></linearGradient><linearGradient id="cO" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#474adb"/><stop offset="1" stop-color="#4143d5"/></linearGradient></defs><rect x="4" y="9" width="27" height="27" rx="9" fill="url(#cA)"/><rect x="17" y="12" width="27" height="27" rx="9" fill="url(#cB)"/><rect x="17" y="12" width="14" height="24" rx="8" fill="url(#cO)"/><path d="M24 15 Q25.2 21.2 31 24 Q25.2 26.8 24 33 Q22.8 26.8 17 24 Q22.8 21.2 24 15 Z" fill="#ffffff"/></svg>`;

const COOP_WORDMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="48" viewBox="0 0 140 48"><defs><linearGradient id="cA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b5fef"/><stop offset="1" stop-color="#4143d5"/></linearGradient><linearGradient id="cB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a4cfc"/><stop offset="1" stop-color="#712ae2"/></linearGradient><linearGradient id="cO" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#474adb"/><stop offset="1" stop-color="#4143d5"/></linearGradient></defs><rect x="4" y="9" width="27" height="27" rx="9" fill="url(#cA)"/><rect x="17" y="12" width="27" height="27" rx="9" fill="url(#cB)"/><rect x="17" y="12" width="14" height="24" rx="8" fill="url(#cO)"/><path d="M24 15 Q25.2 21.2 31 24 Q25.2 26.8 24 33 Q22.8 26.8 17 24 Q22.8 21.2 24 15 Z" fill="#ffffff"/><text x="54" y="33" font-family="Inter, -apple-system, 'Segoe UI', Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="-0.4" fill="#4143d5">Co-op</text></svg>`;

const svgDataUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

const LOGO_TILES = {
  // Sign in / recovery: tile only (coop_sign_in_refactored).
  signin: svgDataUri(COOP_MARK_SVG),
  // Sign up: tile + wordmark (coop_sign_up_refactored).
  signup: svgDataUri(COOP_WORDMARK_SVG),
};

// ---------------------------------------------------------------------------
// Palette per mode (matches theme/colors.ts and theme/dark.ts)
// ---------------------------------------------------------------------------
interface Palette {
  card: string;
  border: string;
  borderStrong: string;
  foreground: string;
  muted: string;
  mutedFaint: string;
  inputBg: string;
  inputBorder: string;
  primary: string;
  primaryHover: string;
  danger: string;
  success: string;
  warning: string;
  shadow: string;
}

const LIGHT: Palette = {
  card: '#ffffff',
  border: '#e9e6f3',
  borderStrong: '#c6c5d7',
  foreground: '#1b1b23',
  muted: '#464555',
  mutedFaint: '#767586',
  inputBg: '#f5f2fe',
  inputBorder: '#d9d7e6',
  primary: '#4143d5',
  primaryHover: '#5b5fef',
  danger: '#ba1a1a',
  success: '#2e9e5b',
  warning: '#e0a106',
  shadow: '0 8px 24px rgba(21, 24, 29, 0.06)',
};

const DARK: Palette = {
  card: '#1c1c26',
  border: '#2a2a36',
  borderStrong: '#3d3d4c',
  foreground: '#f2effc',
  muted: '#b9b7c9',
  mutedFaint: '#8d8b9d',
  inputBg: '#22222e',
  inputBorder: '#3d3d4c',
  primary: '#5b5fef',
  primaryHover: '#6e70f2',
  danger: '#e35d5d',
  success: '#3fbf72',
  warning: '#f0b429',
  shadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
};

const FONT = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;

// ---------------------------------------------------------------------------
// The appearance factory
// ---------------------------------------------------------------------------
export function coopAuthAppearance(dark: boolean, mode: 'signin' | 'signup'): CoopAppearance {
  const p = dark ? DARK : LIGHT;

  return {
    theme: 'clerk',
    options: {
      logoPlacement: 'inside',
      logoImageUrl: LOGO_TILES[mode],
      socialButtonsVariant: 'blockButton',
    },
    variables: {
      colorPrimary: p.primary,
      colorPrimaryForeground: '#ffffff',
      colorDanger: p.danger,
      colorSuccess: p.success,
      colorWarning: p.warning,
      colorNeutral: p.border,
      colorForeground: p.foreground,
      colorMuted: p.muted,
      colorMutedForeground: p.mutedFaint,
      colorBackground: 'transparent',
      colorInput: p.inputBg,
      colorInputForeground: p.foreground,
      colorRing: tint(p.primary, 0.18),
      colorShadow: p.shadow,
      colorBorder: p.inputBorder,
      fontFamily: FONT,
      fontSize: '14px',
      borderRadius: '12px',
    },
    elements: {
      // --- Card (Stitch: white, 1px border-subtle, 16px radius, soft lift) ---
      rootBox: { maxWidth: 420, width: '100%' },
      card: {
        background: p.card,
        border: `1px solid ${p.border}`,
        borderRadius: 16,
        boxShadow: p.shadow,
      },
      cardBox: { padding: '36px 36px 32px' },

      // --- Brand (logo slot) ---
      logoBox: { display: 'flex', justifyContent: 'center', marginBottom: 20 },
      logoImage: { display: 'block' },

      // --- Header (centered title + subtitle) ---
      header: { textAlign: 'center', marginBottom: 26 },
      headerTitle: {
        fontSize: 30,
        lineHeight: '38px',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        color: p.foreground,
        margin: 0,
      },
      headerSubtitle: {
        fontSize: 15,
        lineHeight: '22px',
        color: p.muted,
        marginTop: 8,
      },
      // Recovery flow back link ("← Sign In", coop_recover_account_refactored)
      headerBackLink: { color: p.primary, fontWeight: 600, fontSize: 14 },

      // --- Form fields (label-caps labels + tinted inputs) ---
      formField: { marginBottom: 16 },
      formFieldLabelRow: { marginBottom: 8 },
      formFieldLabel: {
        fontSize: 12,
        lineHeight: '16px',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: p.muted,
      },
      formFieldInput: {
        height: 46,
        padding: '0 14px',
        background: p.inputBg,
        border: `1px solid ${p.inputBorder}`,
        borderRadius: 12,
        fontSize: 14.5,
        color: p.foreground,
        '&hover': { borderColor: p.borderStrong },
        '&focus': {
          borderColor: p.primary,
          boxShadow: `0 0 0 3px ${tint(p.primary, 0.15)}`,
        },
      },
      'formFieldInput__error': { borderColor: p.danger },
      formFieldErrorText: { color: p.danger, fontSize: 12.5, marginTop: 6 },
      formFieldHintText: { color: p.mutedFaint, fontSize: 12.5, marginTop: 6 },
      formFieldCheckboxLabel: { fontSize: 14, color: p.muted },
      checkbox: { borderRadius: 6, width: 16, height: 16 },

      // --- Primary button (Sign In → / Create Account / Send Reset Link) ---
      formButtonPrimary: {
        height: 47,
        borderRadius: 12,
        background: p.primary,
        color: '#ffffff',
        fontWeight: 600,
        fontSize: 14.5,
        boxShadow: 'none',
        '&hover': { background: p.primaryHover, boxShadow: 'none' },
        '&active': { background: p.primary },
      },
      'formButtonPrimary__loading': { opacity: 0.85 },
      spinner: { color: p.primary },

      // --- "OR CONTINUE WITH" divider + social buttons ---
      dividerRow: { margin: '24px 0 16px' },
      dividerText: {
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: p.mutedFaint,
      },
      // Layout (2-up desktop / 1-col mobile) stays Clerk's responsive
      // default — it already matches the Stitch mobile screens.
      socialButtons: { gap: 12 },
      socialButtonsBlockButton: {
        height: 45,
        borderRadius: 12,
        border: `1px solid ${p.inputBorder}`,
        background: p.card,
        color: p.foreground,
        fontWeight: 500,
        fontSize: 14,
        '&hover': { background: dark ? '#262633' : '#f5f2fe', borderColor: p.borderStrong },
      },

      // --- Footer ("Don't have an account? …" / recovery links) ---
      footer: { marginTop: 26, textAlign: 'center' },
      footerAction: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 },
      footerActionText: { color: p.muted, fontSize: 14 },
      footerActionLink: { color: p.primary, fontWeight: 600, fontSize: 14 },
      formResendCodeLink: { color: p.primary, fontWeight: 600 },

      // --- Email-code (OTP) flow ---
      otpCodeFieldInput: {
        width: 44,
        height: 54,
        borderRadius: 12,
        border: `1px solid ${p.inputBorder}`,
        background: p.inputBg,
        fontSize: 18,
        fontWeight: 600,
        textAlign: 'center',
        color: p.foreground,
        '&focus': { borderColor: p.primary, boxShadow: `0 0 0 3px ${tint(p.primary, 0.15)}` },
      },
      'otpCodeFieldInput__error': { borderColor: p.danger },
      otpCodeFieldErrorText: { color: p.danger, fontSize: 12.5, marginTop: 8 },

      // --- Email code / password tabs ---
      tabListContainer: {
        display: 'flex',
        gap: 6,
        padding: 4,
        borderRadius: 12,
        background: dark ? '#22222e' : '#f5f2fe',
        marginBottom: 22,
      },
      tabButton: {
        borderRadius: 9,
        fontWeight: 600,
        fontSize: 13.5,
        color: p.muted,
      },

      // --- Form-level alert (Clerk's inline error box, e.g. wrong password) ---
      alert: {
        background: tint(p.danger, dark ? 0.16 : 0.07),
        border: `1px solid ${tint(p.danger, dark ? 0.4 : 0.25)}`,
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 18,
      },
      alertIcon: { color: p.danger },
      alertText: { color: p.foreground, fontSize: 13.5 },
    },
  };
}
