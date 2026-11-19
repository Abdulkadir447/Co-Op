import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import CoopBadge, { CoopBadgeVariant } from '../ui/CoopBadge';
import CoopTable from '../ui/CoopTable';
import { formatCurrency } from '../../pages/Dashboard/kpiConfig';

/** Order status vocabulary shared with the backend (backend/models.py). */
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface OrderRow {
  id: number;
  orderNumber: string;
  customer: string;
  date: string;
  status: OrderStatus;
  total: number;
}

/**
 * Semantic status pill (UXDS 1.17 — color-independent status indicators)
 * mapped onto the shared order status variants (Stitch order designs).
 */
const STATUS_VARIANT: Record<OrderStatus, CoopBadgeVariant> = {
  pending: 'primary',
  confirmed: 'warning',
  shipped: 'neutral',
  delivered: 'success',
  cancelled: 'critical',
};

export const OrderStatusTag: React.FC<{ status: OrderStatus }> = ({ status }) => (
  <CoopBadge variant={STATUS_VARIANT[status]}>{status}</CoopBadge>
);

/**
 * Recent Orders card (Stitch dashboard pattern): header with "View All",
 * ORDER ID / CUSTOMER / AMOUNT / STATUS columns, hairline rows, hover tint.
 * Live rows come from /orders (latest 8); an empty list renders the shared
 * empty state.
 */
const RecentOrdersTable: React.FC<{ orders?: OrderRow[] }> = ({ orders = [] }) => {
  const { colors } = useCoopTheme();
  const navigate = useNavigate();

  const columns: ColumnsType<OrderRow> = [
    {
      title: 'Order ID',
      dataIndex: 'orderNumber',
      key: 'orderNumber',
      render: (value: string, row) => (
        <div>
          <div style={{ fontWeight: 700, color: colors.onSurface }}>{value}</div>
          <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 }}>{row.date}</div>
        </div>
      ),
    },
    {
      title: 'Customer',
      dataIndex: 'customer',
      key: 'customer',
      render: (v: string) => <span style={{ color: colors.onSurfaceVariant }}>{v}</span>,
    },
    {
      title: 'Amount',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      render: (value: number) => (
        <span style={{ color: colors.onSurface, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
          {formatCurrency(value)}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: OrderStatus) => <OrderStatusTag status={status} />,
    },
  ];

  return (
    <div
      style={{
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header band: title + View All */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `16px 20px`,
          borderBottom: `1px solid ${colors.borderSubtle}`,
        }}
      >
        <span style={{ ...type.titleMd, color: colors.onSurface }}>Recent Orders</span>
        <button
          type="button"
          onClick={() => navigate('/orders')}
          style={{
            border: 'none',
            background: 'transparent',
            color: colors.primary,
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: radius.md,
          }}
        >
          View All
        </button>
      </div>

      <CoopTable<OrderRow>
        rowKey="id"
        columns={columns}
        dataSource={orders}
        pagination={false}
        scroll={{ x: 560 }}
        empty={{
          title: 'No orders yet',
          description: 'New orders will appear here once your data is connected.',
          compact: true,
        }}
      />
    </div>
  );
};

export default RecentOrdersTable;
