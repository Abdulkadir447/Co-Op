/**
 * OFFLINE 6 — real-runtime E2E harness.
 *
 * Proves the offline promise with the REAL production code:
 *   * the real data-layer app (electron/dataLayerApp.js — the handler table
 *     main.js serves over IPC),
 *   * the real renderer sync stack (frontend/src/sync compiled),
 *   * the real FastAPI backend over HTTP (spawned uvicorn),
 *   * a real file-backed SQLite database that survives process death,
 *   * real process lifecycles (boot / SIGKILL / restart / graceful quit),
 *   * real network state (the cloud server is stopped and started = Wi-Fi).
 *
 * Scenarios (per the OFFLINE 6 spec):
 *   S1  launch online -> mirror -> offline -> operate (customer/product/
 *       order/status) -> local data fully visible
 *   S2  reconnect -> auto-sync -> cloud receives changes -> queue empties
 *   S4  repeated syncs -> no duplicates (orders/stock/customers/products)
 *   S3  SIGKILL with pending ops -> restart -> queue survives -> sync
 *       exactly once
 *   S5  offline conflict -> parked -> Sync Center view -> resolve -> synced
 *   S6  cold start OFFLINE on an initialized device -> mirror trusted ->
 *       dashboard data available -> operate -> reconnect -> syncs
 *
 * Run:  node electron/e2e/run-e2e.js   (build the renderer first:
 *       node electron/e2e/build-renderer.js — done automatically here)
 */
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const { pythonExecutable, sqliteUrl } = require('../platform');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
let PORT = null; // chosen in main() — a free port per run (no stale-server collisions)
let API = null;
const TOKEN = 'e2e';
const DEADLINE_MS = 45_000;
const POLL_MS = 400;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coop-e2e-'));
const CLOUD_DB = path.join(tmp, 'cloud.db');
const DEVICE_DB = path.join(tmp, 'device.db');

let failures = 0;
let passes = 0;
function check(name, cond, extra) {
  if (cond) {
    passes += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.log(`  ✗ FAIL: ${name}${extra != null ? ` — ${JSON.stringify(extra)}` : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(label, fn, deadline = DEADLINE_MS) {
  const end = Date.now() + deadline;
  let last;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() > end) throw new Error(`timeout waiting for: ${label} (last: ${JSON.stringify(last)})`);
    await sleep(POLL_MS);
  }
}

// ---------------------------------------------------------------------------
// Cloud (real FastAPI backend; "Wi-Fi off" = kill it, "on" = start it)
// ---------------------------------------------------------------------------
let cloudProc = null;
function startCloud() {
  // Windows venvs live in Scripts\python.exe, POSIX in bin/python.
  const py = pythonExecutable(ROOT, process.platform);
  cloudProc = spawn(py, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', String(PORT), '--log-level', 'warning'], {
    cwd: ROOT,
    env: {
      ...process.env,
      COOP_ENV: 'testing',
      DATABASE_URL: sqliteUrl(CLOUD_DB, { platform: process.platform }),
      COOP_TEST_AUTH_USER: 'e2e-owner',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  cloudProc.stdout.on('data', () => {});
  cloudProc.stderr.on('data', (d) => { if (process.env.E2E_VERBOSE) process.stderr.write(`[cloud] ${d}`); });
  return poll('cloud up', async () => {
    try {
      const r = await fetch(`${API}/healthcheck`);
      return r.ok;
    } catch {
      return false;
    }
  }, 30_000);
}
function stopCloud() {
  if (cloudProc) { cloudProc.kill('SIGKILL'); cloudProc = null; }
}

async function cloud(pathname, body) {
  const res = await fetch(API + pathname, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`cloud ${pathname} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}
async function cloudList(pathname, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const data = await cloud(pathname + (qs ? `?${qs}` : ''));
  return Array.isArray(data) ? data : data.items;
}

// Direct reads of the device's SQLite file (read-only; WAL allows this
// while the device process holds the writer connection).
function deviceDb() {
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(DEVICE_DB, { readOnly: true });
}

// ---------------------------------------------------------------------------
// Device (the real data-layer app + real renderer engine, over stdio RPC)
// ---------------------------------------------------------------------------
let deviceProc = null;
function startDevice(startOffline) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(__dirname, 'app-process.js'),
      '--db', DEVICE_DB,
      '--api-url', API,
      '--token', TOKEN,
    ];
    if (startOffline) args.push('--start-offline');
    deviceProc = spawn(process.execPath, args, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    deviceProc.stderr.on('data', (d) => {
      const s = String(d);
      if (!s.includes('ExperimentalWarning') && process.env.E2E_VERBOSE) process.stderr.write(`[device] ${s}`);
    });
    const pending = new Map();
    let buf = '';
    let settled = false;
    const fail = (e) => { if (!settled) { settled = true; reject(e); } };
    deviceProc.on('exit', (code) => {
      if (!settled) fail(new Error(`device exited early (code ${code})`));
    });
    deviceProc.stdout.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.ready) { settled = true; resolve(deviceProc); return; }
        if (msg.id != null && pending.has(msg.id)) {
          const { resolve: r, reject: j } = pending.get(msg.id);
          pending.delete(msg.id);
          msg.error != null ? j(new Error(msg.error)) : r(msg.result);
        }
      }
    });
    let nextId = 1;
    deviceProc.request = (op, arg) => new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      deviceProc.stdin.write(JSON.stringify({ id, op, arg }) + '\n');
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error(`rpc timeout: ${op}`)); }
      }, 20_000);
    });
    setTimeout(fail, 30_000);
  });
}
const stopDevice = (signal = 'SIGTERM') => {
  if (!deviceProc) return;
  const p = deviceProc;
  deviceProc = null;
  p.stdin.end();
  p.kill(signal);
};

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
async function s1_offline_operation() {
  console.log('\nS1 — launch online, mirror, go offline, operate, data stays visible');
  await startCloud();
  // Seed the cloud with a product + customer BEFORE the device boots, so
  // the initial pull mirrors them (the device later references them).
  await cloud('/products', { sku: 'S1-CHAIR', name: 'Cloud Chair', unit_price: 100, current_stock: 25, cost_price: 40, reorder_level: 5 });
  await cloud('/customers', { full_name: 'Cloud Customer', email: 'cloud-cust@x.com' });

  const dev = await startDevice(false);
  await poll('initial mirror (mirrorReady)', async () => (await dev.request('status')).mirrorReady);
  const mirror = await dev.request('productList', { business_id: await (await dev.request('businessFirst')).id, opts: { limit: 100 } });
  check('initial pull mirrored the cloud product', mirror.some((p) => p.sku === 'S1-CHAIR'), mirror);

  // Wi-Fi off.
  await dev.request('setOnline', false);
  const st = await dev.request('status');
  check('device reports offline', st.online === false);

  const bizId = (await dev.request('businessFirst')).id;
  const custs = await dev.request('customerList', { business_id: bizId });
  const prods = await dev.request('productList', { business_id: bizId });
  const cloudCust = custs.find((c) => c.email === 'cloud-cust@x.com');
  const cloudProd = prods.find((p) => p.sku === 'S1-CHAIR');
  check('mirrored customer + product readable offline', !!cloudCust && !!cloudProd);

  // Operate fully offline.
  const newCust = await dev.request('customerCreate', { business_id: bizId, data: { full_name: 'Offline Customer', email: 'off-cust@x.com' } });
  const newProd = await dev.request('productCreate', { business_id: bizId, data: { name: 'Offline Lamp', sku: 'S1-LAMP', unit_price: 30, cost_price: 12, current_stock: 10, reorder_level: 2 } });
  const order = await dev.request('orderCreate', { business_id: bizId, data: { customer_id: cloudCust.id, items: [{ product_id: newProd.id, quantity: 2, unit_price: 30 }] } });
  await dev.request('orderSetStatus', { business_id: bizId, order_id: order.id, status: 'confirmed' });
  check('offline order created with correct total', order.total_amount === 60, order);

  const st2 = await dev.request('status');
  check('queue holds the offline ops', st2.pending >= 5, st2);
  check('conflicts: none', st2.conflicts === 0);

  // "Dashboard/reports data available offline" = the local read handlers
  // (what the local analytics bundle consumes) return complete data.
  const det = await dev.request('orderListDetailed', { business_id: bizId, opts: { limit: 100 } });
  const row = det.find((o) => o.id === order.id);
  check('offline order visible in the list with customer name', !!row && row.customer_name === 'Cloud Customer', row);
  const prods2 = await dev.request('productList', { business_id: bizId });
  check('offline product visible offline', prods2.some((p) => p.sku === 'S1-LAMP'));
  const custs2 = await dev.request('customerList', { business_id: bizId });
  check('offline customer visible offline', custs2.some((c) => c.email === 'off-cust@x.com'));
  const mov = await dev.request('stockMovements', { business_id: bizId });
  check('offline stock movement recorded in the local ledger', mov.some((m) => m.change === -2));
  return dev;
}

async function s2_reconnect_auto_sync(dev) {
  console.log('\nS2 — reconnect: sync automatically, cloud receives, queue empties');
  await startCloud();
  await dev.request('setOnline', true); // the engine's online event triggers a cycle

  await poll('queue drained (auto-sync)', async () => (await dev.request('status')).pending === 0);
  const custs = await cloudList('/customers', { limit: 100 });
  check('cloud received the offline customer', custs.some((c) => c.email === 'off-cust@x.com'));
  const plist = await cloudList('/products', { limit: 100 });
  check('cloud received the offline product', plist.some((p) => p.sku === 'S1-LAMP'));
  const olist = await cloudList('/orders', { limit: 100 });
  const ord = olist.find((o) => o.total_amount === 60 && o.status === 'confirmed');
  check('cloud received the offline order with its status', !!ord, olist.map((o) => [o.total_amount, o.status]));
  const st = await dev.request('status');
  check('device reports synced (pending 0, conflicts 0)', st.pending === 0 && st.conflicts === 0, st);
}

async function s4_idempotent_repeat(dev) {
  console.log('\nS4 — repeated sync: no duplicates anywhere');
  const bizId = (await dev.request('businessFirst')).id;
  const before = {
    customers: (await cloudList('/customers', { limit: 100 })).length,
    products: (await cloudList('/products', { limit: 100 })).length,
    orders: (await cloudList('/orders', { limit: 100 })).length,
  };
  // Force extra cycles on top of whatever the engine is already doing.
  await dev.request('syncNow');
  await dev.request('syncNow');
  await poll('settled', async () => (await dev.request('status')).pending === 0, 20_000).catch(() => {});
  await sleep(1500); // let in-flight cycles land
  const after = {
    customers: (await cloudList('/customers', { limit: 100 })).length,
    products: (await cloudList('/products', { limit: 100 })).length,
    orders: (await cloudList('/orders', { limit: 100 })).length,
  };
  check('no duplicate customers', after.customers === before.customers, { before, after });
  check('no duplicate products', after.products === before.products, { before, after });
  check('no duplicate orders', after.orders === before.orders, { before, after });

  // Stock: the S1 order (2 x S1-LAMP) deducted exactly once (lamp 10 -> 8);
  // the chair was not ordered, so its stock is untouched.
  const plist = await cloudList('/products', { limit: 100 });
  const chair = plist.find((p) => p.sku === 'S1-CHAIR');
  const lamp = plist.find((p) => p.sku === 'S1-LAMP');
  check('untouched product stock is unchanged (chair 25)', chair.current_stock === 25, chair.current_stock);
  check('lamp stock reflects the single deduction (10->8)', lamp.current_stock === 8, lamp.current_stock);
}

async function s3_kill_with_pending_ops(dev) {
  console.log('\nS3 — SIGKILL with pending ops: queue survives, syncs exactly once');
  stopCloud(); // offline again
  await dev.request('setOnline', false);
  const bizId = (await dev.request('businessFirst')).id;
  const prods = await dev.request('productList', { business_id: bizId });
  const custs = await dev.request('customerList', { business_id: bizId });
  const prod = prods.find((p) => p.sku === 'S1-CHAIR');
  const cust = custs.find((c) => c.email === 'cloud-cust@x.com');
  await dev.request('customerCreate', { business_id: bizId, data: { full_name: 'Kill Customer', email: 'kill@x.com' } });
  await dev.request('orderCreate', { business_id: bizId, data: { customer_id: cust.id, items: [{ product_id: prod.id, quantity: 1, unit_price: 100 }] } });
  const pendingBefore = (await dev.request('status')).pending;
  check('pending ops exist right before the kill', pendingBefore >= 3, pendingBefore);
  stopDevice('SIGKILL'); // hard kill WITH ops in the queue
  await sleep(500);

  // Restart the device (offline) — the queue must be intact.
  const dev2 = await startDevice(false); // starts "online" flag true, but cloud is down
  await dev2.request('setOnline', false); // be honest: cloud is down
  const st = await dev2.request('status');
  check('queue survived the kill (pending ops intact)', st.pending === pendingBefore, { pending: st.pending, expected: pendingBefore });
  check('mirror trusted on restart (mirrorReady from disk)', st.mirrorReady === true);

  const db = deviceDb();
  const pending = db.prepare("SELECT COUNT(*) n FROM sync_queue WHERE status='pending'").get().n;
  check('device SQLite on disk holds the pending queue', pending === pendingBefore, pending);
  db.close();

  await startCloud();
  await dev2.request('setOnline', true);
  await poll('queue drained after restart', async () => (await dev2.request('status')).pending === 0);

  // Exactly-once: the S1 data still appears exactly once on the cloud.
  const orders = await cloudList('/orders', { limit: 100 });
  const s1orders = orders.filter((o) => o.total_amount === 60 && o.status === 'confirmed');
  check('S1 order exists exactly once after kill+resync', s1orders.length === 1, s1orders.length);
  const killOrders = orders.filter((o) => o.total_amount === 100);
  check('kill-scenario order synced exactly once', killOrders.length === 1, killOrders.length);
  const customers = await cloudList('/customers', { limit: 100 });
  check('S1 customer exists exactly once', customers.filter((c) => c.email === 'off-cust@x.com').length === 1);
  check('kill-scenario customer synced exactly once', customers.filter((c) => c.email === 'kill@x.com').length === 1);
  return dev2;
}

async function s5_conflict_resolve(dev) {
  console.log('\nS5 — offline conflict: parks, Sync Center shows it, resolve, synced');
  // Cloud already has a customer with dup@x.com (created live, no client_id).
  // Seed it while ONLINE and wait for the mirror to have it, so the conflict
  // scenario is deterministic regardless of pull timing.
  await cloud('/customers', { full_name: 'Cloud Dup', email: 'dup@x.com' });
  await dev.request('syncNow');
  await poll('Cloud Dup mirrored locally', async () => {
    const db = deviceDb();
    const r = db.prepare(`SELECT 1 FROM customers WHERE email='dup@x.com'`).get();
    db.close();
    return !!r;
  }, 60_000);

  stopCloud();
  await dev.request('setOnline', false);
  const bizId = (await dev.request('businessFirst')).id;
  await dev.request('customerCreate', { business_id: bizId, data: { full_name: 'Local Dup', email: 'dup@x.com' } });
  const pendingBefore = (await dev.request('status')).pending;
  check('conflicting op queued while offline', pendingBefore >= 1);

  await startCloud();
  await dev.request('setOnline', true);
  await poll('conflict parked', async () => {
    const s = await dev.request('status');
    return s.conflicts === 1 && s.pending === 0;
  });

  // The Sync Center's view: the structured conflict (what ConflictCard renders).
  const conflicts = await dev.request('syncConflicts');
  check('Sync Center lists exactly one conflict', conflicts.length === 1, conflicts.length);
  const c = conflicts[0];
  check('conflict reason is email_conflict', c.conflict.reason === 'email_conflict', c.conflict);
  check('conflict carries the local attempt', c.conflict.local && c.conflict.local.email === 'dup@x.com', c.conflict.local);
  check('conflict carries the cloud record', c.conflict.server && c.conflict.server.email === 'dup@x.com' && c.conflict.server.full_name === 'Cloud Dup', c.conflict.server);
  check('conflict operation is excluded from the push queue', (await dev.request('status')).pending === 0);

  // Resolve: use a new email (the Sync Center's "Use this email" choice).
  await dev.request('syncRequeue', { queueId: c.id, payloadOverride: { email: 'local-dup-resolved@x.com' } });
  const st = await dev.request('status');
  check('resolution re-queues a validated operation', st.pending === 1 && st.conflicts === 0, st);
  await poll('resolved op synced', async () => (await dev.request('status')).pending === 0);

  const customers = await cloudList('/customers', { limit: 100 });
  check('cloud has BOTH customers (no merge)',
    customers.some((c) => c.email === 'dup@x.com' && c.full_name === 'Cloud Dup') &&
    customers.some((c) => c.email === 'local-dup-resolved@x.com' && c.full_name === 'Local Dup'));
  check('conflict gone from the Sync Center', (await dev.request('syncConflicts')).length === 0);
  {
    const db = deviceDb();
    const rows = db.prepare(`SELECT email FROM customers WHERE business_id=? ORDER BY id`).all(bizId);
    const cursor = db.prepare(`SELECT value FROM sync_meta WHERE key='pull_cursor'`).get();
    console.log('  [diag S5] mirror customers:', JSON.stringify(rows.map((r) => r.email)), 'cursor:', cursor && cursor.value);
    db.close();
  }
}

async function s6_cold_start_offline(dev) {
  console.log('\nS6 — cold start OFFLINE on an initialized device');
  // Graceful shutdown while online; the mirror + queue stay on disk.
  stopDevice('SIGTERM');
  await sleep(700);

  stopCloud(); // the device boots with NO internet

  const dev2 = await startDevice(true); // --start-offline
  const st = await dev2.request('status');
  check('cold offline start: mirror trusted from disk (mirrorReady)', st.mirrorReady === true, st);
  {
    const db = deviceDb();
    const cursor = db.prepare(`SELECT value FROM sync_meta WHERE key='pull_cursor'`).get();
    console.log('  [diag S6] cursor at cold start:', cursor && cursor.value);
    db.close();
  }
  check('cold offline start: connection offline', st.online === false);
  check('cold offline start: nothing pending', st.pending === 0);

  // The dashboard's data is available from the mirror.
  const bizRow = await dev2.request('businessFirst');
  check('business row from the previous run is present', !!bizRow && !!bizRow.client_id, bizRow);
  const custs = await dev2.request('customerList', { business_id: bizRow.id });
  check('customers available offline (previous runs)', custs.some((c) => c.email === 'off-cust@x.com') && custs.some((c) => c.email === 'dup@x.com'), custs.map((c) => c.email));
  const prods = await dev2.request('productList', { business_id: bizRow.id });
  check('products available offline', prods.some((p) => p.sku === 'S1-CHAIR') && prods.some((p) => p.sku === 'S1-LAMP'));
  const orders = await dev2.request('orderListDetailed', { business_id: bizRow.id, opts: { limit: 100 } });
  check('orders available offline (with customer names)', orders.some((o) => o.total_amount === 60 && o.customer_name === 'Cloud Customer'));

  // The user can operate normally offline.
  const c = await dev2.request('customerCreate', { business_id: bizRow.id, data: { full_name: 'Cold Start Customer', email: 'cold@x.com' } });
  check('offline write works on a cold-started device', !!c.client_id && c.client_id.length === 26, c);
  const st2 = await dev2.request('status');
  check('the new write is queued (not lost, not pushed)', st2.pending === 1, st2);

  // Reconnect: the cold-started device syncs normally.
  await startCloud();
  await dev2.request('setOnline', true);
  await poll('cold-start device synced after reconnect', async () => (await dev2.request('status')).pending === 0);
  const customers = await cloudList('/customers', { limit: 100 });
  check('cold-start offline write reached the cloud', customers.some((c) => c.email === 'cold@x.com'));
  return dev2;
}

// ---------------------------------------------------------------------------
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = require('node:net').createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function main() {
  PORT = await getFreePort();
  API = `http://127.0.0.1:${PORT}`;
  console.log(`OFFLINE 6 E2E — workdir ${tmp} (cloud port ${PORT})`);
  const build = spawnSync(process.execPath, [path.join(__dirname, 'build-renderer.js')], { stdio: 'inherit' });
  if (build.status !== 0) { console.error('renderer build failed'); process.exit(1); }

  try {
    const dev1 = await s1_offline_operation();
    await s2_reconnect_auto_sync(dev1);
    await s4_idempotent_repeat(dev1);
    const dev2 = await s3_kill_with_pending_ops(dev1);
    await s5_conflict_resolve(dev2);
    await s6_cold_start_offline(dev2);
  } finally {
    stopDevice('SIGKILL');
    stopCloud();
  }

  console.log(`\n=== OFFLINE 6 E2E: ${passes} passed, ${failures} failed ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nE2E ABORTED:', e);
  stopDevice('SIGKILL');
  stopCloud();
  process.exit(2);
});
