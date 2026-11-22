/**
 * Co-op local data layer — repositories (OFFLINE 1, foundation for OFFLINE 2).
 *
 * Local-first: every write is a local SQLite transaction that (1) updates the
 * local source of truth and (2) enqueues a sync operation carrying the row's
 * client_id as its idempotency key. The UI sees the change immediately, fully
 * offline (ADR-002).
 *
 * These are the data-layer primitives. OFFLINE 2 wires the React UI to call
 * these (via IPC) instead of FastAPI for core operations.
 */
'use strict';

const { ulid, SYNTHETIC_PREFIX } = require('./ids');

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Business (local tenant root)
// ---------------------------------------------------------------------------
class BusinessRepository {
  constructor(db) {
    this.db = db;
  }

  /** Ensure a local business row exists (idempotent by client_id). */
  ensure({ client_id, name, currency = 'NGN' }) {
    let row = this.db.prepare(`SELECT * FROM business WHERE client_id=?`).get(client_id);
    if (row) return row;
    const r = this.db
      .prepare(`INSERT INTO business (client_id, name, currency) VALUES (?, ?, ?)`)
      .run(client_id, name, currency);
    return this.db.prepare(`SELECT * FROM business WHERE id=?`).get(Number(r.lastInsertRowid));
  }

  get(id) {
    return this.db.prepare(`SELECT * FROM business WHERE id=?`).get(id);
  }

  /** The (single-owner) local business row, or null. */
  first() {
    return this.db.prepare(`SELECT * FROM business ORDER BY id ASC LIMIT 1`).get() || null;
  }

  update(id, { name, currency }) {
    this.db
      .prepare(`UPDATE business SET name=COALESCE(?, name), currency=COALESCE(?, currency), updated_at=? WHERE id=?`)
      .run(name ?? null, currency ?? null, now(), id);
    return this.get(id);
  }
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
class CustomerRepository {
  constructor(db, queue) {
    this.db = db;
    this.queue = queue;
  }

  create(business_id, { full_name, email, phone, company, address }) {
    const client_id = ulid();
    const r = this.db
      .prepare(
        `INSERT INTO customers (client_id, business_id, full_name, email, phone, company, address, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(client_id, business_id, full_name, email ?? null, phone ?? null, company ?? null, address ?? null, now());
    const id = Number(r.lastInsertRowid);
    const row = this.get(id);
    this.queue.enqueue({ business_id, entity: 'customer', entity_id: id, client_id, operation: 'create', payload: row });
    return row;
  }

  update(id, { full_name, email, phone, company, address }) {
    const existing = this.db.prepare(`SELECT * FROM customers WHERE id=?`).get(id);
    if (!existing) throw new Error(`customer ${id} is not in the local database`);
    this.db
      .prepare(
        `UPDATE customers SET
           full_name=COALESCE(?, full_name), email=COALESCE(?, email), phone=COALESCE(?, phone),
           company=COALESCE(?, company), address=COALESCE(?, address), updated_at=?
         WHERE id=?`
      )
      .run(full_name ?? null, email ?? null, phone ?? null, company ?? null, address ?? null, now(), id);
    const row = this.get(id);
    this.queue.enqueue({ business_id: row.business_id, entity: 'customer', entity_id: id, client_id: row.client_id, operation: 'update', payload: row });
    return row;
  }

  softDelete(id) {
    const existing = this.db.prepare(`SELECT * FROM customers WHERE id=?`).get(id);
    if (!existing) throw new Error(`customer ${id} is not in the local database`);
    this.db.prepare(`UPDATE customers SET deleted_at=?, updated_at=? WHERE id=?`).run(now(), now(), id);
    const row = this.db.prepare(`SELECT * FROM customers WHERE id=?`).get(id);
    this.queue.enqueue({ business_id: row.business_id, entity: 'customer', entity_id: id, client_id: row.client_id, operation: 'delete', payload: { client_id: row.client_id } });
    return row;
  }

  get(id) {
    return this.db.prepare(`SELECT * FROM customers WHERE id=? AND deleted_at IS NULL`).get(id);
  }

  list(business_id, { limit = 200 } = {}) {
    return this.db
      .prepare(`SELECT * FROM customers WHERE business_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT ?`)
      .all(business_id, limit);
  }

  /**
   * OFFLINE 5 — resolution-only local soft-delete for a customer that was
   * NEVER synced (its create parked as a conflict). Deliberately does NOT
   * enqueue a delete op: the server has no row for this client_id, so a
   * delete would just become a not_found conflict.
   */
  discardLocal(id) {
    const existing = this.db.prepare(`SELECT * FROM customers WHERE id=?`).get(id);
    if (!existing) throw new Error(`customer ${id} is not in the local database`);
    this.db
      .prepare(`UPDATE customers SET deleted_at=?, updated_at=? WHERE id=?`)
      .run(new Date().toISOString(), new Date().toISOString(), id);
    return this.db.prepare(`SELECT * FROM customers WHERE id=?`).get(id);
  }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
class ProductRepository {
  constructor(db, queue) {
    this.db = db;
    this.queue = queue;
  }

  create(business_id, { name, sku, category, description, unit_price, cost_price, current_stock = 0, reorder_level = 0 }) {
    const client_id = ulid();
    const r = this.db
      .prepare(
        `INSERT INTO products (client_id, business_id, name, sku, category, description, unit_price, cost_price, current_stock, reorder_level, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(client_id, business_id, name, sku ?? null, category ?? null, description ?? null,
        unit_price ?? null, cost_price ?? null, current_stock, reorder_level, now());
    const id = Number(r.lastInsertRowid);
    const row = this.get(id);
    this.queue.enqueue({ business_id, entity: 'product', entity_id: id, client_id, operation: 'create', payload: row });
    // Initial stock (if any) is a ledger movement. The stock is ALREADY in the
    // row from the INSERT above, so this only records the ledger entry +
    // enqueues the sync op — it must NOT re-apply the quantity.
    if (current_stock) this._recordInitialStock(business_id, id, current_stock);
    return row;
  }

  update(id, fields) {
    const existing = this.db.prepare(`SELECT * FROM products WHERE id=?`).get(id);
    if (!existing) throw new Error(`product ${id} is not in the local database`);
    this.db
      .prepare(
        `UPDATE products SET
           name=COALESCE(?, name), sku=COALESCE(?, sku), category=COALESCE(?, category),
           description=COALESCE(?, description), unit_price=COALESCE(?, unit_price),
           cost_price=COALESCE(?, cost_price), reorder_level=COALESCE(?, reorder_level), updated_at=?
         WHERE id=?`
      )
      .run(fields.name ?? null, fields.sku ?? null, fields.category ?? null, fields.description ?? null,
        fields.unit_price ?? null, fields.cost_price ?? null, fields.reorder_level ?? null, now(), id);
    const row = this.get(id);
    this.queue.enqueue({ business_id: row.business_id, entity: 'product', entity_id: id, client_id: row.client_id, operation: 'update', payload: row });
    return row;
  }

  softDelete(id) {
    const existing = this.db.prepare(`SELECT * FROM products WHERE id=?`).get(id);
    if (!existing) throw new Error(`product ${id} is not in the local database`);
    this.db.prepare(`UPDATE products SET deleted_at=?, updated_at=? WHERE id=?`).run(now(), now(), id);
    const row = this.db.prepare(`SELECT * FROM products WHERE id=?`).get(id);
    this.queue.enqueue({ business_id: row.business_id, entity: 'product', entity_id: id, client_id: row.client_id, operation: 'delete', payload: { client_id: row.client_id } });
    return row;
  }

  get(id) {
    return this.db.prepare(`SELECT * FROM products WHERE id=? AND deleted_at IS NULL`).get(id);
  }

  list(business_id, { limit = 200 } = {}) {
    return this.db
      .prepare(`SELECT * FROM products WHERE business_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT ?`)
      .all(business_id, limit);
  }

  /**
   * OFFLINE 5 — resolution-only local soft-delete for a product that was
   * NEVER synced (its create parked as a conflict). No queue op: the server
   * has no row for this client_id.
   */
  discardLocal(id) {
    const existing = this.db.prepare(`SELECT * FROM products WHERE id=?`).get(id);
    if (!existing) throw new Error(`product ${id} is not in the local database`);
    this.db
      .prepare(`UPDATE products SET deleted_at=?, updated_at=? WHERE id=?`)
      .run(new Date().toISOString(), new Date().toISOString(), id);
    return this.db.prepare(`SELECT * FROM products WHERE id=?`).get(id);
  }

  /**
   * Record the initial-stock ledger entry for a freshly created product.
   * The stock value is already persisted by the product INSERT, so this only
   * appends the movement row + enqueues its sync op (no stock mutation).
   */
  _recordInitialStock(business_id, product_id, initialStock) {
    const product = this.get(product_id);
    const mc = ulid();
    const r = this.db
      .prepare(`INSERT INTO stock_movements (client_id, business_id, product_id, change, reason, note, order_id, created_at)
                VALUES (?, ?, ?, ?, 'initial', NULL, NULL, ?)`)
      .run(mc, business_id, product_id, initialStock, now());
    this.queue.enqueue({
      business_id, entity: 'stock_movement', entity_id: Number(r.lastInsertRowid), client_id: mc, operation: 'create',
      payload: { product_client_id: product.client_id, change: initialStock, reason: 'initial', note: null, order_id: null, applied_at: now() },
    });
  }
}

// ---------------------------------------------------------------------------
// Stock (operation-based, ADR-002 rule 5)
// ---------------------------------------------------------------------------
class StockRepository {
  constructor(db, queue, products, idmap) {
    this.db = db;
    this.queue = queue;
    this.products = products;
    this.idmap = idmap;
  }

  /**
   * Push-shape product reference: client_id for locally-created products,
   * or the SERVER id (via id_map) for cloud-mirrored ones, which have no
   * client_id. The server resolves whichever is present.
   */
  productRefs(productId) {
    const p = this.products.get(productId);
    if (!p) return null;
    // Cloud-mirrored rows carry a SYNTHETIC client_id (srv-<server id>); they
    // must be referenced by SERVER id (the server has no row with that
    // client_id). Locally-created rows carry a real ULID client_id.
    if (p.client_id && p.client_id.startsWith(SYNTHETIC_PREFIX)) {
      return { product_client_id: null, product_server_id: Number(p.client_id.slice(SYNTHETIC_PREFIX.length)) };
    }
    if (p.client_id) {
      return { product_client_id: p.client_id, product_server_id: null };
    }
    return { product_client_id: null, product_server_id: this.idmap ? this.idmap.serverId('product', productId) : null };
  }

  /** Apply a signed stock change + record a movement (offline-safe). */
  adjust(business_id, product_id, change, reason = 'correction', { order_id = null, note = null } = {}) {
    if (change === 0) throw new Error('Stock change must be non-zero');
    const product = this.products.get(product_id);
    if (!product) throw new Error(`Product ${product_id} not found`);
    const newStock = (product.current_stock || 0) + change;
    if (newStock < 0) throw new Error(`Insufficient stock: ${product.current_stock} available`);
    this.db.tx(() => {
      this.db.prepare(`UPDATE products SET current_stock=?, updated_at=? WHERE id=?`).run(newStock, now(), product_id);
      const mc = ulid();
      const r = this.db
        .prepare(`INSERT INTO stock_movements (client_id, business_id, product_id, change, reason, note, order_id, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(mc, business_id, product_id, change, reason, note ?? null, order_id ?? null, now());
      const refs = this.productRefs(product_id) || {};
      this.queue.enqueue({
        business_id, entity: 'stock_movement', entity_id: Number(r.lastInsertRowid), client_id: mc, operation: 'create',
        payload: { ...refs, change, reason, note, order_id, applied_at: now() },
      });
    });
    return this.products.get(product_id);
  }

  movements(business_id, product_id = null, { limit = 100 } = {}) {
    if (product_id != null) {
      return this.db
        .prepare(`SELECT * FROM stock_movements WHERE business_id=? AND product_id=? ORDER BY id DESC LIMIT ?`)
        .all(business_id, product_id, limit);
    }
    return this.db
      .prepare(`SELECT * FROM stock_movements WHERE business_id=? ORDER BY id DESC LIMIT ?`)
      .all(business_id, limit);
  }

  /**
   * OFFLINE 5 — resolution-only stock correction. When the user DISCARDS a
   * rejected movement (the cloud refused it, e.g. insufficient stock), the
   * local row must be brought back to the cloud's value — as a LOCAL
   * correction: a signed ledger entry with reason 'correction' and NO queue
   * op (pushing the delta again would just re-conflict). ADR-002 rule 5 is
   * preserved for everything that actually syncs.
   */
  setLocalStock(product_id, value, note = 'Sync conflict resolution: aligned to cloud stock') {
    const product = this.products.get(product_id);
    if (!product) throw new Error(`product ${product_id} is not in the local database`);
    const from = product.current_stock || 0;
    const delta = value - from;
    this.db.tx(() => {
      this.db.prepare(`UPDATE products SET current_stock=?, updated_at=? WHERE id=?`).run(value, now(), product_id);
      if (delta !== 0) {
        const mc = ulid();
        // Local-only correction (resolution of a rejected movement): recorded
        // in the local ledger but NOT queued — it must not re-push.
        this.db
          .prepare(`INSERT INTO stock_movements (client_id, business_id, product_id, change, reason, note, order_id, created_at)
                    VALUES (?, ?, ?, ?, 'correction', ?, NULL, ?)`)
          .run(mc, product.business_id, product_id, delta, note, now());
      }
    });
    return this.products.get(product_id);
  }
}

// ---------------------------------------------------------------------------
// Orders (create deducts stock; status changes may restore it)
// ---------------------------------------------------------------------------
class OrderRepository {
  constructor(db, queue, products, stock, idmap) {
    this.db = db;
    this.queue = queue;
    this.products = products;
    this.stock = stock;
    this.idmap = idmap;
  }

  /**
   * Push-shape customer reference: client_id for locally-created customers,
   * or the SERVER id (via id_map) for cloud-mirrored ones, which have no
   * client_id. The server resolves whichever is present.
   */
  customerRefs(customerId) {
    const c = this.db.prepare(`SELECT client_id FROM customers WHERE id=?`).get(customerId);
    if (!c) return null;
    if (c.client_id && c.client_id.startsWith(SYNTHETIC_PREFIX)) {
      return { customer_client_id: null, customer_server_id: Number(c.client_id.slice(SYNTHETIC_PREFIX.length)) };
    }
    if (c.client_id) {
      return { customer_client_id: c.client_id, customer_server_id: null };
    }
    return { customer_client_id: null, customer_server_id: this.idmap ? this.idmap.serverId('customer', customerId) : null };
  }

  /**
   * Create an order with line items; deducts stock and records movements,
   * all in one local transaction. items: [{ product_id, quantity, unit_price }].
   */
  create(business_id, { customer_id, items, order_date = null }) {
    const order_client_id = ulid();
    return this.db.tx(() => {
      const total = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
      // The PUSH payload carries client ids for locally-created references and
      // SERVER ids for cloud-mirrored references (which have no client_id);
      // the server resolves whichever is present (ADR-002). The local row
      // itself keeps local integer ids for the local UI.
      const custRefs = this.customerRefs(customer_id);
      if (!custRefs) throw new Error(`customer ${customer_id} is not in the local database`);
      const r = this.db
        .prepare(
          `INSERT INTO orders (client_id, business_id, customer_id, status, total_amount, order_date, updated_at)
           VALUES (?, ?, ?, 'pending', ?, ?, ?)`
        )
        .run(order_client_id, business_id, customer_id, total, order_date ?? now(), now());
      const order_id = Number(r.lastInsertRowid);

      for (const it of items) {
        const line_client_id = ulid();
        this.db
          .prepare(
            `INSERT INTO order_items (client_id, business_id, order_id, product_id, quantity, unit_price, total_price)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(line_client_id, business_id, order_id, it.product_id, it.quantity, it.unit_price, it.quantity * it.unit_price);
        const item = this.db.prepare(`SELECT * FROM order_items WHERE client_id=?`).get(line_client_id);
        const prodRefs = this.stock.productRefs(it.product_id);
        if (!prodRefs) throw new Error(`product ${it.product_id} is not in the local database`);
        this.queue.enqueue({
          business_id, entity: 'order_item', entity_id: item.id, client_id: line_client_id, operation: 'create',
          // Push shape: references by client_id or server id (sync.py _apply_order_item).
          payload: {
            ...item,
            order_client_id,
            ...prodRefs,
          },
        });
        // Deduct stock (operation-based) — mirrors the server's create-time deduction.
        const prodRow = this.products.get(it.product_id);
        if (prodRow) {
          this.stock._adjustInline(business_id, it.product_id, -it.quantity, 'order', { order_id });
        }
      }

      const order = this.get(order_id);
      this.queue.enqueue({
        business_id, entity: 'order', entity_id: order_id, client_id: order_client_id, operation: 'create',
        // Push shape: the server resolves the customer by client_id or server id.
        payload: { ...order, ...custRefs },
      });
      return order;
    });
  }

  /** Change status; cancelling a non-cancelled order restores its stock. */
  setStatus(business_id, order_id, status) {
    const order = this.get(order_id);
    if (!order) throw new Error(`Order ${order_id} not found`);
    const prev = order.status;
    this.db.prepare(`UPDATE orders SET status=?, updated_at=? WHERE id=?`).run(status, now(), order_id);
    const updated = this.get(order_id);
    this.queue.enqueue({ business_id, entity: 'order', entity_id: order_id, client_id: order.client_id, operation: 'update', payload: updated });
    // Cancellation restores stock exactly once (mirrors the server rule).
    if (status === 'cancelled' && prev !== 'cancelled') {
      this.db.tx(() => {
        const items = this.db.prepare(`SELECT * FROM order_items WHERE order_id=?`).all(order_id);
        for (const it of items) {
          this.stock._adjustInline(business_id, it.product_id, it.quantity, 'order_cancelled', { order_id });
        }
      });
    }
    return updated;
  }

  get(order_id) {
    return this.db.prepare(`SELECT * FROM orders WHERE id=? AND deleted_at IS NULL`).get(order_id);
  }

  items(order_id) {
    return this.db.prepare(`SELECT * FROM order_items WHERE order_id=?`).all(order_id);
  }

  list(business_id, { limit = 200 } = {}) {
    return this.db
      .prepare(`SELECT * FROM orders WHERE business_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT ?`)
      .all(business_id, limit);
  }

  /**
   * Orders with their customer's name (local read path, OFFLINE 3): the
   * renderer filters/sorts/paginates these in memory, mirroring the server
   * list semantics (search on customer name or order id; order id desc).
   */
  listDetailed(business_id, { limit = 10000 } = {}) {
    return this.db
      .prepare(
        `SELECT o.*, c.full_name AS customer_name
           FROM orders o
           LEFT JOIN customers c ON c.id = o.customer_id
          WHERE o.business_id=? AND o.deleted_at IS NULL
          ORDER BY o.id DESC LIMIT ?`,
      )
      .all(business_id, limit);
  }

  /** All line items of the business's orders (grouped in the renderer). */
  itemsByOrder(business_id, { limit = 10000 } = {}) {
    return this.db
      .prepare(`SELECT * FROM order_items WHERE business_id=? ORDER BY id ASC LIMIT ?`)
      .all(business_id, limit);
  }
}

// Inline stock adjustment shared by StockRepository and OrderRepository.
// (Kept on StockRepository to keep one code path for stock math.)
StockRepository.prototype._adjustInline = function (business_id, product_id, change, reason = 'correction', { order_id = null, note = null } = {}) {
  const product = this.products.get(product_id);
  if (!product) return;
  const newStock = (product.current_stock || 0) + change;
  if (newStock < 0) return; // offline create shouldn't hard-fail the order on stock; server re-validates
  this.db.prepare(`UPDATE products SET current_stock=?, updated_at=? WHERE id=?`).run(newStock, now(), product_id);
  const mc = ulid();
  const r = this.db
    .prepare(`INSERT INTO stock_movements (client_id, business_id, product_id, change, reason, note, order_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(mc, business_id, product_id, change, reason, note ?? null, order_id ?? null, now());
  const refs = this.productRefs(product_id) || {};
  this.queue.enqueue({
    business_id, entity: 'stock_movement', entity_id: Number(r.lastInsertRowid), client_id: mc, operation: 'create',
    payload: { ...refs, change, reason, note, order_id, applied_at: now() },
  });
};

module.exports = {
  BusinessRepository,
  CustomerRepository,
  ProductRepository,
  StockRepository,
  OrderRepository,
};
