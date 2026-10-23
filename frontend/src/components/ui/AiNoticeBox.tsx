import React from 'react';
import { message } from 'antd';
import { radius, spacing, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { SparkleIcon } from './icons';

export interface AiNoticeBoxProps {
  /** Label-caps eyebrow, e.g. "Generate Product Description". */
  title: string;
  description: string;
  /** Optional action link (defaults to an honest "coming soon" notice). */
  actionLabel?: string;
  onAction?: () => void;
  /** Render as a compact inline box (forms) vs a full-width banner. */
  compact?: boolean;
}

/**
 * Zeno notice box (Stage R1 AI chrome: 2px gradient top border +
 * sparkle mark).
 *
 * Honesty rule: Zeno — Ask Zeno, Live Insights and report explanations —
 * is live. These boxes are reserved for a SPECIFIC analysis that is not yet
 * built, so the copy must name that capability as "coming" while making
 * clear the assistant itself is already available — never implying AI is
 * unavailable, and never a fabricated result.
 */
const AiNoticeBox: React.FC<AiNoticeBoxProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}) => {
  const { colors } = useCoopTheme();
  const handleAction = () =>
    onAction ?? (() => message.info('This specific analysis is still on the roadmap — Ask Zeno is available now.'));

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: radius.lg,
        border: `1px solid ${colors.borderSubtle}`,
        background: colors.surfaceContainerLow,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${colors.primaryContainer}, ${colors.secondaryContainer}, ${colors.inversePrimary})`,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: compact ? '14px 16px' : `${spacing.md}px 20px`,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.full,
            background: colors.surfaceContainerLowest,
            border: `1px solid ${colors.borderSubtle}`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.secondaryContainer,
            flexShrink: 0,
          }}
        >
          <SparkleIcon size={17} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...type.titleMd, fontSize: 14.5, color: colors.onSurface, marginBottom: 3 }}>
            {title}
          </div>
          <div style={{ ...type.bodyCompact, fontSize: 13, color: colors.onSurfaceVariant }}>
            {description}
          </div>
          {actionLabel && (
            <button
              type="button"
              onClick={handleAction}
              style={{
                marginTop: 8,
                border: 'none',
                background: 'transparent',
                padding: 0,
                color: colors.primary,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiNoticeBox;
