/**
 * Build every raster brand asset from brand/coop-mark.svg.
 *
 * Run:  node brand/build-assets.mjs
 * Needs: sharp (a devDependency of the website? no — run it with
 *        `npx --yes sharp-cli` or a local sharp install; see BRAND.md).
 *
 * Everything is generated, nothing is hand-edited: change the SVG, re-run, and
 * the favicon, the Windows icon, the PWA icons and the social card all move
 * together. Hand-drawn PNGs are how a brand drifts.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(dirname(dirname(fileURLToPath(import.meta.url))), 'brand', '.tools', 'package.json'));
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp is not installed. Run:  npm i --no-save sharp');
  process.exit(1);
}

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MARK = readFileSync(join(ROOT, 'brand', 'coop-mark.svg'), 'utf8');
const SURFACE = { r: 252, g: 248, b: 255, alpha: 1 }; // --surface, the site's canvas

const out = (p) => join(ROOT, p);
const ensure = (p) => mkdirSync(dirname(out(p)), { recursive: true });

/** Render the mark at `size`, transparent background. */
const render = async (size) => sharp(Buffer.from(MARK)).resize(size, size).png().toBuffer();

/** Render the mark centred on a square of `size` with `inset` percent padding. */
const onCanvas = async (size, { inset = 0.16, background = SURFACE, radius = 0.22 } = {}) => {
  const inner = Math.round(size * (1 - inset * 2));
  const art = await render(inner);
  const left = Math.round((size - inner) / 2);
  let base;
  if (background) {
    const r = Math.round(size * radius);
    const rounded = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
        `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="rgb(${background.r},${background.g},${background.b})"/>` +
        `</svg>`,
    );
    base = await sharp(rounded).png().toBuffer();
  } else {
    base = await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
  }
  return sharp(base).composite([{ input: art, left, top: left }]).png().toBuffer();
};

/* ── 1. Favicons ─────────────────────────────────────────────────────────────
 * A transparent mark below 32px (a rounded tile at 16px is mush), and the
 * rounded lavender tile from 32px up, which is how it looks in a tab bar next
 * to other sites' favicons.
 */
const favicons = [
  { path: 'website/public/logo.png', size: 512, opts: { inset: 0.14 } }, // apple-touch-icon, must be opaque
  { path: 'website/public/favicon-32.png', size: 32, opts: { inset: 0.08, background: null } },
  { path: 'website/public/favicon-16.png', size: 16, opts: { inset: 0.04, background: null } },
];
for (const f of favicons) {
  ensure(f.path);
  writeFileSync(out(f.path), await onCanvas(f.size, f.opts));
  console.log('wrote', f.path, `${f.size}px`);
}

/* ── 2. Desktop (Windows .ico + the Electron window/taskbar icon) ─────────── */
// Multi-resolution ICO, assembled by hand: sharp has no ICO writer.
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = [];
for (const s of icoSizes) icoImages.push(await onCanvas(s, { inset: 0.1 }));
const icoHeader = Buffer.alloc(6 + 16 * icoImages.length);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // 1 = icon
icoHeader.writeUInt16LE(icoImages.length, 4);
let offset = icoHeader.length;
icoImages.forEach((buf, i) => {
  const s = icoSizes[i];
  const e = 6 + i * 16;
  icoHeader.writeUInt8(s >= 256 ? 0 : s, e); // width
  icoHeader.writeUInt8(s >= 256 ? 0 : s, e + 1); // height
  icoHeader.writeUInt8(0, e + 2); // palette
  icoHeader.writeUInt8(0, e + 3); // reserved
  icoHeader.writeUInt16LE(1, e + 4); // colour planes
  icoHeader.writeUInt16LE(32, e + 6); // bits per pixel
  icoHeader.writeUInt32LE(buf.length, e + 8);
  icoHeader.writeUInt32LE(offset, e + 12);
  offset += buf.length;
});
writeFileSync(out('electron/coop-icon.ico'), Buffer.concat([icoHeader, ...icoImages]));
writeFileSync(out('electron/coop-icon.png'), await onCanvas(256, { inset: 0.1 }));
console.log('wrote electron/coop-icon.ico (7 sizes) and coop-icon.png');

/* ── 3. Social card ────────────────────────────────────────────────────────
 * 1200×630, the same claim the page makes. Drawn, not generated: an AI image
 * garbles the product name, and a fake screenshot would be a lie.
 */
const wordmark = async () => {
  const mark = await render(150);
  const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="200">
    <text x="170" y="128" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-size="104"
      font-weight="700" fill="#1a1b26" letter-spacing="-3">Co-op</text>
  </svg>`);
  return sharp({ create: { width: 900, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, left: 0, top: 25 }, { input: text, left: 0, top: 0 }])
    .png().toBuffer();
};
const og = sharp({
  create: { width: 1200, height: 630, channels: 4, background: SURFACE },
})
  .composite([
    { input: await wordmark(), left: 88, top: 120 },
    {
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="220">
        <text x="92" y="60" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-size="34" fill="#5f5e6e">Inventory, orders, customers and invoicing</text>
        <text x="92" y="108" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-size="34" fill="#5f5e6e">in one calm app for Nigerian retail.</text>
        <text x="92" y="190" font-family="Segoe UI, DejaVu Sans, Arial, sans-serif" font-size="24" fill="#8c8a9c">Windows desktop  ·  Works offline  ·  Priced in Naira</text>
      </svg>`),
      left: 0,
      top: 330,
    },
    {
      // The brand bar: recognition at 200px wide, which is the only size a
      // WhatsApp preview is ever seen at.
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="16"><rect width="1200" height="16" fill="#4143d5"/></svg>`,
      ),
      left: 0,
      top: 614,
    },
  ])
  .png()
  .toBuffer();
ensure('website/public/og.png');
writeFileSync(out('website/public/og.png'), await og);
console.log('wrote website/public/og.png 1200x630');

/* ── 4. PWA / installable icons ───────────────────────────────────────────── */
for (const s of [192, 512]) {
  const p = `website/public/icon-${s}.png`;
  ensure(p);
  writeFileSync(out(p), await onCanvas(s, { inset: 0.14 }));
  console.log('wrote', p);
}

console.log('\ndone — re-run after editing brand/coop-mark.svg');
