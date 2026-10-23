/**
 * Zeno — data bundle (Stage 2.2).
 *
 * One parallel round over EXISTING endpoints only. The AI layer never talks
 * to the database; this is its entire data path.
 *
 *   /dashboard/summary            — KPIs, growth
 *   /dashboard/revenue/timeseries — 30-day daily revenue (trends/forecast)
 *   /dashboard/top-products       — best sellers (concentration, table)
 *   /inventory/summary            — stock health counts
 *   /products?stock=low|out       — the actual at-risk SKUs
 *   /customers?limit=100          — base list (recency analysis window)
 *   /orders?limit=100             — recent orders (recency, counts)
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError, useApiClient } from '../services/api/client';
import { isLocalModeActive } from '../repositories';
import { getLocalBundle } from '../analytics/localData';
import type { LProduct } from '../analytics/localTypes';
import {
  inventorySummary as localInventorySummary,
  summary as localSummary,
  timeseries as localTimeseries,
  topProducts as localTopProducts,
} from '../analytics/localDashboard';
import { ALLOWED_ORDER_TRANSITIONS, type OrderStatus } from '../pages/Orders/useOrders';
import type { DashboardSummary, TimeseriesPoint, TopProduct } from '../pages/Dashboard/useDashboardData';
import type { InventorySummary } from '../pages/Inventory/useInventory';
import type { Product } from '../pages/Products/useProducts';
import type { Customer } from '../pages/Customers/useCustomers';
import type { Order } from '../pages/Orders/useOrders';

export interface AiDataBundle {
  summary: DashboardSummary | null;
  timeseries: TimeseriesPoint[];
  topProducts: TopProduct[];
  inventory: InventorySummary | null;
  lowStock: Product[];
  outOfStock: Product[];
  customers: Customer[];
  recentOrders: Order[];
  /** True when there is enough signal to compute insights at all. */
  sufficient: boolean;
}

const EMPTY: AiDataBundle = {
  summary: null,
  timeseries: [],
  topProducts: [],
  inventory: null,
  lowStock: [],
  outOfStock: [],
  customers: [],
  recentOrders: [],
  sufficient: false,
};

export function useAiData() {
  const api = useApiClient();
  const [bundle, setBundle] = useState<AiDataBundle>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const localProduct = (p: LProduct): Product => ({
    id: p.id,
    sku: p.sku ?? '',
    name: p.name,
    description: null,
    category: p.category,
    unit_price: p.unit_price ?? 0,
    cost_price: p.cost_price,
    current_stock: p.current_stock,
    reorder_level: p.reorder_level,
    created_at: '',
    updated_at: null,
  });

  /** Build the same bundle from the SQLite mirror (OFFLINE 3.5 local mode). */
  const loadLocal = useCallback(async () => {
    const b = await getLocalBundle();
    const s = localSummary(b);
    const nameById = new Map(b.customers.map((c) => [c.id, c.full_name]));
    const prodName = new Map(b.products.map((p) => [p.id, p.name]));
    const itemsByOrder = new Map<number, Order['items']>();
    for (const it of b.items) {
      const list = itemsByOrder.get(it.order_id) ?? [];
      list.push({
        id: it.id,
        product_id: it.product_id,
        product_name: prodName.get(it.product_id) ?? `Product #${it.product_id}`,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
      });
      itemsByOrder.set(it.order_id, list);
    }
    const recentOrders: Order[] = [...b.orders]
      .sort((a, z) => z.id - a.id)
      .slice(0, 100)
      .map((o) => ({
        id: o.id,
        customer_id: o.customer_id ?? 0,
        customer: o.customer_id != null && nameById.has(o.customer_id) ? { full_name: nameById.get(o.customer_id)! } : null,
        status: o.status as OrderStatus,
        allowed_transitions: ALLOWED_ORDER_TRANSITIONS[o.status as OrderStatus] ?? [],
        total_amount: o.total_amount,
        order_date: o.order_date,
        created_at: o.created_at ?? o.order_date,
        items: itemsByOrder.get(o.id) ?? [],
      }));
    const customers: Customer[] = b.customers.slice(0, 100).map((c) => ({
      id: c.id,
      full_name: c.full_name,
      email: c.email ?? '',
      phone: null,
      address: null,
      company: null,
      created_at: c.created_at ?? '',
      updated_at: null,
    }));
    const lowStock: Product[] = b.products
      .filter((p) => p.current_stock > 0 && p.current_stock <= p.reorder_level)
      .sort((a, z) => z.id - a.id)
      .slice(0, 5)
      .map(localProduct);
    const outOfStock: Product[] = b.products
      .filter((p) => p.current_stock === 0)
      .sort((a, z) => z.id - a.id)
      .slice(0, 5)
      .map(localProduct);
    setBundle({
      summary: s,
      timeseries: localTimeseries(b, 30),
      topProducts: localTopProducts(b, 5),
      inventory: localInventorySummary(b),
      lowStock,
      outOfStock,
      customers,
      recentOrders,
      sufficient: s.products_count > 0 || recentOrders.length > 0,
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // OFFLINE 3.5: local mode — the deterministic AI layer works offline
      // from the mirror (the model-based assistant stays online-only).
      if (isLocalModeActive()) {
        await loadLocal();
        return;
      }
      const [summary, ts, tops, inv, low, out, cust, ords] = await Promise.all([
        api.get<DashboardSummary>('/dashboard/summary'),
        api.get<TimeseriesPoint[]>('/dashboard/revenue/timeseries', { params: { days: 30 } }),
        api.get<TopProduct[]>('/dashboard/top-products', { params: { limit: 5 } }),
        api.get<InventorySummary>('/inventory/summary').catch(() => null),
        api.get<{ items: Product[] }>('/products', { params: { stock: 'low', limit: 5 } }).catch(() => null),
        api.get<{ items: Product[] }>('/products', { params: { stock: 'out', limit: 5 } }).catch(() => null),
        api.get<{ items: Customer[] }>('/customers', { params: { limit: 100 } }).catch(() => null),
        api.get<{ items: Order[] }>('/orders', { params: { limit: 100 } }).catch(() => null),
      ]);
      setBundle({
        summary: summary.data,
        timeseries: ts.data ?? [],
        topProducts: tops.data ?? [],
        inventory: inv?.data ?? null,
        lowStock: low?.data.items ?? [],
        outOfStock: out?.data.items ?? [],
        customers: cust?.data.items ?? [],
        recentOrders: ords?.data.items ?? [],
        sufficient:
          (summary.data.products_count ?? 0) > 0 || (ords?.data.items?.length ?? 0) > 0,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError('Unable to load business data.'));
    } finally {
      setLoading(false);
    }
  }, [api, loadLocal]);

  useEffect(() => {
    void load();
  }, [load]);

  return { bundle, loading, error, retry: load };
}
