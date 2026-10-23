/**
 * Invoices module — the saved paperwork record (PRD "Invoice generation").
 *
 * One invoice per order, numbered per business (INV-0001, ...). Amounts come
 * from the order — nothing is duplicated here — and the printable document
 * lives on the order page; this is where invoices are numbered, tracked
 * (draft → sent → void) and exported as exactly what is on screen.
 *
 * Raising an invoice happens on the order ("Save as invoice"), because an
 * invoice without an order has no lines to bill.
 */
import React from 'react';
import { Input, Popconfirm, Segmented, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { CoopBadge, CoopButton, CoopCard, CoopErrorState, CoopTable } from '../../components/ui';
import PageHeader from '../../components/layout/PageHeader';
import { useInvoices, type InvoiceRow, type InvoiceStatus } from '../../invoices/useInvoices';
import { formatCurrency } from '../Dashboard/kpiConfig';

const STATUS_VARIANT: Record<InvoiceStatus, 'neutral' | 'info' | 'success' | 'warning'> = {
  draft: 'neutral',
  sent: 'info',
  void: 'warning',
};

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

const InvoicesPage: React.FC = () => {
  const {
    items,
    total,
    page,
    pageSize,
    status,
    loading,
    error,
    busyId,
    setPage,
    setSearch,
    setStatus,
    setStatusFor,
    exportCsv,
  } = useInvoices();

  const columns: ColumnsType<InvoiceRow> = [
    {
      title: 'Invoice',
      dataIndex: 'number',
      render: (value: string, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong style={{ fontSize: 13.5 }}>
            {value}
          </Typography.Text>
          <CoopBadge variant={STATUS_VARIANT[row.status]}>{row.status}</CoopBadge>
        </Space>
      ),
    },
    {
      title: 'Customer',
      dataIndex: ['customer', 'full_name'],
      render: (_: unknown, row) =>
        row.customer ? (
          <Link to={`/customers/${row.customer.id}`}>{row.customer.full_name}</Link>
        ) : (
          '—'
        ),
    },
    {
      title: 'Order',
      dataIndex: ['order', 'id'],
      render: (_: unknown, row) =>
        row.order ? <Link to={`/orders/${row.order.id}`}>#{row.order.id}</Link> : '—',
    },
    { title: 'Issued', dataIndex: 'issue_date', render: (v: string | null) => day(v) },
    { title: 'Due', dataIndex: 'due_date', render: (v: string | null) => day(v) },
    {
      title: 'Total',
      dataIndex: 'total',
      align: 'right',
      render: (value: number, row) => formatCurrency(value, row.currency),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) =>
        row.status === 'void' ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Void — no further changes
          </Typography.Text>
        ) : (
          <Space size={8}>
            {row.status === 'draft' && (
              <CoopButton
                size="sm"
                variant="secondary"
                loading={busyId === row.id}
                onClick={() => void setStatusFor(row.id, 'sent')}
              >
                Mark sent
              </CoopButton>
            )}
            <Popconfirm
              title="Void this invoice?"
              description="The customer may already hold a copy. This cannot be undone."
              okText="Void"
              cancelText="Cancel"
              onConfirm={() => void setStatusFor(row.id, 'void')}
            >
              <CoopButton size="sm" variant="ghost">
                Void
              </CoopButton>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Numbered paperwork for your orders — raise one from an order, track it here."
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <CoopErrorState title="Invoice problem" detail={error} onRetry={() => undefined} />
        </div>
      )}

      <CoopCard flush bodyPadding={0}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            padding: '12px 16px',
          }}
        >
          <Input.Search
            allowClear
            placeholder="Search invoice number, customer or email"
            style={{ maxWidth: 320 }}
            onSearch={(v) => {
              setPage(1);
              setSearch(v);
            }}
          />
          <Segmented
            value={status}
            onChange={(v) => {
              setPage(1);
              setStatus(v as InvoiceStatus | 'all');
            }}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Draft', value: 'draft' },
              { label: 'Sent', value: 'sent' },
              { label: 'Void', value: 'void' },
            ]}
          />
          <div style={{ flex: 1 }} />
          <CoopButton variant="secondary" icon={<DownloadOutlined />} onClick={() => void exportCsv()}>
            Export CSV
          </CoopButton>
        </div>

        <CoopTable<InvoiceRow>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p) => setPage(p),
          }}
          empty={{
            title: 'No invoices yet',
            description: 'Open an order and choose "Save as invoice" to raise the first one.',
            compact: true,
          }}
        />
      </CoopCard>
    </div>
  );
};

export default InvoicesPage;
