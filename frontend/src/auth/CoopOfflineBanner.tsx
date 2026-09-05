/**
 * Co-op offline banner (Stage 3 — auth error states, "Offline/Network
 * Error" pattern from coop_system_error_states_polished).
 *
 * Clerk is a hosted service: without a network the sign-in/sign-up card can
 * do nothing. Rather than a silently stuck form, the auth screens show this
 * banner whenever the browser reports being offline, with an honest Retry
 * action (reload re-attempts Clerk key + session bootstrap).
 */
import React, { useEffect, useState } from 'react';
import { WifiOutlined } from '@ant-design/icons';
import { radius, spacing, tint, type } from '../theme';
import { useCoopTheme } from '../theme-provider';

const CoopOfflineBanner: React.FC = () => {
  const { colors, isDark } = useCoopTheme();
  const [offline, setOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        maxWidth: 420,
        padding: '12px 14px',
        borderRadius: radius.lg,
        background: tint(colors.error, isDark ? 0.16 : 0.08),
        border: `1px solid ${tint(colors.error, isDark ? 0.4 : 0.25)}`,
        marginBottom: spacing.md,
      }}
    >
      <WifiOutlined style={{ color: colors.error, fontSize: 18, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...type.bodyCompact, fontWeight: 700, color: colors.error }}>Offline / network error</div>
        <div style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.onSurfaceVariant }}>
          You appear to be offline. Reconnecting to Co-op…
        </div>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          border: `1px solid ${colors.outlineVariant}`,
          background: colors.surfaceContainerLowest,
          color: colors.onSurfaceVariant,
          fontWeight: 600,
          fontSize: 12.5,
          borderRadius: radius.md,
          padding: '7px 12px',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Retry Now
      </button>
    </div>
  );
};

export default CoopOfflineBanner;
