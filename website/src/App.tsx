/**
 * The site shell.
 *
 * Eight pages plus three legal ones, one header, one footer, one CTA. The
 * router decides which page renders; `applyHead` gives each one its own title,
 * description and structured data.
 *
 * The pages are imported eagerly and not lazily on purpose: the whole site is
 * ~60KB of React plus the copy, it is prerendered to static HTML per route, and
 * a lazy chunk would only add a network round-trip before the text appears.
 */
import { useEffect } from 'react';
import { RouterProvider, useRouter } from './router';
import { applyHead } from './head';
import { track } from './analytics';
import { TopBar, Footer, useTheme } from './components/Layout';
import Home from './pages/Home';
import Pricing from './pages/Pricing';
import Features from './pages/Features';
import Trial from './pages/Trial';
import CaseStudy from './pages/CaseStudy';
import Security from './pages/Security';
import About from './pages/About';
import Contact from './pages/Contact';
import { Privacy, Terms, Status } from './pages/Legal';
import NotFound from './pages/NotFound';

const PAGES: Record<string, React.ComponentType> = {
  '/': Home,
  '/pricing': Pricing,
  '/features': Features,
  '/trial': Trial,
  // /signup keeps working, but the form lives at /trial now.
  '/signup': Trial,
  '/case-study': CaseStudy,
  '/security': Security,
  '/about': About,
  '/contact': Contact,
  '/privacy': Privacy,
  '/terms': Terms,
  '/status': Status,
};

function Shell() {
  const { route, path } = useRouter();
  const [mode, toggle] = useTheme();
  const Component = PAGES[path] ?? NotFound;

  // One <head> writer per route, so a client-side navigation updates the title,
  // canonical and share tags exactly as the prerendered HTML has them.
  useEffect(() => {
    applyHead(route ?? { path, title: 'Page not found | Co-op', description: 'That page does not exist.' });
  }, [route, path]);

  // Pageviews are measured here, once per path change, and nowhere else. The
  // header links used to log their own `nav_click` on top of this, so a single
  // click counted twice — which halves every click-through rate you compute.
  useEffect(() => {
    track('page_view', 'route', path);
  }, [path]);

  return (
    <div id="top">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar mode={mode} onToggle={toggle} />
      <main id="main">
        <Component />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <Shell />
    </RouterProvider>
  );
}
