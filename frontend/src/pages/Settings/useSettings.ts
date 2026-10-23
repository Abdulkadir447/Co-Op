/**
 * Company Settings data hook (Task 9, UXDS 15.6).
 * Loads and saves the caller's tenant settings through the
 * Clerk-authenticated API client. Identity fields are never editable here.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError, useApiClient } from '../../services/api/client';
import { setCurrency } from '../../services/currency';

export interface BusinessSettings {
  name: string;
  industry: string | null;
  currency: string;
  owner_email: string | null;
  address: string | null;
  phone: string | null;
  tax_id: string | null;
  website: string | null;
  timezone: string | null;
  /** Ask Zeno answer style (concise | standard | detailed). */
  ai_response_style: string;
  created_at: string;
  updated_at: string | null;
}

/** Editable subset sent to PATCH /business/settings. */
export type BusinessSettingsUpdate = Partial<Omit<BusinessSettings, 'created_at' | 'updated_at'>>;

/** Ask Zeno response styles — mirrors the backend allow-list. */
export const AI_RESPONSE_STYLE_OPTIONS: { value: string; label: string; blurb: string }[] = [
  { value: 'concise', label: 'Concise', blurb: '1–3 short bullets. Just the answer.' },
  { value: 'standard', label: 'Standard', blurb: 'A short, owner-level explanation.' },
  { value: 'detailed', label: 'Detailed', blurb: 'Step-by-step reasoning with more numbers.' },
];

/** Currency whitelist — mirrors the backend (includes NGN). */
export const CURRENCY_OPTIONS = [
  'USD', 'EUR', 'GBP', 'NGN', 'CAD', 'AUD', 'JPY', 'CNY',
  'ZAR', 'GHS', 'KES', 'EGY', 'INR', 'AED', 'CHF',
];

/** Curated timezone list — mirrors the backend. */
export const TIMEZONE_OPTIONS = [
  'UTC',
  'Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg',
  'Africa/Cairo', 'Africa/Casablanca',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Istanbul',
  'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Sao_Paulo', 'America/Toronto',
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Asia/Singapore',
  'Asia/Shanghai', 'Asia/Tokyo',
  'Australia/Sydney',
];

export function useSettings() {
  const api = useApiClient();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<BusinessSettings>('/business/settings');
      setSettings(data);
      setCurrency(data.currency);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError('Unable to reach the Co-op API.'));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (updates: BusinessSettingsUpdate) => {
      setSaving(true);
      try {
        const { data } = await api.patch<BusinessSettings>('/business/settings', updates);
        setSettings(data);
        setCurrency(data.currency);
        return data;
      } finally {
        setSaving(false);
      }
    },
    [api],
  );

  return { settings, loading, saving, error, reload: load, save };
}
