/**
 * Co-op navigation — single source of truth for the sidebar, routing and
 * (later) the command palette (Stitch app-shell "Navigation Tabs").
 */
import React from 'react';
import {
  BarChartOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  FileTextOutlined,
  InboxOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';

export interface NavItem {
  key: string;
  label: string;
  path: string;
  icon: React.ReactNode;
}

/** Primary module navigation (order = sidebar order). */
export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Overview', path: '/', icon: <DashboardOutlined /> },
  { key: 'reports', label: 'Reports', path: '/reports', icon: <BarChartOutlined /> },
  { key: 'products', label: 'Products', path: '/products', icon: <ShoppingCartOutlined /> },
  { key: 'inventory', label: 'Inventory', path: '/inventory', icon: <InboxOutlined /> },
  { key: 'orders', label: 'Orders', path: '/orders', icon: <TeamOutlined /> },
  { key: 'invoices', label: 'Invoices', path: '/invoices', icon: <FileTextOutlined /> },
  { key: 'customers', label: 'Customers', path: '/customers', icon: <UserOutlined /> },
  { key: 'import', label: 'Import', path: '/import', icon: <UploadOutlined /> },
];

/** Secondary section (account-level). */
export const NAV_SECONDARY: NavItem[] = [
  { key: 'settings', label: 'Settings', path: '/settings', icon: <SettingOutlined /> },
  { key: 'support', label: 'Report an issue', path: '/support', icon: <CustomerServiceOutlined /> },
];
