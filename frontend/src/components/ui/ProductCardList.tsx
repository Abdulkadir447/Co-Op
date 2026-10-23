import React from 'react';
import { EditOutlined, ShoppingOutlined } from '@ant-design/icons';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { STOCK_STATUS_BADGE, STOCK_STATUS_LABEL, stockStatusOf } from '../../lib/stock';
import CoopBadge from './CoopBadge';

export interface ProductCardItem {
  id: number;
  name: string;
  sku: string;
  unit_price: number;
  current_stock: number;
  reorder_level: number;
  priceLabel: string;
}

export interface ProductCardListProps {
  items: ProductCardItem[];
  onEdit: (id: number) => void;
}

/**
 * Mobile product list (Stitch coop_products_mobile_refactored): card per
 * product — name + status pill (with count), SKU line, hairline, price +
 * Edit. Out-of-stock cards carry the gradient top border ("needs
 * attention" marker from the design).
 */
const ProductCardList: React.FC<ProductCardListProps> = ({ items, onEdit }) => {
  const { colors } = useCoopTheme();

  if (items.length === 0) {
    return null; // the shared empty state (CoopTable locale) renders instead
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((p) => {
        const status = stockStatusOf(p.current_stock, p.reorder_level);
        const out = status === 'out';
        return (
          <div
            key={p.id}
            style={{
              position: 'relative',
              overflow: 'hidden',
              background: colors.surfaceContainerLowest,
              border: `1px solid ${out ? colors.outlineVariant : colors.borderSubtle}`,
              borderRadius: radius.lg,
              padding: 16,
            }}
          >
            {out && (
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
            )}
            {/* Name + status pill */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div
                style={{
                  ...type.titleMd,
                  fontSize: 17,
                  color: colors.onSurface,
                  minWidth: 0,
                }}
              >
                {p.name}
              </div>
              <CoopBadge variant={STOCK_STATUS_BADGE[status]} icon={<ShoppingOutlined style={{ fontSize: 12 }} />}>
                {STOCK_STATUS_LABEL[status]} ({p.current_stock})
              </CoopBadge>
            </div>

            {/* SKU */}
            <div style={{ ...type.bodyCompact, fontSize: 13, color: colors.outline, marginTop: 6 }}>
              SKU: {p.sku}
            </div>

            {/* Hairline + price / edit */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 12,
                paddingTop: 12,
                borderTop: `1px solid ${colors.borderSubtle}`,
              }}
            >
              <span
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: colors.primary,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {p.priceLabel}
              </span>
              <button
                type="button"
                onClick={() => onEdit(p.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  border: 'none',
                  background: 'transparent',
                  color: colors.primary,
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: radius.md,
                }}
              >
                <EditOutlined />
                Edit
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProductCardList;
