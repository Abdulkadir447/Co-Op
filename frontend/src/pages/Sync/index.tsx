/**
 * Sync Center (OFFLINE 5) — the home of "needs attention".
 *
 * Shows what the sync engine knows:
 *   - parked CONFLICTS, each with its structured local/cloud context and
 *     type-specific resolution choices (executed through the repository /
 *     sync pathway — never direct DB writes);
 *   - the PENDING queue (what will upload when online);
 *   - the last sync + connection state.
 *
 * In a plain browser (no local data layer) it says so, honestly.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudSyncOutlined, InboxOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { radius, spacing, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import PageHeader from '../../components/layout/PageHeader';
import { CoopCard, CoopEmptyState, CoopLoading } from '../../components/ui';
import { useSyncStatus } from '../../sync/syncStatus';
import {
  getConflicts,
  getPendingOps,
  isLocalAvailable,
  type ParkedConflict,
} from '../../sync/localDb';
import { getLocalBundle } from '../../analytics/localData';
import ConflictCard from './ConflictCard';

const ENTITY_LABEL: Record<string, string> = {
  customer: 'Customer',
  product: 'Product',
  order: 'Order',
  order_item: 'Order line',
  stock_movement: 'Stock movement',
};

const SyncPage: React.FC = () => {
  const navigate = useNavigate();
  const { colors } = useCoopTheme();
  const status = useSyncStatus();
  const [conflicts, setConflicts] = useState<ParkedConflict[] | null>(null);
  const [pending, setPending] = useState<Array<{ entity: string; operation: string }>>([]);

  const local = isLocalAvailable();

  const load = useCallback(async () => {
    if (!local) return;
    const [c, p] = await Promise.all([getConflicts(), getPendingOps()]);
    setConflicts(c);
    setPending(p.map((o) => ({ entity: o.entity, operation: o.operation })));
  }, [local]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-fetch when the sync state changes (a cycle finished, a resolution
  // moved an op) and while a cycle is in flight.
  useEffect(() => {
    void load();
  }, [status.pending, status.conflicts, status.syncing, load]);

  // Product-name lookup for stock-movement conflicts (local bundle).
  const [prodNames, setProdNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!local) return;
    void getLocalBundle()
      .then((b) => setProdNames(new Map(b.products.map((p) => [p.client_id ?? '', p.name]))))
      .catch(() => undefined);
  }, [local, conflicts?.length]);

  if (!local) {
    return (
      <div>
        <PageHeader title="Sync" subtitle="Offline sync runs in the CO OP desktop app." onBack={() => navigate(-1)} backLabel="Back" />
        <CoopCard>
          <CoopEmptyState
            title="Sync is a desktop-app feature"
            description="The local mirror, the sync queue and conflict resolution live in the CO OP desktop app (Electron). In the browser, everything syncs directly with the cloud."
          />
        </CoopCard>
      </div>
    );
  }

  const pendingByEntity = new Map<string, number>();
  for (const p of pending) pendingByEntity.set(p.entity, (pendingByEntity.get(p.entity) ?? 0) + 1);

  return (
    <div>
      <PageHeader
        onBack={() => navigate(-1)}
        backLabel="Back"
        title="Sync"
        subtitle="Your device, the cloud, and anything that needs your decision."
        actions={
          <span style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.outline, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <CloudSyncOutlined style={{ color: status.syncing ? colors.primary : colors.outline }} />
            {status.connection === 'offline'
              ? 'Offline — saved on this device'
              : status.lastSyncAt
                ? `Last sync ${dayjs(status.lastSyncAt).format('HH:mm')}`
                : 'Waiting for first sync'}
          </span>
        }
      />

      {/* Stat row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: spacing.lg, flexWrap: 'wrap' }}>
        {[
          { label: 'Pending upload', value: status.pending, tone: status.pending > 0 ? colors.primary : colors.outline },
          { label: 'Need attention', value: status.conflicts, tone: status.conflicts > 0 ? colors.warning : colors.outline },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              flex: '1 1 140px',
              border: `1px solid ${colors.borderSubtle}`,
              borderRadius: radius.lg,
              background: colors.surfaceContainerLowest,
              padding: '12px 18px',
            }}
          >
            <div style={{ ...type.labelCaps, fontSize: 11, color: colors.outline }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.tone, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Needs attention */}
      <div style={{ ...type.sectionHeading, fontSize: 14, color: colors.onSurfaceVariant, marginBottom: 10 }}>
        Needs attention
      </div>
      {conflicts === null ? (
        <CoopLoading height={120} label="Loading conflicts…" />
      ) : conflicts.length === 0 ? (
        <CoopCard>
          <CoopEmptyState
            title="Nothing needs your attention"
            description="When a change on this device can't be applied to the cloud automatically (for example, the same email or SKU already exists), it appears here with both versions so you can decide."
          />
        </CoopCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {conflicts.map((c) => (
            <ConflictCard
              key={c.id}
              conflict={c}
              productName={(clientId: string) => prodNames.get(clientId) ?? clientId}
              onResolved={() => void load()}
            />
          ))}
        </div>
      )}

      {/* Pending upload */}
      <div style={{ ...type.sectionHeading, fontSize: 14, color: colors.onSurfaceVariant, margin: `${spacing.lg}px 0 10px` }}>
        Pending upload
      </div>
      <CoopCard>
        {pending.length === 0 ? (
          <div style={{ ...type.bodyCompact, color: colors.outline, display: 'flex', alignItems: 'center', gap: 8 }}>
            <InboxOutlined />
            {status.connection === 'offline'
              ? 'Offline changes will be uploaded automatically when you reconnect.'
              : 'Nothing waiting to sync.'}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[...pendingByEntity.entries()].map(([entity, n]) => (
              <span
                key={entity}
                style={{
                  ...type.bodyCompact, fontSize: 12.5, fontWeight: 600,
                  color: colors.primary, background: colors.primaryContainer,
                  padding: '4px 12px', borderRadius: 9999,
                }}
              >
                {n} × {ENTITY_LABEL[entity] ?? entity}
              </span>
            ))}
            <span style={{ ...type.bodyCompact, fontSize: 12.5, color: colors.outline, alignSelf: 'center' }}>
              {status.connection === 'offline' ? 'Uploads when you reconnect.' : 'Syncing…'}
            </span>
          </div>
        )}
      </CoopCard>
    </div>
  );
};

export default SyncPage;
