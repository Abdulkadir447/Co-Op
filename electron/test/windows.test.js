/**
 * Windows-targeted suite.
 *
 * Co-op's desktop build ships to Windows, where the assumptions the rest of
 * the codebase makes quietly break: %APPDATA% instead of ~/.config,
 * Scripts\python.exe instead of bin/python, filenames that may not contain
 * <>:"|?* or end in a dot, MAX_PATH, and files that stay locked after close
 * (antivirus, the Search indexer, Explorer previews).
 *
 * These tests are NOT global smoke tests and they do not need Windows to run:
 * every production helper takes the platform explicitly, so the win32 surface
 * is exercised on Linux CI through `path.win32`. The last group is the
 * opposite — it needs a real Windows filesystem and skips everywhere else.
 *
 * Run with: cd electron && npm test
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const platform = require('../platform');
const {
  APP_USER_MODEL_ID,
  WINDOWS_MAX_PATH,
  appDataDir,
  assertPathLengthOk,
  backupFileName,
  dbPath,
  isTransientWindowsError,
  isWindows,
  paths,
  pythonExecutable,
  sanitizeComponent,
  sqliteUrl,
  withRetry,
} = platform;
const { createDataLayer } = require('../db');
const { ASIDE_SUFFIX, isSqliteFile, replaceDbFile, snapshot } = require('../db/backup');

const WIN = 'win32';
const APPDATA = 'C:\\Users\\Amina\\AppData\\Roaming';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'coop-win-'));
}

/**
 * A filesystem that fails the first N calls of the named operations with
 * EPERM, then delegates to the real one — how Windows behaves while a scanner
 * holds a handle on a file we just closed.
 */
function flakyFs(failures = {}) {
  const remaining = { ...failures };
  const calls = {};
  const wrap = (name) => (...args) => {
    calls[name] = (calls[name] || 0) + 1;
    if (remaining[name] > 0) {
      remaining[name] -= 1;
      const err = new Error(`${name} refused: another process is using the file`);
      err.code = 'EPERM';
      throw err;
    }
    return fs[name](...args);
  };
  return {
    calls,
    existsSync: (...a) => fs.existsSync(...a),
    openSync: (...a) => fs.openSync(...a),
    readSync: (...a) => fs.readSync(...a),
    closeSync: (...a) => fs.closeSync(...a),
    mkdirSync: (...a) => fs.mkdirSync(...a),
    rmSync: wrap('rmSync'),
    renameSync: wrap('renameSync'),
    copyFileSync: wrap('copyFileSync'),
  };
}

// ---------------------------------------------------------------------------
// A. Where the data lives
// ---------------------------------------------------------------------------

test('win32: the data directory is %APPDATA%\\Co-op, not ~/.config', () => {
  const dir = appDataDir({ platform: WIN, env: { APPDATA } });
  assert.strictEqual(dir, `${APPDATA}\\Co-op`);
  assert.strictEqual(dbPath(dir, { platform: WIN }), `${APPDATA}\\Co-op\\coop.db`);
  assert.ok(!dbPath(dir, { platform: WIN }).includes('/'), 'no forward slashes may leak in');
});

test('win32: a missing APPDATA is a clear error, not a path called "undefined"', () => {
  assert.throws(() => appDataDir({ platform: WIN, env: {} }), /APPDATA is not set/);
});

test('non-windows platforms keep their own conventions', () => {
  assert.strictEqual(
    appDataDir({ platform: 'darwin', env: { HOME: '/Users/amina' } }),
    '/Users/amina/Library/Application Support/Co-op',
  );
  assert.strictEqual(
    appDataDir({ platform: 'linux', env: { HOME: '/home/amina' } }),
    '/home/amina/.local/share/Co-op',
  );
  assert.strictEqual(
    appDataDir({ platform: 'linux', env: { HOME: '/home/amina', XDG_DATA_HOME: '/data' } }),
    '/data/Co-op',
  );
});

test('paths() hands back the platform path module, never the host one', () => {
  assert.strictEqual(paths(WIN), path.win32);
  assert.strictEqual(paths('linux'), path.posix);
  assert.strictEqual(isWindows(WIN), true);
  assert.strictEqual(isWindows('linux'), false);
});

// ---------------------------------------------------------------------------
// B. Finding the venv interpreter (the E2E harness used to hardcode bin/python)
// ---------------------------------------------------------------------------

test('win32: the venv interpreter is Scripts\\python.exe', () => {
  assert.strictEqual(
    pythonExecutable('C:\\repo\\coop', WIN),
    'C:\\repo\\coop\\backend\\.venv\\Scripts\\python.exe',
  );
  // the options-bag form must agree with the positional one
  assert.strictEqual(
    pythonExecutable('C:\\repo\\coop', { platform: WIN }),
    pythonExecutable('C:\\repo\\coop', WIN),
  );
});

test('posix: the venv interpreter is bin/python', () => {
  assert.strictEqual(
    pythonExecutable('/srv/coop', 'linux'),
    '/srv/coop/backend/.venv/bin/python',
  );
});

// ---------------------------------------------------------------------------
// C. SQLAlchemy URLs for an absolute SQLite path
// ---------------------------------------------------------------------------

test('win32: a drive-letter path keeps its drive letter', () => {
  assert.strictEqual(
    sqliteUrl('C:\\Users\\Amina\\AppData\\Local\\Temp\\cloud.db', { platform: WIN }),
    'sqlite+aiosqlite:///C:/Users/Amina/AppData/Local/Temp/cloud.db',
  );
});

test('posix: an absolute path still produces the four-slash form', () => {
  // Regression guard: the old code sliced the first character off the path,
  // which is right for neither platform.
  assert.strictEqual(sqliteUrl('/tmp/coop/cloud.db', { platform: 'linux' }), 'sqlite+aiosqlite:////tmp/coop/cloud.db');
});

// ---------------------------------------------------------------------------
// D. Filenames Windows will actually accept
// ---------------------------------------------------------------------------

test('win32: illegal characters are removed and separators become dashes', () => {
  assert.strictEqual(sanitizeComponent('Q3 <final>: v2?', WIN), 'Q3 final v2');
  assert.strictEqual(sanitizeComponent('ACME\\Reports/2026', WIN), 'ACME-Reports-2026');
  assert.strictEqual(sanitizeComponent('tab\tand\nnewline', WIN), 'tabandnewline');
});

test('win32: trailing dots and spaces are stripped (Windows would strip them anyway)', () => {
  assert.strictEqual(sanitizeComponent('ACME Ltd.   ', WIN), 'ACME Ltd');
  assert.strictEqual(sanitizeComponent('report...', WIN), 'report');
});

test('win32: reserved device names are defused at the component level', () => {
  assert.strictEqual(sanitizeComponent('CON', WIN), '_CON');
  assert.strictEqual(sanitizeComponent('NUL.db', WIN), '_NUL.db');
  assert.strictEqual(sanitizeComponent('com1', WIN), '_com1');
  assert.strictEqual(sanitizeComponent('LPT9', WIN), '_LPT9');
  // "CON Ltd" is not a device name — only the bare name is reserved.
  assert.strictEqual(sanitizeComponent('CON Ltd', WIN), 'CON Ltd');
});

test('win32: garbage in, a usable name out', () => {
  assert.strictEqual(sanitizeComponent('???', WIN), 'coop');
  assert.strictEqual(sanitizeComponent('', WIN), 'coop');
  assert.strictEqual(sanitizeComponent('..', WIN), 'coop');
  assert.strictEqual(sanitizeComponent(null, WIN), 'coop');
});

test('win32: a component never exceeds 255 characters', () => {
  const out = sanitizeComponent('x'.repeat(400), WIN);
  assert.strictEqual(out.length, 255);
});

test('win32: backup file names survive a hostile business name', () => {
  const name = backupFileName({
    stamp: new Date('2026-09-05T14:30:00Z'),
    label: 'ACME <Ltd> / NUL:',
    platform: WIN,
  });
  assert.match(name, /^coop-backup-2026-09-05-14-30 - ACME Ltd - NUL\.db$/);
  assert.ok(!/[<>:"|?*\\]/.test(name), `still illegal on Windows: ${name}`);
  assert.ok(!name.endsWith('.'), 'a name ending in a dot is not writable');
});

test('win32: a business literally called CON still gets a writable backup name', () => {
  const name = backupFileName({ stamp: new Date('2026-01-02T03:04:05Z'), label: 'CON', platform: WIN });
  assert.strictEqual(name, 'coop-backup-2026-01-02-03-04 - _CON.db');
});

// ---------------------------------------------------------------------------
// E. MAX_PATH
// ---------------------------------------------------------------------------

test('win32: a path at MAX_PATH is refused with advice, not a raw SQLite error', () => {
  const long = `C:\\${'folder\\'.repeat(40)}coop-backup.db`;
  assert.ok(long.length >= WINDOWS_MAX_PATH);
  assert.throws(() => assertPathLengthOk(long, { platform: WIN }), /too long for Windows/);
  assert.doesNotThrow(() => assertPathLengthOk(long, { platform: WIN, longPathAware: true }));
  assert.doesNotThrow(() => assertPathLengthOk(long, { platform: 'linux' }));
  assert.doesNotThrow(() => assertPathLengthOk('C:\\Backups\\coop.db', { platform: WIN }));
});

test('win32: snapshot refuses an over-long destination before touching the database', () => {
  const dir = tmpDir();
  const live = path.join(dir, 'coop.db');
  const dl = createDataLayer(live, { force: 'node:sqlite' });
  try {
    const dest = path.join(dir, `${'sub\\'.repeat(60)}backup.db`);
    assert.throws(() => snapshot(dl.db, dest, { platform: WIN }), /too long for Windows/);
  } finally {
    dl.close();
  }
});

// ---------------------------------------------------------------------------
// F. Restore while Windows is holding the file (the data-loss path)
// ---------------------------------------------------------------------------

test('win32: a locked live database is retried, not failed', () => {
  const dir = tmpDir();
  const live = path.join(dir, 'coop.db');
  const dl = createDataLayer(live, { force: 'node:sqlite' });
  dl.products.create(1, { name: 'Yam', unit_price: 10, current_stock: 5 });
  dl.close();

  const backupFile = path.join(dir, 'good.db');
  const dl2 = createDataLayer(backupFile, { force: 'node:sqlite' });
  dl2.products.create(1, { name: 'Cassava', unit_price: 12, current_stock: 7 });
  dl2.close();

  // First rename is refused (scanner still holds the handle), then succeeds.
  const ffs = flakyFs({ renameSync: 1 });
  replaceDbFile(live, backupFile, { fs: ffs, platform: WIN, sleepMs: 1, attempts: 5 });

  const reopened = createDataLayer(live, { force: 'node:sqlite' });
  const names = reopened.products.list(1).map((p) => p.name);
  reopened.close();
  assert.deepStrictEqual(names, ['Cassava'], 'the restored database is the backup');
  assert.ok(ffs.calls.renameSync >= 2, 'the refused rename was retried');
  assert.strictEqual(fs.existsSync(live + ASIDE_SUFFIX), false, 'the parked copy was cleaned up');
});

test('win32: if the copy fails, the previous database is put back untouched', () => {
  const dir = tmpDir();
  const live = path.join(dir, 'coop.db');
  const dl = createDataLayer(live, { force: 'node:sqlite' });
  dl.products.create(1, { name: 'Yam', unit_price: 10, current_stock: 5 });
  dl.close();

  const backupFile = path.join(dir, 'good.db');
  const dl2 = createDataLayer(backupFile, { force: 'node:sqlite' });
  dl2.products.create(1, { name: 'Cassava', unit_price: 12, current_stock: 7 });
  dl2.close();

  // Every copy attempt is refused: the swap cannot complete.
  const ffs = flakyFs({ copyFileSync: 50 });
  assert.throws(
    () => replaceDbFile(live, backupFile, { fs: ffs, platform: WIN, sleepMs: 1, attempts: 3 }),
    /previous database is untouched/,
  );

  const reopened = createDataLayer(live, { force: 'node:sqlite' });
  const names = reopened.products.list(1).map((p) => p.name);
  reopened.close();
  assert.deepStrictEqual(names, ['Yam'], 'the owner still has their data');
});

test('a failed restore leaves the WAL sidecars parked, not deleted', () => {
  const dir = tmpDir();
  const live = path.join(dir, 'coop.db');
  const dl = createDataLayer(live, { force: 'node:sqlite' });
  dl.products.create(1, { name: 'Yam', unit_price: 10, current_stock: 5 });
  dl.close();
  fs.writeFileSync(`${live}-wal`, 'wal-bytes');

  const backupFile = path.join(dir, 'good.db');
  const dl2 = createDataLayer(backupFile, { force: 'node:sqlite' });
  dl2.close();

  const ffs = flakyFs({ copyFileSync: 50 });
  assert.throws(() => replaceDbFile(live, backupFile, { fs: ffs, platform: WIN, sleepMs: 1, attempts: 2 }));
  assert.strictEqual(fs.existsSync(`${live}-wal`), true, 'the sidecar came back with the database');
  assert.strictEqual(fs.readFileSync(`${live}-wal`, 'utf8'), 'wal-bytes');
});

test('a restore never accepts a file that is not a Co-op database', () => {
  const dir = tmpDir();
  const live = path.join(dir, 'coop.db');
  const dl = createDataLayer(live, { force: 'node:sqlite' });
  dl.close();
  const notADb = path.join(dir, 'notes.txt');
  fs.writeFileSync(notADb, 'shopping list');
  const ffs = flakyFs();
  assert.throws(
    () => replaceDbFile(live, notADb, { fs: ffs, platform: WIN, sleepMs: 1 }),
    /not a valid Co-op local database/,
  );
  assert.strictEqual(isSqliteFile(live), true, 'the live database was never touched');
});

// ---------------------------------------------------------------------------
// G. Which errors are worth retrying, and the retry helper itself
// ---------------------------------------------------------------------------

test('only Windows handle contention counts as transient', () => {
  const eperm = { code: 'EPERM' };
  assert.strictEqual(isTransientWindowsError(eperm, WIN), true);
  assert.strictEqual(isTransientWindowsError({ code: 'EBUSY' }, WIN), true);
  assert.strictEqual(isTransientWindowsError({ code: 'EACCES' }, WIN), true);
  // The same code off Windows means something real — never swallow it.
  assert.strictEqual(isTransientWindowsError(eperm, 'linux'), false);
  // A missing file is not a lock.
  assert.strictEqual(isTransientWindowsError({ code: 'ENOENT' }, WIN), false);
  assert.strictEqual(isTransientWindowsError(undefined, WIN), false);
});

test('withRetry stops at the attempt limit and reports the code', () => {
  let attempts = 0;
  assert.throws(
    () =>
      withRetry(
        'Release the current database (coop.db)',
        () => {
          attempts += 1;
          const err = new Error('locked');
          err.code = 'EBUSY';
          throw err;
        },
        { attempts: 3, sleepMs: 1, platform: WIN },
      ),
    /Release the current database \(coop\.db\) failed \(EBUSY\)/,
  );
  assert.strictEqual(attempts, 3);

  let second = 0;
  const out = withRetry(
    'ok',
    () => {
      second += 1;
      if (second < 2) {
        const err = new Error('locked');
        err.code = 'EBUSY';
        throw err;
      }
      return 'done';
    },
    { attempts: 3, sleepMs: 1, platform: WIN },
  );
  assert.strictEqual(out, 'done');
});

// ---------------------------------------------------------------------------
// H. The Windows installer configuration
// ---------------------------------------------------------------------------

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('the Windows target is a per-user NSIS installer with a real shortcut name', () => {
  const targets = pkg.build.win.target.map((t) => (typeof t === 'string' ? t : t.target));
  assert.ok(targets.includes('nsis'), `expected an nsis target, got ${JSON.stringify(targets)}`);
  assert.strictEqual(pkg.build.nsis.oneClick, false, 'owners must be able to pick the folder');
  assert.strictEqual(pkg.build.nsis.allowToChangeInstallationDirectory, true);
  assert.strictEqual(pkg.build.nsis.perMachine, false, 'per-user install needs no admin prompt');
  assert.strictEqual(pkg.build.nsis.shortcutName, 'Co-op');
  assert.strictEqual(pkg.build.nsis.uninstallDisplayName, 'Co-op', 'no "coop-electron 0.1.0" in Add/Remove Programs');
  assert.strictEqual(pkg.build.nsis.deleteAppDataOnUninstall, false, 'uninstalling must not destroy the local database');
  assert.strictEqual(pkg.build.nsis.createDesktopShortcut, true);
});

test('the taskbar identity matches the installer appId', () => {
  // main.js calls app.setAppUserModelId(APP_USER_MODEL_ID); if this drifts
  // from the builder appId, Windows shows two taskbar entries.
  assert.strictEqual(APP_USER_MODEL_ID, pkg.build.appId);
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /setAppUserModelId\(APP_USER_MODEL_ID\)/);
});

test('the icon ships and is big enough for Windows', () => {
  const icon = path.join(__dirname, '..', pkg.build.win.icon);
  assert.ok(fs.existsSync(icon), `missing icon: ${pkg.build.win.icon}`);
  const buf = fs.readFileSync(icon);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.ok(width >= 256 && height >= 256, `icon is ${width}x${height}; Windows wants >= 256`);
});

test('every module main.js requires is inside the packaged app', () => {
  // A missing entry here ships an installer that crashes on launch — the
  // failure only shows up on a real machine, so it is asserted instead.
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const required = [...main.matchAll(/require\('\.\/([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(required.length > 0, 'no relative requires found — the assertion is broken');
  for (const mod of required) {
    const covered = pkg.build.files.some((entry) => {
      if (entry === mod || entry === `${mod}.js`) return true;
      // Glob entries: "db/**/*" covers every module under db/.
      const base = entry.split('*')[0].replace(/\/+$/, '');
      return base.length > 0 && (mod === base || mod.startsWith(`${base}/`));
    });
    assert.ok(covered, `"${mod}" is required by main.js but not in build.files`);
  }
});

test('the app refuses to run twice (Windows double-launch)', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /requestSingleInstanceLock\(\)/);
  assert.match(main, /second-instance/);
});

// ---------------------------------------------------------------------------
// I. The defaults: what happens when a caller does NOT pass a platform
// ---------------------------------------------------------------------------
//
// Every helper defaults to the running platform. On a Windows machine those
// defaults are what actually execute in production, so they are checked here
// by standing in for Windows.

function asWindows(fn) {
  const real = process.platform;
  Object.defineProperty(process, 'platform', { value: WIN, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(process, 'platform', { value: real, configurable: true });
  }
}

test('with no platform argument, a Windows machine gets Windows behaviour', () => {
  asWindows(() => {
    assert.strictEqual(paths(), path.win32);
    assert.strictEqual(appDataDir({ env: { APPDATA } }), `${APPDATA}\\Co-op`);
    assert.strictEqual(
      pythonExecutable('C:\\repo\\coop'),
      'C:\\repo\\coop\\backend\\.venv\\Scripts\\python.exe',
    );
    assert.strictEqual(sanitizeComponent('Q3 <final>: v2?'), 'Q3 final v2');
    assert.strictEqual(sanitizeComponent('CON'), '_CON');
    assert.strictEqual(
      backupFileName({ stamp: new Date('2026-09-05T14:30:00Z'), label: 'ACME Ltd.' }),
      'coop-backup-2026-09-05-14-30 - ACME Ltd.db',
    );
    assert.strictEqual(isTransientWindowsError({ code: 'EPERM' }), true);
    assert.throws(
      () => assertPathLengthOk(`C:\\${'folder\\'.repeat(40)}coop.db`),
      /too long for Windows/,
    );
    assert.strictEqual(sqliteUrl('C:\\data\\coop.db'), 'sqlite+aiosqlite:///C:/data/coop.db');
  });
  // the host platform must be restored for the tests that follow
  assert.strictEqual(process.platform, 'linux');
});

test('with no platform argument, this machine keeps its own behaviour', () => {
  assert.strictEqual(paths(), process.platform === WIN ? path.win32 : path.posix);
  assert.strictEqual(isTransientWindowsError({ code: 'EPERM' }), process.platform === WIN);
});

// ---------------------------------------------------------------------------
// J. Needs a real Windows filesystem — skipped everywhere else
// ---------------------------------------------------------------------------

test('win32 (real): an open handle really does block deletion', { skip: process.platform !== WIN && 'requires Windows' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coop-winlock-'));
  const file = path.join(dir, 'coop.db');
  fs.writeFileSync(file, 'SQLite format 3\u0000......');
  const fd = fs.openSync(file, 'r+');
  try {
    assert.throws(
      () => fs.rmSync(file),
      (err) => {
        assert.ok(isTransientWindowsError(err, WIN), `unexpected code: ${err.code}`);
        return true;
      },
    );
  } finally {
    fs.closeSync(fd);
    fs.rmSync(file, { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('win32 (real): the retry helper recovers from a held handle', { skip: process.platform !== WIN && 'requires Windows' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coop-winretry-'));
  const file = path.join(dir, 'coop.db');
  fs.writeFileSync(file, 'data');
  const fd = fs.openSync(file, 'r+');
  // Release the handle partway through the retries, the way a scanner does.
  setTimeout(() => fs.closeSync(fd), 120);
  withRetry('delete the database', () => fs.rmSync(file), { attempts: 10, sleepMs: 40, platform: WIN });
  assert.strictEqual(fs.existsSync(file), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
