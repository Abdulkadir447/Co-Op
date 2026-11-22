# Product screenshots

**These are mocks, not screenshots of a running build.** They are drawn by
`scripts/render-screenshots.py` from the app's real design tokens, labels and
layout rules, and every place they appear on the site says so.

They are here because selling a desktop app without showing it is a harder sell
than showing an honest drawing, and because the alternative — stock photography
of someone else's software, or fake browser chrome around an invented
interface — would be a lie.

## Replacing them with the real thing

1. Run the app, seed a shop with believable data (not `Test 1`, `Test 2`).
2. Capture at 2× on a clean window, light theme: Dashboard, Receivables.
3. Save over these filenames, keeping 1120×700 and 1120×600.
4. Delete the "mock" note next to the images in `src/pages/Home.tsx` and
   `src/pages/Features.tsx` — and only then. The note is the whole reason this
   is allowed on the page.

`dashboard-dark.png` exists to show the dark theme works; it is used smaller.
