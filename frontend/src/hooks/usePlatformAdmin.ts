/**
 * Platform-admin (product-owner) console state.
 *
 * `useIsPlatformAdmin` resolves whether the signed-in user is on the backend
 * allow-list (GET /platform/me). The hard gate is server-side — every
 * /platform/* data route 403s for non-admins — this only decides whether to
 * show the admin UI. Returns null while the check is in flight.
 *
 * `useAdminMode` is the local admin/normal switch the owner flips to step
 * between the product-wide console and their own business. It persists in
 * localStorage and is shared across components via a custom event.
 */
import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { useApiClient } from '../services/api/client';

let cachedIsAdmin: boolean | null = null;
let inflight: Promise<boolean> | null = null;

/** Fetch (and cache) whether the signed-in user is a platform admin. */
export function fetchIsPlatformAdmin(api: AxiosInstance): Promise<boolean> {
  if (cachedIsAdmin != null) return Promise.resolve(cachedIsAdmin);
  if (!inflight) {
    inflight = api
      .get<{ is_admin: boolean }>('/platform/me')
      .then((r) => {
        cachedIsAdmin = !!r.data.is_admin;
        inflight = null;
        return cachedIsAdmin;
      })
      .catch(() => {
        inflight = null;
        return false; // unreachable / non-admin -> no admin UI
      });
  }
  return inflight;
}

/** null = still checking, true/false = resolved. */
export function useIsPlatformAdmin(): boolean | null {
  const api = useApiClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(cachedIsAdmin);

  useEffect(() => {
    let cancelled = false;
    fetchIsPlatformAdmin(api).then((v) => !cancelled && setIsAdmin(v));
    return () => {
      cancelled = true;
    };
  }, [api]);

  return isAdmin;
}

export type AdminMode = 'admin' | 'normal';

const MODE_KEY = 'coop_admin_mode';
const MODE_EVENT = 'coop:admin-mode';

export function getAdminMode(): AdminMode {
  if (typeof window === 'undefined') return 'admin';
  return window.localStorage.getItem(MODE_KEY) === 'normal' ? 'normal' : 'admin';
}

export function setAdminMode(mode: AdminMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MODE_KEY, mode);
  window.dispatchEvent(new Event(MODE_EVENT));
}

/** The current admin/normal mode, reactive across components. */
export function useAdminMode(): AdminMode {
  const [mode, setMode] = useState<AdminMode>(getAdminMode);
  useEffect(() => {
    const onChange = () => setMode(getAdminMode());
    window.addEventListener(MODE_EVENT, onChange);
    return () => window.removeEventListener(MODE_EVENT, onChange);
  }, []);
  return mode;
}

/** Test/teardown helper. */
export function _resetPlatformAdminCacheForTests(): void {
  cachedIsAdmin = null;
  inflight = null;
}
