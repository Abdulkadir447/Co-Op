/**
 * Migration 0001 — core local schema (offline-first, ADR-002).
 *
 * Mirrors the server's core entities with the local additions every offline
 * entity needs:
 *   * client_id  — client-generated ULID, the idempotency key for sync.
 *   * updated_at — drives change tracking / pull cursors.
 *   * deleted_at — soft delete (matches the server's soft-delete model).
 *
 * `stock_movements` is the operation-based ledger: offline inventory changes
 * are recorded as signed movements and synced as operations, never as a final
 * stock number (ADR-002 rule 5).
 *
 * `sync_queue` holds offline writes awaiting push; `sync_meta` holds cursors.
 */
'use strict';

module.exports = {
  version: 1,
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS business (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'NGN',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL UNIQUE,
        business_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        address TEXT,
        deleted_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL UNIQUE,
        business_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sku TEXT,
        category TEXT,
        description TEXT,
        unit_price REAL,
        cost_price REAL,
        current_stock INTEGER NOT NULL DEFAULT 0,
        reorder_level INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_products_business_sku
        ON products(business_id, sku) WHERE sku IS NOT NULL AND deleted_at IS NULL;

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL UNIQUE,
        business_id INTEGER NOT NULL,
        customer_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        total_amount REAL NOT NULL DEFAULT 0,
        order_date TEXT,
        deleted_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_orders_business ON orders(business_id);
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL UNIQUE,
        business_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

      CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL UNIQUE,
        business_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        change INTEGER NOT NULL,
        reason TEXT NOT NULL,
        note TEXT,
        order_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_business ON stock_movements(business_id);

      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        entity TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        client_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, id);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_business ON sync_queue(business_id);

      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  },
};
