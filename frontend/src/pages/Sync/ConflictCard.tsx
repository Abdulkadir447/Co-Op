/**
 * Sync Center — one parked conflict (OFFLINE 5).
 *
 * Renders the structured server context (local vs cloud, side by side) and
 * the type-specific choices. Every choice is executed through
 * sync/resolutions.ts — the repository/sync pathway — never direct DB
 * writes. After a resolution the card flashes "Resolved" and the parent
 * re-fetches (the op has moved on: synced/pending/discarded).
 */
import React, { useState } from 'react';
import { CheckCircleFilled, ExclamationCircleFilled, ReloadOutlined } from '@ant-design/icons';
import { radius, spacing, type } from '../../theme';
import { tint } from '../../theme/colors';
import { useCoopTheme } from '../../theme-provider';
import { formatCurrency } from '../Dashboard/kpiConfig';
import { CoopButton, CoopInput } from '../../components/ui';
import {
  CONFLICT_TITLES,
  ResolutionError,
  legalNextStatuses,
  resolveConflict,
  syncAfterResolution,
} from '../../sync/resolutions';
import { useApiClient } from '../../services/api/client';
import type { ParkedConflict } from '../../sync/localDb';

const str = (v: unknown): string => (v == null ? '—' : String(v));

interface ConflictCardProps {
  conflict: ParkedConflict;
  /** Product name lookup for stock-movement conflicts (local bundle). */
  productName?: (clientId: string) => string;
  onResolved: () => void;
}

const ConflictCard: React.FC<ConflictCardProps> = ({ conflict, productName, onResolved }) => {
  const { colors } = useCoopTheme();
  const api = useApiClient();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const conf = conflict.conflict;
  if (!conf) return null;
  const server = (conf.server ?? {}) as Record<string, unknown>;
  const local = (conf.local ?? {}) as Record<string, unknown>;
  const payload = conflict.payload ?? {};

  const act = async (choice: { act: string; value?: string }) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await resolveConflict(conflict, choice, api);
      syncAfterResolution();
      setDone(r.detail);
      window.setTimeout(onResolved, 900);
    } catch (e) {
      setError(e instanceof ResolutionError ? e.message : 'Resolution failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------
  // Per-reason description + comparison rows + actions
  // ------------------------------------------------------------------
  let description = conf.error;
  let rows: Array<{ label: string; local: React.ReactNode; cloud: React.ReactNode }>;
  let actions: React.ReactNode;

  if (conf.reason === 'email_conflict') {
    description = `“${str(local.email)}” is already used by ${str(server.full_name)} in the cloud.`;
    rows = [
      { label: 'Name', local: str(payload.full_name ?? local.full_name), cloud: str(server.full_name) },
      { label: 'Email', local: str(payload.email ?? local.email), cloud: str(server.email) },
    ];
    actions = (
      <>
        <CoopInput
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null); }}
          placeholder="New email for this customer"
          style={{ flex: 1, minWidth: 200 }}
        />
        <CoopButton variant="primary" disabled={busy || !input.trim()} onClick={() => void act({ act: 'new_value', value: input })}>
          Use this email
        </CoopButton>
        <CoopButton variant="secondary" disabled={busy} onClick={() => void act({ act: 'keep_cloud' })}>
          Keep cloud
        </CoopButton>
      </>
    );
  } else if (conf.reason === 'sku_conflict') {
    description = `SKU ${str(local.sku)} is already used by ${str(server.name)} in the cloud.`;
    rows = [
      { label: 'Name', local: str(payload.name ?? local.name), cloud: str(server.name) },
      { label: 'SKU', local: str(payload.sku ?? local.sku), cloud: str(server.sku) },
      {
        label: 'Price',
        local: payload.unit_price != null ? formatCurrency(Number(payload.unit_price)) : '—',
        cloud: server.unit_price != null ? formatCurrency(Number(server.unit_price)) : '—',
      },
    ];
    actions = (
      <>
        <CoopInput
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null); }}
          placeholder="New SKU"
          style={{ flex: 1, minWidth: 160 }}
        />
        <CoopButton variant="primary" disabled={busy || !input.trim()} onClick={() => void act({ act: 'new_value', value: input })}>
          Use this SKU
        </CoopButton>
        <CoopButton variant="secondary" disabled={busy} onClick={() => void act({ act: 'keep_cloud' })}>
          Keep cloud
        </CoopButton>
      </>
    );
  } else if (conf.reason === 'insufficient_stock') {
    const change = Number(local.change ?? 0);
    const prodName = productName ? productName(str(payload.product_client_id)) : str(payload.product_client_id);
    description = `The cloud refused this movement (its stock is ${str(server.current_stock)}, so it cannot go below zero).`;
    rows = [
      { label: 'Product', local: prodName, cloud: prodName },
      { label: 'Attempted change', local: `${change > 0 ? '+' : ''}${change} (${str(local.reason)})`, cloud: 'refused' },
      { label: 'Stock', local: `${str(server.current_stock)} (cloud value)`, cloud: str(server.current_stock) },
    ];
    actions = (
      <>
        <CoopButton variant="secondary" disabled={busy} onClick={() => void act({ act: 'retry' })} icon={<ReloadOutlined />}>
          Retry (e.g. after restocking)
        </CoopButton>
        <CoopButton variant="secondary" disabled={busy} onClick={() => void act({ act: 'discard' })}>
          Discard movement, align local stock
        </CoopButton>
      </>
    );
  } else if (conf.reason === 'invalid_transition') {
    const cloudStatus = str(server.status);
    description = `The cloud order is “${cloudStatus}”; moving it to “${str(local.status)}” is not a legal step.`;
    const next = legalNextStatuses(cloudStatus);
    rows = [
      { label: 'Status', local: str(local.status), cloud: cloudStatus },
    ];
    actions = next.length > 0 ? (
      <>
        <select
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null); }}
          aria-label="Set status to"
          style={{
            flex: 1, minWidth: 160, height: 36, borderRadius: radius.md,
            border: `1px solid ${colors.outlineVariant}`, background: colors.surfaceContainerLowest,
            color: colors.onSurface, padding: '0 10px', fontFamily: 'inherit', fontSize: 13,
          }}
        >
          <option value="">Set status to…</option>
          {next.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <CoopButton variant="primary" disabled={busy || !input} onClick={() => void act({ act: 'set_status', value: input })}>
          Set status
        </CoopButton>
        <CoopButton variant="secondary" disabled={busy} onClick={() => void act({ act: 'keep_cloud' })}>
          Keep cloud status
        </CoopButton>
      </>
    ) : (
      <CoopButton variant="secondary" disabled={busy} onClick={() => void act({ act: 'keep_cloud' })}>
        Keep cloud status
      </CoopButton>
    );
  } else {
    // not_found + anything future: show the attempted values, offer discard.
    rows = Object.entries(payload)
      .filter(([, v]) => v != null)
      .slice(0, 5)
      .map(([k, v]) => ({ label: k, local: str(v), cloud: 'no record' }));
    actions = (
      <CoopButton variant="secondary" disabled={busy} onClick={() => void act({ act: 'discard' })}>
        Discard this operation
      </CoopButton>
    );
  }

  // ------------------------------------------------------------------
  return (
    <div
      style={{
        border: `1px solid ${tint(colors.warning, 0.4)}`,
        borderTop: `2px solid ${colors.warning}`,
        borderRadius: radius.lg,
        background: colors.surfaceContainerLowest,
        padding: spacing.lg,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {done ? (
          <CheckCircleFilled style={{ color: colors.success, fontSize: 18 }} />
        ) : (
          <ExclamationCircleFilled style={{ color: colors.warning, fontSize: 18 }} />
        )}
        <span style={{ ...type.sectionHeading, fontSize: 15, color: colors.onSurface }}>
          {done ? 'Resolved' : CONFLICT_TITLES[conf.reason] ?? 'Sync conflict'}
        </span>
        <span
          style={{
            ...type.bodyCompact, fontSize: 11, fontWeight: 600, color: colors.warningText,
            background: tint(colors.warning, 0.14), padding: '2px 8px', borderRadius: 9999,
          }}
        >
          {conf.reason}
        </span>
        <span style={{ ...type.bodyCompact, fontSize: 11, color: colors.onSurfaceMuted, marginLeft: 'auto' }}>
          {conflict.entity} · {conflict.operation}
        </span>
      </div>

      <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginBottom: 12 }}>{description}</div>

      {/* Local vs cloud, side by side */}
      {rows.length > 0 && (
        <div
          style={{
            display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: '6px 12px',
            padding: '10px 14px', borderRadius: radius.md,
            background: colors.surfaceContainerLow, marginBottom: 12,
          }}
        >
          <span />
          <span style={{ ...type.labelCaps, fontSize: 11, color: colors.onSurfaceMuted }}>This device</span>
          <span style={{ ...type.labelCaps, fontSize: 11, color: colors.onSurfaceMuted }}>Cloud</span>
          {rows.map((r) => (
            <React.Fragment key={r.label}>
              <span style={{ ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceMuted }}>{r.label}</span>
              <span style={{ ...type.bodyCompact, fontSize: 13, color: colors.onSurface, fontWeight: 500 }}>{r.local}</span>
              <span style={{ ...type.bodyCompact, fontSize: 13, color: colors.onSurface, fontWeight: 500 }}>{r.cloud}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Actions */}
      {!done && actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{actions}</div>
      )}
      {done && (
        <div style={{ ...type.bodyCompact, fontSize: 13, color: colors.successText, fontWeight: 600 }}>{done}</div>
      )}
      {error && !done && (
        <div style={{ ...type.bodyCompact, fontSize: 12, color: colors.error, marginTop: 8 }}>{error}</div>
      )}
    </div>
  );
};

export default ConflictCard;
