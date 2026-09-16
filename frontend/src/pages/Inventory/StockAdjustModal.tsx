/**
 * Adjust Stock dialog (Stitch coop_adjust_stock_workflow).
 *
 * UI refactor only — same endpoint (POST /products/{id}/adjust), same
 * server-side validation (409 when the result would go negative).
 *
 * Layout per the design:
 *   PRODUCT   read-only tile (name + SKU of the row's product)
 *   TYPE      [ + In | − Out ] segmented
 *   QUANTITY  stepper
 *   REASON    select (purchase / sale / damaged / returned / correction)
 *   NOTE      optional free text
 *   footer    Cancel · Confirm Adjustment
 * The live "current → projected" preview is kept — it is real data.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Input, InputNumber, Segmented } from 'antd';
import { MinusOutlined, PlusOutlined, ShoppingOutlined } from '@ant-design/icons';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { ADJUST_REASONS, AdjustInput, InventoryProduct } from './useInventory';
import CoopModal from '../../components/ui/CoopModal';
import CoopSelect from '../../components/ui/CoopSelect';

export interface StockAdjustModalProps {
  open: boolean;
  product: InventoryProduct | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: AdjustInput) => Promise<void>;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 7,
  fontSize: 12,
  lineHeight: '16px',
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

const StockAdjustModal: React.FC<StockAdjustModalProps> = ({
  open,
  product,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const { colors } = useCoopTheme();
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<AdjustInput['reason']>('purchase');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode('in');
    setQuantity(1);
    setReason('purchase');
    setNote('');
    setProblem(null);
  }, [open, product?.id]);

  const change = mode === 'in' ? quantity : -quantity;
  const projected = useMemo(
    () => (product ? product.current_stock + change : 0),
    [product, change],
  );
  const wouldGoNegative = projected < 0;

  const handleOk = async () => {
    if (!product) return;
    if (!quantity || quantity < 1) {
      setProblem('Enter a quantity of at least 1.');
      return;
    }
    if (wouldGoNegative) {
      setProblem(`Cannot remove ${quantity}: only ${product.current_stock} in stock.`);
      return;
    }
    setProblem(null);
    await onSubmit({ change, reason, ...(note.trim() ? { note: note.trim() } : {}) });
  };

  return (
    <CoopModal
      title="Adjust Stock"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="Confirm Adjustment"
      cancelText="Cancel"
      confirmLoading={submitting}
      okButtonProps={{ disabled: !product || wouldGoNegative }}
      destroyOnHidden
      width={520}
    >
      {product && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
          {/* PRODUCT — read-only identity of the row's product */}
          <div>
            <span style={labelStyle}>Product</span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 46,
                padding: '0 14px',
                borderRadius: radius.lg,
                border: `1px solid ${colors.outlineVariant}`,
                background: colors.surfaceContainerLow,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: radius.md,
                  background: colors.surfaceContainer,
                  color: colors.outline,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                <ShoppingOutlined />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: colors.onSurface, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {product.name}
                </span>
                <span style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}>
                  SKU: {product.sku} · {product.current_stock} in stock · reorder at {product.reorder_level}
                </span>
              </span>
            </div>
          </div>

          {/* TYPE + QUANTITY */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '0 1 170px' }}>
              <span style={labelStyle}>Type</span>
              <Segmented
                block
                value={mode}
                onChange={(v) => setMode(v as 'in' | 'out')}
                options={[
                  { label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PlusOutlined /> In</span>, value: 'in' },
                  { label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MinusOutlined /> Out</span>, value: 'out' },
                ]}
              />
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <span style={labelStyle}>Quantity</span>
              <InputNumber
                min={1}
                precision={0}
                value={quantity}
                onChange={(v) => setQuantity(v ?? 1)}
                style={{ width: '100%' }}
                aria-label="Quantity"
              />
            </div>
          </div>

          {/* REASON */}
          <div>
            <span style={labelStyle}>Reason</span>
            <CoopSelect
              value={reason}
              onChange={setReason}
              style={{ width: '100%' }}
              options={ADJUST_REASONS}
              aria-label="Adjustment reason"
            />
          </div>

          {/* NOTE */}
          <div>
            <span style={labelStyle}>Note (optional)</span>
            <Input.TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Add any relevant details…"
              aria-label="Note (optional)"
            />
          </div>

          {/* Live projected result (real data) */}
          <Alert
            type={wouldGoNegative ? 'error' : 'info'}
            showIcon
            message={
              wouldGoNegative
                ? 'This adjustment would make stock negative.'
                : `Stock will change from ${product.current_stock} to ${projected}.`
            }
          />

          {problem && <Alert type="warning" showIcon message={problem} />}
        </div>
      )}
    </CoopModal>
  );
};

export default StockAdjustModal;
