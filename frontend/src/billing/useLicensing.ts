/**
 * Licensing hook — Settings → Licence (PRD Ch7 §7.19).
 *
 * The server is the only authority: a key is verified there, bound to this
 * business, and granted as a window on the subscription. This hook only
 * reads that state and posts a pasted key, surfacing the server's own
 * message for every honest refusal (wrong business, revoked, expired,
 * malformed) rather than guessing client-side.
 */
import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '../services/api/client';

export interface LicenseState {
  licensed: boolean;
  active: boolean;
  plan: string | null;
  label: string | null;
  seats: number | null;
  started_at: string | null;
  ends_at: string | null;
  days_remaining: number;
  fingerprint: string | null;
  expired: boolean;
}

export interface LicenseStatus {
  license: LicenseState;
  effective_plan: string;
}

const EMPTY: LicenseState = {
  licensed: false,
  active: false,
  plan: null,
  label: null,
  seats: null,
  started_at: null,
  ends_at: null,
  days_remaining: 0,
  fingerprint: null,
  expired: false,
};

export function useLicensing() {
  const api = useApiClient();
  const [license, setLicense] = useState<LicenseState>(EMPTY);
  const [effectivePlan, setEffectivePlan] = useState<string>('free');
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api.get<LicenseStatus>('/licenses');
      setLicense(data.license ?? EMPTY);
      setEffectivePlan(data.effective_plan ?? 'free');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your licence.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Activate a pasted key. Returns true when the licence is now live. */
  const activate = useCallback(
    async (key: string): Promise<boolean> => {
      setActivating(true);
      setError(null);
      setNotice(null);
      try {
        await api.post('/licenses/activate', { key });
        await refresh();
        setNotice('Licence activated — your plan is live.');
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not activate that licence key.');
        return false;
      } finally {
        setActivating(false);
      }
    },
    [api, refresh],
  );

  const dismiss = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return { license, effectivePlan, loading, activating, error, notice, activate, dismiss, refresh };
}
