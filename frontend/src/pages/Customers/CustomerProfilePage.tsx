import React, { useEffect, useMemo, useState } from 'react';
import { Col, Row, Spin, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  MailOutlined,
  PhoneOutlined,
  ShoppingCartOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { radius, spacing, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { ApiError, useApiClient } from '../../services/api/client';
import { formatCurrency } from '../Dashboard/kpiConfig';
import type { ApiOrder } from '../Dashboard/useDashboardData';
import {
  OrderStatusTag,
  OrderStatus,
} from '../../components/dashboard/RecentOrdersTable';
import AiNoticeBox from '../../components/ui/AiNoticeBox';
import CustomerAvatar from '../../components/ui/CustomerAvatar';
import CoopBadge from '../../components/ui/CoopBadge';
import CoopButton from '../../components/ui/CoopButton';
import { CoopErrorState, CoopModal, CoopTable } from '../../components/ui';
import CustomerFormModal from './CustomerFormModal';
import { Customer, CustomerFormValues } from './useCustomers';
import { KEY_ACCOUNT_THRESHOLD } from './useCustomerStats';

/**
 * Customer Profile (Stitch coop_customer_details_qa_polished) — the
 * customer details route.
 *
 * Data flow (existing API only):
 *   GET /customers/{id}            → profile + contact
 *   GET /orders?search=<name>      → purchase history, filtered by
 *                                    order.customer.id (exact match)
 *   Total Purchases / Avg Order    → derived from those orders
 *
 * The "Recent Activity Insights" card is AI-chrome with an honest
 * placeholder — no engagement events exist in the data model yet.
 */

const orderNumber = (id: number) => `#ORD-${String(id).padStart(4, '0')}`;

const CustomerProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const { colors } = useCoopTheme();
  const navigate = useNavigate();
  const api = useApiClient();
  const [messageApi, messageCtx] = message.useMessage();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = React.useCallback(async () => {
    if (!Number.isInteger(customerId) || customerId <= 0) {
      setError(new ApiError('Invalid customer id.'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const c = await api.get<Customer>(`/customers/${customerId}`);
      setCustomer(c.data);
      // Purchase history: existing orders endpoint, exact id filter.
      const o = await api.get<{ items: ApiOrder[] }>(
        `/orders?search=${encodeURIComponent(c.data.full_name)}&limit=100`,
      );
      setOrders((o.data.items ?? []).filter((x) => x.customer_id === c.data.id));
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError('Unable to load customer.'));
    } finally {
      setLoading(false);
    }
  }, [api, customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const total = orders.reduce((sum, o) => sum + o.total_amount, 0);
    return {
      orders: orders.length,
      total: Math.round(total * 100) / 100,
      aov: orders.length > 0 ? Math.round((total / orders.length) * 100) / 100 : null,
    };
  }, [orders]);

  const handleUpdate = async (values: CustomerFormValues) => {
    if (!customer) return;
    setSubmitting(true);
    try {
      await api.put<Customer>(`/customers/${customer.id}`, values);
      messageApi.success('Customer updated');
      setEditOpen(false);
      void load();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!customer) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/customers/${customer.id}`);
      messageApi.success('Customer deleted');
      navigate('/customers');
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  };

  const historyColumns: ColumnsType<ApiOrder> = [
    {
      title: 'Order ID',
      dataIndex: 'id',
      key: 'id',
      render: (v: number) => (
        <button
          type="button"
          onClick={() => navigate(`/orders?q=${encodeURIComponent(orderNumber(v))}`)}
          style={{
            border: 'none',
            background: 'transparent',
            color: colors.primary,
            fontWeight: 600,
            fontSize: 13.5,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {orderNumber(v)}
        </button>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'order_date',
      key: 'order_date',
      width: 140,
      render: (v: string) => (
        <span style={{ color: colors.onSurfaceVariant }}>{dayjs(v).format('MMM D, YYYY')}</span>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 140,
      align: 'right',
      render: (v: number) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: colors.onSurface }}>
          {formatCurrency(v)}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (v: string) => <OrderStatusTag status={(v as OrderStatus) ?? 'pending'} />,
    },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
        {messageCtx}
        <CoopErrorState
          title="Customer not found"
          detail={error?.message ?? 'This customer may have been deleted.'}
          onRetry={load}
        />
        <CoopButton variant="secondary" onClick={() => navigate('/customers')}>
          Back to Customers
        </CoopButton>
      </div>
    );
  }

  const contactRow = (icon: React.ReactNode, value: string | null | undefined) =>
    value ? (
      <div key={value} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0' }}>
        <span style={{ color: colors.outline, display: 'inline-flex' }}>{icon}</span>
        <span style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, wordBreak: 'break-word' }}>{value}</span>
      </div>
    ) : null;

  return (
    <div>
      {messageCtx}

      {/* Breadcrumb + title + actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => navigate('/customers')}
              aria-label="Back to Customers"
              title="Back to Customers"
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center',
                border: `1px solid ${colors.borderSubtle}`,
                background: colors.surfaceContainer,
                color: colors.onSurface,
                cursor: 'pointer',
              }}
            >
              <ArrowLeftOutlined />
            </button>
            <button
              type="button"
              onClick={() => navigate('/customers')}
              style={{
                border: 'none',
                background: 'transparent',
                color: colors.outline,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Customers
            </button>
          </div>
          <h1 style={{ margin: 0, ...type.pageTitle, fontSize: 30, lineHeight: '38px', color: colors.onBackground, letterSpacing: '-0.02em' }}>
            Customer Profile
          </h1>
        </div>
        <div style={{ display: 'flex', gap: spacing.sm }}>
          <CoopButton variant="secondary" icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            Edit Customer
          </CoopButton>
          <CoopButton variant="danger" icon={<DeleteOutlined />} onClick={() => setDeleteOpen(true)}>
            Delete
          </CoopButton>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        {/* Left: profile + contact */}
        <Col xs={24} xl={8}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Profile card */}
            <div
              style={{
                background: colors.surfaceContainerLowest,
                border: `1px solid ${colors.borderSubtle}`,
                borderRadius: radius.lg,
                padding: 24,
                textAlign: 'center',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                <CustomerAvatar name={customer.full_name} size={72} />
              </div>
              <div style={{ ...type.sectionHeading, color: colors.onSurface }}>{customer.full_name}</div>
              <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginTop: 4 }}>
                {customer.company ?? 'No company on file'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                {totals.total >= KEY_ACCOUNT_THRESHOLD && (
                  <CoopBadge variant="primary" style={{ background: colors.primary, color: colors.onPrimary }}>
                    Key Account
                  </CoopBadge>
                )}
                <CoopBadge variant="neutral">Customer since {dayjs(customer.created_at).format('MMM YYYY')}</CoopBadge>
              </div>
            </div>

            {/* Contact information */}
            <div
              style={{
                background: colors.surfaceContainerLowest,
                border: `1px solid ${colors.borderSubtle}`,
                borderRadius: radius.lg,
                padding: '20px 24px',
              }}
            >
              <div style={{ ...type.titleMd, fontSize: 17, color: colors.onSurface, marginBottom: 8 }}>
                Contact Information
              </div>
              <div style={{ borderTop: `1px solid ${colors.borderSubtle}`, paddingTop: 4 }}>
                {contactRow(<MailOutlined />, customer.email)}
                {contactRow(<PhoneOutlined />, customer.phone)}
                {contactRow(<ShoppingCartOutlined />, customer.company)}
                {contactRow(<EnvironmentOutlined />, customer.address)}
              </div>
            </div>
          </div>
        </Col>

        {/* Right: stats + order history + insights */}
        <Col xs={24} xl={16}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Stat cards */}
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <StatCard icon={<ShoppingCartOutlined />} label="Total Purchases" value={formatCurrency(totals.total)} />
              </Col>
              <Col xs={24} sm={12}>
                <StatCard
                  icon={<EnvironmentOutlined />}
                  label="Average Order Value"
                  value={totals.aov != null ? formatCurrency(totals.aov) : '—'}
                />
              </Col>
            </Row>

            {/* Order history */}
            <div
              style={{
                background: colors.surfaceContainerLowest,
                border: `1px solid ${colors.borderSubtle}`,
                borderRadius: radius.lg,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: `16px 20px`,
                  borderBottom: `1px solid ${colors.borderSubtle}`,
                }}
              >
                <span style={{ ...type.titleMd, color: colors.onSurface }}>Order History</span>
                <button
                  type="button"
                  onClick={() => navigate(`/orders?q=${encodeURIComponent(customer.full_name)}`)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: colors.primary,
                    fontWeight: 600,
                    fontSize: 13.5,
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: radius.md,
                  }}
                >
                  View All
                </button>
              </div>
              <CoopTable<ApiOrder>
                rowKey="id"
                columns={historyColumns}
                dataSource={orders}
                pagination={false}
                scroll={{ y: 340 }}
                empty={{
                  title: 'No orders yet',
                  description: 'Orders placed by this customer will appear here.',
                  compact: true,
                }}
              />
            </div>

            {/* Recent activity insights (honest AI placeholder) */}
            <AiNoticeBox
              title="Up next: profile-level signals"
              description="Ask Zeno is available now. Per-customer engagement signals — order cadence, churn risk and suggested check-ins — are still on the roadmap."
            />
          </div>
        </Col>
      </Row>

      <CustomerFormModal
        open={editOpen}
        customer={customer}
        submitting={submitting}
        onCancel={() => setEditOpen(false)}
        onSubmit={handleUpdate}
        onDelete={() => {
          setEditOpen(false);
          setDeleteOpen(true);
        }}
        deleting={deleteBusy}
      />

      {/* Destructive delete confirmation (Stitch workflow modal) */}
      <CoopModal
        tone="danger"
        title="Delete Customer"
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onOk={confirmDelete}
        confirmLoading={deleteBusy}
        cancelText="Cancel"
        okText="Delete"
        danger
        width={440}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingTop: 4 }}>
          <span
            aria-hidden
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'rgba(186, 26, 26, 0.1)',
              color: colors.error,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17,
              flexShrink: 0,
            }}
          >
            <WarningOutlined />
          </span>
          <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
            Are you sure you want to delete {customer.full_name}? This is permanent and cannot be
            undone. Their order history is retained for reporting.
          </div>
        </div>
      </CoopModal>
    </div>
  );
};

/** Stat card with corner icon (Stitch details pattern). */
const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => {
  const { colors } = useCoopTheme();
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radius.lg,
        padding: 20,
        height: '100%',
      }}
    >
      {/* Decorative corner tint */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: -46,
          right: -46,
          width: 110,
          height: 110,
          borderRadius: '50%',
          background: colors.surfaceContainerLow,
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 18,
          right: 18,
          width: 34,
          height: 34,
          borderRadius: radius.md,
          background: colors.surfaceContainerLow,
          color: colors.primary,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
        }}
      >
        {icon}
      </span>
      <div style={{ position: 'relative' }}>
        <div style={{ ...type.bodyCompact, fontSize: 13.5, color: colors.onSurfaceVariant, marginBottom: 6 }}>{label}</div>
        <div style={{ ...type.sectionHeading, fontSize: 26, color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
    </div>
  );
};

export default CustomerProfilePage;
