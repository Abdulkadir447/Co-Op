import React from 'react';
import { PlusOutlined, ShoppingCartOutlined, AppstoreAddOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { radius, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  path: string;
}

const ACTIONS: QuickAction[] = [
  { label: 'Create Order', icon: <ShoppingCartOutlined />, path: '/orders' },
  { label: 'Adjust Stock', icon: <PlusOutlined />, path: '/inventory' },
  { label: 'Add Product', icon: <AppstoreAddOutlined />, path: '/products' },
];

/**
 * Quick Actions card (Stitch dashboard): full-width gradient buttons that
 * route into the matching module. Pure navigation — no new business logic;
 * the target modules already own their create/adjust flows.
 */
const QuickActionsCard: React.FC = () => {
  const { colors } = useCoopTheme();
  const navigate = useNavigate();

  return (
    <div
      style={{
        background: colors.surfaceContainerLowest,
        border: `1px solid ${colors.borderSubtle}`,
        borderRadius: radius.lg,
        padding: 20,
      }}
    >
      <div style={{ ...type.titleMd, color: colors.onSurface, marginBottom: 14 }}>Quick Actions</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ACTIONS.map((a) => (
          <button
            key={a.path}
            type="button"
            onClick={() => navigate(a.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              height: 42,
              borderRadius: radius.lg,
              border: 'none',
              background: `linear-gradient(135deg, ${colors.primaryContainer} 0%, ${colors.secondaryContainer} 100%)`,
              color: colors.onPrimary,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'opacity 150ms, transform 150ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.92')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActionsCard;
