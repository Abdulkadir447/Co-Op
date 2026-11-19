/**
 * Reports — Export menu (Reports phase, Pass 5/6).
 *
 * "Export exactly what I'm looking at": the request carries the SAME filter
 * state the screen is rendering, and the backend renders the SAME ReportData
 * it just returned — so the file can't disagree with the KPIs on screen.
 */
import React, { useState } from 'react';
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { useApiClient } from '../../services/api/client';
import { useCoopTheme } from '../../theme-provider';
import { radius, type } from '../../theme';
import { isLocalModeActive } from '../../repositories';
import type { ReportData, ReportFilterState } from './reportConfig';

type Fmt = 'csv' | 'xlsx' | 'pdf';

/**
 * Client-side CSV of exactly what is on screen (OFFLINE 3.5 local mode):
 * the KPIs + tables of the SAME ReportData object the page renders, so the
 * file can't disagree with the numbers above it. XLSX/PDF remain
 * server-rendered (and are honestly disabled offline).
 */
function buildCsv(d: ReportData): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  lines.push(`${d.title} — ${d.period_label}`);
  lines.push(`Generated,${d.generated_at}`);
  lines.push('');
  lines.push('KPI,Value');
  for (const k of d.kpis) lines.push(`${esc(k.label)},${esc(k.value)}`);
  for (const t of d.tables) {
    lines.push('');
    lines.push(t.title);
    lines.push(t.columns.map(esc).join(','));
    for (const r of t.rows) lines.push(r.map(esc).join(','));
  }
  return lines.join('\n');
}

const OPTIONS: Array<{ fmt: Fmt; label: string; icon: React.ReactNode }> = [
  { fmt: 'csv', label: 'CSV', icon: <FileTextOutlined /> },
  { fmt: 'xlsx', label: 'Excel (.xlsx)', icon: <FileExcelOutlined /> },
  { fmt: 'pdf', label: 'PDF', icon: <FilePdfOutlined /> },
];

function toParams(f: ReportFilterState): Record<string, string | number> {
  const p: Record<string, string | number> = { from: f.from, to: f.to, compare: f.compare };
  if (f.category) p.category = f.category;
  if (f.product_id) p.product_id = f.product_id;
  if (f.customer_id) p.customer_id = f.customer_id;
  return p;
}

const ExportMenu: React.FC<{ reportKey: string; filters: ReportFilterState; data?: ReportData | null }> = ({
  reportKey,
  filters,
  data,
}) => {
  const api = useApiClient();
  const { colors } = useCoopTheme();
  const [busy, setBusy] = useState<Fmt | null>(null);
  const [open, setOpen] = useState(false);
  const local = isLocalModeActive();

  /** Local CSV export of the on-screen data (no network). */
  const downloadLocalCsv = () => {
    if (!data) return;
    const blob = new Blob([buildCsv(data)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coop_${reportKey}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const download = async (fmt: Fmt) => {
    setOpen(false);
    if (local) {
      // CSV is computed from the on-screen ReportData; XLSX/PDF are
      // server-rendered and stay online-only (the menu disables them).
      downloadLocalCsv();
      return;
    }
    setBusy(fmt);
    try {
      const resp = await api.get(`/reports/${reportKey}/export`, {
        params: { ...toParams(filters), format: fmt },
        responseType: 'blob',
      });
      const cd = resp.headers['content-disposition'] as string | undefined;
      let filename = `coop_${reportKey}.${fmt === 'xlsx' ? 'xlsx' : fmt}`;
      const m = cd?.match(/filename="?([^";]+)"?/);
      if (m) filename = m[1];
      const url = URL.createObjectURL(resp.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* ApiError already surfaced by the client interceptor */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          height: 36,
          padding: '0 14px',
          borderRadius: radius.lg,
          border: `1px solid ${colors.outlineVariant}`,
          background: colors.surfaceContainerLowest,
          color: colors.onSurface,
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        <DownloadOutlined style={{ fontSize: 13 }} />
        Export
      </button>
      {open && (
        <>
          <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            role="menu"
            style={{
              position: 'absolute',
              right: 0,
              top: 40,
              zIndex: 50,
              minWidth: 170,
              background: colors.surfaceContainerLowest,
              border: `1px solid ${colors.borderSubtle}`,
              borderRadius: radius.lg,
              boxShadow: '0 8px 28px rgba(20,20,40,0.14)',
              padding: 6,
            }}
          >
            <div style={{ padding: '6px 10px 8px', ...type.bodyCompact, fontSize: 12, color: colors.onSurfaceMuted }}>
              {local ? 'CSV from the data on screen (offline)' : 'Exports the current filters'}
            </div>
            {OPTIONS.map((o) => {
              const offlineOnly = local && o.fmt !== 'csv';
              return (
              <button
                key={o.fmt}
                type="button"
                role="menuitem"
                title={offlineOnly ? 'Server-rendered — connect to export this format' : undefined}
                disabled={busy !== null || offlineOnly || (local && !data)}
                onClick={() => void download(o.fmt)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  color: busy === o.fmt || offlineOnly || (local && !data) ? colors.outline : colors.onSurface,
                  fontWeight: 600,
                  fontSize: 13,
                  borderRadius: radius.md,
                  padding: '9px 10px',
                  cursor: busy === null && !offlineOnly && (data || !local) ? 'pointer' : 'default',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => { if (busy === null && !offlineOnly) e.currentTarget.style.background = colors.surfaceContainerLow; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {busy === o.fmt ? 'Preparing…' : o.label}
                <span aria-hidden style={{ color: colors.outline }}>{o.icon}</span>
              </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ExportMenu;
