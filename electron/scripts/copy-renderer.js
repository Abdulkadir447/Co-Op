/**
 * Packaged-build helper: copies the production renderer build into the
 * electron app directory so electron-builder can ship it inside the asar.
 * Run automatically by `npm run pack` / `npm run dist` in electron/.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// __dirname is electron/scripts, so the repo-root frontend build is two levels
// up (electron/scripts -> electron -> repo root -> frontend/dist). The dest
// renderer-dist lives inside electron/ (one level up).
const SRC = path.join(__dirname, '..', '..', 'frontend', 'dist');
const DEST = path.join(__dirname, '..', 'renderer-dist');

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  console.error('frontend/dist/index.html is missing — run `npm --prefix ../frontend run build` first.');
  process.exit(1);
}
fs.rmSync(DEST, { recursive: true, force: true });
fs.cpSync(SRC, DEST, { recursive: true });
console.log(`renderer copied: ${SRC} -> ${DEST}`);
