/**
 * The site chrome: header, footer, and the shared blocks every page reuses.
 *
 * One header and one footer for all eight pages, so a change to the primary
 * CTA happens once. The header holds exactly one button — "Start free trial" —
 * because competing header CTAs split attention (see the brief: one primary
 * CTA, repeated). "Book a demo" is a secondary path on the pages that need it,
 * never in the header.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NAV_ROUTES, ROUTES, useRouter } from '../router';
import { CONTACT, TRIAL_HREF, CONTACT_IS_PLACEHOLDER, PRODUCT, whatsappHref } from '../site';
import { track } from '../analytics';
import { applyTheme, initialMode } from '../theme';

export function CoopMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Co-op">
      <defs>
        <linearGradient id="siteRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b5fef" />
          <stop offset="1" stopColor="#8a4cfc" />
        </linearGradient>
        <linearGradient id="siteCrate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a4cfc" />
          <stop offset="1" stopColor="#5b5fef" />
        </linearGradient>
      </defs>
      <path d="M33.4 13.2 A14.2 14.2 0 1 0 33.4 34.8" fill="none" stroke="url(#siteRing)" strokeWidth="6.8" strokeLinecap="round" />
      <rect x="21.4" y="17.2" width="15.2" height="13.6" rx="4.8" fill="url(#siteCrate)" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Co-op — home">
      <CoopMark />
      <span>Co-op</span>
    </Link>
  );
}

/**
 * The one CTA. Every instance on the site goes through here so the label, the
 * destination and the event name cannot drift apart.
 */
export function TrialCta({
  surface,
  label = 'Start 10-day free trial',
  variant = 'primary',
  size,
}: {
  surface: string;
  label?: string;
  variant?: 'primary' | 'ghost';
  size?: 'sm' | 'lg';
}) {
  const cls = `btn btn-${variant}${size ? ` btn-${size}` : ''}`;
  return (
    <a
      className={cls}
      href={TRIAL_HREF}
      onClick={() => track('cta_click', surface, label)}
      {...(TRIAL_HREF.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {label}
    </a>
  );
}

export function TopBar({ mode, onToggle }: { mode: 'light' | 'dark'; onToggle: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { path } = useRouter();
  const waHref = whatsappHref();

  // Close the mobile panel whenever the route changes — otherwise it stays
  // open over the page you just navigated to.
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Logo />

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
        </button>

        <nav id="site-nav" className={`nav${menuOpen ? ' nav-open' : ''}`} aria-label="Main">
          {NAV_ROUTES.filter((r) => r.path !== '/').map((r) => (
            <Link
              key={r.path}
              to={r.path}
              className={path === r.path ? 'nav-active' : undefined}
              aria-current={path === r.path ? 'page' : undefined}
            >
              {r.nav}
            </Link>
          ))}
          {waHref && (
            <a
              className="nav-wa"
              href={waHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => track('contact_click', 'mobile-menu', 'whatsapp')}
            >
              WhatsApp us
            </a>
          )}
          <a className="nav-cta" href={TRIAL_HREF} onClick={() => track('cta_click', 'mobile-menu', 'Start free trial')}>
            Start free trial
          </a>
        </nav>

        <button
          type="button"
          className="theme-toggle"
          onClick={onToggle}
          aria-label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={mode === 'dark' ? 'Light theme' : 'Dark theme'}
        >
          <span aria-hidden="true">{mode === 'dark' ? '☀' : '◐'}</span>
        </button>

        {/* WhatsApp sits beside the CTA, as a ghost button: in this market it
            is the channel people actually use to ask a question before buying,
            and leaving it off the header meant the only path was a mailto the
            visitor had to find on another page. Rendered only when the number
            is real — an empty link is worse than no link. */}
        {waHref && (
          <a
            className="btn btn-ghost btn-sm header-wa"
            href={waHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => track('contact_click', 'header', 'whatsapp')}
          >
            <span aria-hidden="true">💬</span> WhatsApp
          </a>
        )}

        <a
          className="btn btn-primary btn-sm header-cta"
          href={TRIAL_HREF}
          onClick={() => track('cta_click', 'header', 'Start free trial')}
          {...(TRIAL_HREF.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          Start free trial
        </a>
      </div>
    </header>
  );
}

export function Footer() {
  const groups = ['Product', 'Company', 'Legal'] as const;
  return (
    <footer className="site-foot">
      <div className="container foot-grid">
        <div className="foot-brand">
          <Logo />
          <p className="muted">{PRODUCT.tagline}</p>
          <p className="muted small">
            {PRODUCT.platform} · priced in Naira · works offline
          </p>
        </div>
        {groups.map((g) => (
          <div key={g}>
            <p className="foot-head">{g}</p>
            <ul className="foot-links">
              {g === 'Product' && (
                <>
                  <li>
                    <Link to="/">Home</Link>
                  </li>
                  <li>
                    <Link to="/features">Features</Link>
                  </li>
                  <li>
                    <Link to="/pricing">Pricing</Link>
                  </li>
                  <li>
                    <Link to="/signup">Start free trial</Link>
                  </li>
                </>
              )}
              {g === 'Company' && (
                <>
                  <li>
                    <Link to="/about">About</Link>
                  </li>
                  <li>
                    <Link to="/security">Security</Link>
                  </li>
                  <li>
                    <Link to="/contact">Contact</Link>
                  </li>
                  <li>
                    <Link to="/case-study">Case study</Link>
                  </li>
                </>
              )}
              {g === 'Legal' && (
                <>
                  <li>
                    <Link to="/privacy">Privacy</Link>
                  </li>
                  <li>
                    <Link to="/terms">Terms</Link>
                  </li>
                  <li>
                    <Link to="/status">Status</Link>
                  </li>
                  <li>
                    <a href={CONTACT.phone ? `mailto:${CONTACT.email}` : CONTACT.email}>Email us</a>
                  </li>
                </>
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="container foot-bottom">
        <p className="small muted">
          © {new Date().getFullYear()} {PRODUCT.name}. All rights reserved.
        </p>
        {CONTACT_IS_PLACEHOLDER && (
          <p className="small muted">
            Preview build — contact details and the public address are placeholders until launch.
          </p>
        )}
      </div>
    </footer>
  );
}

/** Page shell: applies the route's <head> and scrolls to top. */
export function Page({ children }: { children: ReactNode }) {
  return <main id="main">{children}</main>;
}

export function Section({
  children,
  id,
  className,
  tone,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
  tone?: 'band' | 'plain';
}) {
  return (
    <section id={id} className={`${tone === 'band' ? 'band' : ''} ${className ?? ''}`}>
      <div className="container">{children}</div>
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lede,
  align,
  as: Heading = 'h2',
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  align?: 'center';
  /**
   * Every page needs exactly one <h1> — it is the heading Google reads and the
   * one a screen reader announces first. The first SectionHead on a page passes
   * `as="h1"`; every later one stays an h2. It used to be h2 everywhere, which
   * left nine of eleven pages with no h1 at all.
   */
  as?: 'h1' | 'h2';
}) {
  return (
    <div className={`section-head${align === 'center' ? ' center' : ''}`}>
      {eyebrow && <span className="caps eyebrow-text">{eyebrow}</span>}
      <Heading className="section-title">{title}</Heading>
      {lede && <p className="muted lede-sm">{lede}</p>}
    </div>
  );
}

/**
 * The end-of-page CTA band. Present on every page except /signup and /contact,
 * where the page *is* the conversion.
 */
export function CtaBand({ surface }: { surface: string }) {
  return (
    <Section>
      <div className="cta">
        <h2 className="section-title">Start your 10-day free trial</h2>
        <p className="cta-sub">
          Install it in minutes. No card to start. Nothing is deleted if you decide it is not for you.
        </p>
        <div className="cta-actions">
          {/* One label for the one primary action, everywhere. Tracking already
              tells the pages apart (the `surface` argument), so the words do
              not have to. */}
          <TrialCta surface={`${surface}:band`} label="Start free trial" variant="primary" />
          <a
            className="btn cta-btn-secondary"
            href="/pricing"
            onClick={() => track('cta_click', `${surface}:band`, 'See pricing')}
          >
            See pricing
          </a>
        </div>
      </div>
    </Section>
  );
}

/** Shared theme state, lifted out of App so every page can read it. */
export function useTheme(): ['light' | 'dark', () => void] {
  const [mode, setMode] = useState<'light' | 'dark'>(initialMode);

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const toggle = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    try {
      window.localStorage.setItem('coop-web:theme', next);
    } catch {
      /* the choice just does not persist */
    }
  };

  return [mode, toggle];
}

export { ROUTES };
