/**
 * Settings → Security. Co-op does not store passwords — authentication is
 * Clerk's job (password, 2FA, active sessions). This section hands off to
 * Clerk's own account management surface, which is the real implementation
 * rather than a fake local form. Requires internet (Clerk) — said plainly.
 */
import React, { useState } from 'react';
import { Alert, Space, Typography } from 'antd';
import { UserProfile } from '@clerk/react';
import { KeyOutlined } from '@ant-design/icons';
import CoopModal from '../../../components/ui/CoopModal';
import { CoopButton, CoopCard } from '../../../components/ui';

const SecuritySection: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <CoopCard title="Security" subtitle="Account security is managed by Clerk — Co-op never stores passwords.">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Password, two-factor authentication and active sessions live in your Clerk account."
        />
        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
          Account management requires an internet connection — it opens Clerk's secure panel in
          this window.
        </Typography.Text>
        <CoopButton icon={<KeyOutlined />} onClick={() => setOpen(true)}>
          Manage account security
        </CoopButton>
      </Space>

      <CoopModal open={open} onCancel={() => setOpen(false)} hideFooter width={960} title="Account security">
        <UserProfile routing="hash" />
      </CoopModal>
    </CoopCard>
  );
};

export default SecuritySection;
