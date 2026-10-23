/**
 * Settings → Licence (PRD Ch7 §7.19 — the activation flow).
 *
 * Paste the activation string the Co-op team sent, and the server verifies
 * its signature, checks it was issued to THIS business, and grants the plan
 * for the window the key carries. Every refusal is the server's own honest
 * message: a key for another business, a revoked key, an expired key.
 *
 * Only the business owner can activate — the backend 403s everyone else, and
 * the section is hidden for them in the menu.
 */
import React, { useState } from 'react';
import { Alert, Input, Space, Tag, Typography } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { CoopButton, CoopCard, CoopLoading } from '../../../components/ui';
import { useLicensing } from '../../../billing/useLicensing';

function dateLabel(iso: string | null): string {
  if (!iso) return 'Never — perpetual licence';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

const LicenceSection: React.FC = () => {
  const { license, loading, activating, error, notice, activate, dismiss } = useLicensing();
  const [key, setKey] = useState('');

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Licensed plan', value: license.label ?? '—' },
    { label: 'Seats', value: license.seats ?? '—' },
    { label: 'Activated', value: dateLabel(license.started_at) },
    { label: 'Expires', value: dateLabel(license.ends_at) },
    {
      label: 'Days remaining',
      value: license.ends_at ? license.days_remaining : 'Unlimited',
    },
  ];

  const onActivate = async () => {
    dismiss();
    const ok = await activate(key);
    if (ok) setKey('');
  };

  return (
    <CoopCard
      title="Licence"
      subtitle="Activate the key the Co-op team sent you. Nothing is charged here."
      extra={
        license.active ? (
          <Tag icon={<CheckCircleFilled />} color="success">
            Active
          </Tag>
        ) : license.licensed ? (
          <Tag color="warning">Ended</Tag>
        ) : (
          <Tag>No licence</Tag>
        )
      }
    >
      {loading ? (
        <CoopLoading label="Checking your licence…" />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {license.licensed && (
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {rows.map((r) => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {r.label}
                  </Typography.Text>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.value}</span>
                </div>
              ))}
              {license.fingerprint && (
                <Typography.Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                  Key fingerprint {license.fingerprint.slice(0, 16)}…
                </Typography.Text>
              )}
            </Space>
          )}

          {license.licensed && !license.active && (
            <Alert
              type="warning"
              showIcon
              message="Your licence has ended"
              description="Your business is back on the Free plan. Ask the Co-op team for a renewed key and paste it below."
            />
          )}

          {notice && <Alert type="success" showIcon message={notice} closable onClose={dismiss} />}
          {error && <Alert type="error" showIcon message={error} closable onClose={dismiss} />}

          <div>
            <Typography.Text strong style={{ fontSize: 13 }}>
              {license.licensed ? 'Replace with a new key' : 'Enter your activation key'}
            </Typography.Text>
            <Input.TextArea
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="COOP-XXXXX-XXXXX-…"
              autoSize={{ minRows: 2, maxRows: 4 }}
              style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12.5 }}
              aria-label="Licence activation key"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <CoopButton onClick={onActivate} loading={activating} disabled={!key.trim()}>
                {license.licensed ? 'Replace licence' : 'Activate licence'}
              </CoopButton>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
              A licence is bound to this business only, and only the owner can activate it. Keys
              are issued by the Co-op team — the key itself is never stored on our servers.
            </Typography.Text>
          </div>
        </Space>
      )}
    </CoopCard>
  );
};

export default LicenceSection;
