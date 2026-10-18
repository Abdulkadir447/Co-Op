/**
 * The Node-ABI guard that runs on `npm ci` in electron/.
 *
 * `better-sqlite3` only publishes prebuilds for a fixed set of
 * NODE_MODULE_VERSIONs. On anything else npm falls back to node-gyp and fails
 * with "Could not find any Visual Studio installation to use", which reads
 * like a missing-compiler problem but is an ABI problem. The guard turns that
 * 40-line stack trace into an actionable message.
 *
 * Run with: cd electron && npm test
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-node.js');

/** Run the guard with a faked Node version / ABI. */
const run = (nodeVersion, abi) => {
  const wrapper = [
    `Object.defineProperty(process.versions,'node',{value:${JSON.stringify(nodeVersion)},configurable:true});`,
    `Object.defineProperty(process.versions,'modules',{value:${JSON.stringify(abi)},configurable:true});`,
    `require(${JSON.stringify(SCRIPT)});`,
  ].join('\n');
  return spawnSync(process.execPath, ['-e', wrapper], { encoding: 'utf8' });
};

test('passes on every Node ABI better-sqlite3 ships a prebuild for', () => {
  for (const [abi, major] of [[108, '18.20.0'], [115, '20.19.0'], [127, '22.22.3'], [131, '23.9.0']]) {
    const r = run(major, String(abi));
    assert.strictEqual(r.status, 0, `ABI ${abi} should pass: ${r.stderr}`);
    assert.strictEqual(r.stderr, '', 'a passing ABI must stay silent');
  }
});

test('fails on Node 24, which has no prebuild, and says why', () => {
  const r = run('24.19.0', '137');
  assert.strictEqual(r.status, 1, 'Node 24 must be rejected');
  assert.match(r.stderr, /Node 24\.19\.0 \(ABI 137\)/);
  // The whole point: name it as an ABI problem, not a compiler problem.
  assert.match(r.stderr, /not a compiler problem/i);
  // And give the exact escape hatch.
  assert.match(r.stderr, /nvm use 22/);
  assert.match(r.stderr, /process\.versions\.modules/);
});

test('the failure message lists the ABIs that do work', () => {
  const r = run('24.19.0', '137');
  for (const major of [18, 20, 22, 23]) {
    assert.match(r.stderr, new RegExp(`Node ${major} \\(ABI \\d+\\)`), `Node ${major} missing`);
  }
});

test('the guard itself is valid CommonJS and exits 0 on this machine when applicable', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  const abi = Number(process.versions.modules);
  const expected = [108, 115, 127, 131].includes(abi) ? 0 : 1;
  assert.strictEqual(r.status, expected, `unexpected exit on ABI ${abi}: ${r.stderr}`);
});
