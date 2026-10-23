#!/usr/bin/env node
/**
 * Runs the compiled local-analytics port tests (`test/analytics.test.ts`).
 *
 * Why this exists: `tsc` must emit CommonJS for these tests (they import
 * extensionless modules, which only CommonJS resolves), but this package is
 * `"type": "module"` — so the output directory needs its own
 * `{"type":"commonjs"}` marker before `node --test` will load it. Doing that
 * here keeps `npm test` a single cross-platform command instead of a shell
 * one-liner that behaves differently on Windows.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const outDir = new URL('../test-build/', import.meta.url);

writeFileSync(new URL('package.json', outDir), '{ "type": "commonjs" }\n');

// Every compiled suite, not a hardcoded one — adding test/foo.test.ts is enough.
const testDir = new URL('test/', outDir);
const suites = readdirSync(fileURLToPath(testDir))
  .filter((name) => name.endsWith('.test.js'))
  .map((name) => fileURLToPath(new URL(name, testDir)))
  .sort();

if (suites.length === 0) {
  console.error('No compiled test suites found in test-build/test/');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...suites], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
