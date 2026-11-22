import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, initialMode } from './theme';
import './styles.css';

// Before React runs, so the first paint is already the right theme. This used
// to happen after mount, which meant a dark-preference visitor saw a flash of
// white on every page load.
applyTheme(initialMode());

const root = document.getElementById('root')!;

// Every route is prerendered to real HTML (scripts/prerender.mjs). Hydrating
// reuses that markup instead of throwing it away and re-rendering, which is
// what keeps a fast first paint from flashing empty on a slow phone.
//
// `data-prerendered` is set by the prerender script; in `vite dev` the element
// is empty and a plain render is correct.
const isPrerendered = root.hasChildNodes();

if (isPrerendered) {
  hydrateRoot(
    root,
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
