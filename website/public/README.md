# `public/` — files served from the site root

Everything in here is **generated** from `brand/coop-mark.svg` by
`node brand/build-assets.mjs`. Do not hand-edit the PNGs: edit the SVG, re-run
the script, and commit the result. That is what keeps the favicon, the phone
home-screen icon and the social card from drifting apart.

| File | Size | Used for |
| --- | --- | --- |
| `coop-mark.svg` | vector | The tab icon on every modern browser |
| `favicon-32.png` | 32 | Older browsers, bookmarks |
| `favicon-16.png` | 16 | Tab bars that still ask for it |
| `logo.png` | 512 | `apple-touch-icon` and the maskable Android icon |
| `icon-192.png` / `icon-512.png` | 192 / 512 | `manifest.webmanifest` (Add to Home Screen) |
| `og.png` | 1200×630 | WhatsApp / X / LinkedIn preview cards |

`manifest.webmanifest` makes the site installable to a phone home screen, which
matters because most visitors arrive on a phone from a WhatsApp link.

**Product screenshots and videos do not live here.** They are imported as
modules from `src/assets/` so the site can tell at build time whether they
exist — a missing file hides its section instead of rendering a placeholder.
See `src/assets/README.md`.

The social card's tags in `index.html` use a placeholder host until the real
domain exists — see the README section "Temporary placeholders".
