/**
 * Co-op desktop — secure preload bridge (ADR-002).
 *
 * Exposes a minimal, namespaced, promise-based API to the renderer via
 * contextBridge. The renderer NEVER touches Node or SQLite directly:
 *
 *   React renderer
 *     ↓ window.coop.db.*  (this file)
 *     ↓ IPC (ipcRenderer.invoke)
 *     ↓ main process (allow-listed data-layer methods)
 *     ↓ local SQLite
 *
 * Security posture is preserved: contextIsolation stays ON, nodeIntegration
 * stays OFF. Only the explicit methods below cross the bridge — there is no
 * generic "call any method" channel.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Single IPC channel; the main process allow-lists which methods may run.
const call = (method, arg) => ipcRenderer.invoke('coop:db', { method, arg });

contextBridge.exposeInMainWorld('coop', {
  // Local-first core data operations (OFFLINE 1/2 data layer).
  db: {
    businessEnsure: (b) => call('businessEnsure', b),
    businessGet: (id) => call('businessGet', id),
    businessFirst: () => call('businessFirst', null),
    customerCreate: (a) => call('customerCreate', a),
    customerUpdate: (a) => call('customerUpdate', a),
    customerDelete: (id) => call('customerDelete', id),
    customerGet: (id) => call('customerGet', id),
    customerList: (a) => call('customerList', a),
    productCreate: (a) => call('productCreate', a),
    productUpdate: (a) => call('productUpdate', a),
    productDelete: (id) => call('productDelete', id),
    productGet: (id) => call('productGet', id),
    productList: (a) => call('productList', a),
    orderCreate: (a) => call('orderCreate', a),
    orderSetStatus: (a) => call('orderSetStatus', a),
    orderGet: (id) => call('orderGet', id),
    orderList: (a) => call('orderList', a),
    orderListDetailed: (a) => call('orderListDetailed', a),
    orderItemsByOrder: (a) => call('orderItemsByOrder', a),
    stockAdjust: (a) => call('stockAdjust', a),
    stockMovements: (a) => call('stockMovements', a),
    customerDiscardLocal: (id) => call('customerDiscardLocal', id),
    productDiscardLocal: (id) => call('productDiscardLocal', id),
    stockSetLocal: (a) => call('stockSetLocal', a),
  },
  // Sync engine surface (OFFLINE 3). The renderer runs the pull/push cycle
  // (it holds the Clerk-authenticated API client); these cross the bridge
  // to the main-process mirror + queue.
  sync: {
    status: () => call('syncStatus', null),
    pendingOps: () => call('syncPendingOps', null),
    applyPushOutcome: (result) => call('syncApplyPushOutcome', result),
    ingestMirror: (payload) => call('syncIngestMirror', payload),
    pullCursor: () => call('syncPullCursor', null),
    pendingOrderIds: () => call('syncPendingOrderIds', null),
    setSyncing: (b) => call('syncSetSyncing', b),
    // OFFLINE 4: parked conflicts (structured; OFFLINE 5 will resolve them).
    conflicts: () => call('syncConflicts', null),
    // OFFLINE 5: resolution actions.
    requeue: (a) => call('syncRequeue', a),
    resolveConflict: (a) => call('syncResolveConflict', a),
    // Full sync status pushed from main (mirror ready, pending, last sync).
    onStatus: (cb) => {
      ipcRenderer.on('coop:sync', (_e, data) => cb(data));
    },
  },
  // Authoritative connectivity (Electron net.isOnline) pushed from main.
  onNet: (cb) => {
    ipcRenderer.on('coop:net', (_e, data) => cb(data));
  },
  // Hand a URL to the user's real browser (payments, receipts, docs).
  // http/https only — the main process re-checks, the renderer is not trusted.
  shell: {
    openExternal: (url) =>
      ipcRenderer.invoke('coop:shell', { method: 'openExternal', arg: url }),
  },
  // Local database backup & restore (PRD Phase 4 "Backup system").
  backup: {
    create: () => ipcRenderer.invoke('coop:backup', { method: 'create' }),
    restore: () => ipcRenderer.invoke('coop:backup', { method: 'restore' }),
  },
});
