/**
 * Settings → Backup & Restore (PRD Phase 4 "Backup system").
 *
 * Two surfaces, both real:
 *   * Cloud — download a JSON snapshot of your business data, and restore
 *     one. Restore is allowed ONLY while the business is empty (never a
 *     merge into live data) — the backend refuses anything else.
 *   * Desktop — back up / restore the device's local SQLite database
 *     (only when the sync queue is empty, so nothing unsynced can be lost).
 */
import React, { useRef, useState } from 'react';
import { Alert, Space, Typography } from 'antd';
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import { useApiClient, ApiError } from '../../../services/api/client';
import { CoopButton, CoopCard } from '../../../components/ui';
import { getCoopBackup } from '../../../sync/localDb';

const BackupRestoreSection: React.FC = () => {
  const api = useApiClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'cloud' | 'restore' | 'local' | 'localRestore' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const desktopBackup = getCoopBackup();

  const downloadCloudBackup = async () => {
    setBusy('cloud');
    setNotice(null);
    try {
      const res = await api.get('/backups/export', { responseType: 'blob' });
      const disposition: string = res.headers['content-disposition'] ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `coop-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setNotice({ kind: 'success', text: 'Backup downloaded — keep the file somewhere safe.' });
    } catch (e) {
      setNotice({
        kind: 'error',
        text: e instanceof ApiError ? e.message : 'Backup download failed.',
      });
    } finally {
      setBusy(null);
    }
  };

  const restoreCloudBackup = async (file: File) => {
    setBusy('restore');
    setNotice(null);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ApiError('That file is not valid JSON — it is not a Co-op backup.');
      }
      const { data } = await api.post('/backups/restore', payload);
      const counts = Object.entries(data.restored as Record<string, number>)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      setNotice({ kind: 'success', text: `Backup restored (${counts}).` });
    } catch (e) {
      setNotice({
        kind: 'error',
        text: e instanceof ApiError ? e.message : 'Restore failed.',
      });
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const backupLocal = async () => {
    if (!desktopBackup) return;
    setBusy('local');
    setNotice(null);
    try {
      const result = await desktopBackup.create();
      if (result.canceled) {
        setNotice({ kind: 'success', text: 'Backup cancelled — nothing changed.' });
      } else if (result.ok) {
        setNotice({ kind: 'success', text: `Local database backed up to ${result.path}.` });
      } else {
        setNotice({ kind: 'error', text: result.error ?? 'Local backup failed.' });
      }
    } finally {
      setBusy(null);
    }
  };

  const restoreLocal = async () => {
    if (!desktopBackup) return;
    setBusy('localRestore');
    setNotice(null);
    try {
      const result = await desktopBackup.restore();
      if (result.canceled) {
        setNotice({ kind: 'success', text: 'Restore cancelled — nothing changed.' });
      } else if (result.ok) {
        setNotice({ kind: 'success', text: 'Local database restored.' });
      } else {
        setNotice({ kind: 'error', text: result.error ?? 'Restore failed.' });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <CoopCard title="Backup & Restore" subtitle="Keep a copy of your business data — locally or in a file.">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {notice && (
          <Alert
            type={notice.kind === 'success' ? 'success' : 'error'}
            showIcon
            message={notice.text}
            closable
            onClose={() => setNotice(null)}
          />
        )}

        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
            <CloudDownloadOutlined /> Cloud backup
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            A JSON snapshot of your products, customers, orders and stock ledger — downloaded as a
            file you keep.
          </Typography.Text>
          <div style={{ marginTop: 10 }}>
            <Space>
              <CoopButton onClick={downloadCloudBackup} loading={busy === 'cloud'}>
                Download business data
              </CoopButton>
              <CoopButton
                variant="secondary"
                icon={<CloudUploadOutlined />}
                loading={busy === 'restore'}
                onClick={() => fileInput.current?.click()}
              >
                Restore from backup
              </CoopButton>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void restoreCloudBackup(file);
                }}
              />
            </Space>
          </div>
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
            Restore works only while the business is empty — Co-op never merges a backup into live
            data.
          </Typography.Text>
        </div>

        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
            <DatabaseOutlined /> This device
          </Typography.Text>
          {desktopBackup ? (
            <>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                A copy of this device's offline database (your local data plus its sync queue).
              </Typography.Text>
              <div style={{ marginTop: 10 }}>
                <Space>
                  <CoopButton onClick={backupLocal} loading={busy === 'local'}>
                    Back up local database
                  </CoopButton>
                  <CoopButton
                    variant="secondary"
                    icon={<RollbackOutlined />}
                    onClick={restoreLocal}
                    loading={busy === 'localRestore'}
                  >
                    Restore local backup
                  </CoopButton>
                </Space>
              </div>
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
                Restoring the local database is only possible when there is nothing unsynced — the
                app refuses anything that could lose work.
              </Typography.Text>
            </>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Local database backup is available in the desktop app. In the browser, use the cloud
              backup above.
            </Typography.Text>
          )}
        </div>
      </Space>
    </CoopCard>
  );
};

export default BackupRestoreSection;
