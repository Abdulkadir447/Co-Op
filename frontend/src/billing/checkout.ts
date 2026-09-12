/**
 * Leaving the app to pay — the only navigation the renderer may ask for.
 *
 * In the desktop build the renderer cannot navigate anywhere:
 * electron/security.js denies `window.open` and any `will-navigate` to a
 * non-`file:` URL, so a Paystack page has to be handed to the user's real
 * browser through the allow-listed `coop:shell` bridge. In the browser build
 * there is no bridge, so the page navigates normally.
 *
 * Nothing here decides whether a payment happened — that is the backend's
 * job (see backend/payments.py). This module only moves the user.
 */

type CoopBridge = {
  shell?: { openExternal?: (url: string) => Promise<unknown> };
};

function bridge(): CoopBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { coop?: CoopBridge }).coop;
}

/** True when running inside the packaged desktop app. */
export function isDesktopApp(): boolean {
  return Boolean(bridge()?.shell?.openExternal);
}

/**
 * Open `url` outside the app. Resolves once the hand-off has been made; the
 * desktop bridge rejects anything that is not http(s), so callers should
 * surface the rejection rather than swallow it.
 */
export async function openExternal(url: string): Promise<void> {
  const open = bridge()?.shell?.openExternal;
  if (open) {
    await open(url);
    return;
  }
  if (typeof window !== 'undefined') {
    window.location.assign(url);
  }
}

/**
 * The charge reference Paystack appends when it returns the owner to the
 * Billing page (`?reference=coop_…`). It is a lookup key for the backend to
 * verify, never proof of payment — and it is length-capped because it came
 * from a URL.
 */
export function referenceFromSearch(search: string): string | null {
  if (typeof window === 'undefined' && !search) return null;
  const value = new URLSearchParams(search).get('reference');
  if (!value || value.length > 80) return null;
  return value;
}

/** Drop `?reference=…` from the address bar so a refresh cannot re-verify. */
export function clearReferenceFromUrl(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('reference')) return;
  url.searchParams.delete('reference');
  window.history.replaceState({}, '', url.toString());
}
