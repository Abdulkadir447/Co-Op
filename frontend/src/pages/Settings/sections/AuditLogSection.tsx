/**
 * Settings → Audit Log. The tenant's append-only activity trail: every
 * create/update/delete/status change/adjust/import/plan change/restore —
 * including offline-synced operations — newest first. Read-only by design.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useApiClient, ApiError } from '../../../services/api/client';
import { CoopButton, CoopCard, CoopEmptyState, CoopErrorState, CoopLoading } from '../../../components/ui';

interface AuditEntry {
  id: number;
  table_name: string;
  record_id: number | null;
  action: string;
  actor: string | null;
  change: string | null;
  created_at: string | null;
}

const PAGE_SIZE = 50;

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.length ? v.map((x) => formatValue(x)).join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Turn the stored change blob into a sentence a person can read, instead of
 * raw JSON. Falls back to a "Field: value" list for shapes we don't recognise.
 */
function humanizeChange(action: string, change: string | null): string {
  if (!change) return '—';
  let data: unknown;
  try {
    data = JSON.parse(change);
  } catch {
    return change;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return formatValue(data);
  const d = data as Record<string, unknown>;

  // Team invite / member change.
  if (typeof d.email === 'string' && typeof d.role === 'string') {
    const verb = action === 'delete' ? 'Removed' : 'Invited';
    return `${verb} ${d.email} as ${d.role}`;
  }

  // Import batch.
  if (typeof d.entity === 'string' && (d.created || d.skipped)) {
    const created =
      d.created && typeof d.created === 'object'
        ? Object.values(d.created as Record<string, unknown>)
            .filter((n): n is number => typeof n === 'number')
            .reduce((a, b) => a + b, 0)
        : 0;
    const skipped = (d.skipped as Record<string, number> | undefined)?.existing ?? 0;
    const errors = (d.skipped as Record<string, number> | undefined)?.errors ?? 0;
    let s = `${created} ${titleCase(d.entity)} added`;
    if (skipped) s += ` · ${skipped} skipped (already existed)`;
    if (errors) s += ` · ${errors} failed`;
    return s;
  }

  // Generic field changes.
  const entries = Object.entries(d).filter(([k]) => !k.startsWith('_'));
  if (!entries.length) return '—';
  return entries.map(([k, v]) => `${titleCase(k)}: ${formatValue(v)}`).join(' · ');
}

const AuditLogSection: React.FC = () => {
  const api = useApiClient();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (nextOffset: number, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<AuditEntry[]>('/audit', {
          params: { limit: PAGE_SIZE, offset: nextOffset },
        });
        setRows((prev) => (replace ? data : [...prev, ...data]));
        setOffset(nextOffset + data.length);
        setHasMore(data.length === PAGE_SIZE);
      } catch (e) {
        setError(e instanceof ApiError ? e : new ApiError('Unable to load the audit log.'));
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void load(0, true);
  }, [load]);

  const columns: ColumnsType<AuditEntry> = [
    {
      title: 'When',
      dataIndex: 'created_at',
      width: 170,
      render: (v: string | null) => (v ? new Date(v).toLocaleString() : '—'),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 110,
      render: (a: string) => <Tag color={a === 'create' ? 'success' : a === 'delete' ? 'error' : 'processing'}>{a}</Tag>,
    },
    { title: 'Entity', dataIndex: 'table_name', width: 130 },
    { title: 'Record', dataIndex: 'record_id', width: 90, render: (v: number | null) => v ?? '—' },
    {
      title: 'By',
      dataIndex: 'actor',
      width: 130,
      render: (a: string | null) =>
        a === 'offline-sync' ? <Tag>sync</Tag> : (a ?? '—'),
    },
    {
      title: 'Details',
      dataIndex: 'change',
      render: (c: string | null, row: AuditEntry) => (
        <Typography.Text style={{ fontSize: 13 }}>{humanizeChange(row.action, c)}</Typography.Text>
      ),
    },
  ];

  return (
    <CoopCard title="Audit Log" subtitle="Every change to your business data, newest first. Read-only.">
      {error ? (
        <CoopErrorState title="Unable to load the audit log" detail={error.message} onRetry={() => void load(0, true)} />
      ) : loading && rows.length === 0 ? (
        <CoopLoading height={200} label="Loading audit log…" />
      ) : rows.length === 0 ? (
        <CoopEmptyState title="No activity yet" description="Changes you make will appear here." />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Table<AuditEntry>
            rowKey="id"
            columns={columns}
            dataSource={rows}
            pagination={false}
            size="small"
            scroll={{ x: 720 }}
          />
          {hasMore && (
            <CoopButton
              variant="secondary"
              block
              loading={loading}
              onClick={() => void load(offset, false)}
            >
              Load older activity
            </CoopButton>
          )}
        </Space>
      )}
    </CoopCard>
  );
};

export default AuditLogSection;
