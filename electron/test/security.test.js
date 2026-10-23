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
  isExternalSafeUrl,
  isLocalAppUrl,
  isTrustedSender,
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
// The bridge out to the OS browser (used for Paystack payment pages)
// ---------------------------------------------------------------------------

test('only http(s) may be handed to the OS browser', () => {
  assert.strictEqual(isExternalSafeUrl('https://paystack.com/pay/abc'), true);
  assert.strictEqual(isExternalSafeUrl('http://localhost:5173/billing'), true);
  assert.strictEqual(isExternalSafeUrl('https://pay.example.shop/pay/x?a=1&b=2'), true);
});

test('nothing else may be handed to the OS browser', () => {
  for (const url of [
    'file:///etc/passwd',
    'file://server/share/app.exe',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'about:blank',
    'devtools://devtools/x',
    'C:\\Windows\\System32\\calc.exe',
    '',
    null,
    undefined,
    42,
  ]) {
    assert.strictEqual(isExternalSafeUrl(url), false, `expected deny for ${String(url)}`);
  }
});

test('the shell bridge is allow-listed and re-checks the URL in main', () => {
  const PRELOAD = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.ok(PRELOAD.includes("invoke('coop:shell'"), 'preload must use the shell channel');
  assert.ok(MAIN_JS.includes("registerShellIpc"), 'main must register the shell bridge');
  assert.ok(MAIN_JS.includes("method !== 'openExternal'"), 'the channel must be allow-listed');
  assert.ok(MAIN_JS.includes('isExternalSafeUrl(arg)'), 'main must re-check the URL itself');
  // the bridge is not a generic invoke
  assert.ok(!/ipcRenderer\.invoke\(\s*method/.test(PRELOAD), 'no generic invoke channel');
});

// ---------------------------------------------------------------------------
// IPC sender validation (only the app's own window may drive the bridge)
// ---------------------------------------------------------------------------

function stubWin(id) {
  return {
    isDestroyed: () => false,
    webContents: { id },
  };
}

test('IPC from the main window is trusted, anything else is not', () => {
  const win = stubWin(7);
  assert.strictEqual(isTrustedSender({ sender: { id: 7 } }, win), true);
  assert.strictEqual(isTrustedSender({ sender: { id: 8 } }, win), false, 'other window');
  assert.strictEqual(isTrustedSender({}, win), false, 'no sender');
  assert.strictEqual(isTrustedSender({ sender: { id: 7 } }, null), false, 'no window');
  const destroyed = { isDestroyed: () => true, webContents: { id: 7 } };
  assert.strictEqual(isTrustedSender({ sender: { id: 7 } }, destroyed), false, 'destroyed');
});

test('every IPC channel re-checks its sender in the main process', () => {
  for (const channel of ['coop:shell', 'coop:backup', 'coop:db']) {
    assert.ok(MAIN_JS.includes(channel), `${channel} present`);
  }
  const checks = (MAIN_JS.match(/isTrustedSender\(event, mainWindow\)/g) || []).length;
  assert.ok(checks >= 3, `expected sender checks on all 3 channels, found ${checks}`);
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
