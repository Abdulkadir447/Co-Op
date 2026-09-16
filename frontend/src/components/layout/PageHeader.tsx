/**
 * Co-op PageHeader — the page-title pattern (Stitch Stage R1 "Page Title").
 *
 * pageTitle type (32/40/700, -0.02em) + body-compact subtitle, with an
 * optional right-aligned actions slot (CTAs, filters). Every module page
 * starts with this so title size, weight and actions align app-wide.
 */
import React from 'react';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { spacing, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Right-aligned actions (buttons, segmented control). */
  actions?: React.ReactNode;
  /** Renders a back button before the title (detail pages). */
  onBack?: () => void;
  /** Accessible label for the back button. */
  backLabel?: string;
  style?: React.CSSProperties;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, onBack, backLabel, style }) => {
  const { colors } = useCoopTheme();
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: spacing.md,
        marginBottom: spacing.md,
        ...style,
      }}
    >
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel ?? 'Go back'}
            title={backLabel ?? 'Go back'}
            style={{
              flex: '0 0 auto',
              width: 38,
              height: 38,
              borderRadius: 10,
              border: `1px solid ${colors.borderSubtle}`,
              background: colors.surfaceContainer,
              color: colors.onSurface,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <ArrowLeftOutlined />
          </button>
        )}
        <h1
          style={{
            margin: 0,
            ...type.pageTitle,
            color: colors.onBackground,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: '6px 0 0', ...type.bodyCompact, color: colors.onSurfaceVariant }}>{subtitle}</p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>{actions}</div>}
    </div>
  );
};

export default PageHeader;
