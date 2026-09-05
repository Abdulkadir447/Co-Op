/**
 * Platform helpers — the Windows rules Co-op's desktop app has to respect.
 *
 * Windows is where the desktop build is actually shipped, and it is not
 * POSIX with backslashes:
 *
 *   * app data lives in %APPDATA%, not ~/.config;
 *   * a virtualenv's interpreter is in Scripts\python.exe, not bin/python;
 *   * filenames may not contain <>:"|?* or control characters, may not end
 *     in a space or a dot, and may not be a reserved device name (CON, NUL,
 *     COM1...);
 *   * paths over MAX_PATH (260) fail unless long-path support is on;
 *   * open files are locked — deleting or renaming them raises EBUSY/EPERM
 *     where POSIX silently succeeds (antivirus and Search hold handles too).
 *
 * Every function takes the platform explicitly (defaulting to the running
 * one) so the whole Windows surface is testable on Linux CI with
 * `path.win32` — see electron/test/windows.test.js.
 */
'use strict';

const path = require('node:path');

/** Must equal electron/package.json `build.appId` (asserted by the test suite). */
const APP_USER_MODEL_ID = 'app.coop.desktop';

/** Windows reserves these names at every level of the path. */
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
/** Characters NTFS refuses in a filename, plus the control range. */
const WINDOWS_ILLEGAL_CHARS = /[<>:"|?*\u0000-\u001F]/g;
const WINDOWS_MAX_COMPONENT = 255;
const WINDOWS_MAX_PATH = 260;
/** Handle-contention codes: AV scanners, Search indexer, Explorer previews. */
const TRANSIENT_WINDOWS_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY']);

/**
 * Accept either a bare platform string or an options bag, so callers can use
 * whichever reads better: `pythonExecutable(root, 'win32')` or
 * `dbPath(dir, { platform: 'win32' })`.
 */
function _platform(arg = process.platform) {
  if (typeof arg === 'string') return arg;
  return (arg && arg.platform) || process.platform;
}

function isWindows(platform = process.platform) {
  return _platform(platform) === 'win32';
}

/** The right `path` implementation for the platform — never the host's. */
function paths(platform = process.platform) {
  return isWindows(_platform(platform)) ? path.win32 : path.posix;
}

/**
 * The per-user application-data directory Co-op owns.
 * Windows: %APPDATA%\Co-op (matches Electron's app.getPath('userData')).
 * POSIX:   $XDG_DATA_HOME/Co-op, else ~/.config/Co-op.
 * macOS:   ~/Library/Application Support/Co-op.
 */
function appDataDir({ platform = process.platform, env = process.env, appName = 'Co-op' } = {}) {
  platform = _platform(platform);
  const p = paths(platform);
  if (isWindows(platform)) {
    const roaming = env.APPDATA;
    if (!roaming) throw new Error('APPDATA is not set — cannot locate the Co-op data directory.');
    return p.join(roaming, appName);
  }
  if (platform === 'darwin') {
    const home = env.HOME;
    if (!home) throw new Error('HOME is not set — cannot locate the Co-op data directory.');
    return p.join(home, 'Library', 'Application Support', appName);
  }
  const home = env.HOME;
  if (!home) throw new Error('HOME is not set — cannot locate the Co-op data directory.');
  return p.join(env.XDG_DATA_HOME || p.join(home, '.local', 'share'), appName);
}

/** The local SQLite file for a given app-data directory. */
function dbPath(appData, { platform = process.platform, fileName = 'coop.db' } = {}) {
  platform = _platform(platform);
  return paths(platform).join(appData, fileName);
}

/**
 * Interpreter of a repo-local virtualenv. Windows venvs put it in
 * Scripts\python.exe; the E2E harness used to hardcode bin/python and failed
 * on Windows with a bare ENOENT.
 */
function pythonExecutable(rootDir, platform = process.platform) {
  const target = _platform(platform);
  const p = paths(target);
  return isWindows(target)
    ? p.join(rootDir, 'backend', '.venv', 'Scripts', 'python.exe')
    : p.join(rootDir, 'backend', '.venv', 'bin', 'python');
}

/**
 * Make one filename component legal on the target platform.
 * Used for anything Co-op names on the user's behalf (backups, exports), so a
 * business called `ACME <Ltd>/NUL` cannot produce an unwritable path.
 */
function sanitizeComponent(name, platform = process.platform) {
  platform = _platform(platform);
  let out = String(name ?? '');
  if (isWindows(platform)) {
    // Path separators become a dash rather than silently splitting the name.
    out = out.replace(/[\\/]+/g, '-');
    out = out.replace(WINDOWS_ILLEGAL_CHARS, '');
    // Windows strips trailing dots/spaces itself, which makes "report." and
    // "report" the same file — do it here so what we show is what we write.
    out = out.replace(/[. ]+$/g, '').trim();
    if (WINDOWS_RESERVED_NAMES.test(out.split('.')[0])) out = `_${out}`;
  } else {
    out = out.replace(/\/+/g, '-').replace(/[\u0000-\u001F]/g, '').trim();
  }
  out = out.replace(/\s+/g, ' ');
  if (out === '' || out === '.' || out === '..') out = 'coop';
  if (out.length > WINDOWS_MAX_COMPONENT) out = out.slice(0, WINDOWS_MAX_COMPONENT);
  return out;
}

/**
 * Default file name for a locally saved database backup.
 * The date comes first-sortable, the label (business name) is sanitised, and
 * the whole thing is guaranteed writable on Windows.
 */
function backupFileName({ stamp = new Date(), label = '', platform = process.platform, ext = 'db' } = {}) {
  platform = _platform(platform);
  const when =
    stamp instanceof Date
      ? stamp.toISOString().slice(0, 16).replace(/[:T]/g, '-')
      : sanitizeComponent(stamp, platform);
  const who = label ? ` - ${sanitizeComponent(label, platform)}` : '';
  return sanitizeComponent(`coop-backup-${when}${who}`, platform) + `.${ext}`;
}

/**
 * Windows refuses paths at or beyond MAX_PATH unless long-path support is
 * enabled — fail early with a message the owner can act on, instead of
 * surfacing a raw SQLite error.
 */
function assertPathLengthOk(fullPath, { platform = process.platform, longPathAware = false } = {}) {
  platform = _platform(platform);
  if (!isWindows(platform) || longPathAware) return;
  if (String(fullPath).length >= WINDOWS_MAX_PATH) {
    throw new Error(
      'That path is too long for Windows (' +
        `${String(fullPath).length} of ${WINDOWS_MAX_PATH - 1} characters). ` +
        'Choose a shorter folder, e.g. C:\\Backups.'
    );
  }
}

/**
 * `sqlite+aiosqlite:` URL for an absolute path.
 *
 * POSIX absolute paths start with "/", so the URL grows a fourth slash
 * (sqlite:////home/...). Windows paths start with a drive letter, so they
 * must not be sliced — `sqlite:///C:/...` is the correct form. The E2E
 * harness used to strip the first character unconditionally, which produced
 * a nonsense URL on Windows.
 */
function sqliteUrl(absPath, { platform = process.platform, driver = 'aiosqlite' } = {}) {
  platform = _platform(platform);
  const normalised = isWindows(platform) ? String(absPath).replace(/\\/g, '/') : String(absPath);
  return `sqlite+${driver}:///${normalised}`;
}

/**
 * True when a filesystem error is worth retrying: Windows lets antivirus,
 * the Search indexer or Explorer hold a handle on a file we just closed.
 * Never treated as transient off Windows, where these codes mean something
 * real (permissions, a genuinely busy device).
 */
function isTransientWindowsError(err, platform = process.platform) {
  if (!isWindows(_platform(platform))) return false;
  return Boolean(err) && TRANSIENT_WINDOWS_CODES.has(err.code);
}

/** Synchronous sleep (the backup/restore paths are sync by design). */
function sleepSync(ms) {
  if (ms <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      /* fall back to a busy wait if Atomics is unavailable */
    }
  }
}

/**
 * Run `fn`, retrying Windows handle contention with a short backoff.
 * Non-transient errors (and anything off Windows) surface immediately.
 */
function withRetry(label, fn, { attempts = 5, sleepMs = 40, platform = process.platform } = {}) {
  platform = _platform(platform);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return fn();
    } catch (e) {
      lastError = e;
      if (!isTransientWindowsError(e, platform) || attempt === attempts) break;
      sleepSync(sleepMs * attempt);
    }
  }
  const code = lastError && lastError.code ? ` (${lastError.code})` : '';
  const wrapped = new Error(`${label} failed${code}: ${lastError ? lastError.message : 'unknown error'}`);
  wrapped.code = lastError && lastError.code;
  wrapped.cause = lastError;
  throw wrapped;
}

module.exports = {
  APP_USER_MODEL_ID,
  WINDOWS_MAX_COMPONENT,
  WINDOWS_MAX_PATH,
  isWindows,
  _platform,
  paths,
  appDataDir,
  dbPath,
  pythonExecutable,
  sanitizeComponent,
  backupFileName,
  assertPathLengthOk,
  sqliteUrl,
  isTransientWindowsError,
  sleepSync,
  withRetry,
};
