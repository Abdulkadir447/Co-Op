# Website assets — drop your files here

The site looks for these exact paths. If a file is missing, the section shows a
styled placeholder instead, so nothing breaks — just add the files and refresh.

## Founders video
- `videos/founders.mp4` — the founders story (16:9). A poster image is optional:
  `screenshots/founders-poster.jpg`.
- Prefer YouTube/Vimeo? Set `FOUNDERS_EMBED` in `src/App.tsx` to the embed URL
  and it will be used instead of the mp4.

## Product tour (one per app page)
For each page id below, add a screenshot and (recommended) a short muted loop:
- `screenshots/<id>.png`  — static screenshot (shown by default)
- `videos/<id>.mp4`       — 5–10s silent loop (plays on hover / tap)

Page ids: `dashboard`, `products`, `inventory`, `orders`, `customers`,
`invoices`, `ai`.

Example: `screenshots/customers.png` + `videos/customers.mp4`.

Keep videos small (H.264, < ~2 MB, muted, loopable) so the page stays fast.
