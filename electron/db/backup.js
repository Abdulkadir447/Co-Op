/**
 * Co-op local backup primitives (PRD Phase 4 "Backup system", desktop side).
 *
 * The cloud backup (backend/backups.py) is a JSON snapshot of business data;
 * THIS module backs up the device's local SQLite database itself — the
 * offline mirror plus its sync queue — as a portable `.db` file.
 *
 * Three primitives, kept Electron-free so the test suite drives them on
 * plain Node:
 *
 *   isSqliteFile(path)      — header check (never trust a picked file).
 *   snapshot(db, destPath)  — a consistent copy via VACUUM INTO (works on
 *                             both better-sqlite3 and node:sqlite).
 *   replaceDbFile(dbPath, srcPath)
 *                           — swap the live DB file with a backup file
 *                             (caller closes the DB first, then reopens).
 *                             Windows-safe: the live file is renamed aside
 *                             and only removed once the copy has landed, so
 *                             a locked or failed swap can never leave the
 *                             owner with no database at all.
 *   assertRestoreSafe(dataLayer)
 *                           — refuse when the sync queue still holds
 *                             pending or parked-conflict operations: a
 *                             restore would silently drop work the owner
 *                             has not synced yet. Never lose data.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { assertPathLengthOk, withRetry } = require('../platform');

// 16-byte magic header every SQLite file starts with.
const SQLITE_HEADER = Buffer.from('SQLite format 3\u0000', 'utf8');

/** True when the file exists and starts with the SQLite magic header. */
/** @param {object} [fsLike] injectable for tests; defaults to node:fs. */
function isSqliteFile(file, fsLike = fs) {
  try {
    const fd = fsLike.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(16);
      const read = fsLike.readSync(fd, buf, 0, 16, 0);
      return read === 16 && buf.equals(SQLITE_HEADER);
    } finally {
      fsLike.closeSync(fd);
    }
  } catch {
    return false;
  }
}

/** Suffix for the copy a restore parks the live database under. */
const ASIDE_SUFFIX = '.coop-old';

/** The database file plus the WAL/SHM sidecars SQLite leaves next to it. */
function _sidecars(dbPath) {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
}

/** SQL-escape a path for VACUUM INTO (single quotes doubled). */
function _quote(p) {
  return `'${String(p).replace(/'/g, "''")}'`;
}

/**
 * Write a consistent snapshot of the open database to `destPath`.
 * VACUUM INTO produces a standalone, checkpointed copy — safe while the app
 * keeps using the live file.
 */
function snapshot(db, destPath, opts = {}) {
  const f = opts.fs || fs;
  assertPathLengthOk(destPath, opts);
  // VACUUM INTO refuses to overwrite, so clear the target first. On Windows
  // that delete can hit a handle held by AV/Search — retry rather than fail.
  withRetry(
    `Clear the existing backup (${path.basename(destPath)})`,
    () => {
      if (f.existsSync(destPath)) f.rmSync(destPath);
    },
    opts,
  );
  db.exec(`VACUUM INTO ${_quote(destPath)};`);
  return destPath;
}

/**
 * Replace the live database file with a backup file. The caller MUST have
 * closed the database first; WAL/SHM sidecars are removed so the restored
 * file opens clean. Throws if `srcPath` is not a SQLite database.
 */
function replaceDbFile(dbPath, srcPath, opts = {}) {
  const f = opts.fs || fs;

  if (!isSqliteFile(srcPath, f)) {
    throw new Error('The selected file is not a valid Co-op local database.');
  }

  // Move the live database (and its WAL/SHM sidecars) aside instead of
  // deleting it. Windows keeps handles open briefly after close() — AV
  // scanners, the Search indexer, Explorer thumbnails — and a delete-then-copy
  // that fails halfway would leave the owner with no database at all.
  const aside = new Map();
  for (const live of _sidecars(dbPath)) {
    if (!f.existsSync(live)) continue;
    const parked = `${live}${ASIDE_SUFFIX}`;
    withRetry(
      `Release the current database (${path.basename(live)})`,
      () => {
        if (f.existsSync(parked)) f.rmSync(parked);
        f.renameSync(live, parked);
      },
      opts,
    );
    aside.set(live, parked);
  }

  try {
    f.mkdirSync(path.dirname(dbPath), { recursive: true });
    withRetry(`Restore into ${path.basename(dbPath)}`, () => f.copyFileSync(srcPath, dbPath), opts);
  } catch (e) {
    // Put the previous database back so the app still opens.
    for (const [live, parked] of aside) {
      try {
        withRetry(`Roll back ${path.basename(live)}`, () => f.renameSync(parked, live), opts);
      } catch {
        /* the parked copy still exists — the data is not lost */
      }
    }
    throw new Error(
      `Co-op could not replace the local database (${e.code || e.message}). ` +
        'Your previous database is untouched — close other programs using it and try again.'
    );
  }

  for (const parked of aside.values()) {
    try {
      withRetry(`Discard the previous copy (${path.basename(parked)})`, () => f.rmSync(parked), opts);
    } catch {
      /* a stale .coop-old file is harmless; the next restore clears it */
    }
  }
  return dbPath;
}

/**
 * Guard for restore: the sync queue must be empty (nothing pending, no
 * parked conflicts). Restoring over unsynced work would lose it silently —
 * Co-op refuses instead.
 */
function assertRestoreSafe(dataLayer) {
  const pending = dataLayer.queue.countPending();
  const conflicts = dataLayer.queue.countConflicts();
  if (pending > 0 || conflicts > 0) {
    throw new Error(
      'Restore is unavailable while there are unsynced changes ' +
        `(${pending} pending, ${conflicts} conflict${conflicts === 1 ? '' : 's'}). ` +
        'Reconnect and sync first — nothing has been changed.'
    );
  }
}

module.exports = {
  ASIDE_SUFFIX,
  isSqliteFile,
  snapshot,
  replaceDbFile,
  assertRestoreSafe,
};
