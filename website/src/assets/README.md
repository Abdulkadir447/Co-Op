# Website media — what goes here, and what happens when it does not

The site **never renders a placeholder**. A section whose assets are missing is
omitted entirely, so a broken link or an empty frame can't reach a visitor. Drop
the real files in and the section appears on the next build.

## Product tour

One image per app page, any of `.png`, `.jpg`, `.webp`, named by page id:

```
src/assets/screenshots/dashboard.png
src/assets/screenshots/products.png
src/assets/screenshots/inventory.png
src/assets/screenshots/orders.png
src/assets/screenshots/customers.png
src/assets/screenshots/invoices.png
src/assets/screenshots/ai.png
```

Optional silent loop per page, same id: `src/assets/videos/dashboard.mp4`
(5–10 s, muted, H.264, under ~2 MB). A page with a video plays it on hover,
tap or keyboard focus; a page with only an image shows the image.

The section is hidden until **all seven** images exist. That is deliberate:
half a tour looks more broken than no tour.

## Founders video

Either drop `src/assets/videos/founders.mp4` (plus an optional poster at
`src/assets/screenshots/founders-poster.jpg`) or set `FOUNDERS_EMBED` in
`src/App.tsx` to a YouTube/Vimeo embed URL. With neither, the section is
hidden.

## Logo

`public/logo.png` — served from the site root, referenced as `/logo.png`.
