import React, { useCallback, useEffect, useState } from 'react';
import { Select, message } from 'antd';
import {
  CheckCircleFilled,
  DeleteOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  MailOutlined,
  PrinterOutlined,
  FileDoneOutlined,
  ShoppingCartOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { radius, spacing, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  orderNumber,
  orderTimeline,
} from '../../lib/orderStatus';
import { formatCurrency } from '../Dashboard/kpiConfig';
import { ApiError, useApiClient } from '../../services/api/client';
import type { OrderStatus } from './useOrders';
import { ALLOWED_ORDER_TRANSITIONS, Order, OrderItem } from './useOrders';
import { isLocalModeActive, localBusinessIdLocal, makeOrderRepo } from '../../repositories';
import { getLocalDb } from '../../sync/localDb';
import CustomerAvatar from '../../components/ui/CustomerAvatar';
import AiNoticeBox from '../../components/ui/AiNoticeBox';
import {
  CoopBadge,
  CoopButton,
  CoopErrorState,
  CoopLoading,
  CoopModal,
} from '../../components/ui';

/**
 * Order Details (Stitch coop_order_details_refactored):
 *
 *   Order #ORD-XXXX [status pill] · placed-on line
 *   Items Ordered card (real line items + totals)
 *   Zeno Insights (honest placeholder)
 *   Update Status card — the backend-published legal transitions
 *   Customer Details card — links to the customer profile
 *   Timeline — derived from real timestamps + status position
 *   Invoice — printable document (business header, bill-to, lines, total)
 *
 * Business rules unchanged: transitions come from `allowed_transitions`,
 * stock rollback on cancel happens server-side.
 */

const OrderDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id);
  const { colors } = useCoopTheme();
  const navigate = useNavigate();
  const api = useApiClient();
  const [messageApi, messageCtx] = message.useMessage();

  const [order, setOrder] = useState<Order | null>(null);
  const [business, setBusiness] = useState<{ name: string; currency: string; address: string | null; phone: string | null; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const [nextStatus, setNextStatus] = useState<OrderStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  // OFFLINE 3 local read: the order straight from the SQLite mirror (with
  // its customer, line items and product names) — same Order shape.
  const loadLocal = useCallback(async () => {
    const biz = await localBusinessIdLocal();
    const db = getLocalDb();
    if (!db) throw new ApiError('Local data layer unavailable.');
    const [row, allItems, products] = await Promise.all([
      db.orderGet(orderId),
      db.orderItemsByOrder({ business_id: biz, opts: { limit: 10000 } }),
      db.productList({ business_id: biz, opts: { limit: 10000 } }),
    ]);
    if (!row) throw new ApiError('Order not found on this device.');
    const cust = row.customer_id != null ? await db.customerGet(Number(row.customer_id)) : null;
    const bizRow = await db.businessGet(biz);
    if (bizRow) {
      setBusiness({
        name: String(bizRow.name ?? ''),
        currency: String(bizRow.currency ?? 'USD'),
        address: null,
        phone: null,
        email: null,
      });
    }
    const nameById = new Map<number, string>(products.map((p) => [Number(p.id), String(p.name ?? '')]));
    const data: Order = {
      id: Number(row.id),
      customer_id: Number(row.customer_id),
      customer: cust ? { full_name: String(cust.full_name ?? '') } : null,
      status: String(row.status) as Order['status'],
      allowed_transitions: ALLOWED_ORDER_TRANSITIONS[String(row.status) as Order['status']] ?? [],
      total_amount: Number(row.total_amount ?? 0),
      order_date: String(row.order_date ?? ''),
      created_at: String(row.created_at ?? ''),
      items: allItems
        .filter((it) => Number(it.order_id) === Number(row.id))
        .map((it) => ({
          id: Number(it.id),
          product_id: Number(it.product_id),
          product_name: nameById.get(Number(it.product_id)) ?? null,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          total_price: Number(it.total_price),
        })),
    };
    setOrder(data);
    setNextStatus(data.allowed_transitions[0] ?? null);
  }, [orderId]);

  const load = useCallback(async () => {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      setError(new ApiError('Invalid order id.'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isLocalModeActive()) {
        await loadLocal();
        return;
      }
      const { data } = await api.get<Order>(`/orders/${orderId}`);
      setOrder(data);
      setNextStatus(data.allowed_transitions[0] ?? null);
      // Business identity for the invoice header (best-effort).
      api
        .get<{ name: string; currency: string; address: string | null; phone: string | null; owner_email: string | null }>(
          '/business/settings',
        )
        .then((r) =>
          setBusiness({
            name: r.data.name,
            currency: r.data.currency,
            address: r.data.address,
            phone: r.data.phone,
            email: r.data.owner_email,
          }),
        )
        .catch(() => undefined);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError('Unable to load order.'));
    } finally {
      setLoading(false);
    }
  }, [api, orderId, loadLocal]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async () => {
    if (!order || !nextStatus) return;
    setUpdating(true);
    try {
      if (isLocalModeActive()) {
        // Local-first (OFFLINE 3): SQLite + sync queue; the server validates
        // the same transition when the op is pushed. Reload from the mirror.
        await makeOrderRepo(api).setStatus(order.id, nextStatus);
        await load();
        messageApi.success(
          nextStatus === 'cancelled' ? 'Order cancelled — stock restored (pending sync).' : `Order marked ${ORDER_STATUS_LABEL[nextStatus]} (pending sync).`,
        );
        return;
      }
      const { data } = await api.put<Order>(`/orders/${order.id}/status`, { status: nextStatus });
      setOrder(data);
      setNextStatus(data.allowed_transitions[0] ?? null);
      messageApi.success(
        nextStatus === 'cancelled' ? 'Order cancelled — stock restored.' : `Order marked ${ORDER_STATUS_LABEL[nextStatus]}.`,
      );
    } catch (e) {
      messageApi.error(e instanceof ApiError ? e.message : 'Status update failed.');
    } finally {
      setUpdating(false);
    }
  };

  const confirmDelete = async () => {
    if (!order) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/orders/${order.id}`);
      messageApi.success('Order deleted.');
      navigate('/orders');
    } catch (e) {
      messageApi.error(e instanceof ApiError ? e.message : 'Delete failed.');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CoopLoading height={280} label="Loading order…" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
        {messageCtx}
        <CoopErrorState
          title="Order not found"
          detail={error?.message ?? 'This order may have been deleted.'}
          onRetry={load}
        />
        <CoopButton variant="secondary" onClick={() => navigate('/orders')}>
          Back to Orders
        </CoopButton>
      </div>
    );
  }

  // Timeline from real data only: the API exposes created_at; milestone
  // times beyond "placed" are shown only when we actually have them.
  const timeline = orderTimeline(order.status, order.created_at, null);
  const customer = order.customer;

  const itemRow = (item: OrderItem) => (
    <div
      key={item.id}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 70px 120px 120px',
        gap: 10,
        alignItems: 'center',
        padding: '12px 16px',
        borderTop: `1px solid ${colors.borderSubtle}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.md,
            background: colors.surfaceContainer,
            color: colors.outline,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          <ShoppingCartOutlined />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: colors.onSurface, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.product_name ?? `Product #${item.product_id}`}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', color: colors.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</div>
      <div style={{ textAlign: 'right', color: colors.onSurfaceVariant, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(item.unit_price)}</div>
      <div style={{ textAlign: 'right', fontWeight: 700, color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(item.total_price)}</div>
    </div>
  );

  return (
    <div>
      {messageCtx}

      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: spacing.md,
          marginBottom: spacing.lg,
        }}
      >
        <div>
          <button
            type="button"
            onClick={() => navigate('/orders')}
            style={{
              border: 'none',
              background: 'transparent',
              color: colors.outline,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              marginBottom: 6,
            }}
          >
            Orders
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, ...type.pageTitle, fontSize: 30, lineHeight: '38px', color: colors.onBackground, letterSpacing: '-0.02em' }}>
              {orderNumber(order.id)}
            </h1>
            <CoopBadge variant={ORDER_STATUS_VARIANT[order.status]}>{ORDER_STATUS_LABEL[order.status]}</CoopBadge>
          </div>
          <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginTop: 6 }}>
            Placed on {dayjs(order.order_date).format('MMM D, YYYY')} at {dayjs(order.order_date).format('h:mm A')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
          <CoopButton variant="secondary" icon={<FileTextOutlined />} onClick={() => setInvoiceOpen(true)}>
            View Invoice
          </CoopButton>
          <CoopButton variant="danger" icon={<DeleteOutlined />} onClick={() => setDeleteOpen(true)}>
            Delete
          </CoopButton>
        </div>
      </div>

      <div className="coop-order-grid">
        {/* Left column */}
        <div className="coop-order-left">
          {/* Items Ordered */}
          <div
            style={{
              background: colors.surfaceContainerLowest,
              border: `1px solid ${colors.borderSubtle}`,
              borderRadius: radius.lg,
              overflow: 'hidden',
              marginBottom: 16,
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.borderSubtle}`, ...type.titleMd, fontSize: 17, color: colors.onSurface }}>
              Items Ordered
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 70px 120px 120px',
                gap: 10,
                padding: '10px 16px',
                background: colors.surfaceContainerLow,
                borderBottom: `1px solid ${colors.borderSubtle}`,
                ...type.labelCaps,
                color: colors.outline,
              }}
            >
              <span>Product</span>
              <span style={{ textAlign: 'center' }}>Qty</span>
              <span style={{ textAlign: 'right' }}>Price</span>
              <span style={{ textAlign: 'right' }}>Total</span>
            </div>
            {order.items.map(itemRow)}
            <div style={{ padding: '14px 16px', borderTop: `1px solid ${colors.borderSubtle}`, display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', ...type.bodyCompact, color: colors.onSurfaceVariant }}>
                  <span>Subtotal</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(order.total_amount)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: 8,
                    borderTop: `1px solid ${colors.borderSubtle}`,
                    ...type.sectionHeading,
                    fontSize: 18,
                    color: colors.onSurface,
                  }}
                >
                  <span>Total</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(order.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* AI insights (honest placeholder) */}
          <AiNoticeBox
            title="Up next: order-level analysis"
            description="Ask Zeno is available now. Order-level analysis — delivery risk, customer LTV and fulfillment route — is still on the roadmap."
          />
        </div>

        {/* Right column */}
        <div className="coop-order-right">
          {/* Update status */}
          <div
            style={{
              background: colors.surfaceContainerLowest,
              border: `1px solid ${colors.borderSubtle}`,
              borderRadius: radius.lg,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <div style={{ ...type.titleMd, fontSize: 16.5, color: colors.onSurface, marginBottom: 14 }}>Update Status</div>
            <Select
              value={nextStatus ?? undefined}
              onChange={(v) => setNextStatus(v as OrderStatus)}
              disabled={order.allowed_transitions.length === 0}
              style={{ width: '100%', marginBottom: 12 }}
              options={order.allowed_transitions.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] }))}
              placeholder={order.allowed_transitions.length === 0 ? 'No transitions available' : 'Select next status'}
              aria-label="Next status"
            />
            <CoopButton block loading={updating} disabled={!nextStatus} onClick={updateStatus}>
              Update Order
            </CoopButton>
          </div>

          {/* Customer details */}
          <div
            style={{
              background: colors.surfaceContainerLowest,
              border: `1px solid ${colors.borderSubtle}`,
              borderRadius: radius.lg,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...type.titleMd, fontSize: 16.5, color: colors.onSurface, marginBottom: 14 }}>
              <MailOutlined style={{ color: colors.outline }} />
              Customer Details
            </div>
            {customer ? (
              <button
                type="button"
                onClick={() => navigate(`/customers/${order.customer_id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: radius.md,
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceContainerLow)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <CustomerAvatar name={customer.full_name} size={40} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, color: colors.onSurface }}>{customer.full_name}</div>
                  <div style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.outline }}>View customer profile →</div>
                </div>
              </button>
            ) : (
              <div style={{ ...type.bodyCompact, color: colors.outline }}>Customer unavailable.</div>
            )}
            <div style={{ borderTop: `1px solid ${colors.borderSubtle}`, marginTop: 10, paddingTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <EnvironmentOutlined style={{ color: colors.outline }} />
                <span style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
                  {formatCurrency(order.total_amount)} order value
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <ShoppingCartOutlined style={{ color: colors.outline }} />
                <span style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>{order.items.length} items</span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div
            style={{
              background: colors.surfaceContainerLowest,
              border: `1px solid ${colors.borderSubtle}`,
              borderRadius: radius.lg,
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...type.titleMd, fontSize: 16.5, color: colors.onSurface, marginBottom: 16 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke={colors.outline} strokeWidth="1.8" />
                <path d="M12 7v5l3 2" stroke={colors.outline} strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Timeline
            </div>
            <div>
              {timeline.map((node, i) => (
                <div key={node.label} style={{ display: 'flex', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        flexShrink: 0,
                        background:
                          node.state === 'done' ? colors.primary :
                          node.state === 'current' ? colors.primaryFixed :
                          colors.surfaceContainer,
                        color:
                          node.state === 'done' || node.state === 'current' ? colors.onPrimary :
                          node.state === 'cancelled' ? colors.error :
                          colors.outline,
                        border:
                          node.state === 'todo' ? `2px solid ${colors.outlineVariant}` :
                          node.state === 'cancelled' ? `2px solid ${colors.error}` :
                          node.state === 'current' ? `2px solid ${colors.primary}` : 'none',
                      }}
                    >
                      {node.state === 'done' ? (
                        <CheckCircleFilled />
                      ) : node.state === 'cancelled' ? (
                        <WarningOutlined />
                      ) : node.state === 'current' ? (
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors.primary }} />
                      ) : null}
                    </span>
                    {i < timeline.length - 1 && (
                      <span aria-hidden style={{ width: 2, flex: 1, minHeight: 26, background: colors.borderSubtle, margin: '4px 0' }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: i < timeline.length - 1 ? 14 : 0, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color:
                          node.state === 'todo' ? colors.outline :
                          node.state === 'cancelled' ? colors.error :
                          colors.onSurface,
                      }}
                    >
                      {node.label}
                    </div>
                    {node.time && (
                      <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}>
                        {dayjs(node.time).format('MMM D, h:mm A')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <CoopModal
        tone="danger"
        title="Delete Order"
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onOk={confirmDelete}
        confirmLoading={deleteBusy}
        cancelText="Keep Order"
        okText="Delete Order"
        danger
        width={460}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
          <div
            aria-hidden
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              background: 'rgba(186, 26, 26, 0.1)',
              color: colors.error,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            <WarningOutlined />
          </div>
          <p style={{ margin: 0, ...type.bodyCompact, color: colors.onSurfaceVariant }}>
            Are you sure you want to delete {orderNumber(order.id)}? This is permanent and cannot be
            undone.
            {order.status !== 'cancelled' && ' Its stock will be restored.'}
          </p>
        </div>
      </CoopModal>

      {/* Invoice */}
      <InvoiceModal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        order={order}
        business={business}
      />
    </div>
  );
};

export default OrderDetailsPage;
interface InvoiceModalProps {
  open: boolean;
  onClose: () => void;
  order: Order;
  business: { name: string; currency: string; address: string | null; phone: string | null; email: string | null } | null;
}

const InvoiceModal: React.FC<InvoiceModalProps> = ({ open, onClose, order, business }) => {
  const api = useApiClient();
  const navigate = useNavigate();
  const [savingInvoice, setSavingInvoice] = useState(false);

  /**
   * Save this printable invoice as a numbered, tracked document (POST /invoices,
   * team-only). Amounts are not sent — the server reads them off the order — so
   * the record cannot drift from what was printed.
   */
  const saveAsInvoice = useCallback(async () => {
    setSavingInvoice(true);
    try {
      const { data } = await api.post<{ number: string }>('/invoices', { order_id: order.id });
      message.success(`Saved as ${data.number}`);
      onClose();
      navigate('/invoices');
    } catch (e) {
      // The api client already lifts `detail.message` onto ApiError.message,
      // so "This order is already invoiced as INV-0001." arrives as-is.
      message.error(e instanceof Error ? e.message : 'Could not save the invoice.');
    } finally {
      setSavingInvoice(false);
    }
  }, [api, navigate, onClose, order.id]);

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(27,27,35,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      className="coop-invoice-backdrop"
      onClick={onClose}
    >
      <div
        className="coop-invoice-print"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          color: '#1b1b23',
          borderRadius: radius.xl,
          width: '100%',
          maxWidth: 680,
          maxHeight: '88vh',
          overflowY: 'auto',
          padding: 40,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: '#4143d5' }}>
              {business?.name ?? 'Co-op Business'}
            </div>
            {business?.address && <div style={{ fontSize: 13, color: '#464555', marginTop: 6, whiteSpace: 'pre-line' }}>{business.address}</div>}
            {business?.phone && <div style={{ fontSize: 13, color: '#464555', marginTop: 2 }}>{business.phone}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1b1b23' }}>Invoice</div>
            <div style={{ fontSize: 13.5, color: '#464555', marginTop: 8 }}>{orderNumber(order.id)}</div>
            <div style={{ fontSize: 13, color: '#767586', marginTop: 2 }}>{dayjs(order.order_date).format('MMM D, YYYY')}</div>
          </div>
        </div>

        {/* Bill to */}
        <div style={{ marginBottom: 28, padding: '14px 16px', borderRadius: radius.lg, background: '#f5f2fe' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#767586', marginBottom: 6 }}>
            Bill To
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{order.customer?.full_name ?? 'Customer'}</div>
          <div style={{ fontSize: 13, color: '#464555', marginTop: 2 }}>Status: {ORDER_STATUS_LABEL[order.status]}</div>
        </div>

        {/* Lines */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#f5f2fe' }}>
              {['Product', 'Qty', 'Unit Price', 'Total'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: '10px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: '#767586',
                    textAlign: i === 0 ? 'left' : 'right',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #e9e6f3' }}>
                <td style={{ padding: '10px 12px', fontSize: 13.5, fontWeight: 500 }}>{item.product_name ?? `Product #${item.product_id}`}</td>
                <td style={{ padding: '10px 12px', fontSize: 13.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                <td style={{ padding: '10px 12px', fontSize: 13.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(item.unit_price, business?.currency)}
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13.5, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(item.total_price, business?.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
          <div style={{ display: 'flex', gap: 40, alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, color: '#464555' }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(order.total_amount, business?.currency)}
            </span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e9e6f3', paddingTop: 16, textAlign: 'center', fontSize: 12, color: '#767586' }}>
          Thank you for your business — {business?.name ?? 'Co-op'}
        </div>

        {/* Actions (hidden in print) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }} className="coop-invoice-actions">
          {!isLocalModeActive && (
            <CoopButton
              variant="secondary"
              icon={<FileDoneOutlined />}
              loading={savingInvoice}
              onClick={() => void saveAsInvoice()}
            >
              Save as invoice
            </CoopButton>
          )}
          <CoopButton variant="secondary" onClick={onClose}>
            Close
          </CoopButton>
          <CoopButton icon={<PrinterOutlined />} onClick={() => window.print()}>
            Print / Save PDF
          </CoopButton>
        </div>
      </div>
    </div>
  );
};


