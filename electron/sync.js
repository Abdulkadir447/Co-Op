/**
 * Co-op sync engine — core (OFFLINE 3).
 *
 * Pure logic over the local data layer (no network, no Electron imports):
 *
 *   applyPull(dataLayer, payload, { full })
 *     Upserts a /sync/pull mirror payload into local SQLite, keyed by stable
 *     identity (client_id, or the synthetic key `srv-<server_id>` for
 *     cloud-native rows), resolves cross-references through id_map, and — on
 *     a FULL pull — verifies the mirror's counts against the payload before
 *     the transaction commits. Stores the pull cursor for delta pulls.
 *
 *   markPushOutcome(dataLayer, result)
 *     Applies a /sync/push summary: every op the server acknowledged (in
 *     result.ids — applied OR idempotent-skip) is marked synced; every op
 *     with an error is marked failed (retryFailed puts it back on the next
 *     cycle).
 *
 * Transport (the Clerk-authenticated axios client) and the triggers
 * (startup / reconnect / interval / manual) live in the renderer
 * (frontend/src/sync/engine.ts) — that is where the auth token exists.
 *
 * Invariants:
 *   * applyPull is idempotent: re-applying the same payload changes nothing.
 *   * applyPull never deletes local-only rows (offline writes awaiting push);
 *     full pull is an upsert, not a replace.
 *   * A failed full-pull verification rolls back the whole transaction —
 *     the cursor is stored last, inside it.
 */
'use strict';

const CURSOR_KEY = 'pull_cursor';

/** Stable local identity key: the row's ULID, or `srv-<server_id>` for
 *  cloud-native rows (client_id is null on the server). */
// Cloud-native rows (client_id is null on the server) get a deterministic
// SYNTHETIC local key so the mirror upsert is stable across pulls. A
// synthetic key is NOT a real client id: push payloads must reference such
// rows by their SERVER id instead (repositories.js checks SYNTHETIC_PREFIX).
const SYNTHETIC_PREFIX = 'srv-';

function keyFor(row) {
  return row.client_id || `${SYNTHETIC_PREFIX}${row.id}`;
}

function getCursor(db) {
  const r = db.prepare(`SELECT value FROM sync_meta WHERE key=?`).get(CURSOR_KEY);
  return r ? r.value : null;
}

function setCursor(db, cursor) {
  db.prepare(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).run(CURSOR_KEY, String(cursor));
}

/** (entity, server_id) -> local row id, recorded by every mirror upsert. */
function mapLocalId(db, entity, serverId) {
  if (serverId == null) return null;
  const r = db.prepare(`SELECT local_id FROM id_map WHERE entity=? AND server_id=?`).get(entity, Number(serverId));
  return r ? Number(r.local_id) : null;
}

function recordMap(db, entity, serverId, clientId, localId) {
  db.prepare(
    `INSERT INTO id_map (entity, server_id, client_id, local_id) VALUES (?, ?, ?, ?)
     ON CONFLICT(entity, server_id) DO UPDATE SET client_id=excluded.client_id, local_id=excluded.local_id`,
  ).run(entity, Number(serverId), String(clientId), Number(localId));
}

function upsertCustomer(db, bizId, row) {
  const key = keyFor(row);
  db.prepare(
    `INSERT INTO customers (client_id, business_id, full_name, email, phone, company, address, deleted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_id) DO UPDATE SET
       full_name=excluded.full_name, email=excluded.email, phone=excluded.phone,
       company=excluded.company, address=excluded.address,
       deleted_at=excluded.deleted_at, updated_at=excluded.updated_at`,
  ).run(key, bizId, row.full_name, row.email ?? null, row.phone ?? null, row.company ?? null, row.address ?? null, row.deleted_at ?? null, row.updated_at ?? null);
  const localId = Number(db.prepare(`SELECT id FROM customers WHERE client_id=?`).get(key).id);
  recordMap(db, 'customer', row.id, key, localId);
  return localId;
}

function upsertProduct(db, bizId, row) {
  const key = keyFor(row);
  db.prepare(
    `INSERT INTO products (client_id, business_id, name, sku, category, description, unit_price, cost_price, current_stock, reorder_level, deleted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_id) DO UPDATE SET
       name=excluded.name, sku=excluded.sku, category=excluded.category, description=excluded.description,
       unit_price=excluded.unit_price, cost_price=excluded.cost_price, current_stock=excluded.current_stock,
       reorder_level=excluded.reorder_level, deleted_at=excluded.deleted_at, updated_at=excluded.updated_at`,
  ).run(key, bizId, row.name, row.sku ?? null, row.category ?? null, row.description ?? null,
    row.unit_price ?? null, row.cost_price ?? null, row.current_stock ?? 0, row.reorder_level ?? 0,
    row.deleted_at ?? null, row.updated_at ?? null);
  const localId = Number(db.prepare(`SELECT id FROM products WHERE client_id=?`).get(key).id);
  recordMap(db, 'product', row.id, key, localId);
  return localId;
}

function upsertOrder(db, bizId, row) {
  const key = keyFor(row);
  const customerLocal = mapLocalId(db, 'customer', row.customer_id);
  if (customerLocal == null) {
    throw new Error(`mirror: order ${row.id} references customer ${row.customer_id}, not in the local mapping`);
  }
  db.prepare(
    `INSERT INTO orders (client_id, business_id, customer_id, status, total_amount, order_date, deleted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_id) DO UPDATE SET
       customer_id=excluded.customer_id, status=excluded.status, total_amount=excluded.total_amount,
       order_date=excluded.order_date, deleted_at=excluded.deleted_at, updated_at=excluded.updated_at`,
  ).run(key, bizId, customerLocal, row.status, row.total_amount ?? 0, row.order_date ?? null, row.deleted_at ?? null, row.updated_at ?? null);
  const localId = Number(db.prepare(`SELECT id FROM orders WHERE client_id=?`).get(key).id);
  recordMap(db, 'order', row.id, key, localId);
  return localId;
}

function upsertOrderItem(db, bizId, row) {
  const key = keyFor(row);
  const orderLocal = mapLocalId(db, 'order', row.order_id);
  const productLocal = mapLocalId(db, 'product', row.product_id);
  if (orderLocal == null) throw new Error(`mirror: order item ${row.id} references order ${row.order_id}, not in the local mapping`);
  if (productLocal == null) throw new Error(`mirror: order item ${row.id} references product ${row.product_id}, not in the local mapping`);
  // Line items are immutable locally (no deleted_at/updated_at columns): an
  // item's lifecycle belongs to its order, which soft-deletes as a whole.
  db.prepare(
    `INSERT INTO order_items (client_id, business_id, order_id, product_id, quantity, unit_price, total_price)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_id) DO UPDATE SET
       order_id=excluded.order_id, product_id=excluded.product_id, quantity=excluded.quantity,
       unit_price=excluded.unit_price, total_price=excluded.total_price`,
  ).run(key, bizId, orderLocal, productLocal, row.quantity, row.unit_price, row.total_price);
  recordMap(db, 'order_item', row.id, key, Number(db.prepare(`SELECT id FROM order_items WHERE client_id=?`).get(key).id));
}

/**
 * The stock ledger is immutable + deduped by client_id: an offline movement
 * and its server echo carry the SAME client_id, so re-ingesting after push
 * must not duplicate. INSERT OR IGNORE on client_id gives exactly that.
 */
function upsertMovement(db, bizId, row) {
  const key = keyFor(row);
  const productLocal = mapLocalId(db, 'product', row.product_id);
  if (productLocal == null) throw new Error(`mirror: movement ${row.id} references product ${row.product_id}, not in the local mapping`);
  db.prepare(
    `INSERT OR IGNORE INTO stock_movements (client_id, business_id, product_id, change, reason, note, order_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(key, bizId, productLocal, row.change, row.reason, row.note ?? null,
    mapLocalId(db, 'order', row.order_id), row.created_at ?? null);
}

function localCount(db, entity, bizId) {
  // payload.counts is keyed by table name; id_map is keyed by entity name.
  const table = {
    customers: 'customers', products: 'products', orders: 'orders',
    order_items: 'order_items', stock_movements: 'stock_movements',
    customer: 'customers', product: 'products', order: 'orders',
    order_item: 'order_items', stock_movement: 'stock_movements',
  }[entity];
  if (!table) throw new Error(`mirror: unknown count entity ${entity}`);
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE business_id=?`).get(bizId).n);
}

/**
 * Upsert a /sync/pull payload into the local mirror (one transaction).
 * @param {object} dataLayer  createDataLayer() result.
 * @param {object} payload    /sync/pull response (full or delta).
 * @param {{full?: boolean}} [opts]  full=true verifies mirror counts.
 * @returns {{business_id: number, cursor: string, applied: object}}
 */
function applyPull(dataLayer, payload, { full = false } = {}) {
  const db = dataLayer.db;
  return db.tx(() => {
    const biz = payload.business;
    if (!biz || biz.id == null) throw new Error('mirror: payload has no business');
    const bizRow = dataLayer.business.ensure({ client_id: String(biz.id), name: biz.name, currency: biz.currency || 'NGN' });
    if (bizRow.name !== biz.name || bizRow.currency !== (biz.currency || 'NGN')) {
      dataLayer.business.update(bizRow.id, { name: biz.name, currency: biz.currency || 'NGN' });
    }
    const bizId = Number(bizRow.id);
    const applied = { customers: 0, products: 0, orders: 0, order_items: 0, stock_movements: 0 };

    // Dependency-safe order (mirrors the server's push ordering): referenced
    // entities first, then dependents.
    for (const row of payload.customers || []) { upsertCustomer(db, bizId, row); applied.customers += 1; }
    for (const row of payload.products || []) { upsertProduct(db, bizId, row); applied.products += 1; }
    for (const row of payload.orders || []) { upsertOrder(db, bizId, row); applied.orders += 1; }
    for (const row of payload.order_items || []) { upsertOrderItem(db, bizId, row); applied.order_items += 1; }
    for (const row of payload.stock_movements || []) { upsertMovement(db, bizId, row); applied.stock_movements += 1; }

    // A FULL pull must leave the mirror matching the cloud exactly (counts
    // include soft-deleted rows on both sides). A delta's counts only cover
    // the changed rows — per-row success is its check.
    if (full && payload.counts) {
      for (const [entity, expected] of Object.entries(payload.counts)) {
        const actual = localCount(db, entity, bizId);
        if (actual !== Number(expected)) {
          throw new Error(`mirror verification failed: ${entity} local=${actual} cloud=${expected}`);
        }
      }
    }

    // Cursor is stored LAST, inside the transaction: a rolled-back pull
    // keeps the old cursor, so the next delta re-covers the gap.
    setCursor(db, payload.cursor);
    return { business_id: bizId, cursor: payload.cursor, applied };
  });
}

/**
 * Mark the local queue after a /sync/push batch (OFFLINE 4 outcomes):
 *   result.ids       -> synced   (applied or idempotent-skip: done either way)
 *   result.conflicts -> conflict (structured entry retained; NEVER retried —
 *                        retryFailed() only re-arms 'failed' ops)
 *   result.failed    -> failed   (transient; retried on the next push)
 * Ops in none of the three sets stay pending. A conflict wins over a failed
 * entry for the same client_id (the structured info is the superset).
 */
function markPushOutcome(dataLayer, result) {
  const ok = new Set(Object.keys(result.ids || {}));
  const conflictEntries = new Map(
    (result.conflicts || []).filter((c) => c.client_id).map((c) => [c.client_id, c]),
  );
  const errs = new Map((result.failed || result.errors || []).filter((e) => e.client_id).map((e) => [e.client_id, e.error]));
  let synced = 0;
  let conflicts = 0;
  let failed = 0;
  for (const op of dataLayer.queue.pending()) {
    if (conflictEntries.has(op.client_id)) {
      dataLayer.queue.markConflict(op.id, conflictEntries.get(op.client_id));
      conflicts += 1;
    } else if (ok.has(op.client_id)) {
      dataLayer.queue.markSynced(op.id);
      synced += 1;
    } else if (errs.has(op.client_id)) {
      dataLayer.queue.markFailed(op.id, errs.get(op.client_id));
      failed += 1;
    }
  }
  return { synced, conflicts, failed };
}

module.exports = { applyPull, markPushOutcome, getCursor, keyFor, SYNTHETIC_PREFIX };
