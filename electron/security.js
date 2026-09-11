/**
 * Renderer containment for the desktop shell.
 *
 * The BrowserWindow loads one local file and nothing else. Everything in here
 * exists to make that true even when something tries to change it: a link in
 * imported data, a URL in an AI answer, a stray target="_blank". Without the
 * handlers below, one bad link hands a remote page the preload bridge.
 *
 * The logic is kept out of main.js so it can be driven directly by the test
 * suite (electron/test/security.test.js) with a stub renderer.
 */
'use strict';

/** Protocols the privileged renderer is allowed to load. */
const ALLOWED_PROTOCOLS = new Set(['file:', 'devtools:']);

/** WebPreferences every Co-op window is created with. */
function rendererPreferences(preloadPath) {
  return {
    preload: preloadPath,
    nodeIntegration: false,
    contextIsolation: true,
    // The renderer needs no Node API — the preload only bridges ipcRenderer.
    // Sandboxing means a compromised renderer cannot reach the filesystem
    // even if everything else failed.
    sandbox: true,
  };
}

/** True for URLs that belong to the packaged app itself. */
function isLocalAppUrl(url) {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    // Unparseable (about:blank, javascript:, a bare word) — not ours.
    return false;
  }
}

/**
 * Deny navigation away from the app for one renderer.
 *
 * `openExternal` is injected (main.js passes electron's `shell.openExternal`)
 * so the tests do not need electron to be installed.
 */
function containNavigation(contents, options = {}) {
  const openExternal = options.openExternal;

  // New windows are never allowed inside Co-op. http(s) links are handed to
  // the user's real browser, which is what they meant by clicking.
  contents.setWindowOpenHandler(({ url }) => {
    if (openExternal && /^https?:/i.test(url)) {
      openExternal(url);
    }
    return { action: 'deny' };
  });

  // In-place navigation to anything that is not the packaged app is refused.
  contents.on('will-navigate', (event, url) => {
    if (!isLocalAppUrl(url)) {
      event.preventDefault();
    }
  });
}

module.exports = { ALLOWED_PROTOCOLS, containNavigation, isLocalAppUrl, rendererPreferences };
