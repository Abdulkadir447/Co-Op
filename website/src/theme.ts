/**
 * Theme switching.
 *
 * The palette itself lives in `tokens.css` as static CSS — see the note at the
 * top of that file for why. This module only flips the `data-theme` attribute
 * and keeps the browser's own chrome (address bar, form controls, scrollbars)
 * in step, which is what `color-scheme` in the stylesheet handles.
 *
 * The old version painted every colour onto `:root` from JavaScript after
 * React mounted, which left the first paint unstyled — on a slow phone that is
 * a flash of black-on-white with the wrong font, exactly where a first
 * impression is made.
 */

export type Mode = 'light' | 'dark';

export function applyTheme(mode: Mode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', mode);
}

/**
 * Set the theme before React runs, so the first paint is already correct.
 * Called from main.tsx and, in the prerendered HTML, from a tiny inline script
 * in <head> — the only inline script on the site, and it is a theme read, not
 * tracking.
 */
export function initialMode(): Mode {
  if (typeof window === 'undefined') return 'light';
  // The attribute, not localStorage, is the source of truth on load: the inline
  // script in index.html has already resolved exactly this value before first
  // paint, and it is the same expression. Reading it back means the component's
  // first render agrees with the DOM the browser painted, which is what keeps
  // hydration from throwing away the prerendered markup.
  const painted = document.documentElement.getAttribute('data-theme');
  if (painted === 'light' || painted === 'dark') return painted;
  try {
    const stored = window.localStorage.getItem('coop-web:theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* private mode */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}
