/**
 * CoopCard — the Co-op container primitive (Stage R1 "Cards").
 *
 * Level-1 elevation by design: surface-container-lowest background, 1px
 * border-subtle border, 12px radius, NO shadow. `hoverable` lifts to Level 2
 * (diffused shadow). The `ai` variant adds the signature 2px gradient top
 * border that marks AI-generated content (Stage R1 "AICard").
 *
 * `flush` removes body padding — use for tables/lists that span the card
 * edge-to-edge (the "Data List View" pattern).
 */
import React from 'react';
import { radius, shadow, spacing, transition, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { SparkleIcon } from './icons';

export interface CoopCardProps {
  children: React.ReactNode;
  /** Card heading (title-md style). */
  title?: React.ReactNode;
  /** Small muted line under the title. */
  subtitle?: string;
  /** Right-aligned header slot (buttons, switches). */
  extra?: React.ReactNode;
  /** Marks the card as AI-powered: gradient top border + sparkle mark. */
  ai?: boolean;
  /** AI module label, e.g. "Zeno Insight" (gradient text). */
  aiLabel?: string;
  /** Hover lift (Level 2). */
  hoverable?: boolean;
  /** Remove body padding (edge-to-edge content such as tables). */
  flush?: boolean;
  /** Body padding when not flush. Defaults to 16. */
  bodyPadding?: number;
  style?: React.CSSProperties;
  className?: string;
  'aria-label'?: string;
  onClick?: () => void;
}

const CoopCard: React.FC<CoopCardProps> = ({
  children,
  title,
  subtitle,
  extra,
  ai = false,
  aiLabel,
  hoverable = false,
  flush = false,
  bodyPadding = 16,
  style,
  className,
  onClick,
  ...rest
}) => {
  const { colors, isDark } = useCoopTheme();
  const [hovered, setHovered] = React.useState(false);
  const hasHeader = title || subtitle || extra;

  return (
    <div
      {...rest}
      className={className}
      onClick={onClick}
      onMouseEnter={hoverable ? () => setHovered(true) : undefined}
      onMouseLeave={hoverable ? () => setHovered(false) : undefined}
      style={{
        background: colors.surfaceContainerLowest,
        border: `1px solid ${hovered && hoverable ? colors.outlineVariant : colors.borderSubtle}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
        transition: transition('box-shadow, border-color'),
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: hovered && hoverable ? (isDark ? '0 4px 16px rgba(0, 0, 0, 0.4)' : shadow.lift) : 'none',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {ai && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, ${colors.primaryContainer}, ${colors.secondaryContainer}, ${colors.inversePrimary})`,
            borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
          }}
        />
      )}

      {hasHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: spacing.md,
            padding: `${spacing.md}px ${bodyPadding}px`,
            paddingBottom: subtitle || extra ? spacing.md : 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {ai && aiLabel ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  ...type.labelCaps,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                <SparkleIcon size={16} color={colors.secondaryContainer} />
                <span className="coop-ai-gradient-text">{aiLabel}</span>
              </div>
            ) : (
              title && (
                <div
                  style={{
                    ...type.titleMd,
                    color: colors.onSurface,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {title}
                </div>
              )
            )}
            {subtitle && (
              <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          {extra && <div style={{ flexShrink: 0 }}>{extra}</div>}
        </div>
      )}

      <div style={{ padding: flush ? 0 : bodyPadding, flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
};

export default CoopCard;
