import { useState } from 'react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { CheckCircleFilled, CloseCircleFilled, FileTextOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import type { DraftInvoice, DraftOrder } from '../../ai/types';
import { formatCurrency } from '../../pages/Dashboard/kpiConfig';
import CoopButton from '../ui/CoopButton';
import InvoiceDocument from './InvoiceDocument';

const AI_ORDER_DRAFT_KEY = 'coop:ai-order-draft';

/**
 * Draft review card — the action boundary made visible.
 *
 * A draft is never executed by the assistant. The user reviews the lines
 * and explicitly confirms:
 *   - Invoice draft → generates the printable invoice document (no data
 *     mutation; the invoice store lands with the billing stage)
 *   - Order draft   → hands off to the real Create Order flow, where the
 *     user reviews and confirms; the existing POST /orders then executes
 */
export function DraftCard({
  invoice,
  order,
}: {
  invoice?: DraftInvoice | null;
  order?: DraftOrder | null;
}) {
  const { colors } = useCoopTheme();
  const navigate = useNavigate();
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const d = invoice ?? order;
  const isInvoice = Boolean(invoice);
  if (!d || d.lines.length === 0) return null;

  const openInCreateOrder = () => {
    try {
      localStorage.setItem(
        AI_ORDER_DRAFT_KEY,
        JSON.stringify({
          customer: d.customer,
          lines: d.lines.map((l) => ({
            product_id: l.product_id,
            name: l.name,
            sku: l.sku,
            quantity: l.quantity,
            unit_price: l.unit_price,
          })),
        }),
      );
    } catch {
      /* non-fatal — the flow works without the handoff */
    }
    navigate('/orders/new');
  };

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: radius.lg,
        border: `1px solid ${colors.outlineVariant}`,
        background: colors.surfaceContainerLow,
        marginTop: 12,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${colors.primaryContainer}, ${colors.secondaryContainer})`,
        }}
      />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {isInvoice ? (
            <FileTextOutlined style={{ color: colors.primary }} />
          ) : (
            <ShoppingCartOutlined style={{ color: colors.primary }} />
          )}
          <span style={{ ...type.titleMd, fontSize: 14.5, color: colors.onSurface }}>
            {isInvoice ? 'Invoice draft' : 'Order draft'} — {d.customer?.full_name ?? 'Customer'}
          </span>
        </div>

        {d.lines.map((l, i) => (
          <div
            key={`${l.product_id}-${i}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: '8px 0',
              borderTop: i > 0 ? `1px solid ${colors.borderSubtle}` : 'none',
            }}
          >
            <span style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, minWidth: 0 }}>
              {l.quantity} × {l.name}
              {l.sku ? ` (${l.sku})` : ''}
            </span>
            <span style={{ ...type.bodyCompact, fontWeight: 600, color: colors.onSurface, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {formatCurrency(l.quantity * l.unit_price)}
            </span>
          </div>
        ))}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: `1px solid ${colors.outlineVariant}`,
            marginTop: 8,
            paddingTop: 12,
          }}
        >
          <span style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>Total</span>
          <span style={{ ...type.sectionHeading, fontSize: 17, color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(d.total)}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
          <CoopButton size="sm" variant="secondary" icon={<CloseCircleFilled />} onClick={() => message.info('Draft discarded — nothing was created.')}>
            Discard
          </CoopButton>
          {isInvoice ? (
            <CoopButton size="sm" icon={<FileTextOutlined />} onClick={() => setInvoiceOpen(true)}>
              Review & Generate Invoice
            </CoopButton>
          ) : (
            <CoopButton size="sm" icon={<ShoppingCartOutlined />} onClick={openInCreateOrder}>
              Open in Create Order
            </CoopButton>
          )}
        </div>
      </div>

      {invoice && invoiceOpen && <InvoiceDocument draft={invoice} onClose={() => setInvoiceOpen(false)} />}
    </div>
  );
}

/**
 * Confirmation strip shown after an action executed.
 */
export function ResultStrip({ ok, text }: { ok: boolean; text: string }) {
  const { colors } = useCoopTheme();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
        padding: '10px 12px',
        borderRadius: radius.md,
        background: ok ? `rgba(46, 158, 91, 0.1)` : `rgba(186, 26, 26, 0.08)`,
        border: `1px solid ${ok ? 'rgba(46, 158, 91, 0.3)' : 'rgba(186, 26, 26, 0.25)'}`,
        ...type.bodyCompact,
        color: ok ? colors.successText : colors.errorText,
      }}
    >
      {ok ? <CheckCircleFilled /> : <CloseCircleFilled />}
      {text}
    </div>
  );
}
