const { app, BrowserWindow, session, ipcMain, net, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { createDataLayer, defaultDbPath } = require('./db');
const { createDataLayerApp } = require('./dataLayerApp');
const { isSqliteFile, snapshot, replaceDbFile, assertRestoreSafe } = require('./db/backup');
const { APP_USER_MODEL_ID, backupFileName } = require('./platform');
const { containNavigation, isExternalSafeUrl, isTrustedSender, rendererPreferences } = require('./security');
const { initAutoUpdate } = require('./updater');

// ---------------------------------------------------------------------------
// Content Security Policy for the Co-op desktop app.
//
// Applied to navigation responses via session.webRequest.onHeadersReceived.
// Sources follow Clerk's official manual CSP configuration
// (https://clerk.com/docs/security/clerk-csp), adapted for Electron:
//
//   * script-src  — Co-op's Clerk DEVELOPMENT Frontend API host serves
//                   clerk.browser.js; challenges.cloudflare.com (Clerk bot
//                   protection) and *.protect.clerk.com (Clerk abuse/fraud
//                   protection) are required by Clerk docs. 'unsafe-eval' is
//                   kept for the Vite/React dev runtime; 'unsafe-inline' is
//                   required by Clerk JS script injection.
//   * connect-src — Clerk JS API calls to the Frontend API, plus
//                   *.accounts.dev (development hosted auth flows) and
//                   *.protect.clerk.com.
//   * img-src     — img.clerk.com hosts Clerk avatars/images; data: covers
//                   Ant Design inline SVG/data-URI assets.
//   * worker-src  — Clerk uses Web Workers (blob: workers).
//   * frame-src   — development hosted pages and Clerk challenge frames.
//   * form-action / base-uri / object-src — hardening, per CSP best practice.
//
// When Co-op moves to a production Clerk instance, replace the
// bursting-swan-43.clerk.accounts.dev host with the production Frontend API
// hostname (e.g. https://clerk.coop.example).
// ---------------------------------------------------------------------------
// The Clerk Frontend API host is parameterised (Task 11 / audit H5): production
// builds set CLERK_FRONTEND_API in the environment; otherwise the development
// instance is used. Keeping it a single variable keeps the CSP self-consistent.
const CLERK_FAPI_DEV = 'https://bursting-swan-43.clerk.accounts.dev';
const CLERK_FAPI = process.env.CLERK_FRONTEND_API
  ? `https://${process.env.CLERK_FRONTEND_API}`
  : CLERK_FAPI_DEV;
// The Co-op backend the renderer calls. A packaged build has no dev-server
// proxy, so the renderer talks to an absolute URL (VITE_API_URL, baked into the
// renderer at build time) — the CSP must allow that origin or EVERY API request
// is blocked. localhost:8000 covers local dev/testing (uvicorn's default port);
// a deployed backend is allowed by setting COOP_API_URL to its base URL.
const COOP_API_ORIGINS = ['http://localhost:8000', 'http://127.0.0.1:8000'];
if (process.env.COOP_API_URL) {
  try {
    COOP_API_ORIGINS.push(new URL(process.env.COOP_API_URL).origin);
  } catch {
    /* ignore a malformed COOP_API_URL */
  }
}
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${CLERK_FAPI} https://challenges.cloudflare.com https://*.protect.clerk.com`,
  `connect-src 'self' ${CLERK_FAPI} https://*.accounts.dev https://*.protect.clerk.com ${COOP_API_ORIGINS.join(' ')}`,
  "img-src 'self' data: https://img.clerk.com",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `frame-src 'self' https://*.accounts.dev https://challenges.cloudflare.com https://*.protect.clerk.com`,
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

function createWindow () {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });

  const win = new BrowserWindow({
    // Sane default for a dashboard app (Stage 2.4 QA).
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    // Match the design canvas to avoid a white flash before React paints.
    backgroundColor: '#fcf8ff',
    title: 'Co-op',
    icon: path.join(__dirname, 'coop-icon.png'),
    show: false,
    webPreferences: rendererPreferences(path.join(__dirname, 'preload.js'))
  });

  // Show only once the first paint is ready (no blank-frame flicker).
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Packaged builds ship the renderer inside the app (scripts/copy-renderer.js
  // copies frontend/dist -> electron/renderer-dist); dev runs load it from
  // the repo's frontend/dist.
  const packedIndex = path.join(__dirname, 'renderer-dist', 'index.html');
  const devIndex = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  const indexPath = fs.existsSync(packedIndex) ? packedIndex : devIndex;
  win.loadFile(indexPath);
  return win;
}

// ---------------------------------------------------------------------------
// Local data layer (offline-first, ADR-002).
//
// Electron owns SQLite. The renderer reaches it ONLY through the allow-listed
// IPC methods below — there is no generic "call any method" channel.
// ---------------------------------------------------------------------------
let dataLayer = null;
let dataLayerApp = null; // createDataLayerApp(dataLayer) — shared handler surface
let dataLayerPath = null; // the live SQLite file (backup/restore targets this)

let mainWindow = null;

// ---------------------------------------------------------------------------
// Local database backup & restore (PRD Phase 4 "Backup system", desktop side).
//
// Back up = a consistent copy of the device's SQLite file to a user-chosen
// location. Restore = replace the live database with a chosen backup — only
// when the sync queue is empty (nothing unsynced or conflicted can be lost).
// Restore rebuilds the data layer in place, so the running app switches to
// the restored database without a relaunch.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The one bridge out to the OS browser.
//
// The renderer cannot navigate anywhere (see electron/security.js), so paying
// a bill or opening a receipt has to be handed to the user's real browser.
// http(s) only, checked in the main process — the renderer is not trusted to
// decide what is safe.
// ---------------------------------------------------------------------------
function registerShellIpc() {
  ipcMain.handle('coop:shell', async (event, { method, arg }) => {
    if (!isTrustedSender(event, mainWindow)) {
      throw new Error('Blocked coop:shell from an untrusted renderer.');
    }
    if (method !== 'openExternal') {
      throw new Error(`Blocked non-allow-listed shell method: ${method}`);
    }
    if (!isExternalSafeUrl(arg)) {
      throw new Error(`Refusing to open a non-http(s) URL: ${String(arg).slice(0, 120)}`);
    }
    await shell.openExternal(arg);
    return true;
  });
}

function registerBackupIpc() {
  ipcMain.handle('coop:backup', async (event, { method }) => {
    if (!isTrustedSender(event, mainWindow)) {
      throw new Error('Blocked coop:backup from an untrusted renderer.');
    }
    if (method === 'create') {
      // A name Windows will actually accept: no <>:"|?*, no trailing dot or
      // space, never a reserved device name (a business called "NUL" or
      // "CON" must not produce an unwritable file).
      const stamp = new Date();
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Back up Co-op local database',
        defaultPath: backupFileName({ stamp, label: app.name }),
        filters: [{ name: 'SQLite database', extensions: ['db'] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      snapshot(dataLayer.db, filePath);
      return { ok: true, path: filePath };
    }

    if (method === 'restore') {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Restore Co-op local database',
        properties: ['openFile'],
        filters: [{ name: 'SQLite database', extensions: ['db'] }],
      });
      if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };
      const srcPath = filePaths[0];
      try {
        if (!isSqliteFile(srcPath)) {
          throw new Error('The selected file is not a valid Co-op local database.');
        }
        assertRestoreSafe(dataLayer);
        dataLayer.close();
        dataLayer = null; // the old layer is gone; a failure below must reopen
        replaceDbFile(dataLayerPath, srcPath);
        dataLayer = createDataLayer(dataLayerPath);
        dataLayerApp = createDataLayerApp(dataLayer);
        registerDataLayerIpc();
        if (mainWindow && !mainWindow.isDestroyed()) broadcastSync(mainWindow);
        return { ok: true };
      } catch (e) {
        if (dataLayerPath && !dataLayer) {
          // The close happened before the failure — reopen so the app keeps
          // working with its current database.
          dataLayer = createDataLayer(dataLayerPath);
          dataLayerApp = createDataLayerApp(dataLayer);
          registerDataLayerIpc();
        }
        return { ok: false, error: e instanceof Error ? e.message : 'Restore failed.' };
      }
    }

    throw new Error(`Blocked non-allow-listed backup method: ${method}`);
  });
}

function broadcastSync(win) {
  if (dataLayerApp && win && !win.isDestroyed()) {
    win.webContents.send('coop:sync', dataLayerApp.status());
  }
}

function registerDataLayerIpc() {
  const handlers = dataLayerApp.handlers;
  handlers._onStatusChange(() => {
    if (mainWindow && !mainWindow.isDestroyed()) broadcastSync(mainWindow);
  });
  ipcMain.handle('coop:db', (event, { method, arg }) => {
    if (!isTrustedSender(event, mainWindow)) {
      throw new Error('Blocked coop:db from an untrusted renderer.');
    }
    if (typeof method !== 'string' || !Object.prototype.hasOwnProperty.call(handlers, method)) {
      throw new Error(`Blocked non-allow-listed data-layer method: ${method}`);
    }
    return handlers[method](arg);
  });
}

// Connectivity detection; the renderer's sync engine (OFFLINE 3) reacts to
// these events, and the status broadcast keeps the visible pill fresh.
function watchConnectivity(win) {
  const update = () => {
    const online = dataLayerApp.handlers.setOnline(net.isOnline());
    if (win && !win.isDestroyed()) {
      win.webContents.send('coop:net', { online });
    }
  };
  net.on('online', update);
  net.on('offline', update);
  update();
}

// ---------------------------------------------------------------------------
// Single instance.
//
// Windows owners double-click the desktop shortcut, and the taskbar makes a
// second launch one click away. Two instances would fight over the same
// SQLite file (WAL tolerates it, but the second window's sync engine would
// push the same queue twice and the backup dialog would target a database the
// other instance is rewriting). The second launch focuses the running window
// instead.
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // ---------------------------------------------------------------------------
// Navigation containment (electron/security.js).
//
// The app loads one local file and nothing else; see that module for why.
// ---------------------------------------------------------------------------
app.on('web-contents-created', (_event, contents) => {
  containNavigation(contents, { openExternal: (url) => shell.openExternal(url) });
});

app.whenReady().then(() => {
    // Taskbar grouping and notifications on Windows use the AppUserModelID;
    // without it the pinned icon reads "Electron". Kept equal to the
    // electron-builder appId (asserted in electron/test/windows.test.js).
    if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);

    // Deny every permission request by default (camera, microphone,
    // geolocation, MIDI, USB, notifications, etc.). Co-op is a business app
    // that uses none of them, so a denied prompt is never a missing feature —
    // it just means a compromised renderer cannot ask the OS for device access.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);

    dataLayerPath = defaultDbPath(app.getPath('userData'));
    dataLayer = createDataLayer(dataLayerPath);
    dataLayerApp = createDataLayerApp(dataLayer); // cold start: trust an existing mirror
    registerDataLayerIpc();
    registerBackupIpc();
    registerShellIpc();
    const win = createWindow();
    mainWindow = win;
    watchConnectivity(win);
    // Desktop auto-update: downloads in the background, the owner chooses when
    // to restart, and a deferred update force-installs after a week
    // (see electron/updater.js). No-ops in dev / unpackaged runs.
    initAutoUpdate({
      app,
      dialog,
      getWindow: () => mainWindow,
      log: (...a) => console.log('[updater]', ...a),
    });
    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        const w = createWindow();
        mainWindow = w;
        watchConnectivity(w);
      }
    });
  });

  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
  });
}
