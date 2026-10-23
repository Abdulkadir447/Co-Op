/**
 * Clerk fatal-error boundary (Stage 3 — auth error states).
 *
 * Wraps the ClerkProvider in main.tsx. If Clerk cannot initialise (bad
 * publishable key, blocked network, failed key fetch) it throws during
 * render; instead of a white screen the user gets the Co-op system-error
 * treatment (coop_system_error_states_polished "500" card): icon, heading,
 * explanation, and a Retry action.
 *
 * Sits OUTSIDE CoopThemeProvider (no theme context available here) so it
 * styles itself with the static light palette.
 */
import React from 'react';
import { CloseCircleFilled } from '@ant-design/icons';
import { radius, shadow, spacing, type } from '../theme';
import { colors } from '../theme/colors';

interface Props {
  children: React.ReactNode;
}

interface State {
  failed: boolean;
  message?: string;
}

export class ClerkErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    // The preview/dev surface has no logger — keep the signal in the console
    // for diagnostics without adding dependencies.
    console.error('Clerk failed to initialise:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.md,
          background: colors.surface,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 460,
            background: colors.surfaceContainerLowest,
            border: `1px solid ${colors.borderSubtle}`,
            borderRadius: radius.xl,
            boxShadow: shadow.soft,
            padding: 40,
            textAlign: 'center',
          }}
        >
          <div
            aria-hidden
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(186, 26, 26, 0.1)',
              color: colors.error,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: 24,
            }}
          >
            <CloseCircleFilled />
          </div>
          <h1 style={{ ...type.sectionHeading, color: colors.onSurface, fontSize: 24, margin: 0 }}>
            Unable to load Co-op
          </h1>
          <p style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginTop: 10, marginBottom: 0 }}>
            Authentication could not be initialised{this.state.message ? ` (${this.state.message})` : ''}. This
            usually means the Clerk publishable key is missing or the network is unreachable.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 24,
              height: 40,
              padding: '0 20px',
              borderRadius: radius.lg,
              border: `1px solid ${colors.primary}`,
              background: colors.primary,
              color: colors.onPrimary,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
