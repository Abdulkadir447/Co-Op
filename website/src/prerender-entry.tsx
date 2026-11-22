/**
 * The render entry used by scripts/prerender.mjs.
 *
 * It renders the whole site to a string in Node, so every route ships real copy
 * in its HTML instead of an empty <div id="root">. That matters three times
 * over: a crawler that does not run JavaScript still sees the page, a WhatsApp
 * or Google preview reads the real text, and someone on a slow connection reads
 * the offer before the bundle arrives.
 *
 * The browser stubs below exist only because the app reads `window` during
 * render (theme preference, injected path). They are minimal on purpose: if the
 * site starts doing something at render time that needs a real browser, this
 * will fail loudly rather than silently produce wrong HTML.
 */
import { renderToString } from 'react-dom/server';
import App from './App';
import { ROUTES } from './router';
import { softwareApplicationSchema, faqSchema } from './structured-data';
import { FAQ } from './site';
import { PRICING_FAQ } from './faq';

interface StubWindow {
  __COOP_PATH__: string;
  location: { pathname: string; search: string };
  matchMedia: (q: string) => { matches: boolean };
  localStorage: { getItem: () => string | null; setItem: () => void };
  sessionStorage: { getItem: () => string | null; setItem: () => void };
  addEventListener: () => void;
  removeEventListener: () => void;
  history: { pushState: () => void; replaceState: () => void };
  scrollTo: () => void;
}

function install(path: string): void {
  const win: StubWindow = {
    __COOP_PATH__: path,
    location: { pathname: path, search: '' },
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem: () => undefined },
    sessionStorage: { getItem: () => null, setItem: () => undefined },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    history: { pushState: () => undefined, replaceState: () => undefined },
    scrollTo: () => undefined,
  };
  (globalThis as unknown as { window: StubWindow }).window = win;
  (globalThis as unknown as { document: unknown }).document = {
    // getAttribute is read by initialMode(); during a prerender there is no
    // painted attribute yet, and light is the correct default to bake in.
    documentElement: { setAttribute: () => undefined, getAttribute: () => null, dataset: {} },
    head: { querySelector: () => null, appendChild: () => undefined },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getElementById: () => null,
    createElement: () => ({ setAttribute: () => undefined, remove: () => undefined }),
  };
}

/** Render one path to HTML. */
export function render(path: string): string {
  install(path);
  return renderToString(<App />);
}

/**
 * The JSON-LD a route should carry, computed without a DOM.
 *
 * This is a pure function so the prerenderer can put the payload straight into
 * the HTML. The FAQ payload is passed in by the caller (the script knows which
 * routes render the FAQ) rather than discovered at render time.
 */
export function structuredData(faqs: ReadonlyArray<{ q: string; a: string }> = []) {
  const blocks: unknown[] = [softwareApplicationSchema()];
  if (faqs.length > 0) blocks.push(faqSchema(faqs));
  return blocks;
}

export function faqItemsFor(path: string): ReadonlyArray<{ q: string; a: string }> {
  // Kept here so the script never re-derives the rule "FAQ markup only where
  // the questions are visible".
  if (path === '/') return FAQ;
  if (path === '/pricing') return PRICING_FAQ;
  return [];
}

export { ROUTES };
