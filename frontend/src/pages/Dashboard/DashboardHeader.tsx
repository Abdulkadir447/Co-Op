import React, { useEffect, useState } from 'react';
import { spacing, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import type { BusinessIdentity } from './useDashboardData';

/**
 * Dashboard page header (Stitch coop_business_dashboard_qa_polished):
 * "CURRENT BUSINESS DISPLAY" label-caps eyebrow, the business name +
 * currency as the page title, and a live "Last updated" line.
 *
 * Business name/currency come from /business/settings (fetched by the data
 * hook); the updated stamp is the real finish time of the last successful
 * load, re-evaluated on a 30s tick ("Just now" → "2 min ago" …).
 */
const DashboardHeader: React.FC<{
  business: BusinessIdentity | null;
  lastUpdated: Date | null;
}> = ({ business, lastUpdated }) => {
  const { colors } = useCoopTheme();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const updatedLabel = (() => {
    if (!lastUpdated) return 'Loading…';
    const mins = Math.floor((now - lastUpdated.getTime()) / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    return lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();

  return (
    <header
      aria-label="Dashboard header"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: spacing.md,
        marginBottom: spacing.md,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            ...type.labelCaps,
            color: colors.outline,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 6,
          }}
        >
          Current business display
        </div>
        <h1
          style={{
            margin: 0,
            ...type.pageTitle,
            fontSize: 30,
            lineHeight: '38px',
            color: colors.onBackground,
            letterSpacing: '-0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {business ? business.name : 'Your business'}
          {business && (
            <span style={{ ...type.bodyDefault, fontSize: 18, fontWeight: 500, color: colors.onSurfaceVariant }}>
              {' '}
              ({business.currency})
            </span>
          )}
        </h1>
      </div>
      <div style={{ ...type.bodyCompact, color: colors.outline, whiteSpace: 'nowrap' }}>
        Last updated: {updatedLabel}
      </div>
    </header>
  );
};

export default DashboardHeader;
