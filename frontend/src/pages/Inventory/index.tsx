/**
 * Inventory module screen (Stitch coop_products_catalog_refactored table
 * pattern + coop_adjust_stock_workflow). UI refactor only — same
 * endpoints, same business rules:
 *   - KPI stat row (products / value / low / out)
 *   - catalog table: SKU · Product · Category · Prices · Stock · Status ·
 *     Inventory Value · Adjust Stock
 *   - stock filter tabs (backend `stock` param) + search
 *   - expandable stock history (immutable movement ledger, UXDS 11.12)
 */
import React, { useEffect, useState } from 'react';
import { Segmented, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DollarOutlined, InboxOutlined, ShoppingOutlined, TagsOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { radius, spacing, tint, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { STOCK_STATUS_BADGE, STOCK_STATUS_LABEL, stockStatusOf } from '../../lib/stock';
import { useApiClient } from '../../services/api/client';
import { formatCurrency } from '../Dashboard/kpiConfig';
import StockAdjustModal from './StockAdjustModal';
import {
  AdjustInput,
  InventoryProduct,
  MOVEMENT_LABELS,
  StockStatus,
  unitValueOf,
  useInventory,
} from './useInventory';
import {
  CoopBadge,
  CoopButton,
  CoopCard,
  CoopErrorState,
  CoopInput,
  CoopLoading,
  CoopTable,
} from '../../components/ui';
import PageHeader from '../../components/layout/PageHeader';

/** One stat card for the KPI row (UXDS 11.5, Stitch dashboard pattern). */
const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  sub?: string;
}> = ({ icon, label, value, accent, sub }) => {
  const { colors } = useCoopTheme();
  return (
  <div
    style={{
      background: colors.surfaceContainerLowest,
      border: `1px solid ${colors.borderSubtle}`,
      borderRadius: radius.lg,
      padding: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      height: '100%',
    }}
  >
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: radius.md,
        background: tint(accent, 0.12),
        color: accent,
        fontSize: 16,
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
    <div style={{ minWidth: 0 }}>
      <div style={{ ...type.bodyCompact, fontSize: 13, color: colors.onSurfaceVariant }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          lineHeight: '28px',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: colors.onSurface,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}>{sub}</div>
      )}
    </div>
  </div>
  );
};

/** Movement history — loaded lazily when a row is expanded (UXDS 11.12). */
const MovementHistory: React.FC<{ productId: number }> = ({ productId }) => {
  const { colors } = useCoopTheme();
  const api = useApiClient();
  const [movements, setMovements] = useState<import('./useInventory').StockMovement[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/products/${productId}/movements`, { params: { limit: 20 } })
      .then((r) => !cancelled && setMovements(r.data.items))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [productId, api]);

  if (failed)
    return (
      <div style={{ ...type.bodyCompact, color: colors.error }}>Unable to load stock history.</div>
    );
  if (!movements) return <CoopLoading height={48} />;
  if (movements.length === 0)
    return <div style={{ ...type.bodyCompact, color: colors.outline }}>No stock movements recorded yet.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {movements.map((m) => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              fontWeight: 700,
              color: m.change >= 0 ? colors.success : colors.error,
              fontVariantNumeric: 'tabular-nums',
              minWidth: 44,
            }}
          >
            {m.change > 0 ? `+${m.change}` : m.change}
          </span>
          <CoopBadge variant="neutral">{MOVEMENT_LABELS[m.reason] ?? m.reason}</CoopBadge>
          {m.order_id != null && (
            <span style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}>
              Order #ORD-{String(m.order_id).padStart(4, '0')}
            </span>
          )}
          {m.note && (
            <span style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}>“{m.note}”</span>
          )}
          <span style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline }}>
            {dayjs(m.created_at).format('MMM D, HH:mm')}
          </span>
        </div>
      ))}
    </div>
  );
};

const InventoryPage: React.FC = () => {
  const { colors, isDark } = useCoopTheme();
  const [messageApi, messageCtx] = message.useMessage();
  const [adjusting, setAdjusting] = useState<InventoryProduct | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    summary,
    items,
    total,
    page,
    pageSize,
    search,
    setSearch,
    stockFilter,
    setStockFilter,
    loading,
    error,
    reload,
    goToPage,
    adjustStock,
  } = useInventory();

  const handleAdjust = async (input: AdjustInput) => {
    if (!adjusting) return;
    setSubmitting(true);
    try {
      await adjustStock(adjusting.id, input);
      messageApi.success('Stock adjusted successfully — movement history updated.');
      setAdjusting(null);
      reload();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : 'Adjustment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<InventoryProduct> = [
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 120,
      render: (v: string) => (
        <span style={{ color: colors.primary, fontWeight: 600, fontSize: 13 }}>{v}</span>
      ),
    },
    {
      title: 'Product',
      dataIndex: 'name',
      key: 'name',
      render: (_: string, p) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 34,
              height: 34,
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
            <ShoppingOutlined />
          </span>
          <span style={{ fontWeight: 600, color: colors.onSurface }}>{p.name}</span>
        </div>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string | null) =>
        category ? (
          <span style={{ color: colors.onSurfaceVariant }}>{category}</span>
        ) : (
          <span style={{ color: colors.outline }}>—</span>
        ),
    },
    {
      title: 'Unit Price',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 110,
      align: 'right',
      render: (v: number) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: colors.onSurface }}>{formatCurrency(v)}</span>
      ),
    },
    {
      title: 'Cost Price',
      dataIndex: 'cost_price',
      key: 'cost_price',
      width: 110,
      align: 'right',
      render: (v: number | null) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: colors.onSurfaceVariant }}>
          {v != null ? formatCurrency(v) : '—'}
        </span>
      ),
    },
    {
      title: 'Current Stock',
      key: 'stock',
      width: 120,
      render: (_: unknown, p) => {
        const status = stockStatusOf(p.current_stock, p.reorder_level);
        const countColor =
          status === 'out' ? colors.error : status === 'low' ? colors.warning : isDark ? colors.primaryContainer : colors.primary;
        return (
          <div>
            <div style={{ fontWeight: 700, color: countColor, fontVariantNumeric: 'tabular-nums' }}>
              {p.current_stock}
            </div>
            <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline, marginTop: 2 }}>
              Reorder: {p.reorder_level}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 130,
      render: (_: unknown, p) => {
        const status = stockStatusOf(p.current_stock, p.reorder_level);
        return <CoopBadge variant={STOCK_STATUS_BADGE[status]}>{STOCK_STATUS_LABEL[status]}</CoopBadge>;
      },
    },
    {
      title: 'Inventory Value',
      key: 'value',
      width: 130,
      align: 'right',
      render: (_: unknown, p) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: colors.onSurface }}>
          {formatCurrency(Math.round(p.current_stock * unitValueOf(p) * 100) / 100)}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      align: 'right',
      render: (_: unknown, p) => (
        <CoopButton size="sm" variant="secondary" onClick={() => setAdjusting(p)}>
          Adjust Stock
        </CoopButton>
      ),
    },
  ];

  const showEmptyCta = !loading && !error && total === 0 && !search && stockFilter === 'all';

  return (
    <div>
      {messageCtx}

      <PageHeader
        title="Inventory"
        subtitle="Stock levels, valuation and movement history."
      />

      {/* KPI row (UXDS 11.5) */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <StatCard icon={<InboxOutlined />} label="Products" value={String(summary.products_count)} accent={colors.primary} />
          <StatCard
            icon={<DollarOutlined />}
            label="Inventory Value"
            value={formatCurrency(summary.inventory_value)}
            accent={colors.primary}
            sub="at cost price"
          />
          <StatCard
            icon={<WarningOutlined />}
            label="Low Stock"
            value={String(summary.low_stock_count)}
            accent={colors.warning}
            sub={`${summary.out_of_stock_count} out of stock`}
          />
          <StatCard icon={<TagsOutlined />} label="Categories" value={String(summary.categories_count)} accent={colors.primary} />
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16 }}>
          <CoopErrorState
            title={error.isAuthError ? 'Authentication required' : 'Unable to load inventory'}
            detail={error.message}
            onRetry={reload}
          />
        </div>
      )}

      <CoopCard flush bodyPadding={0}>
        {/* Toolbar: stock tabs + search (catalog pattern) */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            borderBottom: `1px solid ${colors.borderSubtle}`,
          }}
        >
          <Segmented
            size="small"
            value={stockFilter}
            onChange={(v) => setStockFilter(v as StockStatus | 'all')}
            options={[
              { label: 'All Products', value: 'all' },
              { label: 'In Stock', value: 'in' },
              { label: 'Low Stock', value: 'low' },
              { label: 'Out of Stock', value: 'out' },
            ]}
          />
          <div style={{ width: '100%', maxWidth: 360, flex: 1 }}>
            <CoopInput
              search
              placeholder="Search by name, SKU or category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search inventory"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <CoopTable<InventoryProduct>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          scroll={{ x: 1040 }}
          expandable={{
            expandedRowRender: (p) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: `${spacing.sm + 4}px 16px` }}>
                <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
                  {p.description || 'No description provided.'}
                </div>
                <div style={{ ...type.labelCaps, color: colors.onSurfaceVariant }}>Stock history</div>
                <MovementHistory productId={p.id} />
              </div>
            ),
          }}
          empty={
            showEmptyCta
              ? {
                  title: 'No products yet',
                  description: 'Add products in the Products module to start tracking inventory.',
                  compact: true,
                }
              : {
                  title: 'No results found',
                  description: 'No products match your filters.',
                  compact: true,
                }
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

      <StockAdjustModal
        open={adjusting !== null}
        product={adjusting}
        submitting={submitting}
        onCancel={() => setAdjusting(null)}
        onSubmit={handleAdjust}
      />
    </div>
  );
};

export default InventoryPage;
