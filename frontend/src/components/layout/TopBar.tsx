/**
 * Co-op TopBar (Stitch app-shell, sticky header).
 *
 * Translucent blurred bar + 1px border-subtle bottom edge. Anatomy:
 *   mobile  — hamburger (opens the sidebar drawer)
 *   left    — global search field (opens the ⌘K command palette)
 *   right   — Zeno pill · notifications (real inventory alerts) ·
 *             theme toggle (light/dark) · account menu (profile + sign out)
 *
 * Stage-2 notes: global search is a REAL command palette (pages + live
 * backend search); notifications are REAL low/out-of-stock alerts. The AI
 * Assistant pill is a design slot that answers honestly until Stage 3.
 */
import React, { useState } from 'react';
import { Avatar, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  SafetyCertificateOutlined,
  SunOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { setAdminMode, useAdminMode, useIsPlatformAdmin } from '../../hooks/usePlatformAdmin';
import { radius, spacing } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { SparkleIcon } from '../ui/icons';
import NotificationsPopover from './NotificationsPopover';
import SyncIndicator from './SyncIndicator';

/** Minimal structural user shape (Clerk's UserResource satisfies it). */
export interface TopBarUser {
  fullName?: string | null;
  firstName?: string | null;
  email?: string | null;
  imageUrl?: string | null;
}

export interface TopBarProps {
  user?: TopBarUser | null;
  onSignOut: () => void;
  onMenuClick: () => void;
  /** Opens the command palette (search field interaction). */
  onOpenPalette: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ user, onSignOut, onMenuClick, onOpenPalette }) => {
  const { colors, isDark, toggle } = useCoopTheme();
  const [searchHover, setSearchHover] = useState(false);
  const navigate = useNavigate();
  const name = user?.fullName || user?.firstName || 'Account';
  const isAdmin = useIsPlatformAdmin();
  const adminMode = useAdminMode();

  // Product-owner-only entries: open the console, and flip admin/normal. The
  // backend is the hard gate; these just surface it for allow-listed emails.
  const adminItems: MenuProps['items'] = isAdmin
    ? [
        { type: 'divider' },
        {
          key: 'admin-console',
          icon: <SafetyCertificateOutlined />,
          label: 'Admin console',
          onClick: () => {
            setAdminMode('admin');
            navigate('/admin');
          },
        },
        {
          key: 'admin-toggle',
          icon: <SwapOutlined />,
          label: adminMode === 'admin' ? 'Switch to Normal view' : 'Switch to Admin view',
          onClick: () => {
            if (adminMode === 'admin') {
              setAdminMode('normal');
              navigate('/');
            } else {
              setAdminMode('admin');
              navigate('/admin');
            }
          },
        },
      ]
    : [];

  const accountItems: MenuProps['items'] = [
    {
      key: 'profile',
      type: 'group',
      label: (
        <div style={{ padding: '4px 4px' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
          {user?.email && (
            <div style={{ fontSize: 12, opacity: 0.75, wordBreak: 'break-all' }}>{user.email}</div>
          )}
        </div>
      ),
    },
    ...adminItems,
    { type: 'divider' },
    { key: 'signout', icon: <LogoutOutlined />, label: 'Sign out', danger: true, onClick: onSignOut },
  ];

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: `0 ${spacing.lg}px`,
        background: isDark ? 'rgba(28, 28, 38, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${colors.borderSubtle}`,
        transition: 'background-color 300ms, border-color 300ms',
      }}
    >
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="coop-topbar-menu-btn"
        style={{
          display: 'none',
          width: 36,
          height: 36,
          borderRadius: radius.md,
          border: 'none',
          background: 'transparent',
          color: colors.onSurfaceVariant,
          cursor: 'pointer',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MenuOutlined style={{ fontSize: 18 }} />
      </button>

      {/* Global search → command palette */}
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Search (opens command palette)"
        onMouseEnter={() => setSearchHover(true)}
        onMouseLeave={() => setSearchHover(false)}
        style={{
          flex: '0 1 480px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 38,
          padding: `0 ${spacing.md}px`,
          borderRadius: radius.lg,
          border: `1px solid ${searchHover ? colors.outlineVariant : colors.borderSubtle}`,
          background: isDark ? colors.surfaceContainerLow : colors.surface,
          cursor: 'text',
          transition: 'border-color 150ms, background-color 300ms',
          textAlign: 'left',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke={colors.outline} strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke={colors.outline} strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: colors.outline,
            fontFamily: 'inherit',
            fontSize: 14,
          }}
        >
          Search orders, customers, or products…
        </span>
        <kbd
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 7px',
            borderRadius: radius.sm,
            border: `1px solid ${colors.borderSubtle}`,
            background: colors.surfaceContainerLow,
            color: colors.outline,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          ⌘K
        </kbd>
      </button>

      <div style={{ flex: 1 }} />

      {/* Zeno pill */}
      <button
        type="button"
        onClick={() => navigate('/coop-ai')}
        aria-label="Open the Zeno assistant"
        className="coop-topbar-ai"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          height: 34,
          padding: `0 ${spacing.md - 2}px`,
          borderRadius: radius.full,
          border: `1px solid ${isDark ? colors.primaryFixed : colors.primaryFixed}`,
          background: isDark ? 'rgba(122, 127, 255, 0.14)' : 'rgba(225, 224, 255, 0.45)',
          color: colors.primary,
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          transition: 'background-color 150ms',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? 'rgba(122, 127, 255, 0.24)' : colors.primaryFixed)}
        onMouseLeave={(e) => (e.currentTarget.style.background = isDark ? 'rgba(122, 127, 255, 0.14)' : 'rgba(225, 224, 255, 0.45)')}
      >
        <SparkleIcon size={15} color={colors.secondaryContainer} />
        <span className="coop-topbar-ai-label">Zeno</span>
      </button>

      {/* Sync state (offline-first, ADR-002) — never hidden */}
      <SyncIndicator />

      {/* Notifications (real inventory alerts) */}
      <NotificationsPopover />

      {/* Theme toggle (Stage 2 light/dark) */}
      <button
        type="button"
        onClick={toggle}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        title={isDark ? 'Light theme' : 'Dark theme'}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: 'none',
          background: 'transparent',
          color: colors.onSurfaceVariant,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 150ms, transform 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = colors.surfaceContainerLow;
          e.currentTarget.style.transform = 'rotate(18deg)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.transform = 'rotate(0deg)';
        }}
      >
        {isDark ? <SunOutlined style={{ fontSize: 17 }} /> : <MoonOutlined style={{ fontSize: 16 }} />}
      </button>

      {/* Account menu — profile area */}
      <Dropdown
        trigger={['click']}
        menu={{ items: accountItems }}
      >
        <button type="button" aria-label="Account menu" style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, borderRadius: radius.full }}>
          <Avatar
            size={34}
            src={user?.imageUrl || undefined}
            style={{ background: colors.primaryContainer, color: colors.onPrimary, fontWeight: 600 }}
          >
            {name.slice(0, 1).toUpperCase()}
          </Avatar>
        </button>
      </Dropdown>
    </header>
  );
};

export default TopBar;
