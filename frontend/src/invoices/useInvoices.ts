/**
 * Invoices hook — the data layer for the Invoices module.
 *
 * Invoices are cloud-only in v1: they are the paperwork record (number,
 * lifecycle, dates), not core operational data, so they sit outside the
 * offline boundary (ADR-002) alongside XLSX/PDF exports. The printable
 * invoice on an order still renders locally — this module is what turns it
 * into a saved, numbered document.
 *
 * Money is never sent to the server here: totals come from the order.
 */
import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '../services/api/client';

export type InvoiceStatus = 'draft' | 'sent' | 'void';

export interface InvoiceRow {
  id: number;
  number: string;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  notes: string | null;
  currency: string;
  total: number;
  order: { id: number; status: string | null; order_date: string | null; total_amount: number } | null;
  customer: { id: number; full_name: string; email: string | null } | null;
  created_at: string | null;
}

interface InvoiceListResponse {
  items: InvoiceRow[];
  total: number;
  page: number;
  limit: number;
}

const PAGE_SIZE = 25;

export function useInvoices() {
  const api = useApiClient();
  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, limit: PAGE_SIZE };
      if (search.trim()) params.search = search.trim();
      if (status !== 'all') params.status = status;
      const { data } = await api.get<InvoiceListResponse>('/invoices', { params });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load invoices.');
    } finally {
      setLoading(false);
    }
  }, [api, page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Create the invoice for an order (409 when the order is already invoiced). */
  const createForOrder = useCallback(
    async (orderId: number): Promise<InvoiceRow | null> => {
      try {
        const { data } = await api.post<InvoiceRow>('/invoices', { order_id: orderId });
        await load();
        return data;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create the invoice.');
        return null;
      }
    },
    [api, load],
  );

  /** Move an invoice along draft → sent → void. */
  const setStatusFor = useCallback(
    async (id: number, next: InvoiceStatus): Promise<boolean> => {
      setBusyId(id);
      setError(null);
      try {
        await api.patch(`/invoices/${id}`, { status: next });
        await load();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update that invoice.');
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [api, load],
  );

  /** Download exactly the rows the list is showing. */
  const exportCsv = useCallback(async () => {
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      if (status !== 'all') params.status = status;
      const { data } = await api.get('/invoices/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'coop_invoices.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export invoices.');
    }
  }, [api, search, status]);

  return {
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    search,
    status,
    loading,
    error,
    busyId,
    setPage,
    setSearch,
    setStatus,
    createForOrder,
    setStatusFor,
    exportCsv,
    refresh: load,
  };
}
