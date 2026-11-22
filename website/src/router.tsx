/**
 * A 60-line router, on purpose.
 *
 * The site needs eight real pages with clean URLs (`/pricing`, not `/#pricing`)
 * because the pricing page is the highest-intent page on a SaaS site and a
 * fragment cannot be tracked, ranked or linked in a WhatsApp message the way a
 * path can. What it does not need is a 40KB routing library, a loader system,
 * or nested layouts — so this is `history.pushState` plus `popstate`, with the
 * path list in one place and every path prerendered at build time by
 * `scripts/prerender.mjs`.
 *
 * Rules that keep it honest on a static host:
 *   · internal links are real <a href> elements — middle-click, "open in new
 *     tab", and a crawler all work without JavaScript;
 *   · the click handler only intercepts plain left-clicks, so a modifier click
 *     is left to the browser;
 *   · an unknown path renders a real 404 page (and `vercel.json` rewrites to
 *     index.html so the SPA can decide).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface RouteMeta {
  path: string;
  /** <title> for this page. One per page — never a site-wide suffix soup. */
  title: string;
  /** <meta name="description"> — the sentence Google shows. */
  description: string;
  /** Show in the header nav. */
  nav?: string;
  /** Show in the footer under "Product" / "Company" / "Legal". */
  footer?: 'Product' | 'Company' | 'Legal';
}

export const ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: 'Co-op — close your books in 20 minutes, not 3 hours',
    description:
      'Inventory, orders, customers and invoicing in one Windows app for Nigerian retail. Works offline, priced in Naira, 10-day free trial with no card.',
    nav: 'Home',
  },
  {
    path: '/features',
    title: 'Features — inventory, orders, customers, invoices | Co-op',
    description:
      'What Co-op does: stock that updates itself, orders and invoices in one flow, customer history, and an assistant that answers questions from your own numbers.',
    nav: 'Features',
    footer: 'Product',
  },
  {
    path: '/pricing',
    title: 'Pricing — ₦25,000/mo, 10-day free trial | Co-op',
    description:
      'Transparent Naira pricing. Starter ₦25,000/month, Professional ₦75,000/month, 20% off yearly. No setup fee, no per-order charge, cancel any time.',
    nav: 'Pricing',
    footer: 'Product',
  },
  {
    path: '/signup',
    title: 'Start your 10-day free trial | Co-op',
    description:
      'Download Co-op and start a 10-day trial. No card needed, your data stays yours, and nothing is deleted if you decide not to continue.',
    // Deliberately not in the nav: the header holds one CTA, and this is it.
  },
  {
    path: '/case-study',
    title: 'Case study — a Lagos provisions shop | Co-op',
    description:
      'How one shop moved from four notebooks and a WhatsApp thread to one app: the stocktake, the migration, and the numbers before and after.',
    footer: 'Product',
  },
  {
    path: '/security',
    title: 'Security and trust | Co-op',
    description:
      'Where your data lives, how it is encrypted, who can see it — and an honest list of what we do not have yet, including SOC 2 and a public status page.',
    footer: 'Company',
  },
  {
    path: '/about',
    title: 'About Co-op — who builds this and why',
    description:
      'Co-op is built for Nigerian retail by a small team. What we believe about software for shop owners, and what we have not built yet.',
    nav: 'About',
    footer: 'Company',
  },
  {
    path: '/contact',
    title: 'Contact — talk to a human | Co-op',
    description:
      'Questions about pricing, moving your data, or whether Co-op fits your shop. Email, WhatsApp, or book a 20-minute call.',
    nav: 'Contact',
    footer: 'Company',
  },
  { path: '/privacy', title: 'Privacy policy | Co-op', description:
      'What Co-op collects, why, where it is stored (EU), how long it is kept, and how to get a copy or have it deleted.', footer: 'Legal' },
  { path: '/terms', title: 'Terms of service | Co-op', description:
      'The terms you agree to when you use Co-op: the trial, Naira billing, cancellation, refunds, and what we do and do not promise.', footer: 'Legal' },
  { path: '/status', title: 'Status | Co-op', description:
      'What Co-op monitors today, what it does not, and how to report an outage. No invented green light.', footer: 'Legal' },
];

export const NAV_ROUTES = ROUTES.filter((r) => r.nav);

const BY_PATH = new Map(ROUTES.map((r) => [r.path, r]));

/** Normalise '/pricing/' and '/pricing' to the same route. */
export function normalise(path: string): string {
  if (!path) return '/';
  const clean = path.split('?')[0].split('#')[0];
  if (clean.length > 1 && clean.endsWith('/')) return clean.slice(0, -1);
  return clean || '/';
}

interface RouterValue {
  path: string;
  route: RouteMeta | undefined;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue>({
  path: '/',
  route: BY_PATH.get('/'),
  navigate: () => undefined,
});

/**
 * The initial path. In the browser it is `location.pathname`; during
 * prerendering (Node) there is no location, so the render script passes it in
 * through `window.__COOP_PATH__`.
 */
function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  const injected = (window as unknown as { __COOP_PATH__?: string }).__COOP_PATH__;
  return normalise(injected ?? window.location.pathname);
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onPop = () => setPath(currentPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (to: string, opts?: { replace?: boolean }) => {
    const next = normalise(to);
    if (typeof window === 'undefined') return;
    if (next !== path) {
      window.history[opts?.replace ? 'replaceState' : 'pushState']({}, '', next);
    }
    setPath(next);
    // Every navigation starts at the top. Without this a user who clicks
    // "Pricing" from halfway down the home page lands halfway down Pricing,
    // which looks like a broken page.
    if (next !== normalise(window.location.pathname) || !opts?.replace) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  return (
    <RouterContext.Provider value={{ path, route: BY_PATH.get(path), navigate }}>{children}</RouterContext.Provider>
  );
}

export function useRouter() {
  return useContext(RouterContext);
}

/**
 * An internal link that works with or without JavaScript.
 *
 * Renders a real anchor with a real href; intercepts only an unmodified
 * left-click. Everything else — ctrl-click, middle-click, "copy link" — is the
 * browser's job and it does it correctly.
 */
export function Link({
  to,
  children,
  className,
  onClick,
  ...rest
}: {
  to: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        onClick?.();
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
