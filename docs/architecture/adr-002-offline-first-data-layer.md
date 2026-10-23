# ADR-002 — Offline-first data layer (local SQLite owned by Electron)

**Status:** Accepted (v1 commitment)
**Date:** 2026-08-28
**Supersedes:** the "desktop convenience / offline is a future enhancement"
treatment in `PRODUCT_READINESS.md` §2.2.

## Context

Co-op's v1 promise is being made explicit and non-negotiable:

> **Co-op keeps your core business running even when the internet goes down,
> and syncs your work back to the cloud when connectivity returns.**

Positioning:

> **"Run your business anywhere. Co-op works offline and syncs when you're
> back online."**

Today the app is `React → FastAPI → Postgres`. That cannot work offline.

## Decision

Co-op becomes **offline-first with a local SQLite database owned by Electron**.
The React UI never calls FastAPI directly for core data operations; it always
goes through a local repository/data layer:

```
React UI
  ↓
Co-op Repository (local-first)
  ├── local SQLite  (immediate source of truth)
  └── sync engine  →  FastAPI  →  PostgreSQL
```

### Offline boundary (v1)

**Works offline:** Dashboard · Products · Inventory · Customers · Orders ·
order status changes · local invoices · Reports · CSV/XLSX import ·
locally-calculated deterministic insights.

**Requires internet:** real LLM calls · AI model-based explanations · cloud
billing/payment · cloud account auth/refresh · anything depending on an
external service.

Deterministic, locally-calculated insights (the briefing/reporting engine)
keep working offline; the *model-based* assistant degrades to an honest
"Zeno is unavailable offline — your data and workflows remain available."

## Consequences & rules (non-negotiable)

1. **The browser does not cache the database.** Electron owns SQLite; the
   renderer never touches the DB directly. Access is via `preload.js` → IPC
   → main process → SQLite, preserving the existing security posture
   (`contextIsolation: true`, `nodeIntegration: false`).

2. **Local SQLite is the immediate source of truth.** An offline write is a
   local transaction: the UI updates immediately, a `sync_queue` row is
   created, and a "pending sync" indicator is shown. We never fail a core
   write with "you're offline."

3. **Client-generated IDs.** Every syncable entity carries a client
   `client_id` (ULID — sortable, time-ordered) generated locally, because the
   server is unavailable offline. The server maps `client_id → server id` on
   sync.

4. **Every write is idempotent.** Syncable operations carry an idempotency
   key (`client_id` + operation). The server dedupes on it, so a retried
   offline order is applied once, not twice.

5. **Inventory syncs as operations, not values.** We sync a `stock movement`
   (a signed `change` + `reason`), never a final stock number, so the server
   can re-apply its business rules. This reuses the existing stock-movement
   ledger.

6. **Start one-way.** v1 sync is primarily **offline writes → cloud**.
   Cloud→local refresh reuses the existing list endpoints. Bidirectional
   conflict resolution is a later sub-phase with defined rules (orders =
   straightforward; customers = merge on `client_id`/email, flag don't
   blind-merge; products = `client_id`/SKU, flag conflicts).

7. **The server never trusts the offline client.** A synced order is
   re-validated server-side (customer, products, prices, stock, status).

8. **Sync state is always visible** (Synced / Offline — saved on this device
   / Syncing… / N need attention). Synchronization is never hidden.

## Phasing (this is a major phase, not one pass)

- **OFFLINE 1 — Local database:** SQLite, schema, migrations, repositories,
  IPC. *(This phase.)*
- **OFFLINE 2 — Local-first writes:** Products / Customers / Orders /
  Inventory through the repository layer.
- **OFFLINE 3 — Sync engine:** queue, push, retry, idempotency,
  connectivity.
- **OFFLINE 4 — Conflicts:** orders → customers → products → inventory
  (operation-based).
- **OFFLINE 5 — UX:** offline indicator, sync status, sync errors, manual
  sync, conflict resolution.
- **OFFLINE 6 — Testing:** online / offline / offline→online / interruption /
  duplicate sync / failed sync / conflict / restart-while-unsynced.

## Driver note

The data layer is written against a thin driver contract with two adapters:
`better-sqlite3` (production Electron) and `node:sqlite` (Node ≥ 22.5, used
for the test suite). This keeps the data-layer logic identical and testable
outside a full Electron runtime.

**Packaging note:** `better-sqlite3` is a native module. At desktop-package
time it must be rebuilt against Electron's ABI (e.g. `@electron/rebuild` /
electron-builder's postinstall) so the prebuilt Node binary isn't loaded in
the Electron runtime. This is a standard step and belongs to the desktop
packaging sub-phase (OFFLINE 5/6), where an actual `electron-builder` build
can verify it.
