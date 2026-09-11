/**
 * Desktop shell hardening (docs/SECURITY_AUDIT.md, findings 2 and 4).
 *
 * The renderer loads a local file and must never navigate anywhere else, never
 * open a window, and never get Node. The logic lives in ../security.js so it
 * can be driven here with a stub renderer — these are real behaviour tests,
 * not greps. The only source-level assertions are the two that check the
 * wiring in main.js (that the helpers are actually used) and the dependency
 * pin, neither of which can be exercised without launching electron.
 *
 * Run with: cd electron && npm test
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  ALLOWED_PROTOCOLS,
  containNavigation,
  isLocalAppUrl,
  rendererPreferences,
} = require('../security');

const MAIN_JS = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const PKG = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
);

/** Minimal stand-in for electron's WebContents. */
function stubContents() {
  const handlers = {};
  let windowOpenHandler = null;
  return {
    handlers,
    setWindowOpenHandler(fn) {
      windowOpenHandler = fn;
    },
    on(event, fn) {
      handlers[event] = fn;
    },
    /** Returns whatever the app would do with the popup. */
    requestWindowOpen(url) {
      assert.ok(windowOpenHandler, 'setWindowOpenHandler was never registered');
      return windowOpenHandler({ url });
    },
    navigate(url) {
      let prevented = false;
      handlers['will-navigate']({ preventDefault: () => { prevented = true; } }, url);
      return prevented;
    },
  };
}

// ---------------------------------------------------------------------------
// Window flags
// ---------------------------------------------------------------------------

test('every window is sandboxed, isolated and without Node', () => {
  const prefs = rendererPreferences('/tmp/preload.js');
  assert.strictEqual(prefs.sandbox, true);
  assert.strictEqual(prefs.contextIsolation, true);
  assert.strictEqual(prefs.nodeIntegration, false);
  assert.strictEqual(prefs.preload, '/tmp/preload.js');
});

// ---------------------------------------------------------------------------
// window.open
// ---------------------------------------------------------------------------

test('http links open in the real browser, never inside Co-op', () => {
  const opened = [];
  const contents = stubContents();
  containNavigation(contents, { openExternal: (u) => opened.push(u) });

  const decision = contents.requestWindowOpen('https://evil.example/steal');
  assert.deepStrictEqual(decision, { action: 'deny' });
  assert.deepStrictEqual(opened, ['https://evil.example/steal']);
});

test('non-http popups are denied without being opened anywhere', () => {
  const opened = [];
  const contents = stubContents();
  containNavigation(contents, { openExternal: (u) => opened.push(u) });

  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'about:blank', 'nope']) {
    assert.deepStrictEqual(contents.requestWindowOpen(url), { action: 'deny' });
  }
  assert.deepStrictEqual(opened, []);
});

test('window.open is denied even with no external opener wired', () => {
  const contents = stubContents();
  containNavigation(contents);
  assert.deepStrictEqual(contents.requestWindowOpen('https://evil.example/'), {
    action: 'deny',
  });
});

// ---------------------------------------------------------------------------
// will-navigate
// ---------------------------------------------------------------------------

test('navigating away from the packaged app is prevented', () => {
  const contents = stubContents();
  containNavigation(contents);

  for (const url of [
    'https://paystack.example/pay/abc',
    'http://localhost:5173/',
    'javascript:alert(document.cookie)',
    'about:blank',
    'data:text/html,<script>alert(1)</script>',
    'not a url',
  ]) {
    assert.strictEqual(contents.navigate(url), true, `expected deny for ${url}`);
  }
});

test('the packaged app itself is allowed to navigate', () => {
  const contents = stubContents();
  containNavigation(contents);

  assert.strictEqual(contents.navigate('file:///opt/coop/renderer-dist/index.html'), false);
  assert.strictEqual(contents.navigate('file:///opt/coop/renderer-dist/index.html#/orders'), false);
  assert.strictEqual(contents.navigate('devtools://devtools/bundled/inspector.html'), false);
});

test('unparseable URLs are not ours', () => {
  assert.strictEqual(isLocalAppUrl(''), false);
  assert.strictEqual(isLocalAppUrl('javascript:void(0)'), false);
  assert.strictEqual(isLocalAppUrl(undefined), false);
  assert.strictEqual(isLocalAppUrl('file:///app/index.html'), true);
  assert.ok(ALLOWED_PROTOCOLS.has('file:'));
  assert.ok(!ALLOWED_PROTOCOLS.has('https:'));
});

// ---------------------------------------------------------------------------
// Wiring and dependency pin (source level — cannot run electron here)
// ---------------------------------------------------------------------------

test('main.js uses the shared preferences and navigation guards', () => {
  assert.ok(MAIN_JS.includes('rendererPreferences('), 'window must use the shared preferences');
  assert.ok(MAIN_JS.includes('containNavigation(contents'), 'web-contents-created must contain navigation');
  // no window may opt back out
  assert.ok(!/nodeIntegration:\s*true/.test(MAIN_JS), 'nodeIntegration must never be re-enabled');
  assert.ok(!/contextIsolation:\s*false/.test(MAIN_JS), 'contextIsolation must never be disabled');
  assert.ok(!/sandbox:\s*false/.test(MAIN_JS), 'sandbox must never be disabled');
});

test('electron and electron-builder are pinned to an exact version', () => {
  for (const dep of ['electron', 'electron-builder']) {
    const version = PKG.devDependencies[dep];
    assert.ok(version, `${dep} must be a devDependency`);
    assert.match(version, /^\d+\.\d+\.\d+$/, `${dep} must be pinned exactly, got ${version}`);
  }
});
