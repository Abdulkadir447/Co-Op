#!/usr/bin/env node
/**
 * Fails `npm ci` early, with a readable message, when the running Node has no
 * prebuilt `better-sqlite3` binary.
 *
 * Without this, `npm ci` in electron/ dies deep inside node-gyp with
 * "Could not find any Visual Studio installation to use" — which reads like a
 * missing compiler problem but is really an ABI problem. better-sqlite3 only
 * publishes prebuilds for a fixed set of NODE_MODULE_VERSIONs; on anything
 * else it tries to compile, and that needs the full MSVC toolchain.
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

if (PREBUILT_ABIS[abi]) {
  process.exit(0);
}

const supported = Object.entries(PREBUILT_ABIS)
  .map(([a, m]) => `Node ${m} (ABI ${a})`)
  .join(', ');

console.error(`
Co-op desktop: Node ${process.versions.node} (ABI ${abi}) has no prebuilt
better-sqlite3 binary, so npm would try to compile it from source and fail
unless the Visual Studio "Desktop development with C++" workload is installed.

This is not a compiler problem. Switch Node and no compiler is needed:

    nvm install 22.20.0
    nvm use 22.20.0
    node -p "process.versions.modules"   # must print 127

Prebuilds exist for: ${supported}.
Node 22 LTS is recommended. If you are using nvm on Windows (nvm4w), remove
electron/node_modules first so the stale build artifacts do not get reused:

    Remove-Item -Recurse -Force node_modules
    npm ci

If you must stay on Node ${major}, install the C++ workload instead, or run
"npm ci --ignore-scripts" and accept that "npm start" (dev) will not work
until electron-builder rebuilds the module for Electron's own ABI.
`);

process.exit(1);
