import React, { useEffect, useState } from 'react';
import { CloseOutlined, RightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { radius, spacing, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { useApiClient } from '../../services/api/client';
import { isLocalModeActive } from '../../repositories';
import { getLocalBundle } from '../../analytics/localData';
import { briefingBanner as localBriefingBanner } from '../../analytics/localBriefing';
import { SparkleIcon } from '../ui/icons';

const SEEN_KEY = 'coop:briefing-seen';

/**
 * Dashboard briefing banner (v1 onboarding): shown until the user reads or
 * dismisses the Day 1 Briefing. Fetches the briefing once for its headline
 * insight — the full briefing lives at /briefing.
 */
const BriefingBanner: React.FC = () => {
  const { colors } = useCoopTheme();
  const navigate = useNavigate();
  const api = useApiClient();
  const [visible, setVisible] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SEEN_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [ready, setReady] = useState<boolean | null>(null);
  const [headline, setHeadline] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // OFFLINE 3.5: local mode — the deterministic briefing from the mirror.
    if (isLocalModeActive()) {
      getLocalBundle()
        .then((b) => {
          if (cancelled) return;
          const bf = localBriefingBanner(b);
          setReady(bf.ready);
          const top = bf.insights?.[0];
          if (top) setHeadline(top.title);
        })
        .catch(() => {
          if (!cancelled) setReady(false);
        });
      return () => {
        cancelled = true;
      };
    }
    api
      .get<{ ready: boolean; insights: Array<{ title: string; severity: string }> }>('/dashboard/briefing')
      .then(({ data }) => {
        if (cancelled) return;
        setReady(data.ready);
        const top = data.insights?.[0];
        if (top) setHeadline(top.title);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, visible]);

  if (!visible || ready === null) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* non-fatal */
    }
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Morning briefing"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radius.lg,
        marginBottom: spacing.md,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `14px ${spacing.md}px` }}>
        <span
          aria-hidden
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${colors.primaryContainer}, ${colors.secondaryContainer})`,
            color: colors.onPrimary,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <SparkleIcon size={17} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...type.bodyCompact, fontWeight: 700, color: colors.onSurface }}>
            {ready ? 'Your Day 1 Briefing is ready' : 'Your briefing is waiting for your data'}
          </div>
          <div
            style={{
              ...type.bodyCompact,
              fontSize: 12,
              color: colors.onSurfaceVariant,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ready
              ? headline ?? 'Co-op read your business and found what matters.'
              : 'Import your products, customers or sales history and Co-op will brief you here.'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/briefing')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            border: 'none',
            background: colors.primary,
            color: colors.onPrimary,
            fontWeight: 600,
            fontSize: 13,
            borderRadius: radius.md,
            padding: '8px 14px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Read briefing <RightOutlined style={{ fontSize: 10 }} />
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss briefing banner"
          style={{
            border: 'none',
            background: 'transparent',
            color: colors.outline,
            cursor: 'pointer',
            padding: 6,
            display: 'inline-flex',
          }}
        >
          <CloseOutlined />
        </button>
      </div>
    </div>
  );
};

export default BriefingBanner;
