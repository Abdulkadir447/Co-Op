/**
 * Co-op Command Palette (Stage 2) — the ⌘K quick navigator & live search.
 *
 * Two kinds of results:
 *   1. Pages   — the app's modules (instant, client-side filter).
 *   2. Records — LIVE backend search across Products, Customers and Orders
 *      (GET ?search= endpoints, debounced). Selecting a record navigates to
 *      its module with the query pre-applied (?q=… — the module hooks read
 *      it on entry).
 *
 * Keyboard-first: ↑/↓ to move, Enter to open, Esc to close; ⌘K / Ctrl+K
 * toggles from anywhere.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { radius, spacing, type } from '../../theme';
import { useCoopTheme } from '../../theme-provider';
import { useApiClient } from '../../services/api/client';
import { NAV_ITEMS, NAV_SECONDARY } from './nav';
import { CoopMark } from '../brand/CoopLogo';

const BoxIcon = ({ color, size = 15 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="m3 7 9 5 9-5M12 12v10" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);
const PersonIcon = ({ color, size = 15 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.8" />
    <path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const ReceiptIcon = ({ color, size = 15 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22l-2-1.5L6 22V2Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9 7h6M9 11h6M9 15h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

interface PageResult {
  key: string;
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface RecordResult {
  kind: 'product' | 'customer' | 'order';
  id: number;
  label: string;
  sub: string;
}

interface FlatItem {
  section: string;
  page?: PageResult;
  record?: RecordResult;
}

const orderNumber = (id: number) => `#ORD-${String(id).padStart(4, '0')}`;

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const { colors, isDark } = useCoopTheme();
  const navigate = useNavigate();
  const api = useApiClient();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [records, setRecords] = useState<RecordResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reqSeq = useRef(0);

  // Reset + focus on open.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setRecords([]);
      // Defer focus to the next frame (after the panel mounts).
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced live search against the three list endpoints.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setRecords([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++reqSeq.current;
    const t = setTimeout(async () => {
      try {
        const [products, customers, orders] = await Promise.all([
          api
            .get('/products', { params: { search: q, limit: 5 } })
            .then((r) => r.data.items as Array<{ id: number; name: string; sku: string }>),
          api
            .get('/customers', { params: { search: q, limit: 5 } })
            .then((r) => r.data.items as Array<{ id: number; full_name: string; email: string }>),
          api
            .get('/orders', { params: { search: q, limit: 5 } })
            .then((r) =>
              r.data.items as Array<{ id: number; status: string; customer?: { full_name?: string } | null }>,
            ),
        ]);
        if (seq !== reqSeq.current) return;
        setRecords([
          ...products.map((p): RecordResult => ({ kind: 'product', id: p.id, label: p.name, sub: p.sku })),
          ...customers.map((c): RecordResult => ({ kind: 'customer', id: c.id, label: c.full_name, sub: c.email })),
          ...orders.map((o): RecordResult => ({
            kind: 'order',
            id: o.id,
            label: orderNumber(o.id),
            sub: o.customer?.full_name ?? o.status,
          })),
        ]);
      } catch {
        if (seq === reqSeq.current) setRecords([]);
      } finally {
        if (seq === reqSeq.current) setSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query, open, api]);

  const pages: PageResult[] = useMemo(
    () => [...NAV_ITEMS, ...NAV_SECONDARY].map((n) => ({ key: n.key, label: n.label, path: n.path, icon: n.icon })),
    [],
  );

  const items: FlatItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pageItems: FlatItem[] = pages
      .filter((p) => !q || p.label.toLowerCase().includes(q))
      .map((p) => ({ section: 'Go to', page: p }));
    const recItems: FlatItem[] = records.map((r) => ({
      section: r.kind === 'product' ? 'Products' : r.kind === 'customer' ? 'Customers' : 'Orders',
      record: r,
    }));
    return [...pageItems, ...recItems];
  }, [pages, records, query]);

  useEffect(() => setActiveIndex(0), [items.length, query]);

  // Keep the active row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const choose = useCallback(
    (item: FlatItem) => {
      if (item.page) {
        navigate(item.page.path);
      } else if (item.record) {
        const r = item.record;
        const target =
          r.kind === 'product' ? `/products?q=${encodeURIComponent(r.label)}`
          : r.kind === 'customer' ? `/customers?q=${encodeURIComponent(r.label)}`
          : `/orders?q=${encodeURIComponent(r.label)}`;
        navigate(target);
      }
      onClose();
    },
    [navigate, onClose],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) choose(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  let lastSection: string | null = null;

  return (
    <div
      className="coop-fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: isDark ? 'rgba(10, 10, 14, 0.6)' : 'rgba(27, 27, 35, 0.32)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '14vh 16px 16px',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="coop-palette-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: '62vh',
          display: 'flex',
          flexDirection: 'column',
          background: colors.surfaceContainerLowest,
          border: `1px solid ${colors.outlineVariant}`,
          borderRadius: radius.xl,
          boxShadow: isDark ? '0 24px 64px rgba(0, 0, 0, 0.5)' : '0 24px 64px rgba(91, 95, 239, 0.22)',
          overflow: 'hidden',
        }}
      >
        {/* Input row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: `0 ${spacing.md}px`,
            height: 52,
            borderBottom: `1px solid ${colors.borderSubtle}`,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke={colors.outline} strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke={colors.outline} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search products, customers, orders…"
            aria-label="Search commands and records"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: colors.onSurface,
              fontFamily: 'inherit',
              fontSize: 15,
            }}
          />
          {searching && (
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: `2px solid ${colors.borderSubtle}`,
                borderTopColor: colors.primary,
                animation: 'coop-spin 0.7s linear infinite',
              }}
            />
          )}
          <kbd
            aria-hidden
            style={{
              padding: '2px 7px',
              borderRadius: radius.sm,
              border: `1px solid ${colors.borderSubtle}`,
              background: colors.surfaceContainerLow,
              color: colors.outline,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', padding: 8 }} role="listbox" aria-label="Results">
          {items.length === 0 && !searching && (
            <div style={{ padding: `${spacing.xl}px ${spacing.md}px`, textAlign: 'center' }}>
              <div style={{ ...type.titleMd, color: colors.onSurface }}>No matching commands or records</div>
              <div style={{ ...type.bodyCompact, color: colors.onSurfaceVariant, marginTop: 4 }}>
                Try a different term — or browse a module from the sidebar.
              </div>
            </div>
          )}

          {items.map((item, i) => {
            const showSection = item.section !== lastSection;
            lastSection = item.section;
            const active = i === activeIndex;
            const label = item.page?.label ?? item.record?.label ?? '';
            const sub = item.page?.path === '/' ? 'Home' : item.record?.sub;
            return (
              <React.Fragment key={`${item.section}-${label}-${i}`}>
                {showSection && (
                  <div
                    style={{
                      ...type.labelCaps,
                      color: colors.outline,
                      textTransform: 'uppercase',
                      padding: `10px 12px 6px`,
                    }}
                  >
                    {item.section}
                  </div>
                )}
                <div
                  data-index={i}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => choose(item)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '9px 12px',
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    background: active ? colors.surfaceContainerLow : 'transparent',
                    transition: 'background-color 120ms',
                  }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: radius.md,
                      background: active ? colors.primaryFixed : colors.surfaceContainer,
                      color: active ? colors.primary : colors.outline,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                >
                  {item.page?.icon ?? (
                    item.record?.kind === 'order' ? (
                      <ReceiptIcon color={active ? colors.primary : colors.outline} />
                    ) : item.record?.kind === 'customer' ? (
                      <PersonIcon color={active ? colors.primary : colors.outline} />
                    ) : (
                      <BoxIcon color={active ? colors.primary : colors.outline} />
                    )
                  )}
                </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontWeight: active ? 600 : 500,
                        color: colors.onSurface,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {label}
                    </span>
                    {sub && (
                      <span style={{ ...type.bodyCompact, fontSize: 12, color: colors.outline, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sub}
                      </span>
                    )}
                  </span>
                  {active && (
                    <kbd
                      aria-hidden
                      style={{
                        padding: '2px 7px',
                        borderRadius: radius.sm,
                        border: `1px solid ${colors.borderSubtle}`,
                        background: colors.surfaceContainerLow,
                        color: colors.outline,
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      ↵
                    </kbd>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Footer hints */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: `10px ${spacing.md}px`,
            borderTop: `1px solid ${colors.borderSubtle}`,
            background: colors.surfaceContainerLow,
            ...type.labelCaps,
            color: colors.outline,
            fontSize: 11,
          }}
        >
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <CoopMark size={14} /> Powered by CO OP
          </span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
