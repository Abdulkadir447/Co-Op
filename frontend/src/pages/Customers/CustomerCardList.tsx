import React from 'react';
import { BuildOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import CustomerAvatar from '../../components/ui/CustomerAvatar';
import type { CustomerStats } from './useCustomerStats';
import type { Customer } from './useCustomers';
import { formatCurrency } from '../Dashboard/kpiConfig';

export interface CustomerCardListProps {
  customers: Customer[];
  stats: Record<number, CustomerStats>;
  statsLoading: boolean;
}

/**
 * Mobile customer list (Stitch coop_customers_mobile): card per customer —
 * avatar + name, company line, hairline, "Total Spent" + amount. Tapping a
 * card opens the Customer Profile.
 */
const CustomerCardList: React.FC<CustomerCardListProps> = ({ customers, stats, statsLoading }) => {
  const { colors } = useCoopTheme();
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {customers.map((c) => {
        const s = stats[c.id];
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => navigate(`/customers/${c.id}`)}
            style={{
              textAlign: 'left',
              background: colors.surfaceContainerLowest,
              border: `1px solid ${colors.borderSubtle}`,
              borderRadius: radius.lg,
              padding: 16,
              cursor: 'pointer',
              transition: 'border-color 150ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = colors.outlineVariant)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = colors.borderSubtle)}
          >
            {/* Avatar + name · company */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CustomerAvatar name={c.full_name} size={44} />
              <div style={{ minWidth: 0 }}>
                <div style={{ ...type.titleMd, color: colors.onSurface, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.full_name}
                </div>
                <div
                  style={{
                    ...type.bodyCompact,
                    fontSize: 13,
                    color: colors.onSurfaceVariant,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  <BuildOutlined style={{ color: colors.outline, fontSize: 12 }} />
                  {c.company ?? '—'}
                </div>
              </div>
            </div>

            {/* Hairline + total spent */}
            <div style={{ borderTop: `1px solid ${colors.borderSubtle}`, marginTop: 12, paddingTop: 12 }}>
              <div style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.outline }}>Total Spent</div>
              <div style={{ ...type.titleMd, fontSize: 18, color: colors.onSurface, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {statsLoading ? '…' : formatCurrency(s?.total ?? 0)}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default CustomerCardList;
