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

// The renderer bakes VITE_API_URL in at build time, and a packaged app has
// neither the Vite dev-server proxy nor an environment on the user's machine.
// So the main process cannot learn the API origin from process.env at runtime:
// it has to be baked in too, or the CSP connect-src allows only localhost and
// EVERY API request is blocked. Emit the origin next to the app for main.js.
const apiUrl = process.env.VITE_API_URL || '';
let apiOrigin = '';
if (apiUrl) {
  try {
    apiOrigin = new URL(apiUrl).origin;
  } catch {
    console.error(`VITE_API_URL is not a valid absolute URL: ${apiUrl}`);
    process.exit(1);
  }
}
const ORIGIN_FILE = path.join(__dirname, '..', 'api-origin.json');
fs.writeFileSync(ORIGIN_FILE, `${JSON.stringify({ apiOrigin }, null, 2)}\n`);
if (apiOrigin) {
  console.log(`api origin baked into the packaged app: ${apiOrigin}`);
} else {
  console.warn(
    'WARNING: VITE_API_URL is not set, so the packaged app will call the ' +
      'relative /api and cannot reach a backend. Set VITE_API_URL before ' +
      '`npm run dist` for a distributable build.',
  );
}
