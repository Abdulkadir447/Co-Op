import React from 'react';
import { TrophyOutlined } from '@ant-design/icons';
import { radius, spacing, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { formatCurrency } from '../../pages/Dashboard/kpiConfig';
import type { TopProduct } from '../../pages/Dashboard/useDashboardData';
import { CoopEmptyState } from '../ui';

/**
 * Top Products card (Stitch dashboard): best sellers by units sold with the
 * revenue each generated. Real data from /dashboard/top-products — no
 * ranking is invented when there are no sales yet.
 */
const TopProductsCard: React.FC<{ products: TopProduct[] }> = ({ products }) => {
  const { colors } = useCoopTheme();

  return (
    <div
      style={{
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radius.lg,
        padding: 20,
      }}
    >
      <div style={{ ...type.titleMd, color: colors.onSurface, marginBottom: 14 }}>Top Products</div>

      {products.length === 0 ? (
        <CoopEmptyState
          icon={<TrophyOutlined />}
          title="No sales yet"
          description="Orders you create will rank your best sellers here."
          compact
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {products.map((p, i) => (
            <div
              key={p.product_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.sm,
                padding: '11px 0',
                borderTop: i > 0 ? `1px solid ${colors.borderSubtle}` : 'none',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    ...type.bodyCompact,
                    fontWeight: 600,
                    color: colors.onSurface,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.product_name}
                </div>
                <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 }}>
                  {formatCurrency(p.total_revenue)}
                </div>
              </div>
              <div style={{ ...type.bodyCompact, fontWeight: 700, color: colors.onSurface, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {p.total_quantity} sold
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TopProductsCard;
