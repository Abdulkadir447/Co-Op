'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  deadlinePassed,
  readState,
  writeState,
  clearState,
  UPDATE_DEADLINE_DAYS,
  DAY_MS,
} = require('../updater');

test('deadlinePassed: false until the update is a week old', () => {
  const now = Date.now();
  assert.strictEqual(deadlinePassed(undefined, now), false, 'no download yet');
  assert.strictEqual(deadlinePassed(now - 6 * DAY_MS, now), false, 'day 6: still deferrable');
  assert.strictEqual(deadlinePassed(now - 7 * DAY_MS, now), true, 'day 7+: force install');
  assert.strictEqual(deadlinePassed(now - 30 * DAY_MS, now), true, 'long overdue');
});

test('deadlinePassed: default deadline is 7 days', () => {
  assert.strictEqual(UPDATE_DEADLINE_DAYS, 7);
});

test('state round-trips through userData and clears', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coop-updater-'));
  try {
    assert.deepStrictEqual(readState(dir), {}, 'missing file reads as empty');
    writeState(dir, { downloadedAt: 123, version: '9.9.9' });
    assert.deepStrictEqual(readState(dir), { downloadedAt: 123, version: '9.9.9' });
    writeState(dir, { version: '10.0.0' }); // merges, keeps downloadedAt
    assert.deepStrictEqual(readState(dir), { downloadedAt: 123, version: '10.0.0' });
    clearState(dir);
    assert.deepStrictEqual(readState(dir), {}, 'cleared');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readState tolerates a corrupt file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coop-updater-bad-'));
  try {
    fs.writeFileSync(path.join(dir, 'update-state.json'), '{not json');
    assert.deepStrictEqual(readState(dir), {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
