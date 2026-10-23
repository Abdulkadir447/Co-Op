/**
 * First-run onboarding — "Welcome to Co-op".
 *
 * Shown when a signed-in tenant has no business data yet (backend
 * /onboarding/state). The point of this screen is to make the Intelligent
 * Importer the FIRST thing a new business does — not a page buried in
 * Settings. "Start from scratch" keeps the manual path equally visible.
 */
import React from 'react';
import {
  ImportOutlined,
  RocketOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { spacing, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { CoopButton, CoopCard } from '../../components/ui';
import { SparkleIcon } from '../../components/ui/icons';
import { CoopMark } from '../../components/brand/CoopLogo';

// AI accent stops (same as the theme's aiGradient, as raw colors for tints).
const AI_FROM = '#5b5fef';
const AI_TO = '#8a4cfc';

const PILLARS = [
  {
    icon: <ImportOutlined />,
    title: 'Bring your data',
    body: 'Drop in your old system\u2019s export \u2014 products, customers or sales history.',
  },
  {
    icon: <CheckCircleFilled />,
    title: 'Co-op organizes it',
    body: 'Co-op maps your columns, you confirm. Nothing is written before you review.',
  },
  {
    icon: <SparkleIcon size={16} />,
    title: 'Co-op understands it',
    body: 'Your Day 1 Briefing: what matters, what\u2019s at risk, and a draft action to take.',
  },
];

const WelcomePage: React.FC = () => {
  const { colors } = useCoopTheme();
  const navigate = useNavigate();

  // "Start from scratch" → the empty dashboard. RootGate shows /welcome only
  // until the owner makes this choice; the flag stops it bouncing back here
  // on every "/" visit while the business still has no data.
  const startFromScratch = () => {
    try {
      window.localStorage.setItem('coop:started-manual', '1');
    } catch {
      /* persistence is a nicety */
    }
    navigate('/');
  };

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${spacing.xl}px 16px`,
        background: `radial-gradient(1200px 500px at 50% -10%, ${AI_FROM}14, transparent 70%), ${colors.surface}`,
      }}
    >
      <div style={{ width: '100%', maxWidth: 640, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: spacing.lg }}>
          <CoopMark size={56} />
        </div>

        <h1
          style={{
            margin: 0,
            ...type.pageTitle,
            fontSize: 34,
            color: colors.onBackground,
            letterSpacing: '-0.02em',
          }}
        >
          Welcome to Co-op
        </h1>
        <p
          style={{
            margin: '10px 0 0',
            ...type.titleMd,
            color: colors.onSurfaceVariant,
          }}
        >
          Let&rsquo;s get your business ready.
        </p>
        <p style={{ margin: '14px 0 0', ...type.bodyCompact, color: colors.outline, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
          Have data from another system? Co-op imports it, organizes it, and tells you
          what matters \u2014 in one go.
        </p>

        {/* Primary CTA — the importer is the hero of first run */}
        <div style={{ marginTop: spacing.lg, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          <CoopButton size="lg" icon={<ImportOutlined />} onClick={() => navigate('/import')}>
            Import my business data
          </CoopButton>
          <div style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.outline }}>or</div>
          <CoopButton size="lg" variant="secondary" icon={<RocketOutlined />} onClick={startFromScratch}>
            Start from scratch
          </CoopButton>
        </div>

        {/* What happens — sets the expectation, keeps the trust story */}
        <div
          style={{
            marginTop: spacing.lg,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            textAlign: 'left',
          }}
        >
          {PILLARS.map((p) => (
            <CoopCard key={p.title} style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span
                  aria-hidden
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: `${AI_TO}22`,
                    color: colors.primary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                  }}
                >
                  {p.icon}
                </span>
                <span style={{ ...type.titleMd, fontSize: 14, color: colors.onSurface }}>{p.title}</span>
              </div>
              <div style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.onSurfaceVariant, lineHeight: '19px' }}>
                {p.body}
              </div>
            </CoopCard>
          ))}
        </div>

        <div style={{ marginTop: spacing.lg, ...type.bodyCompact, fontSize: 12, color: colors.outline }}>
          Nothing is written until you review the mapping \u2014 and every import keeps its provenance.
        </div>
      </div>
    </div>
  );
};

export default WelcomePage;
