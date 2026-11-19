/**
 * Settings → Notifications. Gates the IN-APP notification center, plus the
 * outbound channel that does exist: emailing today's daily summary
 * (backend POST /notifications/summary/send, SMTP-configured deployments).
 * Prefs are stored on the device and the TopBar notification center
 * honours them live.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Button, Input, Space, Switch, Typography, message } from 'antd';
import { MailOutlined, SendOutlined } from '@ant-design/icons';
import { CoopCard } from '../../../components/ui';
import { getNotificationPrefs, setNotificationPrefs } from '../../../notifications/prefs';
import { useApiClient, ApiError } from '../../../services/api/client';
import { fetchIdentity } from '../../../repositories/identity';
import { useTeamRole } from '../../../hooks/useTeamRole';

const ROWS = [
  {
    key: 'dailySummary' as const,
    title: 'Daily summary',
    blurb: 'Today at a glance — revenue, orders and notable changes.',
  },
  {
    key: 'lowStock' as const,
    title: 'Stock alerts',
    blurb: 'Low-stock and out-of-stock items in the notification center.',
  },
];

const EmailDeliveryCard: React.FC = () => {
  const api = useApiClient();
  const role = useTeamRole();
  const [messageApi, messageCtx] = message.useMessage();
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sent' | 'unconfigured'>('idle');

  useEffect(() => {
    let cancelled = false;
    fetchIdentity(api)
      .then((me) => !cancelled && setRecipient((r) => r || (me.email ?? '')))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);

  const send = async () => {
    if (!recipient.trim()) {
      messageApi.warning('Enter an email address first');
      return;
    }
    setBusy(true);
    try {
      await api.post('/notifications/summary/send', { email: recipient.trim() });
      setStatus('sent');
      messageApi.success(`Summary emailed to ${recipient.trim()}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setStatus('unconfigured');
      } else {
        messageApi.error(e instanceof ApiError ? e.message : 'Could not send the summary');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <CoopCard
      title="Email me today's summary"
      subtitle="Sends the same verified daily summary you see in the notification center."
    >
      {messageCtx}
      {role !== null && role !== 'owner' && role !== 'manager' ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Only the owner or a manager can trigger an email summary.
        </Typography.Text>
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {status === 'sent' && (
            <Alert type="success" showIcon message="Sent. One more channel you can rely on." />
          )}
          {status === 'unconfigured' && (
            <Alert
              type="info"
              showIcon
              message="Email delivery isn't configured for this deployment — the in-app summary still works. The owner can enable it with the SMTP_* environment settings."
            />
          )}
          <Space.Compact style={{ width: '100%' }}>
            <Input
              prefix={<MailOutlined />}
              placeholder="you@example.com"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              aria-label="Recipient email"
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={busy}
              onClick={() => void send()}
            >
              Send
            </Button>
          </Space.Compact>
        </Space>
      )}
    </CoopCard>
  );
};

const NotificationsSection: React.FC = () => {
  const [prefs, setPrefs] = useState(getNotificationPrefs);

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      <CoopCard title="Notifications" subtitle="What the in-app notification center shows.">
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          {ROWS.map((row) => (
            <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <Typography.Text strong>{row.title}</Typography.Text>
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  {row.blurb}
                </Typography.Text>
              </div>
              <Switch
                checked={prefs[row.key]}
                onChange={(checked) => setPrefs(setNotificationPrefs({ [row.key]: checked }))}
                aria-label={row.title}
              />
            </div>
          ))}
        </Space>
      </CoopCard>
      <EmailDeliveryCard />
    </Space>
  );
};

export default NotificationsSection;
