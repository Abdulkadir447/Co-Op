import React from 'react';
import { useCoopTheme } from '../../theme-provider';

/**
 * Co-op brand mark — "the C that holds the shop".
 *
 * One shape does the work: the C is the product name, and it wraps a crate —
 * stock, the trader's goods — the way the software wraps a business. The
 * crate's gradient runs against the ring's so the two read as two objects, and
 * the ring stays open on the right so the mark never looks like a © or a
 * padlock at 16px (both were tried and both did).
 *
 * Why it replaced the old three-petal "weave": that mark was three abstract
 * blobs with a white spark, and at the sizes it actually appears — 16px
 * favicon, 30px in the top bar, 40px in the rail — it collapsed into a flower
 * shape that told a shopkeeper nothing about what the software does.
 *
 * Source of truth: brand/coop-mark.svg (this is that file as a component).
 * Geometry: ring centre 24,24 r14.2 stroke 6.8; crate 15.2×13.6 r4.8.
 * Colours are the design system's AI gradient, hard-coded on purpose — a
 * logo is a fixed asset, not a themed surface, and `useId` keeps the two
 * gradients unique when the mark renders more than once on a page.
 */
export interface CoopMarkProps {
  size?: number;
  className?: string;
  /** Accessible label (default: the mark is decorative). */
  title?: string;
  /** Force a single colour (print, one-colour surfaces, watermarks). */
  color?: string;
}

export const CoopMark: React.FC<CoopMarkProps> = ({ size = 32, className, title, color }) => {
  const id = React.useId();
  const ring = color ?? `url(#${id}-ring)`;
  const crate = color ?? `url(#${id}-crate)`;
  // The crate is knocked out of the ring by a gap so the two shapes stay
  // separate when they share a colour. In full colour the gradients already
  // separate them, so the mask is only needed for the single-colour version.
  const gapMask = color ? `${id}-gap` : undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b5fef" />
          <stop offset="1" stopColor="#8a4cfc" />
        </linearGradient>
        <linearGradient id={`${id}-crate`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a4cfc" />
          <stop offset="1" stopColor="#5b5fef" />
        </linearGradient>
        {gapMask && (
          <mask id={gapMask}>
            <rect width="48" height="48" fill="#fff" />
            <rect x="18.2" y="14" width="21.6" height="20" rx="7.4" fill="#000" />
          </mask>
        )}
      </defs>
      <path
        d="M33.4 13.2 A14.2 14.2 0 1 0 33.4 34.8"
        fill="none"
        stroke={ring}
        strokeWidth="6.8"
        strokeLinecap="round"
        mask={gapMask ? `url(#${gapMask})` : undefined}
      />
      <rect x="21.4" y="17.2" width="15.2" height="13.6" rx="4.8" fill={crate} />
    </svg>
  );
};

export interface CoopLogoProps {
  /** Mark size in px (wordmark scales with it). */
  size?: number;
  /** Hide the wordmark (icon-only usage). */
  iconOnly?: boolean;
  className?: string;
  /** Small-caps subtitle under the wordmark (sidebar usage). */
  subtitle?: string;
}

/**
 * Co-op combined lockup: mark + "Co-op" wordmark.
 * The wordmark is real text (crisp, selectable, theme-aware) rather than
 * a raster/SVG font.
 */
export const CoopLogo: React.FC<CoopLogoProps> = ({ size = 32, iconOnly = false, className, subtitle }) => {
  const { colors } = useCoopTheme();
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.max(8, size * 0.26) }}>
      <CoopMark size={size} title="Co-op" />
      {!iconOnly && (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, minWidth: 0 }}>
          <span
            style={{
              fontSize: Math.round(size * 0.62),
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: colors.primary,
              whiteSpace: 'nowrap',
            }}
          >
            Co-op
          </span>
          {subtitle && (
            <span
              style={{
                fontSize: Math.max(9, Math.round(size * 0.24)),
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: colors.onSurfaceVariant,
                whiteSpace: 'nowrap',
              }}
            >
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );
};
