'use strict';
/**
 * Desktop auto-update (electron-updater) with a defer-with-deadline policy.
 *
 * Behaviour the product asked for:
 *   - Updates download silently in the background — the owner keeps working.
 *   - When one is ready we ask: "Restart now" or "Later". Their choice.
 *   - A deferred update is NOT nagging, but it is not optional forever: once a
 *     downloaded update is UPDATE_DEADLINE_DAYS old it installs itself (the
 *     "8th day" rule), with or without confirmation.
 *
 * The downloaded-at timestamp is persisted in userData so the deadline survives
 * restarts, and is cleared once the recorded version actually becomes the
 * running version (i.e. the update was applied).
 *
 * The deadline maths and state I/O are pure/standalone so they can be unit
 * tested without Electron (see test/updater.test.js).
 */
const fs = require('fs');
const path = require('path');

const UPDATE_DEADLINE_DAYS = 7;
const STATE_FILE = 'update-state.json';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function statePath(userDataDir) {
  return path.join(userDataDir, STATE_FILE);
}

function readState(userDataDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(userDataDir), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(userDataDir, patch) {
  const next = { ...readState(userDataDir), ...patch };
  try {
    fs.writeFileSync(statePath(userDataDir), JSON.stringify(next));
  } catch {
    /* best-effort: a missing deadline just means we re-prompt next launch */
  }
  return next;
}

function clearState(userDataDir) {
  try {
    fs.unlinkSync(statePath(userDataDir));
  } catch {
    /* nothing to clear */
  }
}

/**
 * Pure: is a downloaded update older than the deadline? Drives the "installs
 * itself on the 8th day" rule. `downloadedAt` is an epoch-ms timestamp.
 */
function deadlinePassed(downloadedAt, now = Date.now(), deadlineDays = UPDATE_DEADLINE_DAYS) {
  if (!downloadedAt || typeof downloadedAt !== 'number') return false;
  return now - downloadedAt >= deadlineDays * DAY_MS;
}

/**
 * Wire electron-updater into a running app. Safe to call in dev (no-ops when
 * the app is not packaged, since there is no installed build to update).
 *
 * @param {object} deps
 * @param {Electron.App} deps.app
 * @param {Electron.Dialog} deps.dialog
 * @param {() => Electron.BrowserWindow|null} deps.getWindow
 * @param {(msg: string) => void} [deps.log]
 */
function initAutoUpdate({ app, dialog, getWindow, log = () => {} }) {
  if (!app.isPackaged) {
    log('auto-update skipped: not a packaged build');
    return null;
  }

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    log('electron-updater not available:', err && err.message);
    return null;
  }

  const userData = () => app.getPath('userData');

  // The recorded update was applied (running version caught up) — reset state
  // so the next update gets a fresh deadline.
  const prior = readState(userData());
  if (prior.version && prior.version !== app.getVersion()) clearState(userData());

  autoUpdater.autoDownload = true; // download in the background, no prompt
  autoUpdater.autoInstallOnAppQuit = true; // apply on a normal quit too

  let prompted = false;
  let lastInfo = null;

  const restart = () => {
    try {
      // isSilent=true, isForceRunAfter=true: install and relaunch Co-op.
      autoUpdater.quitAndInstall(true, true);
    } catch (err) {
      log('quitAndInstall failed:', err && err.message);
    }
  };

  const askRestart = (info, forced) => {
    const win = getWindow();
    if (forced) {
      // 8th-day rule: this is no longer optional. Single action.
      dialog
        .showMessageBox(win, {
          type: 'info',
          title: 'Update required',
          message: `Co-op ${info.version} is ready and must be installed now.`,
          detail: 'Co-op will restart to finish the update.',
          buttons: ['Restart now'],
          defaultId: 0,
        })
        .then(() => restart())
        .catch(() => restart());
      return;
    }
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: 'Update ready',
        message: `Co-op ${info.version} is ready to install.`,
        detail:
          'Restart now to apply it, or carry on working — it will install ' +
          'automatically within a week.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) restart();
        // "Later": stays downloaded; we re-ask next launch and force at deadline.
      })
      .catch(() => {});
  };

  autoUpdater.on('update-downloaded', (info) => {
    lastInfo = info;
    const state = readState(userData());
    if (!state.downloadedAt) {
      writeState(userData(), { downloadedAt: Date.now(), version: info.version });
    }
    if (prompted) return;
    prompted = true;
    const forced = deadlinePassed(readState(userData()).downloadedAt);
    askRestart(info, forced);
  });

  autoUpdater.on('error', (err) => log('update error:', err && err.message));

  // If the app stays open for days, keep honouring the deadline.
  const timer = setInterval(() => {
    if (!lastInfo) return;
    if (deadlinePassed(readState(userData()).downloadedAt)) {
      clearInterval(timer);
      askRestart(lastInfo, true);
    }
  }, HOUR_MS);
  if (typeof timer.unref === 'function') timer.unref();

  autoUpdater.checkForUpdates().catch((err) => log('update check failed:', err && err.message));
  return autoUpdater;
}

module.exports = {
  initAutoUpdate,
  deadlinePassed,
  readState,
  writeState,
  clearState,
  UPDATE_DEADLINE_DAYS,
  DAY_MS,
};
