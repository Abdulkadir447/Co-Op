import React from 'react';
import {
  AppstoreOutlined,
  DollarOutlined,
  InboxOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import { getCurrency } from '../../services/currency';

/**
 * KPI definitions for the Dashboard first row (Stitch
 * coop_business_dashboard_qa_polished): Total Revenue • Orders •
 * Inventory Health • Products.
 *
 * This file stays the single KPI CONFIGURATION layer (title, icon, accent,
 * route) exactly as before — live values, trends and sub-lines are computed
 * from /dashboard/summary at render time in Dashboard/index.tsx.
 *
 * `accent` is 'solid' (filled brand tile — the hero metric) or 'soft'
 * (tinted tile), matching the design's icon treatment.
 */
export type KpiAccent = 'solid' | 'soft';

export interface KpiDefinition {
  key: string;
  title: string;
  icon: React.ReactNode;
  accent: KpiAccent;
  /** KPI click navigates to the associated module (UXDS 9.9). */
  route?: string;
}

export const KPI_DEFINITIONS: KpiDefinition[] = [
  {
    key: 'revenue',
    title: 'Total Revenue',
    icon: <DollarOutlined />,
    accent: 'solid',
  },
  {
    key: 'orders',
    title: 'Orders',
    icon: <ShoppingCartOutlined />,
    accent: 'soft',
    route: '/orders',
  },
  {
    key: 'inventory-health',
    title: 'Inventory Health',
    icon: <InboxOutlined />,
    accent: 'soft',
    route: '/inventory',
  },
  {
    key: 'products',
    title: 'Products',
    icon: <AppstoreOutlined />,
    accent: 'soft',
    route: '/products',
  },
];

/**
 * Shared currency formatter. Defaults to the business currency from the
 * Settings store (Task 9) so money formatting follows the company setting;
 * pass an explicit code to override.
 */
export const formatCurrency = (value: number, currency?: string): string =>
  value.toLocaleString(undefined, { style: 'currency', currency: currency ?? getCurrency() });

/** Compact money for tight spaces (donut center label): $1.4k / $2.3M. */
export const formatCompact = (value: number, currency?: string): string => {
  const cur = currency ?? getCurrency();
  const abs = Math.abs(value);
  let num: string;
  if (abs >= 1_000_000) num = (value / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  else if (abs >= 1_000) num = (value / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  else num = String(Math.round(value));
  const symbol =
    new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, currencyDisplay: 'symbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? `${cur} `;
  return `${symbol}${num}`;
};
