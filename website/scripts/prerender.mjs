#!/usr/bin/env node
/**
 * Prerender every route to its own HTML file.
 *
 * Input:  dist/index.html (the Vite build) + dist/ssr/entry.js (this bundle)
 * Output: dist/index.html, dist/pricing/index.html, dist/features/index.html…
 *         each with real copy, its own <title>, canonical, OG tags and JSON-LD.
 *
 * Why bother, on a site that is already a React app: an empty <div id="root">
 * is a page that a crawler may or may not render and a WhatsApp preview cannot
 * read at all. This market shares links on WhatsApp; a preview with no title is
 * a link nobody taps.
 *
 * `cleanUrls: true` in vercel.json serves `dist/pricing/index.html` at
 * `/pricing`. The SPA still hydrates on top and takes over navigation.
 */
import { build } from 'esbuild';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const SSR_DIR = join(DIST, 'ssr');

/** Build the render bundle from the site's own source (no second toolchain). */
async function bundleForNode() {
  await build({
    entryPoints: [join(ROOT, 'src', 'prerender-entry.tsx')],
    outfile: join(SSR_DIR, 'entry.cjs'),
    bundle: true,
    platform: 'node',
    // CommonJS, not ESM: react-dom/server's Node build does `require('util')`,
    // and esbuild's ESM output turns that into a dynamic require it cannot
    // support. CJS output keeps the requires intact for Node to resolve.
    format: 'cjs',
    target: 'node20',
    jsx: 'automatic',
    // CSS imports are handled by Vite for the browser build; node does not
    // need them, and `empty` keeps esbuild from trying to write a .css file.
    loader: { '.css': 'empty' },
    logLevel: 'warning',
  });
}

/** Escape text for use inside an attribute value. */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * JSON-LD, inlined as a script tag.
 *
 * `</` is escaped because a closing script tag inside a JSON string would end
 * the block early — the one way a valid schema payload can break the page.
 */
function jsonLd(blocks) {
  return blocks
    .map(
      (block, i) =>
        `<script type="application/ld+json" id="ld-${i === 0 ? 'app' : 'faq'}">${JSON.stringify(block).replace(
          /</g,
          '\\u003c',
        )}</script>`,
    )
    .join('\n    ');
}

function headFor(route, siteUrl, data = []) {
  // An alias route (e.g. /signup → /trial) keeps its own file so old links
  // work, but its canonical and og:url point at the real page.
  const canonicalPath = route.aliasOf ?? route.path;
  const url = `${siteUrl}${canonicalPath === '/' ? '/' : canonicalPath}`;
  return [
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Co-op" />`,
    `<meta property="og:title" content="${esc(route.title)}" />`,
    `<meta property="og:description" content="${esc(route.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(siteUrl)}/og.png" />`,
    `<meta property="og:locale" content="en_NG" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(route.title)}" />`,
    `<meta name="twitter:description" content="${esc(route.description)}" />`,
    `<meta name="twitter:image" content="${esc(siteUrl)}/og.png" />`,
    ...(data.length ? [jsonLd(data)] : []),
  ].join('\n    ');
}

/**
 * Swap the <head> of the built index.html for this route's, and the body's
 * `#root` for the rendered markup. Everything else — the stylesheet link, the
 * module script, the icon links — is left exactly as Vite emitted it.
 */
function page(template, route, html, siteUrl, data = []) {
  let out = template;
  // Drop the single-route head tags Vite kept from index.html; the prerender is
  // the authority for title/description/canonical/social.
  out = out.replace(/<title>[\s\S]*?<\/title>\s*/i, '');
  out = out.replace(/<meta name="description"[^>]*>\s*/i, '');
  out = out.replace(/<link rel="canonical"[^>]*>\s*/i, '');
  out = out.replace(/<meta property="og:[^"]*"[^>]*>\s*/gi, '');
  out = out.replace(/<meta name="twitter:[^"]*"[^>]*>\s*/gi, '');
  out = out.replace('</head>', `  ${headFor(route, siteUrl, data)}\n  </head>`);
  // Replace the boot loader with the rendered page. The loader stays in the
  // template for any route the prerenderer does not know about, but a page we
  // *did* render should never flash a spinner over text that is already there.
  out = out.replace(/<div id="root">[\s\S]*?<\/div>\s*<\/body>/, `<div id="root">${html}</div>\n  </body>`);
  return out;
}

async function main() {
  // The prerenderer runs as plain Node, so it cannot read `import.meta.env`.
  // It must fall back to the SAME host the client bundle uses, or the canonical
  // tags it writes and the ones the app writes at runtime disagree — which is
  // how the site ended up canonicalising to a domain that does not resolve.
  const siteUrl = (process.env.VITE_PUBLIC_URL || 'https://co-op-fawn.vercel.app').replace(
    /\/$/,
    '',
  );
  const template = readFileSync(join(DIST, 'index.html'), 'utf8');

  await bundleForNode();
  const { render, structuredData, faqItemsFor, ROUTES } = await import(
    pathToFileURL(join(SSR_DIR, 'entry.cjs')).href
  );

  let count = 0;
  for (const route of ROUTES) {
    const html = render(route.path);
    // FAQPage markup only where the questions are on screen; Google treats
    // markup for absent Q&A as spam.
    const out = page(template, route, html, siteUrl, structuredData(faqItemsFor(route.path)));
    const file = route.path === '/' ? join(DIST, 'index.html') : join(DIST, route.path, 'index.html');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, out);
    count += 1;
    console.log(`  prerendered ${route.path.padEnd(14)} ${(out.length / 1024).toFixed(1)}KB`);
  }

  // A real 404 body, so a mistyped URL does not hydrate into a blank page.
  const notFoundHtml = render('/__not-found__');
  writeFileSync(
    join(DIST, '404.html'),
    page(
      template,
      { path: '/404', title: 'Page not found | Co-op', description: 'That page does not exist.' },
      notFoundHtml,
      siteUrl,
      structuredData(),
    ),
  );

  // sitemap.xml — every real page, with the placeholder host until a real one
  // is configured. Generated, so it cannot go stale.
  const today = new Date().toISOString().slice(0, 10);
  const urls = ROUTES.filter((r) => !r.aliasOf).map(
    (r) => `  <url>\n    <loc>${siteUrl}${r.path === '/' ? '/' : r.path}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`,
  ).join('\n');
  writeFileSync(
    join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );

  // robots.txt — generated, and it points at the sitemap on the same host.
  writeFileSync(
    join(DIST, 'robots.txt'),
    ['User-agent: *', 'Allow: /', '', `Sitemap: ${siteUrl}/sitemap.xml`, ''].join('\n'),
  );

  // The SSR bundle is build scaffolding, not an asset.
  rmSync(SSR_DIR, { recursive: true, force: true });

  console.log(`\nprerendered ${count} routes + 404 + sitemap + robots`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
