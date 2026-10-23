/**
 * The baked API origin the packaged app's CSP allows.
 *
 * A distributed build has no dev-server proxy and no environment on the user's
 * machine, so scripts/copy-renderer.js writes the origin of VITE_API_URL into
 * api-origin.json at build time and main.js reads it back into connect-src.
 * If that read is wrong the app starts but every API call is blocked by CSP —
 * a silent, total failure, which is why the fallbacks are pinned here.
 *
 * Run with: cd electron && npm test
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { bakedApiOrigin } = require('../apiOrigin');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'coop-api-origin-'));
}

test('reads the origin baked in at build time', () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, 'api-origin.json'),
    JSON.stringify({ apiOrigin: 'https://api.coop.example.com' }),
  );
  assert.strictEqual(bakedApiOrigin(dir), 'https://api.coop.example.com');
});

test('is empty when there is no file (unpackaged / dev run)', () => {
  assert.strictEqual(bakedApiOrigin(tmpDir()), '');
});

test('is empty on a corrupt file instead of failing to start', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'api-origin.json'), '{ not json');
  assert.strictEqual(bakedApiOrigin(dir), '');
});

test('is empty when apiOrigin is not a string', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'api-origin.json'), JSON.stringify({ apiOrigin: 42 }));
  assert.strictEqual(bakedApiOrigin(dir), '');
});

test('is empty for a build made without VITE_API_URL', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'api-origin.json'), JSON.stringify({ apiOrigin: '' }));
  assert.strictEqual(bakedApiOrigin(dir), '');
});
