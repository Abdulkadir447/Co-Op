/**
 * CoopBadge — status pill (Stage R1 "Badge / StatusPill").
 *
 * Tinted background of the semantic color, high-contrast text, 8px radius,
 * label-caps. In dark mode the tint is deepened so pills keep contrast on
 * elevated dark surfaces.
 */
import React from 'react';
import { radius, type } from '../../theme';
import { useCoopTheme, } from '../../theme-provider';
import { tint } from '../../theme/colors';

export type CoopBadgeVariant = 'success' | 'warning' | 'critical' | 'info' | 'primary' | 'neutral';

export interface CoopBadgeProps {
  children: React.ReactNode;
  variant?: CoopBadgeVariant;
  /** Optional leading icon (e.g. a trend arrow). */
  icon?: React.ReactNode;
  /** Small dot before the label (used by inventory chips). */
  dot?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

const TINT_ALPHA: Record<'light' | 'dark', number> = { light: 0.1, dark: 0.2 };

const CoopBadge: React.FC<CoopBadgeProps> = ({
  children,
  variant = 'neutral',
  icon,
  dot = false,
  style,
  className,
}) => {
  const { colors, isDark } = useCoopTheme();
  const a = TINT_ALPHA[isDark ? 'dark' : 'light'];

  // Text uses the darker *Text variants: at 12px on a 10% tint the base hues
  // measure 2.1–3.1:1 and fail WCAG 1.4.3. Dots/icons keep the vivid hue.
  const fg =
    variant === 'success' ? colors.successText
    : variant === 'warning' ? colors.warningText
    : variant === 'critical' ? colors.errorText
    : variant === 'info' ? colors.infoText
    : variant === 'primary' ? colors.onPrimaryFixedVariant
    : colors.onSurfaceVariant;

  const bg =
    variant === 'primary'
      ? colors.primaryFixed
      : variant === 'neutral'
        ? colors.surfaceVariant
        : tint(fg, a);

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: radius.md,
        background: bg,
        color: fg,
        ...type.labelCaps,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: fg }} />}
      {icon}
      {children}
    </span>
  );
};

export default CoopBadge;
