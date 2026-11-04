/**
 * Settings → AI Learning. What Zeno has learned in THIS business.
 *
 * Two lists, because the two kinds have different trust rules:
 *   · Mistakes    — active immediately. Graded 1-5 by what they cost, because
 *                   the ledger Co-op owns can measure the consequence. A
 *                   severity is a fact about money, not a mood.
 *   · Preferences — proposed, never obeyed. A candidate reaches the prompt only
 *                   after the owner accepts it here. Dismiss is permanent.
 *
 * Every write goes through the API (tenant-scoped server-side); nothing on this
 * screen can change business data, only what Zeno is told not to repeat.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Input, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { BulbOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useApiClient } from '../../../services/api/client';
import {
  CoopButton,
  CoopCard,
  CoopEmptyState,
  CoopErrorState,
  CoopLoading,
  CoopModal,
  CoopSelect,
} from '../../../components/ui';

interface Lesson {
  id: number;
  kind: 'mistake' | 'preference';
  scope: string;
  statement: string;
  severity: number;
  severity_label?: string | null;
  cost_amount?: number | null;
  cost_basis?: string | null;
  blast_radius?: number;
  repeat_count: number;
  status: 'active' | 'candidate' | 'dismissed';
  source?: string | null;
  evidence_ref?: string | null;
  created_at?: string | null;
}

type SeverityMap = Record<string, string>;

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  active: { color: 'green', label: 'Active' },
  candidate: { color: 'gold', label: 'Needs review' },
  dismissed: { color: 'default', label: 'Dismissed' },
};

/** Severity is 1-5 where the number means money, so show the word too. */
function severityTag(severity: number, label?: string | null) {
  const color =
    severity >= 5 ? 'red' : severity === 4 ? 'volcano' : severity === 3 ? 'orange' : 'default';
  return (
    <Tag color={color} style={{ marginInlineEnd: 0 }}>
      {severity} · {label || '—'}
    </Tag>
  );
}

const ZenoLearningSection: React.FC = () => {
  const api = useApiClient();
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [severities, setSeverities] = useState<SeverityMap>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({
    kind: 'mistake' as 'mistake' | 'preference',
    statement: '',
    severity: 3,
    cost_amount: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: Lesson[]; severities: SeverityMap }>('/ai/lessons');
      setLessons(data.items);
      setSeverities(data.severities || {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load what Zeno has learned');
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (lesson: Lesson, body: Record<string, unknown>) => {
    setBusy(lesson.id);
    try {
      await api.patch(`/ai/lessons/${lesson.id}`, body);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!draft.statement.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        kind: draft.kind,
        statement: draft.statement.trim(),
      };
      if (draft.kind === 'mistake') {
        payload.severity = draft.severity;
        if (draft.cost_amount.trim()) payload.cost_amount = Number(draft.cost_amount);
      }
      await api.post('/ai/lessons', payload);
      setAddOpen(false);
      setDraft({ kind: 'mistake', statement: '', severity: 3, cost_amount: '' });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const severitiesList = Object.entries(severities)
    .map(([value, label]) => ({ value: Number(value), label: `${value} — ${label}` }))
    .sort((a, b) => a.value - b.value);

  const columns: ColumnsType<Lesson> = [
    {
      title: 'What Zeno must not repeat',
      dataIndex: 'statement',
      render: (_: unknown, r) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{r.statement}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.scope}
            {r.repeat_count > 1 ? ` · happened ${r.repeat_count}×` : ''}
            {r.source === 'detected' ? ' · caught automatically' : ''}
            {r.evidence_ref ? ` · ${r.evidence_ref}` : ''}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Cost',
      dataIndex: 'severity',
      width: 150,
      render: (_: unknown, r) => (
        <Space direction="vertical" size={2}>
          {severityTag(r.severity, r.severity_label)}
          {r.cost_amount ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.cost_amount.toLocaleString()} ({r.cost_basis})
            </Typography.Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (status: string) => {
        const t = STATUS_TAG[status] || STATUS_TAG.dismissed;
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: '',
      key: 'actions',
      width: 150,
      render: (_: unknown, r) => (
        <Space size={4}>
          {r.status === 'candidate' ? (
            <Tooltip title="Accept — Zeno will follow this from now on">
              <CoopButton
                size="sm"
                loading={busy === r.id}
                onClick={() => void patch(r, { status: 'active' })}
                icon={<CheckOutlined />}
              >
                Accept
              </CoopButton>
            </Tooltip>
          ) : null}
          {r.status !== 'dismissed' ? (
            <Tooltip title="Dismiss permanently — a repeat will not bring it back">
              <CoopButton
                size="sm"
                variant="ghost"
                loading={busy === r.id}
                onClick={() => void patch(r, { status: 'dismissed' })}
                icon={<CloseOutlined />}
              >
                Dismiss
              </CoopButton>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
  ];

  const mistakes = (lessons || []).filter((l) => l.kind === 'mistake');
  const preferences = (lessons || []).filter((l) => l.kind === 'preference');
  const pending = preferences.filter((p) => p.status === 'candidate').length;

  if (error) {
    return <CoopErrorState title="Could not load Zeno's lessons" detail={error} onRetry={() => void load()} />;
  }
  if (lessons === null) return <CoopLoading label="Loading what Zeno has learned…" />;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <CoopCard
        title="Mistakes Zeno has learned from"
        subtitle="Graded 1–5 by what the mistake cost — a wrong number costs a sentence, a wrong rule costs money. These are active immediately."
        extra={
          <CoopButton onClick={() => setAddOpen(true)} icon={<BulbOutlined />}>
            Record a mistake
          </CoopButton>
        }
      >
        {mistakes.length === 0 ? (
          <CoopEmptyState
            title="Nothing recorded yet"
            description="Zeno adds a lesson automatically whenever it proposes an order that fails validation — wrong stock, missing price, or an ambiguous customer. You can also record one yourself."
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={mistakes}
            pagination={false}
            size="middle"
          />
        )}
      </CoopCard>

      <CoopCard
        title={
          <Space size={8}>
            Preferences you taught
            {pending > 0 ? <Tag color="gold">{pending} to review</Tag> : null}
          </Space>
        }
        subtitle="Zeno proposes, you decide. A preference only takes effect after you accept it — and dismissing is permanent."
      >
        {preferences.length === 0 ? (
          <CoopEmptyState
            title="No preferences yet"
            description="Tell Zeno the same thing twice (a unit, a rounding rule, how you like answers) and it will appear here for you to accept."
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={preferences}
            pagination={false}
            size="middle"
          />
        )}
      </CoopCard>

      <CoopModal
        title="Record a mistake"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => void submit()}
        okText="Record"
        confirmLoading={saving}
        okButtonProps={{ disabled: !draft.statement.trim() }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            What should Zeno never do again? Be specific — this becomes an instruction on every
            later answer.
          </Typography.Text>
          <Input.TextArea
            rows={3}
            maxLength={300}
            showCount
            placeholder="e.g. quoted list price to a customer on a standing discount"
            value={draft.statement}
            onChange={(e) => setDraft({ ...draft, statement: e.target.value })}
          />
          <div>
            <Typography.Text strong>How costly was it?</Typography.Text>
            <CoopSelect
              style={{ width: '100%', marginTop: 6 }}
              value={draft.severity}
              onChange={(v) => setDraft({ ...draft, severity: Number(v) })}
              options={
                severitiesList.length
                  ? severitiesList
                  : [
                      { value: 1, label: '1 — cosmetic' },
                      { value: 2, label: '2 — minor' },
                      { value: 3, label: '3 — costly' },
                      { value: 4, label: '4 — expensive' },
                      { value: 5, label: '5 — wrong money or stock' },
                    ]
              }
            />
          </div>
          <div>
            <Typography.Text strong>Money lost (optional)</Typography.Text>
            <Input
              style={{ marginTop: 6 }}
              inputMode="decimal"
              placeholder="e.g. 12400"
              value={draft.cost_amount}
              onChange={(e) => setDraft({ ...draft, cost_amount: e.target.value })}
            />
          </div>
        </Space>
      </CoopModal>
    </Space>
  );
};

export default ZenoLearningSection;
