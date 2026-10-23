/**
 * Products module screen (Stitch coop_products_catalog_refactored +
 * coop_products_mobile_refactored + coop_product_management_states).
 *
 * Presentation refactor only — same endpoints, same business rules:
 *   desktop : catalog table (SKU · Product · Category · Prices · Stock ·
 *             Status) with the All/Low/Out tabs (backend `stock` filter)
 *   mobile  : card list + gradient FAB (coop_products_mobile)
 *   create  : "Create New Product" modal (Pricing Details group, AI
 *             description placeholder)
 *   edit    : "Update Product" modal with the Delete Product action
 *   delete  : destructive confirmation card (red top border + details box)
 */
import React, { useState } from 'react';
import { Pagination, Segmented, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ShoppingOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { STOCK_STATUS_BADGE, STOCK_STATUS_LABEL, stockStatusOf } from '../../lib/stock';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatCurrency } from '../Dashboard/kpiConfig';
import ProductFormModal from './ProductFormModal';
import { Product, ProductFormValues, ProductStockFilter, useProducts } from './useProducts';
import {
  CoopBadge,
  CoopButton,
  CoopCard,
  CoopErrorState,
  CoopInput,
  CoopModal,
  CoopTable,
} from '../../components/ui';
import ProductCardList from '../../components/ui/ProductCardList';
import PageHeader from '../../components/layout/PageHeader';

const ProductsPage: React.FC = () => {
  const { colors, isDark } = useCoopTheme();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [messageApi, messageCtx] = message.useMessage();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const {
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
    createProduct,
    updateProduct,
    deleteProduct,
  } = useProducts();

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setModalOpen(true);
  };

  const handleSubmit = async (values: ProductFormValues) => {
    try {
      if (editing) {
        // SKU and stock are immutable on update (Task 12 / M6): stock moves
        // only via Inventory -> Adjust Stock.
        const { sku: _sku, current_stock: _stock, ...rest } = values;
        await updateProduct(editing.id, rest);
        messageApi.success('Product updated');
      } else {
        await createProduct(values);
        messageApi.success('Product created');
      }
      setModalOpen(false);
      reload();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : 'Request failed');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteProduct(deleting.id);
      messageApi.success('Product deleted');
      setDeleting(null);
      reload();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns: ColumnsType<Product> = [
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
      width: 130,
      render: (category: string | null) =>
        category ? (
          <span style={{ color: colors.onSurfaceVariant }}>{category}</span>
        ) : (
          <span style={{ color: colors.outline }}>—</span>
        ),
    },
    {
      title: 'Selling Price',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 120,
      align: 'right',
      render: (v: number) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: colors.onSurface }}>
          {formatCurrency(v)}
        </span>
      ),
    },
    {
      title: 'Cost Price',
      dataIndex: 'cost_price',
      key: 'cost_price',
      width: 120,
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
      width: 130,
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
      title: '',
      key: 'actions',
      width: 110,
      align: 'right',
      render: (_: unknown, p) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <CoopButton size="sm" variant="secondary" icon={<EditOutlined />} onClick={() => openEdit(p)}>
            Edit
          </CoopButton>
          <CoopButton
            size="sm"
            variant="ghost"
            danger
            icon={<DeleteOutlined style={{ color: colors.error }} />}
            onClick={() => setDeleting(p)}
            aria-label={`Delete ${p.name}`}
            style={{ color: colors.error }}
          />
        </div>
      ),
    },
  ];

  const showEmptyCta = !loading && !error && total === 0 && !search;
  const priceLabel = (p: Product) => formatCurrency(p.unit_price);

  return (
    <div>
      {messageCtx}

      <PageHeader
        title="Products"
        subtitle="Manage your catalog, stock levels and pricing."
        actions={
          isMobile ? undefined : (
            <CoopButton icon={<PlusOutlined />} onClick={openCreate}>
              Add product
            </CoopButton>
          )
        }
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <CoopErrorState
            title={error.isAuthError ? 'Authentication required' : 'Unable to load products'}
            detail={error.message}
            onRetry={reload}
          />
        </div>
      )}

      <CoopCard flush bodyPadding={0}>
        {/* Toolbar: stock tabs + search (Stitch catalog pattern) */}
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
            onChange={(v) => setStockFilter(v as ProductStockFilter)}
            options={[
              { label: 'All Products', value: 'all' },
              { label: 'Low Stock', value: 'low' },
              { label: 'Out of Stock', value: 'out' },
            ]}
          />
          <div style={{ width: '100%', maxWidth: 380, flex: 1 }}>
            <CoopInput
              search
              placeholder="Search for products by name, SKU or category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search products"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Desktop: table · Mobile: card list */}
        {!isMobile && (
          <CoopTable<Product>
            rowKey="id"
            columns={columns}
            dataSource={items}
            loading={loading}
            scroll={{ x: 860 }}
            empty={
              showEmptyCta
                ? {
                    title: 'No products yet',
                    description: 'Add your first product to start building your catalog.',
                    action: (
                      <CoopButton size="sm" icon={<PlusOutlined />} onClick={openCreate}>
                        Add product
                      </CoopButton>
                    ),
                    compact: true,
                  }
                : {
                    title: stockFilter === 'all' ? 'No results found' : `No ${stockFilter === 'low' ? 'low-stock' : 'out-of-stock'} products`,
                    description: 'No products match your search or filter.',
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
        )}

        {isMobile && (
          <div style={{ padding: 16 }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: 120,
                      borderRadius: radius.lg,
                      background: colors.surfaceContainer,
                    }}
                  />
                ))}
              </div>
            ) : items.length > 0 ? (
              <ProductCardList
                items={items.map((p) => ({
                  id: p.id,
                  name: p.name,
                  sku: p.sku,
                  unit_price: p.unit_price,
                  current_stock: p.current_stock,
                  reorder_level: p.reorder_level,
                  priceLabel: priceLabel(p),
                }))}
                onEdit={(id) => {
                  const p = items.find((x) => x.id === id);
                  if (p) openEdit(p);
                }}
              />
            ) : (
              <div
                style={{
                  border: `1px solid ${colors.borderSubtle}`,
                  borderRadius: radius.lg,
                  padding: '40px 16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ ...type.titleMd, color: colors.onSurface, marginBottom: 6 }}>
                  {showEmptyCta ? 'No products yet' : 'No results found'}
                </div>
                <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginBottom: showEmptyCta ? 16 : 0 }}>
                  {showEmptyCta
                    ? 'Add your first product to start building your catalog.'
                    : 'No products match your search or filter.'}
                </div>
                {showEmptyCta && (
                  <CoopButton size="sm" icon={<PlusOutlined />} onClick={openCreate}>
                    Add product
                  </CoopButton>
                )}
              </div>
            )}
            {items.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <Pagination
                  current={page}
                  pageSize={pageSize}
                  total={total}
                  size="small"
                  showSizeChanger={false}
                  onChange={goToPage}
                />
              </div>
            )}
          </div>
        )}
      </CoopCard>

      {/* Mobile FAB (coop_products_mobile) */}
      {isMobile && (
        <button
          type="button"
          onClick={openCreate}
          aria-label="Add product"
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
      )}

      <ProductFormModal
        open={modalOpen}
        product={editing}
        onCancel={() => setModalOpen(false)}
        onSubmit={handleSubmit}
        onDelete={editing ? () => {
          setModalOpen(false);
          setDeleting(editing);
        } : undefined}
      />

      {/* Destructive delete confirmation (Stitch management states) */}
      <CoopModal
        tone="danger"
        title={`Delete ${deleting?.name ?? 'product'}?`}
        open={deleting !== null}
        onCancel={() => setDeleting(null)}
        onOk={confirmDelete}
        confirmLoading={deleteBusy}
        cancelText="Keep Product"
        okText="Delete Product"
        danger
        width={460}
      >
        {deleting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
            <div
              aria-hidden
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                background: `rgba(186, 26, 26, 0.1)`,
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
              Are you sure you want to delete this product? This is permanent and cannot be
              undone. Historical orders are retained for reporting.
            </p>
            <div
              style={{
                borderRadius: radius.lg,
                border: `1px solid ${colors.borderSubtle}`,
                background: colors.surfaceContainerLow,
                padding: '12px 14px',
              }}
            >
              <div style={{ ...type.labelCaps, color: colors.outline, marginBottom: 4 }}>
                Product Details
              </div>
              <div style={{ ...type.bodyCompact, fontWeight: 600, color: colors.onSurface }}>
                {deleting.name} ({deleting.sku})
              </div>
            </div>
          </div>
        )}
      </CoopModal>
    </div>
  );
};

export default ProductsPage;
