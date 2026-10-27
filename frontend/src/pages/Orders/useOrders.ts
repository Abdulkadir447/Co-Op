/**
 * Orders data hook — same architecture as Products/Customers (Task 7).
 * Stock deduction, transition rules and rollback live on the server; this
 * hook only transports data through the Clerk-authenticated API client.
 *
 * OFFLINE 3: when local mode is active (desktop + populated mirror), READS
 * come from the local SQLite mirror via the data layer — the repository
 * decides (ADR-002). The local path mirrors the server list semantics
 * exactly (search: customer name or order id; status filter; id desc;
 * same page envelope) so the page is unchanged either way.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ApiError, useApiClient } from '../../services/api/client';
import { makeOrderRepo, localBusinessIdLocal, isLocalModeActive, useLocalModeActivated } from '../../repositories';
import { getLocalDb, getPendingOrderIds } from '../../sync/localDb';
import { subscribe } from '../../sync/syncStatus';

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderItem {
  id: number;
  product_id: number;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Order {
  id: number;
  customer_id: number;
  customer: { full_name: string } | null;
  status: OrderStatus;
  /** Legal next statuses, published by the backend (Task 12 / M4). */
  allowed_transitions: OrderStatus[];
  /** Net subtotal — tax is NOT included (0021, tax-exclusive). */
  total_amount: number;
  /** Tax snapshotted when the order was raised. `null` = tax was off. */
  tax_rate?: number | null;
  tax_amount?: number;
  /** What the customer owes in full: total_amount + tax_amount. */
  grand_total?: number;
  /**
   * Receivables (0020). Computed server-side from the payment ledger on every
   * read, so it can never drift from the order. `unknown` only appears on the
   * offline mirror, which does not carry payments (they are recorded online).
   */
  amount_paid?: number;
  balance_due?: number;
  payment_status?: 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'unknown';
  order_date: string;
  created_at: string;
  items: OrderItem[];
}

export interface OrderListResponse {
  items: Order[];
  total: number;
  page: number;
  limit: number;
}

export interface OrderItemInput {
  product_id: number;
  quantity: number;
  unit_price: number;
}

export interface OrderCreateInput {
  customer_id: number;
  items: OrderItemInput[];
}

export const ORDERS_PAGE_SIZE = 10;

/** Status labels (display chrome lives in the page's CoopBadge variants). */
export const STATUS_META: Record<OrderStatus, { label: string }> = {
  pending: { label: 'Pending' },
  confirmed: { label: 'Confirmed' },
  shipped: { label: 'Shipped' },
  delivered: { label: 'Delivered' },
  cancelled: { label: 'Cancelled' },
};

/**
 * The server's order status machine (backend ALLOWED_ORDER_TRANSITIONS),
 * mirrored for local reads — same legal next statuses, same sorted order.
 */
export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['cancelled', 'confirmed'],
  confirmed: ['cancelled', 'shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/** Map local mirror rows to the server's OrderOut shape (local read path). */
function localOrdersResponse(rows: Array<Record<string, unknown>>, allItems: Array<Record<string, unknown>>, productName: (id: number) => string | null) {
  const itemsByOrder = new Map<number, OrderItem[]>();
  for (const it of allItems) {
    const oid = Number(it.order_id);
    const list = itemsByOrder.get(oid) ?? [];
    list.push({
      id: Number(it.id),
      product_id: Number(it.product_id),
      product_name: productName(Number(it.product_id)),
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      total_price: Number(it.total_price),
    });
    itemsByOrder.set(oid, list);
  }
  return rows.map((o) => ({
    id: Number(o.id),
    customer_id: Number(o.customer_id),
    customer: o.customer_name ? { full_name: String(o.customer_name) } : null,
    status: String(o.status) as OrderStatus,
    allowed_transitions: ALLOWED_ORDER_TRANSITIONS[String(o.status) as OrderStatus] ?? [],
    total_amount: Number(o.total_amount ?? 0),
    order_date: String(o.order_date ?? ''),
    created_at: String(o.created_at ?? ''),
    items: itemsByOrder.get(Number(o.id)) ?? [],
  })) as Order[];
}

export function useOrders() {
  const api = useApiClient();
  // OFFLINE 2: order writes go through the repository (local-first on desktop,
  // unchanged HTTP in a browser). Reads stay server-backed until pull exists.
  const ordersRepo = makeOrderRepo(api);
  const [items, setItems] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  // Command-palette deep links (Stage 2): apply ?q= when the palette
  // navigates to this module — including while it is already mounted.
  const location = useLocation();
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('q');
    if (q != null) setSearch(q);
  }, [location.search]);

  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  // "Pending sync" chips: local orders whose push op hasn't landed yet.
  const [pendingSyncIds, setPendingSyncIds] = useState<number[]>([]);

  /** Local read path (OFFLINE 3): the SQLite mirror, server semantics. */
  const loadLocal = useCallback(
    async (requestedPage: number, query: string, status: OrderStatus | 'all') => {
      const biz = await localBusinessIdLocal();
      const db = getLocalDb();
      if (!db) throw new ApiError('Local data layer unavailable.');
      const [rows, allItems, products, pending] = await Promise.all([
        db.orderListDetailed({ business_id: biz, opts: { limit: 10000 } }),
        db.orderItemsByOrder({ business_id: biz, opts: { limit: 10000 } }),
        db.productList({ business_id: biz, opts: { limit: 10000 } }),
        getPendingOrderIds(),
      ]);
      const nameById = new Map<number, string>(products.map((p) => [Number(p.id), String(p.name ?? '')]));
      let orders = localOrdersResponse(rows, allItems, (id) => nameById.get(id) ?? null);

      if (status !== 'all') orders = orders.filter((o) => o.status === status);
      const q = query.trim();
      if (q) {
        const ql = q.toLowerCase();
        const asId = /^\d+$/.test(q) ? Number(q) : null;
        orders = orders.filter(
          (o) => (o.customer?.full_name.toLowerCase().includes(ql) ?? false) || (asId !== null && o.id === asId),
        );
      }
      orders.sort((a, b) => b.id - a.id); // server list order: id desc

      setTotal(orders.length);
      const start = (requestedPage - 1) * ORDERS_PAGE_SIZE;
      setItems(orders.slice(start, start + ORDERS_PAGE_SIZE));
      setPage(requestedPage);
      setPendingSyncIds(pending);
    },
    [],
  );

  const load = useCallback(
    async (requestedPage: number, query: string, status: OrderStatus | 'all') => {
      setLoading(true);
      setError(null);
      try {
        if (isLocalModeActive()) {
          await loadLocal(requestedPage, query, status);
          return;
        }
        const { data } = await api.get<OrderListResponse>('/orders', {
          params: {
            page: requestedPage,
            limit: ORDERS_PAGE_SIZE,
            ...(query ? { search: query } : {}),
            ...(status !== 'all' ? { status } : {}),
          },
        });
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
        setPendingSyncIds([]);
      } catch (e) {
        setError(
          e instanceof ApiError ? e : new ApiError('Unable to reach the Co-op API.'),
        );
      } finally {
        setLoading(false);
      }
    },
    [api, loadLocal],
  );

  // Debounced search/filter changes return to page 1.
  useEffect(() => {
    const timer = setTimeout(
      () => load(1, search.trim(), statusFilter),
      search ? 350 : 0,
    );
    return () => clearTimeout(timer);
  }, [search, statusFilter, load]);

  // The mirror became ready (initial pull): a page mounted before that must
  // stop serving HTTP reads and reload from the local mirror.
  useLocalModeActivated(() => {
    void load(page, search.trim(), statusFilter);
  });

  // Keep the "Pending sync" chips live: when the sync cycle drains the
  // queue, the chips vanish without a page reload.
  useEffect(() => {
    return subscribe(() => {
      if (!isLocalModeActive()) return;
      void getPendingOrderIds().then(setPendingSyncIds).catch(() => undefined);
    });
  }, []);

  // Local-first order writes (ADR-002): create + status go to the local layer
  // (ULID + stock operation + queue) on desktop, else the existing HTTP call.
  const createOrder = (input: OrderCreateInput) => ordersRepo.create(input);

  const updateStatus = (id: number, status: OrderStatus) =>
    ordersRepo.setStatus(id, status);

  // Deletion restores server-side stock, so it stays on the HTTP path for now
  // (local delete + stock restore is a later OFFLINE sub-phase).
  const deleteOrder = (id: number) => api.delete(`/orders/${id}`);

  return {
    items,
    total,
    page,
    pageSize: ORDERS_PAGE_SIZE,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    loading,
    error,
    pendingSyncIds,
    reload: () => load(page, search.trim(), statusFilter),
    goToPage: (p: number) => load(p, search.trim(), statusFilter),
    createOrder,
    updateStatus,
    deleteOrder,
  };
}
