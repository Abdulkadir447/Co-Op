# Frontend review — the app and the marketing site

**Date:** 23 October 2026
**Scope:** `frontend/src` (the product UI, 19,586 lines of TSX) and `website/src` (the marketing site, 470 lines), graded against the four installed skill packs.
**Method:** static read of every file cited, mechanical scans over the whole tree, and measured contrast on the real token values. No browser was available, so nothing below is a claim about how it *looks* — only about what the code declares. Where a judgement needed a render, the finding says **Not verified**.

---

## The short version, in plain English

1. **The product UI is genuinely well built underneath.** One token file owns every colour, the buttons/modals/tables/empty states are shared primitives, loading and error states exist on every screen I opened, and the app already respects "reduce motion". That is more than most codebases at this stage.
2. **But it fails accessibility in three places that would be embarrassing in a demo.** The page doesn't declare a language. On a phone the menu button is permanently invisible, so there is no navigation at all. Green, amber and blue status pills are too pale to read (2.1:1 to 3.1:1 where 4.5:1 is the law).
3. **There is a layout bug on every page.** `PageHeader` puts the subtitle *beside* the page title instead of under it. It's one component, so every module inherits it.
4. **The marketing site is not ready to be shown to a buyer.** Seven product screenshots are missing, so visitors see "screenshot / clip goes here" tiles. The founders video frame says "drop videos/founders.mp4". The contact section says "Add a number in CONTACT to enable this." The pricing buttons go to the top of the page. Prices are in dollars while the product is Naira-only.
5. **Grading:** app **C+**, website **D+**, combined **C**. The app is a B-quality product with C-level polish defects; the site is a template with the wiring unfinished.

---

## 1. What was installed

Four sources, installed at **project level** into `.agents/skills/` with `.claude/skills/` symlinks, pinned in `skills-lock.json` (all three repositories are MIT):

| Source | Skills | Notable ones used in this review |
| --- | --- | --- |
| `addyosmani/agent-skills` | 25 | `frontend-ui-engineering`, `code-review-and-quality`, `performance-optimization` |
| `anthropics/skills` | 20 | `frontend-design`, `webapp-testing`, `brand-guidelines` |
| `jakubkrehel/skills` | 15 | `better-interface`, `better-accessibility`, `better-layout`, `better-writing`, `better-typography`, `better-colors`, `better-ui`, `interface-review` |
| `Leonxlnx/taste-skill` | 1 | `design-taste-frontend` (tasteskill 2.5) |

Commands used (re-runnable, idempotent):

```bash
npx --yes skills@latest add addyosmani/agent-skills --all
npx --yes skills@latest add anthropics/skills --all
npx --yes skills@latest add jakubkrehel/skills --all
npx --yes skills@latest add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend" -y
npx skills list        # what is installed
npx skills remove --all  # undo everything
```

**Nothing tracked was modified by the install.** `git diff` was empty after all four commands; the only new paths are `.agents/`, `.claude/skills/*` and `skills-lock.json`. The 40 MB inside `design-taste-frontend/assets/` is the skill's own component/photo kit — it lives outside `frontend/` and `website/`, so Vite never sees it. No hook, script or binary from a skill was executed.

> One caveat worth knowing: `design-taste-frontend/SKILL.md` ships a `Stop` hook that runs `scripts/gate.mjs` under Claude Code, and the kit's own checker needs Node 22 + Chrome. Neither the hook nor the checker ran here, and neither is wired into CI.

---

## 2. Scope and method

| Field | Value |
| --- | --- |
| Target | Whole-repository interface audit (not a change review) |
| Files read in full | `AppShell`, `Sidebar`, `TopBar`, `PageHeader`, `CoopButton`, `CoopModal`, `CoopBadge`, `CoopEmptyState`, `CoopLoader`, `CoopTable`, `Products/index`, `Dashboard/index` (parts), `KpiCard`, `ForecastCard`, `CreateOrderPage` (parts), `styles.css`, `theme/*`, `index.html`; `website/src/App.tsx`, `website/src/styles.css`, `website/src/theme.ts`, `website/index.html` |
| Mechanically scanned | all 161 TS/TSX/CSS files in `frontend/src`; all 4 files in `website/src` |
| Skills applied | `better-interface` as the orchestrator, then `better-accessibility` → `better-layout` → `better-writing` → `better-typography` → `better-colors` → `better-ui`; `frontend-ui-engineering` for architecture; `design-taste-frontend` for the marketing page only |
| Excluded | `electron/`, `backend/`, `node_modules`, `.agents/` itself |
| Not verified | every rendered/visual claim: no Chrome or Chromium in this environment and the browser CDN is unreachable, so no screenshots, no axe run, no 320/1440 render, no tab-through. Contrast figures are computed from the hex values in `theme/colors.ts`, not sampled from a screen |
| Verification actually run | `grep`/AST-level scans quoted in each finding; WCAG contrast maths (sRGB relative luminance, WCAG 2.2 formula); line counts; live-region inventory |

There is no `CONTRIBUTING.md` design section, no Storybook, and no interface ADR. The nearest thing to a written convention is the header comment in `frontend/src/theme/tokens.ts` (8 px grid, 12 px containers, no square corners) and `typography.ts` (Inter, seven type styles, no more than three levels per view). I hold the code to those documents where they exist.

---

## 3. Scoreboard

| Skill | App (`frontend/src`) | Website (`website/src`) | One-line reason |
| --- | --- | --- | --- |
| `frontend-ui-engineering` | **C+** | **C** | App: state coverage is excellent, design-system-as-code is not — 1,308 inline style objects, 31 files over 200 lines, zero UI tests. Site: small and readable, but unfinished. |
| `better-accessibility` | **D+** | **C** | App: missing `lang`, unreachable mobile nav, `aria-hidden` over focusable drawer links, three failing contrast pairs. Site: click-only tour tiles, nav vanishes below 860 px. |
| `better-layout` | **C** | **C** | App: page-header subtitle sits beside its title on every screen; table width unproven between 769–1024 px. Site: no mobile navigation, otherwise clean. |
| `better-writing` | **B−** | **D** | App: plain, specific error states with a retry — good; raw backend strings leak, brand casing is inconsistent. Site: developer instructions visible to customers, dead CTAs, claims that contradict known blockers. |
| `better-typography` | **C** | **B** | App: a seven-style scale exists and is widely bypassed by 25 ad-hoc sizes, many at half-pixels. Site: consistent scale, good measure, but emoji stand in for icons. |
| `better-colors` | **C+** | **B** | App: best-in-class token architecture, but the semantic *text* colours fail their ratios. Site: inherits the same tokens; passes on primary. |
| `better-ui` | **B** | **C** | App: restrained motion, real hover/press states, reduced-motion honoured. Site: no entrance, no dealt moment, placeholder tiles read as unfinished. |
| `design-taste-frontend` | n/a — product UI | **D** | Fails 6 of the 9 house rules: empty grounds, captions under visuals, emoji instead of real icons, no photography, no hero entrance, no declared page type. |
| **Overall** | **C+** | **D+** | **Combined: C** |

Grade anchors: **A** = ship it, nothing above LOW; **B** = solid with cosmetic debt; **C** = functional but visibly under-finished, several MEDIUMs and at least one HIGH; **D** = a customer would notice without being told; **F** = broken.

---

## 4. App findings — ranked

Triggers from `better-interface` §*Escalation triggers* are marked ⚠ and are never averaged down.

| # | Sev | Domain | Location | What the code does | Fix |
| --- | --- | --- | --- | --- | --- |
| A1 | **HIGH** ⚠ | Accessibility | `frontend/index.html:2` | `<html>` has no `lang`. Every page announces in the OS default voice and the screen reader cannot pick the right pronunciation rules. WCAG **3.1.1 (A)**. | `<html lang="en">`. One word. |
| A2 | **HIGH** ⚠ | Accessibility / Layout | `TopBar.tsx:129-131` + `styles.css:285` | The hamburger is hidden by an **inline** `display: 'none'`. The media query that is supposed to reveal it below 768 px (`.coop-topbar-menu-btn { display: inline-flex }`) loses to the inline style, which always wins without `!important`. Result: on a phone the only navigation control never renders, the desktop rail is `display:none` below 768 px, and the drawer can only be opened by nothing. **No route navigation is reachable on a phone.** | Delete `display: 'none'` from the inline style and add `.coop-topbar-menu-btn { display: none; }` to the base stylesheet. Two lines. |
| A3 | **HIGH** ⚠ | Accessibility | `Sidebar.tsx:213-247` | The mobile drawer is hidden with `transform: translateX(-100%)` plus `aria-hidden={!open}` — but a translated element keeps its buttons in the tab order, so a keyboard user tabs through invisible nav items; and `aria-hidden` wrapped around focusable content is itself a violation (**4.1.2**). There is no Escape handler and focus is never moved into or restored out of the drawer. | Give the closed drawer `visibility: 'hidden'` (removes descendants from both the tab order and the accessibility tree) with `visibility` in the transition, drop the `aria-hidden`, add an `Escape` listener and focus the first item on open. |
| A4 | **HIGH** ⚠ | Colors / Accessibility | `theme/colors.ts:86-90` → `CoopBadge.tsx:40-52` | Status pills draw 12 px semibold text in the semantic hue on a 10 % tint of the same hue. Measured: **success 3.05:1, warning 2.10:1, info 3.14:1** (error and neutral pass). Needs **4.5:1** at 12 px (**1.4.3 AA**). Every stock status, order status and sync state in the app is one of these pills. | Add darker *text* tokens (`successText #1c7a43` = 4.69:1, `warningText #8a6100` = 4.83:1, `infoText #1c6ea8` = 4.74:1) and use them in `CoopBadge` for `color` only; keep the vivid hue for dots and icons. One token block + one switch statement. |
| A5 | **HIGH** | Layout | `PageHeader.tsx:39-73` | The title and the subtitle are siblings in a `display:flex; alignItems:center` row, so the subtitle renders **to the right of** the `<h1>` (with `margin-top: 6px` doing nothing in a centred row). `DashboardHeader` and `Briefing` both stack theirs — this component is the outlier. Reaches every module page that uses `PageHeader`. | Wrap the `<h1>` and subtitle in one `display:flex; flexDirection:column` div; keep the back button as its sibling. |
| A6 | **HIGH** ⚠ | Accessibility | `AppShell.tsx:143-152` | On a client-side route change focus stays on the sidebar button and only `document.title` updates. Nothing announces the new view, and the first Tab stop after navigation is still the nav rail. No skip link either, so every screen starts with 9 rail buttons before the content. | On `location.pathname` change, focus a wrapper with `tabIndex={-1}` around the page body (and render a "Skip to content" link as the first focusable element). |
| A7 | **MEDIUM** ⚠ | Accessibility / Typography | `ForecastCard.tsx:73` | `color: isDark ? colors.warning : tint(colors.warning, 0.9)` — a 90 %-alpha orange used as **text colour** on the "Estimate, not a fact" pill. On white this is roughly 1.9:1; the label is effectively unreadable, and it is the disclaimer on a forecast, which is the sentence that protects the user from over-ordering. | Use the new `warningText` token (or `onSurfaceVariant`); never pass a tint as `color`. |
| A8 | **MEDIUM** | Accessibility | `CreateOrderPage.tsx:338` | The customer and product pickers are raw `<input>` elements labelled only by `placeholder`. The placeholder disappears on the first keystroke and is not a label (**3.3.2 A**; browsers do fall back to it for the accessible name). | `aria-label={placeholder}` (or a visually-hidden `<label>`), plus `aria-autocomplete`/`role="combobox"` if the list is announced. |
| A9 | **MEDIUM** | Typography | `theme/typography.ts:30-47`, 25 hardcoded sizes | The project defines seven type styles and then bypasses them: `fontSize` appears at **25 distinct values**, including `11.5`, `12.5`, `13.5`, `14.5`, `15.5`, `16.5` and `10.5`. Half-pixel sizes land on a fractional device pixel and render soft. The three-levels-per-view rule in the file's own header is not observable. | Snap to the scale: 11.5/12.5 → 12, 13/13.5/14.5 → 13 or 14, 15.5/16.5 → 16. Use `type.labelCaps` / `bodyCompact` / `titleMd` rather than new numbers. |
| A10 | **MEDIUM** | Colors | `theme/colors.ts:72` (`outline #767586`) | Tertiary text, placeholders and "Reorder: 40" captions use `outline`, which measures **4.29:1** on the `surface` canvas and **4.08:1** on `surfaceContainerLow` — under 4.5:1 for text below 18.67 px bold (**1.4.3**). It is only compliant on pure white. | Introduce `onSurfaceMuted` at ~`#5f5e6e` (≥5:1 on both surfaces) for text; keep `#767586` for borders and glyphs, where the bar is 3:1. |
| A11 | **MEDIUM** | Layout | `Products/index.tsx:41`, `CoopTable.tsx` | The table/card switch is `max-width: 768px`, and the table's fixed column widths total ≈810 px with no `scroll={{ x }}` container. Between 769 px and ~1000 px the table has nowhere to go. **Not verified** — needs a render at 900 px. | Either raise the breakpoint to ~1024 px or set `scroll={{ x: 820 }}` so the card scrolls instead of the page (**1.4.10**). |
| A12 | **MEDIUM** | Writing | `Customers/index.tsx:82`, `Products/index.tsx:86`, and 8 siblings | `messageApi.error(e.message)` and `'Request failed'` put raw API/exception text in front of a shop owner. Some name no recovery. | Map to "We couldn't save this customer. Check the connection and try again." and log the raw string. `CoopErrorState` already does this well for page loads — copy that pattern for toasts. |
| A13 | **LOW** | Writing | 24 × `CO OP` vs the `Co-op` wordmark (`CoopLogo.tsx:71`) | Three casings in one product: `CO OP` (title, mark), `Co-op` (error screens), `Coop` (identifiers). | Pick one display form — `Co-op` matches the wordmark and the domain — and use it for `document.title`, alt text and copy. |
| A14 | **LOW** | Typography | `theme/typography.ts` header note | Line-heights are fixed px (`'20px'`) rather than unitless, which the typography skill treats as an exact rule. The file documents why (a previous bug where `lineHeight: 20` became 260 px). This is defensible, but it means changing a font size silently breaks the pair. | Keep it, and add a test that every `type` entry's `lineHeight` is ≥1.4× its `fontSize`. |
| A15 | **LOW** | Engineering | 1,308 `style={{…}}` objects; 31 files >200 lines (`CreateOrderPage` 1,101, `OrderDetailsPage` 1,022) | All states, media queries and theme changes are computed in JavaScript per render. There is no way to express `:hover`, `:focus-visible` or a container query, so the app needs `!important` patches in `styles.css` (5 of them) to fight antd. The two largest pages are 1,000-line components. | Not urgent, but this is the debt that makes A2/A3 possible: a `display` toggle belongs in CSS, not in a style object. Move page chrome to CSS modules and split the two order pages. |

**What is genuinely good, and should not be "fixed":**

- Every screen I opened has a loading state, an empty state and an error state that names a retry (`. CoopEmptyState` / `CoopErrorState` / `CoopLoader` are used consistently).
- `role="status"`, `role="alert"` and `aria-live` are used correctly and sparingly — including the offline banner and the sync indicator.
- Icon-only buttons all carry `aria-label` (a whole-tree scan found **zero** unlabelled icon buttons).
- There is not a single `<div onClick>` acting as a control in the product UI.
- `prefers-reduced-motion` is honoured globally, and the motion that remains is short and purposeful.
- Native `disabled` is used instead of `aria-disabled` guesswork; destructive actions all go through a confirm modal with a distinct red treatment.
- Money is rendered with `font-variant-numeric: tabular-nums` in 66 places.

---

## 5. Website findings — ranked

The marketing page is judged by `design-taste-frontend` (tasteskill 2.5), whose bar is "the site a good company would ship". House-rule numbers below refer to that skill.

| # | Sev | Domain | Location | What ships today | Fix |
| --- | --- | --- | --- | --- | --- |
| W1 | **HIGH** ⚠ | UI / Taste (rule 2) | `website/src/App.tsx:44-82`, `public/screenshots/` empty | The product tour renders **seven identical striped placeholders** reading "screenshot / clip goes here". The single most persuasive section of the page shows nothing. | Ship seven real screenshots (1600×1000, PNG, <200 KB each) into `public/screenshots/`. Until then, cut the section — a missing section beats a section that admits it is missing. |
| W2 | **HIGH** ⚠ | Writing | `App.tsx:352-372` | The founders video block renders an empty 16:9 frame with "Founders video slot — drop `videos/founders.mp4` (or set the embed) to play it here." A customer reads build instructions. | Hide the whole section when `FOUNDERS_EMBED` is empty and the file is absent, or record 40 seconds on a phone. |
| W3 | **HIGH** ⚠ | Writing | `App.tsx:388-412` | Contact cards show "Support email coming soon." and "Add a number in `CONTACT` to enable this." There is no way to contact the company from a page whose CTA is "Talk to a human". | Fill `CONTACT` (a domain email and a WhatsApp number are enough for this market) or remove the section and point the footer at the GitHub issues page. |
| W4 | **HIGH** | Writing / Truth | `App.tsx:157`, `billing/plans.ts:167-180` | Prices are dollars: the hero KPI reads "$2,845" and the plan cards render `$29` / `$99`, while `ck_businesses_currency_ngn` makes the product Naira-only and the site's own copy targets Nigerian chains. Two currencies, one product. | Display ₦ (and say "per store, per month" once quantity pricing lands). The hero KPI is a mock — make it ₦ and a plausible Nigerian basket. |
| W5 | **HIGH** ⚠ | UI / Conversion | `App.tsx:245`, `App.tsx:305` | Every plan CTA and the final "Get started free" point at `href="#top"` — the page scrolls back to the top. There is no signup or download destination on the entire page except a GitHub releases link. | Point the primary CTA at the app's sign-up URL (or the installer), and make the plan CTA carry the plan id into it. |
| W6 | **HIGH** ⚠ | Accessibility | `App.tsx:52-58` | The tour tile is a `<div role="img">` with `onClick`, `onMouseEnter` and no `tabIndex`. Hovering plays a video the keyboard can never reach, and `role="img"` hides any future content inside it. Pointer-only path (**2.1.1**). | Drop `role="img"`, put the poster `<img alt>` inside, and either make the whole card a `<button>` that plays/pauses, or play on `focus` too with an explicit "Play" control. |
| W7 | **HIGH** ⚠ | Layout | `website/src/styles.css:238-243` | Below 860 px `.nav { display: none }` and nothing replaces it. The Features / Tour / Pricing / Contact / Download links simply cease to exist on a phone — where most Nigerian traffic will arrive. | Add a disclosure menu (native `<details>` is enough) or keep the nav and let it wrap. |
| W8 | **HIGH** | Writing / Trust | `App.tsx:152` | "Your data, backed up and encrypted" is on the hero. The known launch blockers include an **unencrypted local SQLite** database and backups that have never been restored on a live Postgres. A retail chain's IT reviewer will ask, and the answer is currently "not yet". | Change to what is true today ("Your data stays on your machine and syncs when you're online") until at-rest encryption ships. |
| W9 | **MEDIUM** | Taste (rules 5, 7) | `App.tsx:187-194` | Feature icons are emoji and text glyphs (`▦ 🧾 📦 👥 ✨ 🔌`). Emoji render differently on every OS and are the clearest "generated, not designed" tell the skill names. | Use the app's own `@ant-design/icons` set, or the product's real icon SVGs, at 20 px in the existing tinted tile. |
| W10 | **MEDIUM** | Taste (rules 1–5) | `App.tsx:1-457` | No declared page type (`<html data-type>`, `<meta name="page-type">`, `<meta name="site-kind">`), no hero entrance, no dealt moment, and a caption under every visual in the tour. `consistency.mjs` would refuse to classify the page. | Add `software` to the three meta declarations; give the hero one 600 ms `data-enter` fade-and-rise; delete the per-tile blurbs (the `h3` already names the page). |
| W11 | **MEDIUM** | Accessibility | `website/src/styles.css:9`, `:1-300` | `html { scroll-behavior: smooth }` and every hover transform run with no `prefers-reduced-motion` guard. The app has one; the site does not. | Wrap smooth scroll and transforms in `@media (prefers-reduced-motion: no-preference)` — the same block the app already uses. |
| W12 | **MEDIUM** | Writing | `App.tsx:278` | "The 10-day trial runs to the end and cannot be cancelled early." That is a hostile sentence to put next to "No credit card required", and it is a cancellation trap in most jurisdictions. | "Try everything free for 10 days. Cancel any time before it ends and you won't be charged." — and make that true in billing. |
| W13 | **MEDIUM** | UI | `App.tsx:113-122, 449` | The theme toggle always starts light, ignores `prefers-color-scheme`, and forgets the choice on reload. Its `aria-label` is the constant "Toggle dark mode" even in dark mode. | Read the OS preference on first paint, persist to `localStorage`, and label it with the destination ("Switch to light theme"). |
| W14 | **MEDIUM** | Taste (rule 3) | `App.tsx:126-176` | The hero puts the headline, three CTAs, a note *and* a fabricated dashboard mock on the first screen — three actions competing for one decision. Rule 3 wants the hero alone. | One primary CTA ("Start free trial"), one secondary ("See it work"), and move "Download for Windows" into the top bar where the nav already points at it. |
| W15 | **LOW** | Writing / SEO | `website/index.html` | No `og:title` / `og:description` / `og:image`, no canonical, no `twitter:card`. Every link shared on WhatsApp — the primary channel here — previews as a bare URL. | Four meta tags plus a 1200×630 PNG. WhatsApp is the distribution channel; this is the highest-leverage 20 minutes on the site. |

**What is good about the site:**

- One source of truth for colour and shape: `website/src/theme.ts` imports the *product's* tokens and paints them onto `:root`, so the site and the app cannot drift. That is the single best structural decision in either codebase.
- `lang="en"`, a real `<title>`, a description, a theme colour and preconnected fonts are all present.
- Layout is a single 1120 px container with two honest breakpoints and no magic widths; the CTA band, plan cards and footer are consistent.
- Type is set from the app's `type` scale, with a readable 18/28 lede and a capped measure.

---

## 6. Fix queue

Items **1–5 are already fixed in the commit that adds this document** — they were single-file, reversible, and each one is verifiable without a browser. Items 6–8 touch pricing and public copy, which are business decisions, so they are left as proposals rather than changed unilaterally.

**P0 — before anyone sees this (≈2 hours, all in this repo):**

1. `<html lang="en">` in `frontend/index.html` (A1).
2. Move `display` off the hamburger's inline style (A2).
3. `visibility` on the closed drawer + Escape + focus (A3).
4. `PageHeader` subtitle under the title (A5).
5. `successText` / `warningText` / `infoText` tokens; use them in `CoopBadge`, the KPI trend, the low-stock count and the forecast badge (A4, A7, A10).
6. Delete or fill the three website placeholders (W1, W2, W3).
7. Naira on the site (W4).
8. Real destinations for the site's CTAs (W5).

**P1 — before a demo to a chain (1–2 days):**

9. Focus the page body on route change, add a skip link (A6).
10. Mobile navigation on the site (W7).
11. Keyboard path for the tour tiles (W6).
12. Rewrite the encryption claim (W8); rewrite the trial sentence (W12).
13. Emoji icons → the product's icon set (W9).
14. Snap type to the seven-style scale (A9).
15. Error toasts that name a recovery (A12).

### Applied in this commit

| Finding | File | Change |
| --- | --- | --- |
| A1 | `frontend/index.html` | `<html>` → `<html lang="en">` |
| A2 | `TopBar.tsx`, `styles.css` | Removed the inline `display: 'none'` that outranked the mobile media query; the hamburger's visibility is now owned by CSS (`display: none` by default, `inline-flex` below 768 px) |
| A3 | `Sidebar.tsx` | Closed drawer is `visibility: hidden` (with a 300 ms delay so the slide-out still plays), which removes its buttons from the tab order and the accessibility tree; `aria-hidden` over focusable content removed; Escape closes it; focus enters the first item on open and returns to the trigger on close |
| A4, A7, A10 | `theme/colors.ts`, `theme/dark.ts`, `CoopBadge.tsx` + 10 call sites | Added `successText` / `warningText` / `infoText` / `errorText` / `onSurfaceMuted` for both palettes and switched semantic **text** to them (badges, KPI trends, stock counts, forecast disclaimer, sync states, report deltas, notification figures). Fills, dots and icons keep the vivid hue |
| A5 | `PageHeader.tsx` | Title and subtitle share one column container instead of sitting side by side in a row |

Every change is either a token addition or a one-component edit; nothing was restructured, no dependency was added, and the existing tests, lint, typecheck and both builds are green.

**P2 — the debt that causes the P0s:**

16. Page chrome out of inline styles into CSS modules (A15), so states and media queries stop being conditional JavaScript.
17. Split `CreateOrderPage` (1,101 lines) and `OrderDetailsPage` (1,022 lines).
18. Add one rendered accessibility check (`axe-core` against the Vite preview) and one 320 px / 900 px layout check to CI. There is currently **no UI test of any kind** — the 26 frontend tests are pure logic.
19. Declare the site's page type and give it a hero entrance + one dealt moment (W10).
20. `og:` tags and a share image (W15).
21. Bundle size: the production build emits an 852 kB `ui` chunk (antd) and a 936 kB `chart` chunk. The chart chunk is already split, so first paint carries the antd weight — acceptable for a desktop app that reads from disk, painful over a 3G phone connection. Revisit when a web build exists.

---

## 7. Verification log

| Check | Result |
| --- | --- |
| Icon-only buttons without an accessible name | **0** (whole-tree scan of `<button>` bodies and attributes) |
| `<div onClick>` / `<span onClick>` acting as a control | **1** — `Reports/ExportMenu.tsx:143`, a deliberately `aria-hidden` backdrop. Acceptable |
| `outline: none` without a replacement | **1** — `styles.css:118`, scoped to `.ant-btn:focus-visible` and `.ant-input:focus-visible`, where antd draws its own ring. Acceptable |
| Global `:focus-visible` ring | **present** (`styles.css:111`, 2 px `#5b5fef`, 2 px offset) |
| `prefers-reduced-motion` | **present in the app** (`styles.css:317`), **absent on the site** |
| Live regions | 12 correct uses of `role="status"` / `role="alert"` / `aria-live` |
| Contrast, semantic text on 10 % tint (white card) | success **3.05:1**, warning **2.10:1**, info **3.14:1**, error 5.45:1, neutral 7.26:1 → three fail 1.4.3 AA |
| Contrast, `outline` as text | 4.51 on white, **4.29 on `surface`**, **4.08 on `surfaceContainerLow`** → fails off-white |
| Contrast, white on `primary` | **7.03:1** → passes everywhere, including the site's CTA band |
| Distinct `fontSize` values in TSX | **25** (scale defines 7) |
| Off-grid px values in spacing/size props | **633** of 1,531 |
| Rendered check (tab order, 320 px, axe) | **Not verified** — no browser in this environment |
| `design-taste-frontend` gate (`gate.mjs`) | **Not run** — requires a `.taste-skill/build.json` from the kit's own builder plus Chrome |
| Gates after the five code fixes | `pnpm --filter ./frontend lint` clean; `typecheck` clean; `vite build` clean (1.75 s); `pnpm test` **26 pass / 0 fail**; `website` `tsc --noEmit` clean and `vite build` clean (the site imports the changed tokens). Backend, Electron and the migration chain were not touched and were not re-run |
| `skills@latest` install side effects | none on tracked files (`git diff` empty after all four adds); no script or hook from any installed skill was executed |

---

## 8. Appendix — how the contrast numbers were produced

sRGB relative luminance, WCAG 2.2 formula, computed on the literal hex values from `frontend/src/theme/colors.ts` and the `tint()` helper in the same file (10 % over `#ffffff` in light mode, 20 % over the dark surface in dark mode). A pair passes when it reaches **4.5:1** for text below 18.67 px bold, **3:1** for large text and UI boundaries. The script is 15 lines of Python and reproducible from the values in this document; no sampling from a rendered screen was involved, so anti-aliasing and actual background stacking (e.g. a badge over `surfaceContainerLow`) can move a value by a few hundredths.
