# The Co-op brand mark

**"The C that holds the shop."**

The mark is one idea drawn with two shapes: a **C** — the product's name — wrapping a
**crate** — stock, the trader's goods. Co-op holds the business, the way it holds the
ledger, the orders and the invoices.

```
brand/coop-mark.svg        the mark, full colour (source of truth)
brand/coop-mark-mono.svg   single colour, for print / one-colour signs
brand/build-assets.mjs     renders every PNG/ICO from the SVG above
```

---

## Why the old mark was replaced

The previous mark was three overlapping rounded petals with a white four-point spark in
the middle. It was pleasant and it meant nothing:

- **At the sizes it actually appears it turned into a flower.** 16px in a browser tab,
  30px in the top bar, 40px in the navigation rail. All three read as a decorative
  blob, not a business.
- **A spark meant "AI" back in 2023.** The product is a shop's ledger that happens to
  be intelligent, not an AI product that happens to have a ledger. The mark was
  advertising the wrong half.
- **Nothing in it said retail.** An owner seeing it in a WhatsApp link preview learned
  nothing about what the app does.

The new mark is built to survive those exact sizes: one heavy ring, one heavy block,
no thin details, no gradient-dependent contrast.

---

## Geometry

Drawn on a 48×48 grid so it scales to any pixel size without a redraw.

| Element | Value |
| --- | --- |
| Ring centre / radius / stroke | `24,24` · `r 14.2` · `6.8` |
| Ring caps | round; the ring is **open** on the right |
| Crate | `15.2 × 13.6`, corner radius `4.8`, centred on `24,24` |
| Live area | `x/y 6.4–41.6` — 13% clear space inside the box |

Two rules keep the mark recognisable:

1. **The ring stays open on the right.** Close it and it becomes a © or a padlock —
   both were drawn and both were wrong (a closed ring with a block inside is a
   copyright symbol; a bag silhouette at 16px is a padlock).
2. **The crate never touches the ring.** In full colour the different gradient
   directions separate them; in single colour `coop-mark-mono.svg` knocks a 3.2-unit
   gap out of the ring. Closing that gap makes the two shapes one grey blob.

## Colour

| Use | Value |
| --- | --- |
| Ring | gradient `#5b5fef → #8a4cfc`, 135° |
| Crate | gradient `#8a4cfc → #5b5fef`, 90° (reversed on purpose) |
| Single colour | `currentColor` |

These are the product's existing AI-gradient tokens (`frontend/src/theme/colors.ts`),
not a new palette: a logo that introduces colours the app does not use makes every
screen look slightly off-brand.

The reversed crate gradient is what makes the two shapes read as two objects rather
than one glyph. Keep it.

## Clear space and minimum size

- **Clear space:** half the crate's height (≈7 units) on all sides. The SVG already
  carries 13% padding inside its own box, so in practice: don't crop it.
- **Minimum size:** 16px for the mark alone; below that use the wordmark instead.
- **On light surfaces** the mark is used as-is on `#fcf8ff`.
- **On dark surfaces** it is used as-is — both gradient stops clear 3:1 against
  `#14131a`. Verified by rendering, not assumed.

## Where it is used

| Surface | File | Notes |
| --- | --- | --- |
| App (React) | `frontend/src/components/brand/CoopLogo.tsx` → `<CoopMark>` | `useId()` keeps the two gradients unique when it renders many times |
| App favicon | `frontend/public/coop-mark.svg` | referenced by `frontend/index.html` |
| Website | `website/src/App.tsx` → `<CoopMark>` | same geometry, site-scoped gradient ids |
| Website favicon / PWA / social | `website/public/*` | generated; see that folder's README |
| Windows installer + taskbar | `electron/coop-icon.ico` (7 sizes), `electron/coop-icon.png` | `.ico` is what NSIS and Explorer use |

`frontend/test/brand-mark.test.ts` fails if the geometry, the colours or the icon
declarations drift between those copies, and fails if the retired three-petal mark
comes back anywhere.

## Changing the mark

```bash
# 1. edit brand/coop-mark.svg
# 2. install the renderer once (local only; not part of the pnpm workspace)
cd brand/.tools && npm i && cd ../..
# 3. re-render every PNG/ICO
node brand/build-assets.mjs
# 4. prove the copies still agree
pnpm --filter ./frontend test
```

Never edit the PNGs by hand — the next run of the script overwrites them, and in the
meantime the favicon and the app disagree.

## Honest limits

- No wordmark file is provided: the site and the app set **Co-op** as real text, which
  stays crisp and themeable. If a printed wordmark is ever needed, it should be drawn
  properly in a vector editor rather than traced from the screen.
- There is no horizontal lockup file (mark + wordmark side by side) to hand to a
  printer. The site renders one; it has not been exported for print.
- The mark was tested by rendering at 16/24/32/48/64/96px on light and dark and
  looking at it, which is more than most logos get and less than a real brand
  studio would do.
