import React, { useEffect, useState } from 'react';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { DraftInvoice } from '../../ai/types';
import { formatCurrency } from '../../pages/Dashboard/kpiConfig';
import { useApiClient } from '../../services/api/client';
import CoopButton from '../ui/CoopButton';

/**
 * Printable invoice document generated from a confirmed AI draft.
 *
 * Execution boundary: the assistant only DRAFTS. This document exists after
 * the user explicitly confirms — and it is a document (print / save PDF),
 * not a database mutation. Invoice storage/billing arrives with the billing
 * stage; until then nothing is silently written.
 */
const InvoiceDocument: React.FC<{ draft: DraftInvoice; onClose: () => void }> = ({ draft, onClose }) => {
  const api = useApiClient();
  const [business, setBusiness] = useState<{ name: string; currency: string; address: string | null; phone: string | null } | null>(null);

  useEffect(() => {
    api
      .get<{ name: string; currency: string; address: string | null; phone: string | null }>('/business/settings')
      .then((r) => setBusiness(r.data))
      .catch(() => undefined);
  }, [api]);

  const cur = business?.currency;
  const date = dayjs().format('MMM D, YYYY');

  return (
    <div
      className="coop-invoice-backdrop"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(27,27,35,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        className="coop-invoice-print"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          color: '#1b1b23',
          borderRadius: 16,
          width: '100%',
          maxWidth: 680,
          maxHeight: '88vh',
          overflowY: 'auto',
          padding: 40,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: '#4143d5' }}>
              {business?.name ?? 'Co-op Business'}
            </div>
            {business?.address && <div style={{ fontSize: 13, color: '#464555', marginTop: 6, whiteSpace: 'pre-line' }}>{business.address}</div>}
            {business?.phone && <div style={{ fontSize: 13, color: '#464555', marginTop: 2 }}>{business.phone}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Invoice</div>
            <div style={{ fontSize: 13, color: '#767586', marginTop: 8 }}>{date}</div>
          </div>
        </div>

        <div style={{ marginBottom: 28, padding: '14px 16px', borderRadius: 12, background: '#f5f2fe' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#767586', marginBottom: 6 }}>
            Bill To
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{draft.customer?.full_name ?? 'Customer'}</div>
          {draft.customer?.email && <div style={{ fontSize: 13, color: '#464555', marginTop: 2 }}>{draft.customer.email}</div>}
        </div>

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
            {draft.lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e9e6f3' }}>
                <td style={{ padding: '10px 12px', fontSize: 13.5, fontWeight: 500 }}>
                  {l.name}
                  {l.sku ? <span style={{ color: '#767586', fontSize: 12 }}> ({l.sku})</span> : null}
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.quantity}</td>
                <td style={{ padding: '10px 12px', fontSize: 13.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(l.unit_price, cur)}</td>
                <td style={{ padding: '10px 12px', fontSize: 13.5, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(l.quantity * l.unit_price, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
          <div style={{ display: 'flex', gap: 40, alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, color: '#464555' }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(draft.total, cur)}</span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e9e6f3', paddingTop: 16, textAlign: 'center', fontSize: 12, color: '#767586' }}>
          Generated with Zeno — reviewed and confirmed by you. Thank you for your business.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }} className="coop-invoice-actions">
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

export default InvoiceDocument;
