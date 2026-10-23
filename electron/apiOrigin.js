'use strict';
/**
 * The backend origin a packaged build was compiled against.
 *
 * A packaged Co-op has no Vite dev-server proxy and no environment on the
 * user's machine, so `process.env` cannot supply the API origin at runtime.
 * `scripts/copy-renderer.js` therefore bakes the origin of `VITE_API_URL` into
 * `api-origin.json` at build time, and the main process reads it back so the
 * CSP `connect-src` allows the same origin the renderer was built to call.
 * Without that, the CSP would allow only localhost and every API request in a
 * distributed build would be blocked.
 *
 * Kept as its own module (rather than inline in main.js) so it is testable
 * without Electron.
 */
const fs = require('fs');
const path = require('path');

/**
 * The baked API origin, or '' when there is none — an unpackaged/dev run, or a
 * build made without VITE_API_URL. A missing or corrupt file must never stop
 * the app from starting.
 *
 * @param {string} [dir] Directory holding api-origin.json (defaults to this
 *   module's directory, which is where the packaged asar puts it).
 * @returns {string} An origin such as "https://api.coop.example.com", or "".
 */
function bakedApiOrigin(dir = __dirname) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'api-origin.json'), 'utf8'));
    return typeof parsed.apiOrigin === 'string' ? parsed.apiOrigin : '';
  } catch {
    return '';
  }
}

module.exports = { bakedApiOrigin };
