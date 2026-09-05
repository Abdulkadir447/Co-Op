/**
 * Customers module screen (Stitch coop_customer_catalog_refactored +
 * coop_customers_mobile). UI refactor only — same endpoints, same data
 * rules (tenant-scoped email uniqueness, soft delete, order history
 * retained).
 *
 *   desktop : catalog table — Name (avatar + ID) · Company · Contact ·
 *             Status (derived) · Orders · Total Spent (derived, lazy)
 *   mobile  : search + AI insight card + customer cards + FAB
 *   rows    → Customer Profile (/customers/:id)
 *   create  : "Create New Customer" modal
 *   delete  : destructive workflow confirmation (profile + shared modal)
 */
import React, { useState } from 'react';
import { Pagination, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatCurrency } from '../Dashboard/kpiConfig';
import CustomerFormModal from './CustomerFormModal';
import CustomerCardList from './CustomerCardList';
import { Customer, CustomerFormValues, useCustomers } from './useCustomers';
import {
  customerActivity,
  useCustomerStats,
  CustomerActivity,
} from './useCustomerStats';
import {
  AiNoticeBox,
  CustomerAvatar,
  CoopButton,
  CoopCard,
  CoopErrorState,
  CoopInput,
  CoopTable,
} from '../../components/ui';
import PageHeader from '../../components/layout/PageHeader';

const ACTIVITY_META: Record<CustomerActivity, { label: string; variant: 'primary' | 'neutral'; solid?: boolean }> = {
  new: { label: 'New', variant: 'primary', solid: true },
  active: { label: 'Active', variant: 'primary' },
  inactive: { label: 'Inactive', variant: 'neutral' },
};

const CustomersPage: React.FC = () => {
  const { colors } = useCoopTheme();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const navigate = useNavigate();
  const [messageApi, messageCtx] = message.useMessage();
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    items,
    total,
    page,
    pageSize,
    search,
    setSearch,
    loading,
    error,
    reload,
    goToPage,
    createCustomer,
  } = useCustomers();

  // Derived purchase stats (Orders / Total Spent) from the existing orders
  // endpoint — lazy per page, never blocks the list itself.
  const { stats, statsLoading } = useCustomerStats(items);

  const handleSubmit = async (values: CustomerFormValues) => {
    setSubmitting(true);
    try {
      await createCustomer(values);
      messageApi.success('Customer created');
      setModalOpen(false);
      reload();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<Customer> = [
    {
      title: 'Name',
      dataIndex: 'full_name',
      key: 'full_name',
      render: (_: string, c) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CustomerAvatar name={c.full_name} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: colors.onSurface }}>{c.full_name}</div>
            <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline, marginTop: 2 }}>
              ID: #C-{String(c.id).padStart(4, '0')}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Company',
      dataIndex: 'company',
      key: 'company',
      width: 170,
      render: (company: string | null) =>
        company ? (
          <span style={{ color: colors.onSurfaceVariant }}>{company}</span>
        ) : (
          <span style={{ color: colors.outline }}>—</span>
        ),
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 240,
      render: (_: unknown, c) => (
        <div>
          <div style={{ color: colors.onSurfaceVariant }}>{c.email}</div>
          <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline, marginTop: 2 }}>
            {c.phone ?? ''}
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_: unknown, c) => {
        if (statsLoading && !stats[c.id]) return <span style={{ color: colors.outline }}>…</span>;
        const meta = ACTIVITY_META[customerActivity(c, stats[c.id])];
        return (
          <span
            style={
              meta.solid
                ? {
                    display: 'inline-block',
                    padding: '3px 12px',
                    borderRadius: radius.md,
                    background: colors.primary,
                    color: colors.onPrimary,
                    ...type.labelCaps,
                    textTransform: 'uppercase',
                  }
                : undefined
            }
          >
            {meta.solid ? (
              meta.label
            ) : (
              <ActivityPill activity={customerActivity(c, stats[c.id])} />
            )}
          </span>
        );
      },
    },
    {
      title: 'Orders',
      key: 'orders',
      width: 100,
      align: 'right',
      render: (_: unknown, c) => (
        <span style={{ color: colors.onSurface, fontVariantNumeric: 'tabular-nums' }}>
          {statsLoading && !stats[c.id] ? '…' : (stats[c.id]?.orders ?? 0)}
        </span>
      ),
    },
    {
      title: 'Total Spent',
      key: 'total',
      width: 150,
      align: 'right',
      render: (_: unknown, c) => (
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: colors.onSurface }}>
          {statsLoading && !stats[c.id] ? '…' : formatCurrency(stats[c.id]?.total ?? 0)}
        </span>
      ),
    },
  ];

  const showEmptyCta = !loading && !error && total === 0 && !search;

  return (
    <div>
      {messageCtx}

      <PageHeader
        title="Customers"
        subtitle="Manage and view your customer database."
        actions={
          isMobile ? undefined : (
            <CoopButton icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Add Customer
            </CoopButton>
          )
        }
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <CoopErrorState
            title={error.isAuthError ? 'Authentication required' : 'Unable to load customers'}
            detail={error.message}
            onRetry={reload}
          />
        </div>
      )}

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ maxWidth: 420 }}>
            <CoopInput
              search
              placeholder="Search customers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search customers"
              style={{ width: '100%' }}
            />
          </div>

          <AiNoticeBox
            compact
            title="Up next: engagement analysis"
            description="Ask Zeno and Live Insights are available now. Automatically flagging customers whose order cadence is changing — with suggested check-ins — is still on the roadmap."
          />

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 110,
                    borderRadius: radius.lg,
                    background: colors.surfaceContainer,
                  }}
                />
              ))}
            </div>
          ) : items.length > 0 ? (
            <CustomerCardList customers={items} stats={stats} statsLoading={statsLoading} />
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
                {showEmptyCta ? 'No customers yet' : 'No results found'}
              </div>
              <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
                {showEmptyCta
                  ? 'Add your first customer to start building your customer base.'
                  : 'No customers match your search.'}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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

          {/* Mobile FAB (coop_customers_mobile) */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label="Add customer"
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
          {/* Toolbar: count + search */}
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
            <span style={{ ...type.bodyCompact, color: colors.onSurfaceVariant }}>
              All Customers: <strong style={{ color: colors.onSurface }}>{loading ? '…' : total}</strong>
            </span>
            <div style={{ width: '100%', maxWidth: 380, flex: 1 }}>
              <CoopInput
                search
                placeholder="Search for customers by name, email or company"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search customers"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <CoopTable<Customer>
            rowKey="id"
            columns={columns}
            dataSource={items}
            loading={loading}
            onRow={(c) => ({
              onClick: () => navigate(`/customers/${c.id}`),
              style: { cursor: 'pointer' },
            })}
            scroll={{ x: 860 }}
            empty={
              showEmptyCta
                ? {
                    title: 'No customers yet',
                    description: 'Add your first customer to start building your customer base.',
                    action: (
                      <CoopButton size="sm" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                        Add customer
                      </CoopButton>
                    ),
                    compact: true,
                  }
                : { title: 'No results found', description: 'No customers match your search.', compact: true }
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

      <CustomerFormModal
        open={modalOpen}
        customer={null}
        submitting={submitting}
        onCancel={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
};

/** Activity pill (Active / Inactive) — New is rendered solid by the column. */
const ActivityPill: React.FC<{ activity: CustomerActivity }> = ({ activity }) => {
  const meta = ACTIVITY_META[activity];
  const { colors } = useCoopTheme();
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 12px',
        borderRadius: radius.md,
        background: meta.variant === 'primary' ? colors.primaryFixed : colors.surfaceVariant,
        color: meta.variant === 'primary' ? colors.onPrimaryFixedVariant : colors.onSurfaceVariant,
        ...type.labelCaps,
        textTransform: 'uppercase',
      }}
    >
      {meta.label}
    </span>
  );
};

export default CustomersPage;
