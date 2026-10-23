/**
 * Co-op Sidebar (Stitch app-shell, left rail).
 *
 * A fixed 72px icon rail, white, 1px border-subtle right edge, flat (no
 * shadow). Every entry is an icon and hovering it shows the name in a
 * tooltip, so there is no expanded (labelled) desktop state and no
 * collapse/expand control. Anatomy:
 *   1. Brand — Co-op mark.
 *   2. Primary nav — Overview / Reports / Products / Inventory / Orders /
 *      Customers / Import. Active = surface-container-low fill + primary
 *      icon.
 *   3. Bottom — Settings (parked here, out of the nav list) and
 *      "Upgrade Plan" (secondary action).
 *
 * On < md the sidebar is rendered as a slide-in drawer (AppShell controls
 * the open state) with the labels shown inline; on desktop it is fixed.
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from 'antd';
import { radius, shadow, spacing, transition, z } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { NAV_ITEMS, NAV_SECONDARY, type NavItem } from './nav';
import { CoopLogo, CoopMark } from '../brand/CoopLogo';

/** Width of the fixed desktop rail. Icon-only; names come from tooltips. */
export const SIDEBAR_WIDTH = 72;

export interface SidebarProps {
  /** Mobile drawer state (AppShell-managed). Ignored on desktop. */
  open?: boolean;
  onClose?: () => void;
}

interface RailContentProps {
  /** 'rail' = desktop icon rail (tooltips); 'drawer' = mobile drawer (labels). */
  variant: 'rail' | 'drawer';
  onNavigate?: () => void;
}

const navItemBase = (active: boolean, rail: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: rail ? '11px 0' : '9px 12px',
  justifyContent: rail ? 'center' : 'flex-start',
  borderRadius: radius.md,
  border: 'none',
  background: active ? 'var(--coop-nav-active-bg)' : 'transparent',
  color: active ? 'var(--coop-nav-active-color)' : 'var(--coop-nav-color)',
  fontWeight: active ? 600 : 400,
  fontSize: 14,
  lineHeight: '20px',
  cursor: 'pointer',
  textAlign: 'left',
  transition: transition('background-color, color'),
});

const SidebarContent: React.FC<RailContentProps> = ({ variant, onNavigate }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { colors } = useCoopTheme();
  const rail = variant === 'rail';

  const allItems = NAV_ITEMS.concat(NAV_SECONDARY);
  // Exact match first, then child routes (e.g. /customers/:id keeps the
  // "Customers" item active).
  const activeKey =
    allItems.find((i) => i.path === location.pathname)?.key ??
    allItems.find((i) => i.path !== '/' && location.pathname.startsWith(`${i.path}/`))?.key;

  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  // CSS variables keep the nav colors in one place per theme.
  const vars = {
    '--coop-nav-active-bg': colors.surfaceContainerLow,
    '--coop-nav-active-color': colors.primary,
    '--coop-nav-color': colors.onSurfaceVariant,
  } as React.CSSProperties;

  const item = (navItem: NavItem) => {
    const active = activeKey === navItem.key;
    const btn = (
      <button
        key={navItem.key}
        type="button"
        style={navItemBase(active, rail)}
        onClick={() => go(navItem.path)}
        aria-current={active ? 'page' : undefined}
        aria-label={rail ? navItem.label : undefined}
      >
        <span style={{ fontSize: 18, display: 'inline-flex' }}>{navItem.icon}</span>
        {!rail && <span>{navItem.label}</span>}
      </button>
    );
    return rail ? (
      <Tooltip key={navItem.key} title={navItem.label} placement="right" mouseEnterDelay={0.35}>
        {btn}
      </Tooltip>
    ) : (
      btn
    );
  };

  const upgradeBtn = (
    <button
      type="button"
      onClick={() => go('/billing')}
      aria-label="Upgrade Plan"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: rail ? 'center' : 'flex-start',
        gap: 8,
        width: '100%',
        height: 40,
        padding: rail ? 0 : '0 12px',
        borderRadius: radius.lg,
        border: `1px solid ${colors.outlineVariant}`,
        background: colors.surfaceContainerLowest,
        color: colors.primary,
        fontWeight: 600,
        fontSize: 13,
        cursor: 'pointer',
        transition: transition('background-color, box-shadow'),
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceContainerLow)}
      onMouseLeave={(e) => (e.currentTarget.style.background = colors.surfaceContainerLowest)}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 19V5m0 0-6 6m6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!rail && 'Upgrade Plan'}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', ...vars }}>
      {/* Brand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: rail ? 'center' : 'flex-start',
          padding: `0 ${rail ? 0 : spacing.sm}px ${spacing.xl}px`,
        }}
      >
        {rail ? <CoopMark size={40} title="CO OP" /> : <CoopLogo size={40} subtitle="Premium SaaS" />}
      </div>

      {/* Primary nav */}
      <nav
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 4 }}
        aria-label="Primary"
      >
        {NAV_ITEMS.map((i) => item(i))}
      </nav>

      {/* Bottom: Settings + upgrade action */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: `${spacing.md}px ${rail ? 0 : spacing.sm}px 0`,
        }}
      >
        <div aria-hidden style={{ height: 1, background: colors.borderSubtle }} />

        {NAV_SECONDARY.map((i) => item(i))}

        {rail ? (
          <Tooltip title="Upgrade Plan" placement="right" mouseEnterDelay={0.35}>
            {upgradeBtn}
          </Tooltip>
        ) : (
          upgradeBtn
        )}
      </div>
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ open = false, onClose }) => {
  const { colors } = useCoopTheme();

  return (
    <>
      {/* Desktop rail (fixed, icon-only) */}
      <aside
        style={{
          position: 'fixed',
          inset: `0 auto 0 0`,
          width: SIDEBAR_WIDTH,
          zIndex: z.sidebar,
          background: colors.surfaceContainerLowest,
          borderRight: `1px solid ${colors.borderSubtle}`,
          padding: `${spacing.lg}px ${spacing.sm}px`,
          display: 'block',
          transition: transition('background-color, border-color'),
        }}
        className="coop-sidebar-desktop"
        aria-label="Sidebar"
      >
        <SidebarContent variant="rail" />
      </aside>

      {/* Mobile drawer overlay */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: isDrawerDark() ? 'rgba(10, 10, 14, 0.55)' : 'rgba(27, 27, 35, 0.35)',
          zIndex: z.drawerOverlay,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: transition('opacity'),
        }}
        className="coop-sidebar-overlay"
      />
      <aside
        aria-hidden={!open}
        style={{
          position: 'fixed',
          inset: `0 auto 0 0`,
          width: 280,
          maxWidth: '85vw',
          zIndex: z.drawerOverlay + 1,
          background: colors.surfaceContainerLowest,
          borderRight: `1px solid ${colors.borderSubtle}`,
          padding: `${spacing.lg}px ${spacing.md}px`,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'block',
          boxShadow: open ? shadow.overlay : 'none',
        }}
        className="coop-sidebar-drawer"
        aria-label="Mobile sidebar"
      >
        <SidebarContent variant="drawer" onNavigate={onClose} />
      </aside>
    </>
  );
};

function isDrawerDark(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}

export default Sidebar;
