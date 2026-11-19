#!/usr/bin/env node
/**
 * Explains, in readable words, why the running Node cannot install
 * `better-sqlite3` from a prebuilt binary.
 *
 * Without this, the install dies deep inside node-gyp with "Could not find any
 * Visual Studio installation to use" — which reads like a missing compiler
 * problem but is really an ABI problem. better-sqlite3 only publishes
 * prebuilds for a fixed set of NODE_MODULE_VERSIONs; on anything else it tries
 * to compile, and that needs the full MSVC toolchain.
 *
 * IMPORTANT — this script cannot be the primary gate. npm runs a root
 * `preinstall` *after* the dependency tree is installed, so on Node 24
 * better-sqlite3's own build script fails before this line is ever reached
 * (verified against npm 10 and 11). The gate that actually stops it is
 * `engine-strict=true` in electron/.npmrc, which makes npm refuse on Node 24
 * before it downloads anything, because electron/package.json's engines field
 * is `>=18 <24`. This script then runs on `npm test` / `npm start`, where its
 * long-form advice is the useful part.
 *
 * The allowed ABIs below are the win32/linux/darwin x64 prebuilds published on
 * https://github.com/Wiselibs/better-sqlite3/releases for the version pinned in
 * electron/package.json. Update this list when bumping better-sqlite3.
 */
'use strict';

const PREBUILT_ABIS = {
  108: 18,
  115: 20,
  127: 22,
  131: 23,
};

const abi = Number(process.versions.modules);
const major = Number(process.versions.node.split('.')[0]);

// engines (>=18 <24) and the ABI table must BOTH allow this Node. Node 24 is
// ABI 137: not in the table, and outside engines — it is the case that used to
// reach node-gyp and produce a wall of Visual Studio errors.
if (PREBUILT_ABIS[abi] && major >= 18 && major < 24) {
  process.exit(0);
}

const supported = Object.entries(PREBUILT_ABIS)
  .map(([a, m]) => `Node ${m} (ABI ${a})`)
  .join(', ');

console.error(`
Co-op desktop: Node ${process.versions.node} (ABI ${abi}) has no prebuilt
better-sqlite3 binary, so npm would try to compile it from source and fail
unless the Visual Studio "Desktop development with C++" workload is installed.

This is not a compiler problem.

FASTEST UNBLOCK — skip the Node-ABI build entirely:

    npm ci --ignore-scripts

Packaging does not need it: electron-builder's @electron/rebuild fetches the
prebuilt better-sqlite3 for Electron's own ABI, so "npm run dist" still works
and the installer is complete. What you lose is "npm start" (dev mode), which
loads the module against Node's ABI.

PROPER FIX — use a Node that has a prebuild:

    nvm install 22.20.0
    nvm use 22.20.0
    node -p "process.versions.modules"   # must print 127

Prebuilds exist for: ${supported}. Node 22 LTS is recommended. Clear
electron/node_modules first so stale build artifacts are not reused:

    Remove-Item -Recurse -Force node_modules
    npm ci

If nvm cannot reach nodejs.org, point it at a mirror first:

    nvm node_mirror https://npmmirror.com/mirrors/node/
    nvm install 22.20.0

Last resort on Node ${major}: install the Visual Studio "Desktop development
with C++" workload.
`);

process.exit(1);
