# `public/` — files served from the site root

Only two things belong here:

- `logo.png` — the favicon and apple-touch-icon, referenced as `/logo.png`.
- `og.png` — the 1200×630 social preview image (WhatsApp, Twitter/X, LinkedIn).
  Regenerate it after a rename or a palette change with the script kept in
  `scripts/make_og.py`. The tags that point at it are in `index.html` and use a
  placeholder host until the real domain exists — see the README section
  "Temporary placeholders".

**Product screenshots and videos no longer live here.** They are imported as
modules from `src/assets/` so the site can tell at build time whether they
exist — a missing file hides its section instead of rendering a placeholder.
See `src/assets/README.md`.
