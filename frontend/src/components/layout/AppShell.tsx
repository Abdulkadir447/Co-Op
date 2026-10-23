/**
 * Co-op AppShell — the chrome every module lives inside (Stitch app-shell,
 * Stage 2 rebuild).
 *
 *   ┌────────────┬────────────────────────────────────────┐
 *   │            │  TopBar (sticky: search · AI · alerts · │
 *   │  Sidebar   │          theme · account)               │
 *   │   72px     ├────────────────────────────────────────┤
 *   │  (fixed)   │  Page content (transition on route)     │
 *   └────────────────────────────────────────────────────┘
 *
 * The sidebar is a permanent 72px icon rail — hovering an icon reveals its
 * name, so there is no expand/collapse state to manage.
 *
 * Stage-2 additions:
 *   - Command palette (⌘K / Ctrl+K anywhere, or click the search field).
 *   - Notifications + theme toggle in the TopBar.
 *   - Window title follows the active module ("<Module> · Co-op").
 *   - Global transitions: page fade/rise on route change, theme cross-fades.
 */
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { radius, spacing } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { NAV_ITEMS, NAV_SECONDARY } from './nav';
import Sidebar, { SIDEBAR_WIDTH } from './Sidebar';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';
import { CoopMark } from '../brand/CoopLogo';
import { useApiClient } from '../../services/api/client';
import FeedbackModal, { type FeedbackValues } from '../feedback/FeedbackModal';

export interface AppShellProps {
  children: React.ReactNode;
  user?: TopBarUserLike | null;
  onSignOut: () => void;
}

type TopBarUserLike = {
  fullName?: string | null;
  firstName?: string | null;
  email?: string | null;
  imageUrl?: string | null;
};

const AppShell: React.FC<AppShellProps> = ({ children, user, onSignOut }) => {
  const { colors } = useCoopTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Periodic product-feedback prompt. Checked once on mount; the backend
  // decides if it's due (3 weeks after the paid relationship began) and
  // whether it's the compulsory first one. Failures are silent — a missing
  // prompt must never block the app.
  const api = useApiClient();
  const [feedbackState, setFeedbackState] = useState<{ open: boolean; required: boolean }>({
    open: false,
    required: false,
  });
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ due: boolean; required: boolean }>('/feedback/status')
      .then((r) => {
        if (!cancelled && r.data.due) {
          setFeedbackState({ open: true, required: r.data.required });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  const submitFeedback = async (values: FeedbackValues) => {
    setFeedbackSubmitting(true);
    try {
      await api.post('/feedback', values);
      setFeedbackState({ open: false, required: false });
    } catch {
      // Keep the modal open so a required prompt isn't lost on a network blip.
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const skipFeedback = async () => {
    setFeedbackState({ open: false, required: false });
    try {
      await api.post('/feedback/dismiss');
    } catch {
      /* skipping is best-effort */
    }
  };

  // Global ⌘K / Ctrl+K — open or close the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  // Window/title area: "<Module> · Co-op" follows the active route.
  useEffect(() => {
    const active = [...NAV_ITEMS, ...NAV_SECONDARY].find((i) => i.path === location.pathname);
    document.title = active ? `${active.label} · CO OP` : 'CO OP';
  }, [location.pathname]);

  return (
    <div style={{ minHeight: '100vh', background: colors.surface, transition: 'background-color 300ms' }}>
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div
        className="coop-main-col"
        style={{
          marginLeft: SIDEBAR_WIDTH,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TopBar
          user={user}
          onSignOut={onSignOut}
          onMenuClick={() => setDrawerOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <main
          className="coop-main"
          style={{ flex: 1, padding: `${spacing.lg}px ${spacing.lg}px ${spacing.xl}px` }}
        >
          {/* Keyed by path so each navigation replays the entrance transition. */}
          <div key={location.pathname} className="coop-page-enter">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <FeedbackModal
        open={feedbackState.open}
        required={feedbackState.required}
        submitting={feedbackSubmitting}
        onSubmit={submitFeedback}
        onSkip={skipFeedback}
      />

      {/* Floating Zeno entry (bottom-right; hidden on the assistant page).
          Kept off the left edge so it never covers the sidebar rail. */}
      {location.pathname !== '/coop-ai' && (
        <button
          type="button"
          onClick={() => navigate('/coop-ai')}
          aria-label="Open the Zeno assistant"
          title="Ask Zeno"
          className="coop-ai-fab"
          style={{
            position: 'fixed',
            right: 20,
            bottom: 88,
            width: 48,
            height: 48,
            borderRadius: radius.lg,
            border: `1px solid ${colors.borderSubtle}`,
            background: colors.surfaceContainerLowest,
            color: colors.onPrimary,
            cursor: 'pointer',
            zIndex: 55,
            boxShadow: '0 8px 24px rgba(91, 95, 239, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.06)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <CoopMark size={30} title="Zeno" />
        </button>
      )}
    </div>
  );
};

export default AppShell;
