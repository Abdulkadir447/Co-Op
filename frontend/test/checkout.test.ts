/**
 * Checkout hand-off — the seam between the renderer and the outside world.
 *
 * Paying means leaving the app, and the desktop build is not allowed to
 * navigate anywhere (electron/security.js denies it). These tests pin the two
 * behaviours that keep that true: an external URL goes through the
 * `coop:shell` bridge when one exists and through a normal navigation when it
 * does not, and the `?reference=` Paystack appends is read once, capped, and
 * then cleared from the address bar so a refresh cannot replay it.
 *
 * Nothing here talks to a network — `window` is a stub.
 */
import test from 'node:test';
import assert from 'node:assert';

import {
  clearReferenceFromUrl,
  isDesktopApp,
  openExternal,
  referenceFromSearch,
} from '../src/billing/checkout';

type StubWindow = {
  coop?: { shell?: { openExternal?: (url: string) => Promise<unknown> } };
  location: { href: string; assign: (url: string) => void };
  history: { replaceState: (state: unknown, title: string, url: string) => void };
  search: string;
};

const g = globalThis as unknown as { window?: StubWindow; URL: typeof URL };

/** Install a browser-ish global and return the recorder. */
function stub(opts: { bridge?: boolean; search?: string } = {}) {
  const opened: string[] = [];
  const assigned: string[] = [];
  const replaced: string[] = [];
  const url = new URL(`https://app.example.test/billing${opts.search ?? ''}`);

  g.window = {
    location: {
      href: url.toString(),
      assign: (u: string) => assigned.push(u),
    },
    history: { replaceState: (_s: unknown, _t: string, u: string) => replaced.push(u) },
    search: url.search,
    ...(opts.bridge
      ? { coop: { shell: { openExternal: async (u: string) => void opened.push(u) } } }
      : {}),
  };
  return { opened, assigned, replaced };
}

function unstub() {
  delete g.window;
}

// ---------------------------------------------------------------------------
// The bridge
// ---------------------------------------------------------------------------

test('the desktop app hands the payment URL to the OS browser', async () => {
  const { opened, assigned } = stub({ bridge: true });
  try {
    assert.strictEqual(isDesktopApp(), true);
    await openExternal('https://pay.example.com/pay/abc?reference=coop_1');
    assert.deepStrictEqual(opened, ['https://pay.example.com/pay/abc?reference=coop_1']);
    assert.deepStrictEqual(assigned, [], 'the renderer must never navigate itself');
  } finally {
    unstub();
  }
});

test('a browser build navigates instead', async () => {
  const { opened, assigned } = stub({ bridge: false });
  try {
    assert.strictEqual(isDesktopApp(), false);
    await openExternal('https://pay.example.com/pay/abc');
    assert.deepStrictEqual(assigned, ['https://pay.example.com/pay/abc']);
    assert.deepStrictEqual(opened, []);
  } finally {
    unstub();
  }
});

test('a rejected bridge call propagates to the caller', async () => {
  stub({ bridge: true });
  g.window!.coop!.shell!.openExternal = async () => {
    throw new Error('Refusing to open a non-http(s) URL');
  };
  try {
    await assert.rejects(() => openExternal('file:///etc/passwd'), /non-http/);
  } finally {
    unstub();
  }
});

// ---------------------------------------------------------------------------
// The reference Paystack sends back
// ---------------------------------------------------------------------------

test('a reference on the query string is read', () => {
  assert.strictEqual(referenceFromSearch('?reference=coop_abc123'), 'coop_abc123');
  assert.strictEqual(
    referenceFromSearch('?utm=x&reference=coop_abc123&y=1'),
    'coop_abc123',
  );
});

test('a missing or absurd reference is ignored', () => {
  assert.strictEqual(referenceFromSearch(''), null);
  assert.strictEqual(referenceFromSearch('?reference='), null);
  assert.strictEqual(referenceFromSearch('?other=1'), null);
  assert.strictEqual(referenceFromSearch(`?reference=${'x'.repeat(81)}`), null);
});

test('the reference is cleared from the address bar so a refresh cannot replay it', () => {
  const { replaced } = stub({ search: '?reference=coop_abc123' });
  try {
    clearReferenceFromUrl();
    assert.strictEqual(replaced.length, 1);
    assert.ok(!replaced[0].includes('reference='), replaced[0]);
    assert.ok(replaced[0].includes('https://app.example.test/billing'));
  } finally {
    unstub();
  }
});

test('clearing is a no-op when there is nothing to clear', () => {
  const { replaced } = stub({});
  try {
    clearReferenceFromUrl();
    assert.deepStrictEqual(replaced, []);
  } finally {
    unstub();
  }
});
