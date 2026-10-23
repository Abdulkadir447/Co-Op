/**
 * Orders module screen (Stitch coop_orders_catalog_refactored +
 * coop_orders_mobile_refactored). UI refactor only — same endpoints, same
 * transition rules (published by the backend), same stock handling.
 *
 *   desktop : underline status tabs + catalog table; rows open the
 *             Order Details page (status workflow + invoice live there)
 *   mobile  : pill tabs + order cards + FAB
 *   export  : real CSV of the current page (client-side, no new endpoint)
 *   create  : /orders/new (Create Order workflow page)
 */
import React from 'react';
import { message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CalendarOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { radius, type } from '../../theme';
import { tint } from '../../theme/colors';
import { useCoopTheme } from '../../theme-provider';
import { ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT, orderNumber } from '../../lib/orderStatus';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatCurrency } from '../Dashboard/kpiConfig';
import { Order, OrderStatus, useOrders } from './useOrders';
import {
  CustomerAvatar,
  CoopBadge,
  CoopButton,
  CoopCard,
  CoopErrorState,
  CoopInput,
  CoopTable,
} from '../../components/ui';
import PageHeader from '../../components/layout/PageHeader';

type TabValue = OrderStatus | 'all';

const TABS: TabValue[] = ['all', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const OrdersPage: React.FC = () => {
  const { colors } = useCoopTheme();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const navigate = useNavigate();
  const [messageApi, messageCtx] = message.useMessage();

  const {
    items,
    total,
    page,
    pageSize,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    loading,
    error,
    pendingSyncIds,
    reload,
    goToPage,
  } = useOrders();

  const openOrder = (id: number) => navigate(`/orders/${id}`);

  // Real CSV export of the current page (client-side; no server change).
  const exportCsv = () => {
    if (items.length === 0) {
      messageApi.info('Nothing to export on this page.');
      return;
    }
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      ['Order ID', 'Customer', 'Date', 'Items', 'Total', 'Status'],
      ...items.map((o) => [
        orderNumber(o.id),
        o.customer?.full_name ?? '',
        dayjs(o.order_date).format('YYYY-MM-DD'),
        String(o.items.length),
        o.total_amount.toFixed(2),
        ORDER_STATUS_LABEL[o.status],
      ]),
    ];
    const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coop-orders-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    messageApi.success('Orders exported (current page).');
  };

  const columns: ColumnsType<Order> = [
    {
      title: 'Order ID',
      dataIndex: 'id',
      key: 'id',
      width: 140,
      render: (v: number) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openOrder(v);
          }}
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
      title: 'Customer',
      key: 'customer',
      render: (_: unknown, o) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CustomerAvatar name={o.customer?.full_name ?? '?'} size={32} />
          <span style={{ color: colors.onSurfaceVariant }}>{o.customer?.full_name ?? '—'}</span>
        </div>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'order_date',
      key: 'order_date',
      width: 140,
      render: (v: string) => <span style={{ color: colors.onSurfaceVariant }}>{dayjs(v).format('MMM D, YYYY')}</span>,
    },
    {
      title: 'Items',
      key: 'items',
      width: 100,
      render: (_: unknown, o) => (
        <span style={{ color: colors.onSurfaceVariant }}>{o.items.length} {o.items.length === 1 ? 'item' : 'items'}</span>
      ),
    },
    {
      title: 'Total',
      dataIndex: 'total_amount',
      key: 'total',
      width: 140,
      align: 'right',
      render: (v: number) => (
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: colors.onSurface }}>
          {formatCurrency(v)}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (s: OrderStatus) => <CoopBadge variant={ORDER_STATUS_VARIANT[s]}>{ORDER_STATUS_LABEL[s]}</CoopBadge>,
    },
  ];

  const showEmptyCta = !loading && !error && total === 0 && !search && statusFilter === 'all';

  const tabsBar = (
    <div
      style={{
        display: 'flex',
        gap: 22,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        borderBottom: `1px solid ${colors.borderSubtle}`,
      }}
    >
      {TABS.map((t) => {
        const active = statusFilter === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => setStatusFilter(t as TabValue)}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '10px 2px',
              marginBottom: -1,
              cursor: 'pointer',
              fontWeight: active ? 600 : 500,
              fontSize: 14,
              color: active ? colors.primary : colors.onSurfaceVariant,
              borderBottom: `2px solid ${active ? colors.primary : 'transparent'}`,
              whiteSpace: 'nowrap',
              transition: 'color 150ms',
            }}
          >
            {t === 'all' ? 'All Orders' : ORDER_STATUS_LABEL[t]}
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      {messageCtx}

      <PageHeader
        title="Orders"
        subtitle="Manage and track all customer orders."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <CoopButton variant="secondary" icon={<DownloadOutlined />} onClick={exportCsv}>
              Export
            </CoopButton>
            {!isMobile && (
              <CoopButton icon={<PlusOutlined />} onClick={() => navigate('/orders/new')}>
                Create Order
              </CoopButton>
            )}
          </div>
        }
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <CoopErrorState
            title={error.isAuthError ? 'Authentication required' : 'Unable to load orders'}
            detail={error.message}
            onRetry={reload}
          />
        </div>
      )}

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ maxWidth: 420 }}>
            <CoopInput
              search
              placeholder="Search orders…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search orders"
              style={{ width: '100%' }}
            />
          </div>

          {/* Mobile pill tabs (coop_orders_mobile) */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {TABS.map((t) => {
              const active = statusFilter === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setStatusFilter(t as TabValue)}
                  style={{
                    border: 'none',
                    borderRadius: radius.full,
                    padding: '8px 16px',
                    fontSize: 13.5,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    background: active ? colors.primary : colors.surfaceContainer,
                    color: active ? colors.onPrimary : colors.onSurfaceVariant,
                    transition: 'background-color 150ms',
                  }}
                >
                  {t === 'all' ? 'All Orders' : ORDER_STATUS_LABEL[t]}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 150, borderRadius: radius.lg, background: colors.surfaceContainer }} />
              ))}
            </div>
          ) : items.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => openOrder(o.id)}
                  style={{
                    textAlign: 'left',
                    background: colors.surfaceContainerLowest,
                    border: `1px solid ${colors.borderSubtle}`,
                    borderRadius: radius.lg,
                    padding: 16,
                    cursor: 'pointer',
                    transition: 'border-color 150ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = colors.outlineVariant)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = colors.borderSubtle)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ ...type.labelCaps, color: colors.outline, fontSize: 11 }}>{orderNumber(o.id)}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {pendingSyncIds.includes(o.id) && (
                        <span
                          role="status"
                          title="Saved on this device — uploading when Co-op is online"
                          style={{
                            ...type.bodyCompact,
                            fontSize: 11,
                            fontWeight: 600,
                            color: colors.warning,
                            background: tint(colors.warning, 0.14),
                            padding: '2px 8px',
                            borderRadius: 9999,
                          }}
                        >
                          Pending sync
                        </span>
                      )}
                      <CoopBadge variant={ORDER_STATUS_VARIANT[o.status]}>{ORDER_STATUS_LABEL[o.status]}</CoopBadge>
                    </span>
                  </div>
                  <div style={{ ...type.titleMd, fontSize: 17, color: colors.onSurface, marginTop: 8 }}>
                    {o.customer?.full_name ?? '—'}
                  </div>
                  <div
                    style={{
                      ...type.bodyCompact,
                      fontSize: 13,
                      color: colors.onSurfaceVariant,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 4,
                    }}
                  >
                    <CalendarOutlined style={{ color: colors.outline, fontSize: 12 }} />
                    {dayjs(o.order_date).format('MMM D, YYYY')}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: `1px solid ${colors.borderSubtle}`,
                      marginTop: 12,
                      paddingTop: 12,
                    }}
                  >
                    <CustomerAvatar name={o.customer?.full_name ?? '?'} size={30} />
                    <span style={{ ...type.titleMd, color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(o.total_amount)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div
              style={{
                border: `1px solid ${colors.borderSubtle}`,
                borderRadius: radius.lg,
                padding: '36px 16px',
                textAlign: 'center',
                background: colors.surfaceContainerLowest,
              }}
            >
              <div style={{ ...type.titleMd, color: colors.onSurface, marginBottom: 6 }}>
                {showEmptyCta ? 'No orders yet' : 'No results found'}
              </div>
              <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
                {showEmptyCta
                  ? 'Create your first order to start tracking sales.'
                  : 'No orders match your filters.'}
              </div>
            </div>
          )}

          {/* Mobile FAB */}
          <button
            type="button"
            onClick={() => navigate('/orders/new')}
            aria-label="Create order"
            style={{
              position: 'fixed',
              right: 20,
              bottom: 24,
              width: 54,
              height: 54,
              borderRadius: radius.xl,
              border: 'none',
              background: `linear-gradient(135deg, ${colors.primaryContainer} 0%, ${colors.secondaryContainer} 100%)`,
              color: colors.onPrimary,
              fontSize: 22,
              cursor: 'pointer',
              zIndex: 60,
              boxShadow: '0 8px 24px rgba(91, 95, 239, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PlusOutlined />
          </button>
        </div>
      ) : (
        <CoopCard flush bodyPadding={0}>
          {/* Toolbar: status tabs + search */}
          <div style={{ padding: '0 16px' }}>{tabsBar}</div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '12px 16px',
              borderBottom: `1px solid ${colors.borderSubtle}`,
            }}
          >
            <div style={{ width: '100%', maxWidth: 340 }}>
              <CoopInput
                search
                placeholder="Search by customer name or order number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search orders"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <CoopTable<Order>
            rowKey="id"
            columns={columns}
            dataSource={items}
            loading={loading}
            onRow={(o) => ({
              onClick: () => openOrder(o.id),
              style: { cursor: 'pointer' },
            })}
            scroll={{ x: 820 }}
            empty={
              showEmptyCta
                ? {
                    title: 'No orders yet',
                    description: 'Create your first order to start tracking sales.',
                    action: (
                      <CoopButton size="sm" icon={<PlusOutlined />} onClick={() => navigate('/orders/new')}>
                        New order
                      </CoopButton>
                    ),
                    compact: true,
                  }
                : { title: 'No results found', description: 'No orders match your filters.', compact: true }
            }
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: false,
              showTotal: (t, range) => `Showing ${range[0]}–${range[1]} of ${t}`,
              onChange: goToPage,
            }}
          />
        </CoopCard>
      )}
    </div>
  );
};

export default OrdersPage;
