/**
 * OFFLINE 3.5 — the local analytics bundle.
 *
 * Fetches the whole mirror (business, orders, items, products, customers,
 * stock movements) in one parallel round over the local data layer — this is
 * the single data source for the local dashboard, reports and briefing
 * calculators (ports of the server's deterministic engines).
 *
 * Caching: a short TTL (15 s) + invalidation on every sync-status change, so
 * the numbers track the mirror while the pages stay fast. Local writes show
 * up on the next hook load (navigation / reload) — the same cadence the
 * server-backed pages always had.
 */
import { localBusinessIdLocal } from '../repositories/identity';
import { getLocalDb } from '../sync/localDb';
import { subscribe } from '../sync/syncStatus';
import type { LBusiness, LCustomer, LMovement, LOrder, LOrderItem, LProduct, LocalBundle } from './localTypes';

const TTL_MS = 15_000;

let cache: { at: number; bundle: LocalBundle } | null = null;
let wired = false;

function invalidate(): void {
  cache = null;
}

/** Subscribe once: any mirror/queue change (pull, push, status) drops the cache. */
function wireInvalidation(): void {
  if (wired) return;
  wired = true;
  subscribe(invalidate);
}

export function invalidateLocalBundle(): void {
  invalidate();
}

export async function getLocalBundle(): Promise<LocalBundle> {
  wireInvalidation();
  if (cache && Date.now() - cache.at < TTL_MS) return cache.bundle;

  const db = getLocalDb();
  if (!db) throw new Error('Local data layer unavailable');
  const bizId = await localBusinessIdLocal();

  const [orderRows, itemRows, productRows, customerRows, movementRows, bizRow] = await Promise.all([
    db.orderListDetailed({ business_id: bizId, opts: { limit: 100000 } }),
    db.orderItemsByOrder({ business_id: bizId, opts: { limit: 100000 } }),
    db.productList({ business_id: bizId, opts: { limit: 100000 } }),
    db.customerList({ business_id: bizId, opts: { limit: 100000 } }),
    db.stockMovements({ business_id: bizId }),
    db.businessGet(bizId),
  ]);

  const orders: LOrder[] = orderRows.map((o) => ({
    id: Number(o.id),
    customer_id: o.customer_id != null ? Number(o.customer_id) : null,
    status: String(o.status),
    total_amount: Number(o.total_amount ?? 0),
    order_date: String(o.order_date ?? ''),
    created_at: o.created_at != null ? String(o.created_at) : null,
  }));
  const items: LOrderItem[] = itemRows.map((i) => ({
    id: Number(i.id),
    order_id: Number(i.order_id),
    product_id: Number(i.product_id),
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price),
    total_price: Number(i.total_price),
  }));
  const products: LProduct[] = productRows.map((p) => ({
    id: Number(p.id),
    client_id: String(p.client_id ?? ''),
    name: String(p.name ?? ''),
    sku: p.sku != null ? String(p.sku) : null,
    category: p.category != null ? String(p.category) : null,
    unit_price: p.unit_price != null ? Number(p.unit_price) : null,
    cost_price: p.cost_price != null ? Number(p.cost_price) : null,
    current_stock: Number(p.current_stock ?? 0),
    reorder_level: Number(p.reorder_level ?? 0),
  }));
  const customers: LCustomer[] = customerRows.map((c) => ({
    id: Number(c.id),
    full_name: String(c.full_name ?? ''),
    email: c.email != null ? String(c.email) : null,
    created_at: c.created_at != null ? String(c.created_at) : c.updated_at != null ? String(c.updated_at) : null,
  }));
  const movements: LMovement[] = movementRows.map((m) => ({
    id: Number(m.id),
    product_id: Number(m.product_id),
    change: Number(m.change),
    reason: String(m.reason),
    order_id: m.order_id != null ? Number(m.order_id) : null,
    created_at: m.created_at != null ? String(m.created_at) : null,
  }));

  const biz: LBusiness = {
    id: Number(bizRow?.id ?? bizId),
    name: String(bizRow?.name ?? 'My Business'),
    currency: String(bizRow?.currency ?? 'NGN'),
  };

  const bundle: LocalBundle = { business: biz, orders, items, products, customers, movements };
  cache = { at: Date.now(), bundle };
  return bundle;
}
