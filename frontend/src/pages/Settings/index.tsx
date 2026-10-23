/**
 * Settings module (Task 9, UXDS Ch15) — two-column layout (UXDS 15.3):
 * PageHeader · CoopCard section menu · one real section per entry.
 *
 * Every section in the menu is implemented (no "coming soon" panels):
 *   Company · Licence · Appearance · AI · Notifications · Security
 *   · Backup & Restore · Sync · Audit Log · About
 *
 * Company + AI read/write the tenant settings through the shared hook here;
 * the other sections own their state (theme, device prefs, Clerk, sync
 * store, backups, audit log).
 */
import React, { useEffect, useState } from 'react';
import { Col, Menu, Row, message } from 'antd';
import {
  AuditOutlined,
  BankOutlined,
  BellOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SkinOutlined,
} from '@ant-design/icons';
import { CoopCard, CoopErrorState } from '../../components/ui';
import PageHeader from '../../components/layout/PageHeader';
import { useSettings } from './useSettings';
import CompanySection from './sections/CompanySection';
import LicenceSection from './sections/LicenceSection';
import AppearanceSection from './sections/AppearanceSection';
import AiPreferencesSection from './sections/AiPreferencesSection';
import NotificationsSection from './sections/NotificationsSection';
import SecuritySection from './sections/SecuritySection';
import BackupRestoreSection from './sections/BackupRestoreSection';
import SyncSection from './sections/SyncSection';
import AuditLogSection from './sections/AuditLogSection';
import AboutSection from './sections/AboutSection';
import TeamSection from './sections/TeamSection';
import { useTeamRole } from '../../hooks/useTeamRole';
import { TeamOutlined } from '@ant-design/icons';

const SECTIONS = [
  { key: 'company', label: 'Company', icon: <BankOutlined />, ownerOnly: true },
  { key: 'licence', label: 'Licence', icon: <SafetyCertificateOutlined />, ownerOnly: true },
  { key: 'team', label: 'Team', icon: <TeamOutlined />, teamVisible: true },
  { key: 'appearance', label: 'Appearance', icon: <SkinOutlined /> },
  { key: 'ai', label: 'AI', icon: <RobotOutlined /> },
  { key: 'notifications', label: 'Notifications', icon: <BellOutlined /> },
  { key: 'security', label: 'Security', icon: <KeyOutlined /> },
  { key: 'backup', label: 'Backup & Restore', icon: <DatabaseOutlined />, ownerOnly: true },
  { key: 'sync', label: 'Sync', icon: <CloudSyncOutlined /> },
  { key: 'audit', label: 'Audit Log', icon: <AuditOutlined /> },
  { key: 'about', label: 'About', icon: <InfoCircleOutlined /> },
];

const SettingsPage: React.FC = () => {
  const [messageApi, messageCtx] = message.useMessage();
  const role = useTeamRole();
  const [active, setActive] = useState('company');
  const { settings, loading, saving, error, save } = useSettings();

  // Client-side mirror of the backend matrix: owner-only sections hidden
  // for every other role (backend 403s anyway).
  const visibleSections = SECTIONS.filter((sec) => {
    if (role == null) return !sec.ownerOnly;
    if (sec.ownerOnly) return role === 'owner';
    if (sec.teamVisible) return role === 'owner' || role === 'manager';
    return true;
  });

  useEffect(() => {
    // First visit by a non-owner must not land on an owner-only section.
    if (visibleSections.every((sec) => sec.key !== active)) {
      setActive(visibleSections[0]?.key ?? 'about');
    }
  }, [active, role, visibleSections]);

  const renderSection = () => {
    switch (active) {
      case 'company':
        return (
          <CompanySection settings={settings} loading={loading} saving={saving} save={save} messageApi={messageApi} />
        );
      case 'licence':
        return <LicenceSection />;
      case 'appearance':
        return <AppearanceSection />;
      case 'ai':
        return <AiPreferencesSection settings={settings} saving={saving} save={save} messageApi={messageApi} />;
      case 'notifications':
        return <NotificationsSection />;
      case 'security':
        return <SecuritySection />;
      case 'backup':
        return <BackupRestoreSection />;
      case 'sync':
        return <SyncSection />;
      case 'audit':
        return <AuditLogSection />;
      case 'team':
        return <TeamSection messageApi={messageApi} />;
      case 'about':
        return <AboutSection />;
      default:
        return null;
    }
  };

  return (
    <div>
      {messageCtx}

      <PageHeader title="Settings" subtitle="Configure your business and application preferences." />

      {error && active !== 'licence' && active !== 'appearance' && active !== 'notifications' && active !== 'security' && active !== 'backup' && active !== 'sync' && active !== 'audit' && active !== 'about' && (
        <div style={{ marginBottom: 16 }}>
          <CoopErrorState
            title={error.isAuthError ? 'Authentication required' : 'Unable to load settings'}
            detail={error.message}
            onRetry={() => undefined}
          />
        </div>
      )}

      {/* Two-column layout (UXDS 15.3) */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={6} lg={5}>
          <CoopCard flush bodyPadding={8}>
            <Menu
              mode="inline"
              selectedKeys={[active]}
              onClick={(e) => setActive(e.key)}
              items={visibleSections.map((s) => ({ key: s.key, icon: s.icon, label: s.label }))}
              style={{ border: 'none' }}
            />
          </CoopCard>
        </Col>

        <Col xs={24} md={18} lg={19}>{renderSection()}</Col>
      </Row>
    </div>
  );
};

export default SettingsPage;
