import React from 'react';
import { useCoopTheme } from '../../theme-provider';

/**
 * Co-op brand mark — "two partners, one spark".
 *
 * Two overlapping rounded squares (cooperation), a deeper shared overlap
 * (the common ground), and a four-point spark at the center (intelligence).
 * Built from the design system's purple family so it feels native in both
 * light and dark modes. Inline SVG = crisp at any size, themeable,
 * accessible.
 */
export interface CoopMarkProps {
  size?: number;
  className?: string;
  /** Accessible label (default describes the mark). */
  title?: string;
}

export const CoopMark: React.FC<CoopMarkProps> = ({ size = 32, className, title }) => {
  const id = React.useId();
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
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b5fef" />
          <stop offset="1" stopColor="#4143d5" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a4cfc" />
          <stop offset="1" stopColor="#712ae2" />
        </linearGradient>
        <linearGradient id={`${id}-c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c0c1ff" />
          <stop offset="1" stopColor="#8a8df5" />
        </linearGradient>
      </defs>
      {/* Weave: three overlapping rounded petals, transparent background. */}
      <rect x="14" y="5" width="20" height="21" rx="9" fill={`url(#${id}-a)`} />
      <rect x="6" y="19" width="20" height="21" rx="9" fill={`url(#${id}-b)`} opacity="0.94" />
      <rect x="22" y="19" width="20" height="21" rx="9" fill={`url(#${id}-c)`} opacity="0.9" />
      <path
        d="M24 17 Q26.6 22.4 30.5 25 Q26.6 27.6 24 33 Q21.4 27.6 17.5 25 Q21.4 22.4 24 17 Z"
        fill="#ffffff"
        opacity="0.96"
      />
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
      <CoopMark size={size} title="CO OP" />
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
            CO OP
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
