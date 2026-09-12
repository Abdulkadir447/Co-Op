# Co-op — marketing website

A static marketing site for Co-op. It is deliberately **dependency-free**
(plain HTML/CSS/JS — no build step) so it can be hosted anywhere.

## Design system parity

Every colour, the Inter typeface, the full type scale, radii and shadows in
`styles.css` mirror the app's design tokens in
`frontend/src/theme/{colors,typography,tokens,dark}.ts` (the single source of
truth). The CSS custom properties at the top of `styles.css` are a 1:1 copy of
those tokens, and `[data-theme="dark"]` mirrors `theme/dark.ts`. If a token
changes in the app, update it here too — the header comment in `styles.css`
flags this.

## Run locally

```sh
cd website
python -m http.server 5178 --bind 0.0.0.0
# open http://localhost:5178
```

## Files

- `index.html` — the landing page (hero, five systems, Co-op AI, pricing, FAQ, CTA).
- `styles.css` — design tokens (as CSS variables) + components.
- `main.js` — light/dark toggle (persisted to localStorage).
