import React, { useEffect, useMemo, useState } from 'react';
import { Input, InputNumber, message } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  DeleteOutlined,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { radius, shadow, type } from '../../theme';
import { tint } from '../../theme/colors';
import { useCoopTheme } from '../../theme-provider';
import { orderNumber } from '../../lib/orderStatus';
import { formatCurrency } from '../Dashboard/kpiConfig';
import { ApiError, useApiClient } from '../../services/api/client';
import { makeCustomerRepo, makeOrderRepo } from '../../repositories';
import {
  useCustomerCatalog,
  useProductCatalog,
  CatalogCustomer,
  CatalogProduct,
} from './useCatalog';
import { OrderCreateInput } from './useOrders';
import CustomerAvatar from '../../components/ui/CustomerAvatar';
import { CoopBadge, CoopButton, SparkleIcon } from '../../components/ui';

/**
 * Create Order workflow (Stitch coop_create_order_workflow +
 * coop_payment_success_failure) as one continuous page:
 *
 *   1. Customer Details — searchable picker + inline "New" customer via the
 *      existing POST /customers
 *   2. Add Products     — searchable picker + Quick Add (bulk-adds matches)
 *   3. Line Items       — qty steppers, editable snapshot prices, totals
 *   → Payment           — honest step: the invoice method is live (creates
 *      the order via the existing POST /orders); the card method stays
 *      disabled until a gateway is connected (no fake charges, no fake TXN)
 *   → Success / Failure — design-matched result screens; failure keeps the
 *      draft for "Try Again"
 *
 * All business rules stay server-side (stock, duplicates, totals); the
 * client-side checks are convenience only.
 */

type Step = 'form' | 'payment' | 'success' | 'failure';

interface Line {
  key: number;
  product: CatalogProduct;
  quantity: number;
  unit_price: number;
}

let lineSeq = 1;

const AI_ORDER_DRAFT_KEY = 'coop:ai-order-draft';

interface AiOrderDraft {
  customer?: { id: number; full_name: string; email: string } | null;
  lines?: Array<{ product_id: number; name: string; sku: string; quantity: number; unit_price: number }>;
}

/**
 * Zeno handoff: an AI-drafted order (Stage 2.2 action boundary) opens
 * here PRE-FILLED for review. The AI never created it — the user still
 * reviews the lines and presses Confirm Order, at which point the existing
 * POST /orders executes.
 */
function readAiDraft(): AiOrderDraft | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(AI_ORDER_DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    localStorage.removeItem(AI_ORDER_DRAFT_KEY);
    return JSON.parse(raw) as AiOrderDraft;
  } catch {
    return null;
  }
}

const CreateOrderPage: React.FC = () => {
  const { colors, isDark } = useCoopTheme();
  const navigate = useNavigate();
  const [messageApi, messageCtx] = message.useMessage();
  const api = useApiClient();
  // OFFLINE 2: inline customer + order creation go through the repositories
  // (local-first on desktop, unchanged HTTP in a browser).
  const customersRepo = makeCustomerRepo(api);
  const ordersRepo = makeOrderRepo(api);

  const customers = useCustomerCatalog();
  const products = useProductCatalog();

  const [step, setStep] = useState<Step>('form');
  const [selectedCustomer, setSelectedCustomer] = useState<CatalogCustomer | null>(null);
  const [customerFocus, setCustomerFocus] = useState(false);
  const [productFocus, setProductFocus] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerBusy, setNewCustomerBusy] = useState(false);
  const [customerDraft, setCustomerDraft] = useState({ full_name: '', email: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod] = useState<'invoice' | 'card'>('invoice');
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);
  const [createdTotal, setCreatedTotal] = useState(0);
  // True when the created order went to the local SQLite mirror (offline /
  // local-first) — the success screen then says so, honestly.
  const [localCreated, setLocalCreated] = useState(false);
  const [failureMessage, setFailureMessage] = useState('');
  const [aiDraftNote, setAiDraftNote] = useState<string | null>(null);

  // Zeno draft handoff (runs once, on mount).
  useEffect(() => {
    const draft = readAiDraft();
    if (!draft) return;
    if (draft.customer) {
      setSelectedCustomer({
        id: draft.customer.id,
        full_name: draft.customer.full_name,
        email: draft.customer.email,
      });
    }
    if (draft.lines && draft.lines.length > 0) {
      // Fetch the real products (live stock caps the qty steppers).
      Promise.all(
        draft.lines.map((l) =>
          api
            .get<CatalogProduct>(`/products/${l.product_id}`)
            .then((r) => ({ line: l, product: r.data }))
            .catch(() => ({ line: l, product: null })),
        ),
      ).then((results) => {
        const nextLines: Line[] = [];
        results.forEach(({ line, product }) => {
          if (!product) return;
          nextLines.push({
            key: lineSeq++,
            product,
            quantity: Math.min(Math.max(1, line.quantity), product.current_stock || line.quantity),
            unit_price: line.unit_price > 0 ? line.unit_price : product.unit_price,
          });
        });
        if (nextLines.length > 0) {
          setLines(nextLines);
          setAiDraftNote(
            `Drafted with Zeno — ${nextLines.map((l) => `${l.quantity} × ${l.product.name}`).join(', ')}. Review and confirm to create the order.`,
          );
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grandTotal = useMemo(
    () => lines.reduce((sum, l) => sum + Math.round(l.unit_price * l.quantity * 100) / 100, 0),
    [lines],
  );

  const ring = tint(colors.primary, 0.15);
  const dropShadow = isDark ? '0 12px 32px rgba(0, 0, 0, 0.5)' : shadow.overlay;

  // ------------------------------------------------------------------
  // Customer selection
  // ------------------------------------------------------------------
  const pickCustomer = (c: CatalogCustomer) => {
    setSelectedCustomer(c);
    setCustomerFocus(false);
    setNewCustomerOpen(false);
  };

  const createCustomerAndPick = async () => {
    if (!customerDraft.full_name.trim() || !customerDraft.email.trim()) {
      messageApi.warning('Name and email are required for a new customer.');
      return;
    }
    setNewCustomerBusy(true);
    try {
      // Local-first (ADR-002): the repository returns the created customer
      // (server CustomerOut, or a local row with the same id/full_name/email).
      const data = (await customersRepo.create({
        full_name: customerDraft.full_name.trim(),
        email: customerDraft.email.trim(),
        ...(customerDraft.phone.trim() ? { phone: customerDraft.phone.trim() } : {}),
      })) as { id: number; full_name: string; email: string };
      pickCustomer({ id: data.id, full_name: data.full_name, email: data.email });
      setCustomerDraft({ full_name: '', email: '', phone: '' });
      messageApi.success('Customer created.');
    } catch (e) {
      messageApi.error(e instanceof ApiError ? e.message : 'Could not create customer.');
    } finally {
      setNewCustomerBusy(false);
    }
  };

  // ------------------------------------------------------------------
  // Product lines
  // ------------------------------------------------------------------
  const addLine = (product: CatalogProduct) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id
            ? { ...l, quantity: Math.min(l.quantity + 1, product.current_stock) }
            : l,
        );
      }
      return [...prev, { key: lineSeq++, product, quantity: 1, unit_price: product.unit_price }];
    });
    setProductFocus(false);
  };

  /** Quick Add: bulk-add the current in-stock search matches (max 5). */
  const quickAdd = () => {
    const matches = products.results.filter((p) => p.current_stock > 0).slice(0, 5);
    if (matches.length === 0) {
      messageApi.info('No in-stock matches to quick-add — refine your search.');
      return;
    }
    setLines((prev) => {
      let next = [...prev];
      matches.forEach((p) => {
        const existing = next.find((l) => l.product.id === p.id);
        if (existing) {
          next = next.map((l) =>
            l.product.id === p.id ? { ...l, quantity: Math.min(l.quantity + 1, p.current_stock) } : l,
          );
        } else {
          next = [...next, { key: lineSeq++, product: p, quantity: 1, unit_price: p.unit_price }];
        }
      });
      return next;
    });
    messageApi.success(`Added ${matches.length} product${matches.length === 1 ? '' : 's'}.`);
  };

  const patchLine = (key: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key: number) => setLines((prev) => prev.filter((l) => l.key !== key));

  // ------------------------------------------------------------------
  // Validation + submission
  // ------------------------------------------------------------------
  const validate = (): string | null => {
    if (!selectedCustomer) return 'Select a customer for this order.';
    if (lines.length === 0) return 'Add at least one product.';
    for (const l of lines) {
      if (l.quantity < 1) return 'Every line needs a quantity of at least 1.';
      if (l.unit_price <= 0) return 'Every line needs a price above 0.';
      if (l.quantity > l.product.current_stock) {
        return `Only ${l.product.current_stock} in stock for "${l.product.name}".`;
      }
    }
    return null;
  };

  const goToPayment = () => {
    const problem = validate();
    if (problem) {
      messageApi.warning(problem);
      return;
    }
    setStep('payment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    setSubmitting(true);
    const input: OrderCreateInput = {
      customer_id: selectedCustomer!.id,
      items: lines.map((l) => ({
        product_id: l.product.id,
        quantity: l.quantity,
        unit_price: l.unit_price,
      })),
    };
    try {
      // Local-first (ADR-002): the repository returns the created order
      // (server OrderOut, or a local row with the same id + total_amount).
      const data = (await ordersRepo.create(input)) as {
        id: number;
        total_amount: number;
      };
      setCreatedOrderId(data.id);
      setCreatedTotal(data.total_amount ?? grandTotal);
      setLocalCreated(ordersRepo.isLocal); // OFFLINE 3: honest "saved on device" state
      setStep('success');
    } catch (e) {
      setFailureMessage(e instanceof ApiError ? e.message : 'The order could not be created.');
      setStep('failure');
    } finally {
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // ------------------------------------------------------------------
  // Shared bits
  // ------------------------------------------------------------------
  const stepLabel = (n: number, text: string) => (
    <div style={{ ...type.titleMd, fontSize: 14.5, color: colors.onSurface, marginBottom: 10 }}>
      {n}. {text}
    </div>
  );

  const searchBox = (
    placeholder: string,
    focused: boolean,
    onFocus: () => void,
    onBlur: () => void,
    value: string,
    onChange: (v: string) => void,
    action?: React.ReactNode,
  ) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 46,
        padding: '0 14px',
        borderRadius: radius.lg,
        border: `1px solid ${focused ? colors.primary : colors.outlineVariant}`,
        background: colors.surfaceContainerLowest,
        boxShadow: focused ? `0 0 0 3px ${ring}` : 'none',
        transition: 'border-color 150ms, box-shadow 150ms',
      }}
    >
      <SearchOutlined style={{ color: colors.outline }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={() => setTimeout(onBlur, 150)}
        placeholder={placeholder}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: colors.onSurface,
          fontFamily: 'inherit',
          fontSize: 14,
        }}
      />
      {action}
    </div>
  );

  // ------------------------------------------------------------------
  // Result screens (coop_payment_success_failure pattern)
  // ------------------------------------------------------------------
  if (step === 'success' || step === 'failure') {
    const success = step === 'success';
    return (
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {messageCtx}
        <div
          style={{
            background: colors.surfaceContainerLowest,
            border: `1px solid ${colors.borderSubtle}`,
            borderRadius: radius.xl,
            padding: '40px 32px',
            textAlign: 'center',
            boxShadow: success ? '0 12px 40px rgba(46, 158, 91, 0.12)' : '0 12px 40px rgba(186, 26, 26, 0.1)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              background: success ? tint(colors.success, 0.14) : tint(colors.error, 0.12),
              color: success ? colors.success : colors.error,
              marginBottom: 18,
            }}
          >
            {success ? <CheckCircleFilled /> : <CloseCircleFilled />}
          </span>
          <h2 style={{ margin: 0, ...type.sectionHeading, fontSize: 22, color: colors.onSurface }}>
            {success ? 'Order placed' : 'Order creation failed'}
          </h2>
          <p style={{ margin: '10px 0 0', ...type.bodyCompact, color: colors.onSurfaceVariant }}>
            {success
              ? localCreated
                ? 'Your order is saved on this device and will appear in your list. It uploads to the cloud automatically when Co-op is online — until then it shows “Pending sync”.'
                : 'Your order has been created and is queued for fulfillment.'
              : 'We could not create your order. Your draft is kept — fix the issue and try again.'}
          </p>

          {success && createdOrderId != null ? (
            <div
              style={{
                margin: '22px 0 26px',
                borderRadius: radius.lg,
                background: colors.surfaceContainerLow,
                border: `1px solid ${colors.borderSubtle}`,
                padding: '8px 18px',
                textAlign: 'left',
              }}
            >
              {[
                ['Order Number', orderNumber(createdOrderId)],
                ['Total', formatCurrency(createdTotal)],
                ['Payment', 'Invoice'],
              ].map(([label, value], i) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderTop: i > 0 ? `1px solid ${colors.borderSubtle}` : 'none',
                  }}
                >
                  <span style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>{label}</span>
                  <span style={{ ...type.bodyCompact, fontWeight: 700, color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div
              role="alert"
              style={{
                margin: '22px 0 26px',
                borderRadius: radius.lg,
                background: tint(colors.error, isDark ? 0.16 : 0.07),
                border: `1px solid ${tint(colors.error, isDark ? 0.4 : 0.25)}`,
                padding: '12px 16px',
                textAlign: 'left',
              }}
            >
              <div style={{ ...type.labelCaps, color: colors.error, marginBottom: 4 }}>Reason</div>
              <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>{failureMessage}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {success ? (
              <>
                <CoopButton
                  block
                  icon={<CheckCircleFilled />}
                  onClick={() => navigate(createdOrderId != null ? `/orders/${createdOrderId}` : '/orders')}
                >
                  View Order
                </CoopButton>
                <CoopButton variant="secondary" block onClick={() => navigate('/orders')}>
                  Back to Orders
                </CoopButton>
              </>
            ) : (
              <>
                <CoopButton variant="secondary" icon={<ReloadOutlined />} onClick={() => setStep('payment')}>
                  Try Again
                </CoopButton>
                <CoopButton block onClick={() => navigate('/orders')}>
                  Back to Orders
                </CoopButton>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Payment step
  // ------------------------------------------------------------------
  if (step === 'payment') {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {messageCtx}
        <div
          style={{
            background: colors.surfaceContainerLowest,
            border: `1px solid ${colors.borderSubtle}`,
            borderRadius: radius.xl,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '20px 24px',
              borderBottom: `1px solid ${colors.borderSubtle}`,
              ...type.titleMd,
              fontSize: 18,
              color: colors.onSurface,
            }}
          >
            Payment
          </div>
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
              {selectedCustomer?.full_name} · {lines.length} {lines.length === 1 ? 'item' : 'items'} ·{' '}
              <strong style={{ color: colors.onSurface }}>{formatCurrency(grandTotal)}</strong>
            </div>

            {/* Payment methods — honest: only invoice is live today */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: radius.lg,
                  border: `1px solid ${paymentMethod === 'invoice' ? colors.primary : colors.borderSubtle}`,
                  background: paymentMethod === 'invoice' ? colors.surfaceContainerLow : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <input type="radio" name="payment" checked readOnly />
                <span>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: colors.onSurface }}>
                    Invoice — pay by invoice
                  </span>
                  <span style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.onSurfaceVariant }}>
                    The order is confirmed and payment is collected by invoice.
                  </span>
                </span>
              </label>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: radius.lg,
                  border: `1px solid ${colors.borderSubtle}`,
                  opacity: 0.6,
                }}
              >
                <input type="radio" name="payment" disabled />
                <span>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: colors.onSurface }}>
                    Card payment
                  </span>
                  <span style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.onSurfaceVariant }}>
                    The card gateway connects in a later stage — no charges are processed yet.
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              padding: '16px 24px',
              borderTop: `1px solid ${colors.borderSubtle}`,
              background: colors.surfaceContainerLow,
            }}
          >
            <CoopButton variant="secondary" onClick={() => setStep('form')}>
              Back
            </CoopButton>
            <CoopButton loading={submitting} onClick={submit}>
              Confirm Order
            </CoopButton>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Form step
  // ------------------------------------------------------------------
  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {messageCtx}
      <div
        style={{
          background: colors.surfaceContainerLowest,
          border: `1px solid ${colors.borderSubtle}`,
          borderRadius: radius.xl,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: `1px solid ${colors.borderSubtle}`,
          }}
        >
          <span style={{ ...type.titleMd, fontSize: 18, color: colors.onSurface }}>Create New Order</span>
          <button
            type="button"
            onClick={() => navigate('/orders')}
            aria-label="Close and return to orders"
            style={{ border: 'none', background: 'transparent', color: colors.outline, cursor: 'pointer', fontSize: 15, padding: 4 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Zeno draft notice (action boundary: drafted, not created) */}
          {aiDraftNote && (
            <div
              role="status"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 14px',
                borderRadius: radius.lg,
                background: colors.surfaceContainerLow,
                border: `1px solid ${colors.outlineVariant}`,
                ...type.bodyCompact,
                color: colors.onSurfaceVariant,
              }}
            >
              <SparkleIcon size={16} color={colors.secondaryContainer} style={{ marginTop: 2 }} />
              {aiDraftNote}
            </div>
          )}

          {/* 1. Customer */}
          <section>
            {stepLabel(1, 'Customer Details')}
            {selectedCustomer ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 46,
                  padding: '8px 14px',
                  borderRadius: radius.lg,
                  border: `1px solid ${colors.borderSubtle}`,
                  background: colors.surfaceContainerLow,
                }}
              >
                <CustomerAvatar name={selectedCustomer.full_name} size={30} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: colors.onSurface }}>{selectedCustomer.full_name}</div>
                  <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}>{selectedCustomer.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  style={{
                    marginLeft: 'auto',
                    border: 'none',
                    background: 'transparent',
                    color: colors.primary,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                {searchBox(
                  'Search customer name or email…',
                  customerFocus,
                  () => setCustomerFocus(true),
                  () => setCustomerFocus(false),
                  customers.search,
                  (v) => customers.setSearch(v),
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setNewCustomerOpen(true);
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: colors.primary,
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + New
                  </button>,
                )}
                {customerFocus && !newCustomerOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 20,
                      marginTop: 6,
                      background: colors.surfaceContainerLowest,
                      border: `1px solid ${colors.outlineVariant}`,
                      borderRadius: radius.lg,
                      boxShadow: dropShadow,
                      maxHeight: 260,
                      overflowY: 'auto',
                    }}
                  >
                    {customers.loading ? (
                      <div style={{ padding: 14, ...type.bodyCompact, color: colors.onSurfaceVariant }}>Searching…</div>
                    ) : customers.results.length === 0 ? (
                      <div style={{ padding: 14, ...type.bodyCompact, color: colors.onSurfaceVariant }}>
                        No customers match — use “+ New” to create one.
                      </div>
                    ) : (
                      customers.results.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            pickCustomer(c);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            padding: '10px 14px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceContainerLow)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <CustomerAvatar name={c.full_name} size={28} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: colors.onSurface }}>{c.full_name}</span>
                            <span style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}>{c.email}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {newCustomerOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 20,
                      marginTop: 6,
                      background: colors.surfaceContainerLowest,
                      border: `1px solid ${colors.outlineVariant}`,
                      borderRadius: radius.lg,
                      boxShadow: dropShadow,
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ ...type.titleMd, fontSize: 14, color: colors.onSurface }}>New Customer</div>
                    <Input
                      placeholder="Full name *"
                      value={customerDraft.full_name}
                      onChange={(e) => setCustomerDraft((d) => ({ ...d, full_name: e.target.value }))}
                    />
                    <Input
                      placeholder="Email *"
                      value={customerDraft.email}
                      onChange={(e) => setCustomerDraft((d) => ({ ...d, email: e.target.value }))}
                    />
                    <Input
                      placeholder="Phone (optional)"
                      value={customerDraft.phone}
                      onChange={(e) => setCustomerDraft((d) => ({ ...d, phone: e.target.value }))}
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <CoopButton size="sm" variant="secondary" onClick={() => setNewCustomerOpen(false)}>
                        Cancel
                      </CoopButton>
                      <CoopButton size="sm" loading={newCustomerBusy} onClick={createCustomerAndPick}>
                        Create & Select
                      </CoopButton>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 2. Add products */}
          <section>
            {stepLabel(2, 'Add Products')}
            <div style={{ position: 'relative' }}>
              {searchBox(
                'Search products to add to order…',
                productFocus,
                () => setProductFocus(true),
                () => setProductFocus(false),
                products.search,
                (v) => products.setSearch(v),
                <button
                  type="button"
                  onClick={quickAdd}
                  title="Add the current in-stock matches (max 5)"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: 'none',
                    background: colors.surfaceContainer,
                    color: colors.primary,
                    fontWeight: 600,
                    fontSize: 12.5,
                    borderRadius: radius.md,
                    padding: '6px 10px',
                    cursor: 'pointer',
                  }}
                >
                  <SparkleIcon size={13} color={colors.secondaryContainer} />
                  Quick Add
                </button>,
              )}
              {productFocus && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 20,
                    marginTop: 6,
                    background: colors.surfaceContainerLowest,
                    border: `1px solid ${colors.outlineVariant}`,
                    borderRadius: radius.lg,
                    boxShadow: dropShadow,
                    maxHeight: 300,
                    overflowY: 'auto',
                  }}
                >
                  {products.loading ? (
                    <div style={{ padding: 14, ...type.bodyCompact, color: colors.onSurfaceVariant }}>Searching…</div>
                  ) : products.results.length === 0 ? (
                    <div style={{ padding: 14, ...type.bodyCompact, color: colors.onSurfaceVariant }}>No products match.</div>
                  ) : (
                    products.results.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={p.current_stock === 0}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          addLine(p);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          padding: '10px 14px',
                          border: 'none',
                          background: 'transparent',
                          cursor: p.current_stock === 0 ? 'not-allowed' : 'pointer',
                          opacity: p.current_stock === 0 ? 0.5 : 1,
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) =>
                          p.current_stock > 0 && (e.currentTarget.style.background = colors.surfaceContainerLow)
                        }
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: colors.onSurface }}>{p.name}</span>
                          <span style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}>
                            {p.sku} · {formatCurrency(p.unit_price)}
                          </span>
                        </span>
                        <CoopBadge variant={p.current_stock === 0 ? 'critical' : p.current_stock <= 5 ? 'warning' : 'primary'}>
                          {p.current_stock === 0 ? 'Out' : `${p.current_stock} in stock`}
                        </CoopBadge>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 3. Line items */}
          <section>
            {stepLabel(3, 'Line Items')}
            {lines.length === 0 ? (
              <div
                style={{
                  border: `1px dashed ${colors.outlineVariant}`,
                  borderRadius: radius.lg,
                  padding: '22px 16px',
                  textAlign: 'center',
                  ...type.bodyCompact,
                  color: colors.onSurfaceVariant,
                }}
              >
                No products added yet — search above to build the order.
              </div>
            ) : (
              <div style={{ border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.lg, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 130px 120px 110px 40px',
                    gap: 8,
                    padding: '10px 14px',
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
                  <span />
                </div>
                {lines.map((l) => (
                  <div
                    key={l.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 130px 120px 110px 40px',
                      gap: 8,
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderTop: `1px solid ${colors.borderSubtle}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13.5,
                          color: colors.onSurface,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {l.product.name}
                      </div>
                      <div style={{ ...type.bodyCompact, fontSize: 11.5, color: colors.outline }}>{l.product.sku}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() => patchLine(l.key, { quantity: Math.max(1, l.quantity - 1) })}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: radius.md,
                          border: `1px solid ${colors.outlineVariant}`,
                          background: 'transparent',
                          color: colors.onSurfaceVariant,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MinusOutlined style={{ fontSize: 11 }} />
                      </button>
                      <span
                        style={{
                          minWidth: 24,
                          textAlign: 'center',
                          fontWeight: 600,
                          fontSize: 13.5,
                          color: colors.onSurface,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {l.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => patchLine(l.key, { quantity: Math.min(l.product.current_stock, l.quantity + 1) })}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: radius.md,
                          border: `1px solid ${colors.outlineVariant}`,
                          background: 'transparent',
                          color: colors.onSurfaceVariant,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <PlusOutlined style={{ fontSize: 11 }} />
                      </button>
                    </div>
                    <InputNumber
                      min={0.01}
                      step={0.01}
                      precision={2}
                      value={l.unit_price}
                      onChange={(v) => patchLine(l.key, { unit_price: v ?? 0 })}
                      style={{ width: '100%' }}
                      size="small"
                      aria-label="Unit price"
                    />
                    <div
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        fontSize: 13.5,
                        color: colors.onSurface,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatCurrency(Math.round(l.unit_price * l.quantity * 100) / 100)}
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${l.product.name}`}
                      onClick={() => removeLine(l.key)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: colors.error,
                        cursor: 'pointer',
                        padding: 4,
                        display: 'inline-flex',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <DeleteOutlined />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Summary + confirm */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            padding: '16px 24px',
            borderTop: `1px solid ${colors.borderSubtle}`,
            background: colors.surfaceContainerLow,
          }}
        >
          <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
            {lines.length} {lines.length === 1 ? 'item' : 'items'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}>Total</div>
              <div style={{ ...type.sectionHeading, fontSize: 22, color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(grandTotal)}
              </div>
            </div>
            <CoopButton variant="secondary" onClick={() => navigate('/orders')}>
              Cancel
            </CoopButton>
            <CoopButton icon={<CheckCircleFilled />} onClick={goToPayment}>
              Continue to Payment
            </CoopButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateOrderPage;
