# `public/` — files served from the site root

Only two things belong here:

- `logo.png` — the favicon and apple-touch-icon, referenced as `/logo.png`.
- `og.png` *(not yet added)* — the 1200×630 social preview image. Add it together
  with the `og:url` / `og:image` tags in `index.html` once the production domain
  is fixed; both tags need an absolute URL.

**Product screenshots and videos no longer live here.** They are imported as
modules from `src/assets/` so the site can tell at build time whether they
exist — a missing file hides its section instead of rendering a placeholder.
See `src/assets/README.md`.
