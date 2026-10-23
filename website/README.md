# Co-op — marketing website

A React + Vite marketing site for Co-op.

## Design system parity (the point)

The website imports the app's **real** design tokens and plan catalog directly:

- `src/theme.ts` reads `frontend/src/theme/{colors,dark,typography,tokens}.ts`
  and paints them onto `:root` as CSS variables (light + dark).
- `src/App.tsx` applies the `type` scale from `frontend/src/theme/typography.ts`
  to headings/body, and renders pricing from `frontend/src/billing/plans.ts`
  (`PLAN_CATALOG` + `displayPrice`).

So colours, the Inter typeface, the type scale, radii, shadows **and the prices**
are literally the same objects the product uses — they cannot drift.

## Run locally

```sh
cd website
npm install
npm run dev      # http://localhost:5178
npm run build    # type-check + production build into dist/
```

## Files

- `index.html` — Vite entry.
- `src/main.tsx` — mounts the app, paints the tokens.
- `src/theme.ts` — maps the app tokens (light/dark) to CSS variables.
- `src/App.tsx` — the landing page (hero, five systems, Zeno AI, pricing, FAQ, CTA).
- `src/styles.css` — layout & components (colours come from the injected variables).
