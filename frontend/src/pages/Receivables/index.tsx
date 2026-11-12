/**
 * Receivables — "who owes me money?".
 *
 * Before this page the app could create, deliver and invoice an order and
 * still not answer the one question an owner actually asks. It lists every
 * live order with money outstanding, oldest first, so the top of the list is
 * the list to chase.
 *
 * Reads only: recording a payment lives on the order page, where the full
 * context (lines, customer, status) is visible. That keeps one place where
 * money is written.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Input, Segmented } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import { CoopBadge, CoopButton, CoopCard, CoopErrorState, CoopTable } from '../../components/ui';
import PageHeader from '../../components/layout/PageHeader';
import { ApiError, useApiClient } from '../../services/api/client';
import { formatCurrency } from '../Dashboard/kpiConfig';

export interface ReceivableRow {
  order_id: number;
  customer_id: number;
  customer_name: string | null;
  order_date: string | null;
  status: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  payment_status: 'unpaid' | 'partial' | 'paid' | 'overpaid';
  age_days: number;
}

interface ReceivablesResponse {
  items: ReceivableRow[];
  total_outstanding: number;
  total_collected: number;
  count: number;
  page: number;
  limit: number;
}

type Filter = 'all' | 'unpaid' | 'partial' | 'stale';

const STALE_DAYS = 30;

function day(iso: string | null): string {
  if (!iso) return '—';
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

const ReceivablesPage: React.FC = () => {
  const api = useApiClient();
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [summary, setSummary] = useState({ outstanding: 0, collected: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ReceivablesResponse>('/receivables', {
        params: { limit: 200 },
      });
      setRows(data.items);
      setSummary({
        outstanding: data.total_outstanding,
        collected: data.total_collected,
        count: data.count,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load receivables.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = rows.filter((row) => {
    if (filter === 'unpaid' && row.payment_status !== 'unpaid') return false;
    if (filter === 'partial' && row.payment_status !== 'partial') return false;
    if (filter === 'stale' && row.age_days < STALE_DAYS) return false;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      const haystack = `${row.customer_name ?? ''} ${row.order_id}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  const columns: ColumnsType<ReceivableRow> = [
    {
      title: 'Order',
      dataIndex: 'order_id',
      render: (id: number) => (
        <Link to={`/orders/${id}`} style={{ fontWeight: 600 }}>
          #{id}
        </Link>
      ),
      width: 100,
    },
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      render: (name: string | null, row) =>
        name ? (
          <Link to={`/customers/${row.customer_id}`}>{name}</Link>
        ) : (
          <span style={{ opacity: 0.6 }}>—</span>
        ),
    },
    {
      title: 'Placed',
      dataIndex: 'order_date',
      render: (iso: string | null) => day(iso),
      width: 140,
    },
    {
      title: 'Age',
      dataIndex: 'age_days',
      width: 110,
      render: (days: number) => (
        <CoopBadge variant={days >= STALE_DAYS ? 'critical' : days >= 14 ? 'warning' : 'neutral'}>
          {days === 0 ? 'today' : `${days}d`}
        </CoopBadge>
      ),
    },
    {
      title: 'Total',
      dataIndex: 'total',
      align: 'right',
      render: (value: number) => formatCurrency(value),
      width: 130,
    },
    {
      title: 'Paid',
      dataIndex: 'amount_paid',
      align: 'right',
      render: (value: number) => formatCurrency(value),
      width: 130,
    },
    {
      title: 'Balance due',
      dataIndex: 'balance_due',
      align: 'right',
      render: (value: number) => (
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(value)}</strong>
      ),
      width: 150,
    },
    {
      title: 'Status',
      dataIndex: 'payment_status',
      width: 120,
      render: (status: ReceivableRow['payment_status']) => (
        <CoopBadge variant={status === 'partial' ? 'warning' : 'neutral'}>
          {status === 'partial' ? 'Part paid' : 'Unpaid'}
        </CoopBadge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Receivables"
        subtitle="Money customers still owe you, oldest first. Record a payment from the order page."
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <CoopErrorState title="Receivables problem" detail={error} onRetry={load} />
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <CoopCard>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Outstanding</div>
          <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(summary.outstanding)}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            across {summary.count} order{summary.count === 1 ? '' : 's'}
          </div>
        </CoopCard>
        <CoopCard>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Collected (all open orders)</div>
          <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(summary.collected)}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>payments already received</div>
        </CoopCard>
        <CoopCard>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Over 30 days</div>
          <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(
              rows.filter((r) => r.age_days >= STALE_DAYS).reduce((sum, r) => sum + r.balance_due, 0),
            )}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>the list to chase</div>
        </CoopCard>
      </div>

      <CoopCard flush bodyPadding={0}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '12px 16px' }}>
          <Input.Search
            allowClear
            placeholder="Search customer or order number"
            style={{ maxWidth: 300 }}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Unpaid', value: 'unpaid' },
              { label: 'Part paid', value: 'partial' },
              { label: '30+ days', value: 'stale' },
            ]}
          />
          <div style={{ flex: 1 }} />
          <CoopButton variant="secondary" onClick={() => void load()}>
            Refresh
          </CoopButton>
        </div>

        <CoopTable<ReceivableRow>
          rowKey="order_id"
          loading={loading}
          columns={columns}
          dataSource={visible}
          pagination={{ pageSize: 25, showSizeChanger: false }}
          empty={{
            title: 'Nothing outstanding',
            description: 'Every order that can owe money has been settled.',
            compact: true,
          }}
        />
      </CoopCard>
    </div>
  );
};

export default ReceivablesPage;
