import { useCallback, useEffect, useRef, useState } from 'react';
import { type as t } from '../../frontend/src/theme/typography';
import { colors } from '../../frontend/src/theme/colors';
import { PLAN_CATALOG, displayPrice, type Plan } from '../../frontend/src/billing/plans';
import { applyTheme, type Mode } from './theme';

const caps = { ...t.labelCaps, textTransform: 'uppercase' as const };

// --- Site config -----------------------------------------------------------
// Everything here is either a real destination or empty. Nothing on this page
// shows a placeholder, a code path or a dead link: a section whose
// configuration is missing is not rendered at all.

const CONTACT = {
  email: '', // e.g. 'hello@coop.ng'
  phone: '',
  whatsapp: '', // digits only, with country code: '2348012345678'
};

/** Founders story: paste a YouTube/Vimeo embed URL here. */
const FOUNDERS_EMBED = '';

/**
 * Where "start free trial" sends a visitor.
 *
 * Co-op is a Windows desktop app today, so the honest destination is the
 * installer. There is no web sign-up yet — set this once one exists and every
 * trial CTA switches over without touching the markup.
 */
const SIGNUP_URL = '';

const DOWNLOAD_URL = 'https://github.com/Abdulkadir447/Co-Op/releases';
const ISSUES_URL = 'https://github.com/Abdulkadir447/Co-Op/issues';

const TRIAL_HREF = SIGNUP_URL || DOWNLOAD_URL;

// --- Assets ----------------------------------------------------------------
// Vite resolves these at build time. An empty glob means the file is absent,
// and the section that needs it is skipped rather than shown empty.
const shotUrls = import.meta.glob('./assets/screenshots/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const videoUrls = import.meta.glob('./assets/videos/*.mp4', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Map `./assets/screenshots/dashboard.png` to `{ dashboard: '/assets/…' }`. */
function byId(urls: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(urls)) {
    const id = path.split('/').pop()?.replace(/\.[^.]+$/, '');
    if (id) out[id] = url;
  }
  return out;
}

const SHOTS = byId(shotUrls);
const VIDEOS = byId(videoUrls);

const PAGES = [
  { id: 'dashboard', name: 'Dashboard', blurb: 'KPIs, revenue and low-stock at a glance.' },
  { id: 'products', name: 'Products', blurb: 'Your catalog, prices, stock and SKUs.' },
  { id: 'inventory', name: 'Inventory', blurb: 'Adjust stock and read the movement ledger.' },
  { id: 'orders', name: 'Orders', blurb: 'Create, track and fulfil orders in one flow.' },
  { id: 'customers', name: 'Customers', blurb: 'Add, sort and search; see purchase history.' },
  { id: 'invoices', name: 'Invoices', blurb: 'Generate and export invoices as PDF.' },
  { id: 'ai', name: 'CO OP AI', blurb: 'Ask Zeno to explain, forecast and draft.' },
];

/** The tour is all-or-nothing: half a tour reads more broken than none. */
const TOUR = PAGES.filter((p) => Boolean(SHOTS[p.id]));
const TOUR_READY = TOUR.length === PAGES.length;

const FOUNDERS_VIDEO = videoUrls['./assets/videos/founders.mp4'];
const FOUNDERS_POSTER = SHOTS['founders-poster'];
const FOUNDERS_READY = Boolean(FOUNDERS_EMBED || FOUNDERS_VIDEO);

const CONTACT_READY = Boolean(CONTACT.email || CONTACT.phone || CONTACT.whatsapp);

// --- Icons -----------------------------------------------------------------
// Real vector icons rather than emoji. Emoji render differently on every OS
// and are the clearest tell of a generated page.
type IconName = 'dashboard' | 'orders' | 'inventory' | 'customers' | 'ai' | 'offline';

const ICON_PATHS: Record<IconName, string> = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  orders: 'M6 3h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1zM9 8h6M9 12h6',
  inventory: 'M3 8l9-5 9 5-9 5-9-5zM3 8v8l9 5 9-5V8M12 13v8',
  customers: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  ai: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  offline: 'M2 8.8a15 15 0 0 1 8-2.3M14 6.6a15 15 0 0 1 8 2.2M5.5 12.4a10 10 0 0 1 3-1.1M15.5 11.4a10 10 0 0 1 3 1M8.8 16a5 5 0 0 1 6.4 0M12 20h.01M2 2l20 20',
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

function WeaveMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="CO OP">
      <defs>
        <linearGradient id="wmA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b5fef" />
          <stop offset="1" stopColor="#4143d5" />
        </linearGradient>
        <linearGradient id="wmB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a4cfc" />
          <stop offset="1" stopColor="#712ae2" />
        </linearGradient>
        <linearGradient id="wmC" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c0c1ff" />
          <stop offset="1" stopColor="#8a8df5" />
        </linearGradient>
      </defs>
      <rect x="14" y="5" width="20" height="21" rx="9" fill="url(#wmA)" />
      <rect x="6" y="19" width="20" height="21" rx="9" fill="url(#wmB)" opacity="0.94" />
      <rect x="22" y="19" width="20" height="21" rx="9" fill="url(#wmC)" opacity="0.9" />
      <path
        d="M24 17 Q26.6 22.4 30.5 25 Q26.6 27.6 24 33 Q21.4 27.6 17.5 25 Q21.4 22.4 24 17 Z"
        fill="#ffffff"
        opacity="0.96"
      />
    </svg>
  );
}

function Logo() {
  return (
    <a className="logo" href="#top">
      <WeaveMark size={24} /> <span>CO OP</span>
    </a>
  );
}

// --- Chrome ----------------------------------------------------------------

const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#tour', label: 'Tour', show: TOUR_READY },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
  { href: '#contact', label: 'Contact', show: CONTACT_READY },
];

function TopBar({ mode, onToggle }: { mode: Mode; onToggle: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const items = NAV.filter((i) => i.show !== false);

  // A nav that simply disappears under 860px leaves a phone with no way around
  // the page. This is a real disclosure button instead (aria-expanded, closes
  // on Escape and on navigation).
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

        <nav
          id="site-nav"
          className={`nav${menuOpen ? ' nav-open' : ''}`}
          aria-label="Main"
          onClick={() => setMenuOpen(false)}
        >
          {items.map((i) => (
            <a key={i.href} href={i.href}>
              {i.label}
            </a>
          ))}
          <a href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
            Download
          </a>
        </nav>

        <button
          type="button"
          className="theme-toggle"
          onClick={onToggle}
          // The label names the destination, not the current state, so a
          // screen-reader user hears what pressing it will do.
          aria-label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={mode === 'dark' ? 'Light theme' : 'Dark theme'}
        >
          <span aria-hidden="true">{mode === 'dark' ? '☀' : '◐'}</span>
        </button>
        <a className="btn btn-primary btn-sm" href={TRIAL_HREF}>
          Start free trial
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-glow" aria-hidden="true" />
      <div className="container hero-inner">
        <div data-enter="hero-copy">
          <span className="eyebrow" style={caps}>
            Offline-first · Built for Nigerian retail
          </span>
          <h1 style={{ ...t.pageTitle, fontSize: 48, lineHeight: '56px' }}>
            Run your whole business from <span className="grad">one calm place</span>
          </h1>
          <p className="lede">
            CO OP brings inventory, orders, customers and invoicing together, plus an assistant
            that explains your numbers and tells you what to do next. It keeps working when the
            internet doesn't.
          </p>
          <div className="hero-cta">
            <a className="btn btn-primary" href={TRIAL_HREF}>
              Start 10-day free trial
            </a>
            <a className="btn btn-ghost" href="#features">
              See how it works
            </a>
          </div>
          <p className="hero-note">
            No card to start · Windows desktop app · Your data stays on your machine and syncs
            when you're online
          </p>
        </div>
        <div className="preview" data-enter="hero-preview" aria-hidden="true">
          <div className="preview-bar">
            <span />
            <span />
            <span />
          </div>
          <div className="kpis">
            <div className="kpi">
              <div style={caps}>Revenue today</div>
              <div className="k-value">₦1,240,500</div>
              <div style={{ ...caps, color: colors.successText }}>▲ 12.4%</div>
            </div>
            <div className="kpi">
              <div style={caps}>Orders</div>
              <div className="k-value">37</div>
              <div style={{ ...caps, color: colors.successText }}>▲ 5</div>
            </div>
            <div className="kpi">
              <div style={caps}>Low stock</div>
              <div className="k-value">6</div>
              <div style={{ ...caps, color: colors.warningText }}>reorder</div>
            </div>
          </div>
          <div className="chart" />
        </div>
      </div>
    </section>
  );
}

const FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'dashboard',
    title: 'Dashboard',
    body: 'KPIs, revenue charts, inventory summaries and customer growth — your whole business at a glance.',
  },
  {
    icon: 'orders',
    title: 'Orders & invoices',
    body: 'Create orders, track status, and generate invoices and PDFs in one flow.',
  },
  {
    icon: 'inventory',
    title: 'Inventory',
    body: 'Products, categories, low-stock alerts, valuation and a full movement ledger.',
  },
  {
    icon: 'customers',
    title: 'Customers',
    body: 'A central database with purchase history and spending analysis per customer.',
  },
  {
    icon: 'ai',
    title: 'CO OP AI',
    body: 'Reports, explanations, forecasts and recommended restocks — grounded in your real data.',
  },
  {
    icon: 'offline',
    title: 'Works offline',
    body: 'Core operations run locally and sync automatically when you are back online.',
  },
];

function Features() {
  return (
    <section id="features">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>
            Everything in v1
          </span>
          <h2 style={t.pageTitle}>Five systems, one workspace</h2>
          <p className="muted" style={t.bodyDefault}>
            Built for owners with little time and no patience for enterprise software.
          </p>
        </div>
        <div className="grid-3">
          {FEATURES.map((f) => (
            <div className="card" key={f.title}>
              <div className="icon">
                <Icon name={f.icon} />
              </div>
              <h3 style={t.titleMd}>{f.title}</h3>
              <p style={t.bodyDefault}>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const AI = [
  {
    title: 'Explain the numbers',
    body: 'Ask why revenue moved and get a plain-English answer from your own data — never invented.',
  },
  {
    title: 'Forecast & restock',
    body: 'Statistical sales forecasts plus recommended reorder actions before you run out.',
  },
  {
    title: 'Draft in seconds',
    body: 'Generate reports and invoices from a sentence, scoped to what you are allowed to see.',
  },
];

function AiBand() {
  return (
    <section id="ai" className="ai-band">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>
            The defining feature
          </span>
          <h2 style={t.pageTitle}>Meet Zeno, an assistant that knows your business</h2>
        </div>
        <div className="grid-3">
          {AI.map((a) => (
            <div className="card ai-card" key={a.title}>
              <h3 style={t.titleMd}>{a.title}</h3>
              <p style={t.bodyDefault}>{a.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * One app page in the tour.
 *
 * It is a real <button>, so it is reachable by keyboard and announces what it
 * does. It used to be a `div role="img"` with onClick and no tabIndex: the
 * hover-to-play loop was pointer-only (WCAG 2.1.1), and `role="img"` hid its
 * contents from screen readers.
 */
function Shot({ id, name }: { id: string; name: string }) {
  const video = VIDEOS[id];
  const poster = SHOTS[id];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const play = useCallback(() => {
    videoRef.current?.play().catch(() => undefined);
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    setPlaying(false);
  }, []);

  if (!video) {
    return (
      <div className="shot">
        <img src={poster} alt={`The ${name} screen in CO OP`} className="shot-media" loading="lazy" />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="shot shot-button"
      aria-label={`${playing ? 'Pause' : 'Play'} the ${name} walkthrough`}
      onClick={() => (playing ? pause() : play())}
      onMouseEnter={play}
      onMouseLeave={pause}
      onFocus={play}
      onBlur={pause}
    >
      <video
        ref={videoRef}
        src={video}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        className="shot-media"
      />
    </button>
  );
}

function ProductTour() {
  if (!TOUR_READY) return null; // assets missing: no section, no placeholders
  return (
    <section id="tour">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>
            Product tour
          </span>
          <h2 style={t.pageTitle}>See every page</h2>
        </div>
        <div className="tour-grid">
          {TOUR.map((p) => (
            <div className="card tour-card" key={p.id}>
              <Shot id={p.id} name={p.name} />
              <h3 style={t.titleMd}>{p.name}</h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan, annual }: { plan: Plan; annual: boolean }) {
  const price = displayPrice(plan, annual);
  return (
    <div className={`card plan${plan.highlight ? ' featured' : ''}`}>
      {plan.highlight && (
        <span className="badge" style={caps}>
          Best value
        </span>
      )}
      <h3 style={t.sectionHeading}>{plan.name}</h3>
      <div className="price">
        <span className="amount">{price.amount}</span>
        {plan.priceMonthly != null && <span className="per">/mo</span>}
      </div>
      <p className="muted" style={t.bodyCompact}>
        {price.note} · {plan.tagline}
      </p>
      <ul style={t.bodyCompact}>
        {plan.features.map((f) => (
          <li key={f.label} className={f.included ? '' : 'off'}>
            <span className="tick" aria-hidden="true">
              {f.included ? '✓' : '—'}
            </span>
            {f.included ? f.label : <s>{f.label}</s>}
          </li>
        ))}
      </ul>
      <a className={`btn ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`} href={TRIAL_HREF}>
        {plan.cta}
      </a>
    </div>
  );
}

function Pricing() {
  const [annual, setAnnual] = useState(true);
  return (
    <section id="pricing">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>
            Pricing
          </span>
          <h2 style={t.pageTitle}>Simple plans that scale with you</h2>
          <p className="muted" style={t.bodyDefault}>
            Every paid plan starts with a 10-day free trial. No card needed to begin — you only
            pay if you decide to keep using CO OP.
          </p>
          <label
            style={{
              ...t.bodyCompact,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
              cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={annual} onChange={(e) => setAnnual(e.target.checked)} />
            Bill annually (save 20%)
          </label>
        </div>
        <div className="plans">
          {PLAN_CATALOG.map((plan) => (
            <PlanCard key={plan.id} plan={plan} annual={annual} />
          ))}
        </div>
        {/* These are the amounts the card is actually charged today, so they are
            shown as they are rather than converted to an invented Naira price.
            Replace this note the day Naira billing ships. */}
        <p className="muted billing-note" style={t.bodyCompact}>
          Prices are in US dollars, the amount charged today. Naira billing is coming.
        </p>
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: 'Does it work without internet?',
    a: 'Yes. Inventory, orders, customers and dashboards run locally; everything syncs when you reconnect.',
  },
  {
    q: 'What happens when the trial ends?',
    a: 'You keep everything you have entered. If you do not subscribe, the app stops accepting new entries until you do. Nothing is deleted.',
  },
  {
    q: 'Which platforms?',
    a: 'CO OP v1 is a Windows desktop app (Electron), with your data backed by the cloud.',
  },
  {
    q: 'Is my data safe?',
    a: 'Your records stay on your own machine and sync to a database that only your business can read. Backups are encrypted before they leave the device.',
  },
];

function Faq() {
  return (
    <section id="faq">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>
            FAQ
          </span>
          <h2 style={t.pageTitle}>Good to know</h2>
        </div>
        <div className="grid-2">
          {FAQ.map((f) => (
            <div className="card" key={f.q}>
              <h3 style={t.titleMd}>{f.q}</h3>
              <p style={t.bodyDefault}>{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FoundersVideo() {
  if (!FOUNDERS_READY) return null; // no empty 16:9 frame, no build instructions
  return (
    <section id="founders" className="ai-band">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>
            From the founders
          </span>
          <h2 style={t.pageTitle}>Why we built CO OP</h2>
        </div>
        <div className="video-frame">
          {FOUNDERS_EMBED ? (
            <iframe
              src={FOUNDERS_EMBED}
              title="Founders video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video
              src={FOUNDERS_VIDEO}
              poster={FOUNDERS_POSTER}
              controls
              playsInline
              preload="none"
            />
          )}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  if (!CONTACT_READY) return null;
  const wa = CONTACT.whatsapp || CONTACT.phone;
  return (
    <section id="contact">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>
            Contact
          </span>
          <h2 style={t.pageTitle}>Talk to a human</h2>
          <p className="muted" style={t.bodyDefault}>
            Questions about plans, onboarding or moving your data across? Reach us any time.
          </p>
        </div>
        <div className="contact-grid">
          {CONTACT.email && (
            <div className="card contact-item">
              <div className="icon" aria-hidden="true">
                <Icon name="orders" />
              </div>
              <h3 style={t.titleMd}>Email</h3>
              <a className="contact-link" style={t.bodyDefault} href={`mailto:${CONTACT.email}`}>
                {CONTACT.email}
              </a>
            </div>
          )}
          {wa && (
            <div className="card contact-item">
              <div className="icon" aria-hidden="true">
                <Icon name="customers" />
              </div>
              <h3 style={t.titleMd}>Call / WhatsApp</h3>
              <a
                className="contact-link"
                style={t.bodyDefault}
                href={
                  CONTACT.whatsapp
                    ? `https://wa.me/${CONTACT.whatsapp.replace(/[^0-9]/g, '')}`
                    : `tel:${CONTACT.phone}`
                }
              >
                {CONTACT.phone || CONTACT.whatsapp}
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section>
      <div className="container">
        <div className="cta">
          <h2 style={t.pageTitle}>Start your 10-day free trial</h2>
          <p style={{ ...t.bodyDefault, opacity: 0.92, margin: '0 0 24px' }}>
            Install it in minutes. No card needed to start.
          </p>
          <a className="btn" href={TRIAL_HREF}>
            Get started free
          </a>
          <a
            className="btn btn-ghost"
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
            style={{ marginLeft: 12 }}
          >
            Download the app
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div className="container foot">
        <Logo />
        <p style={{ ...t.bodyCompact, margin: 0 }}>
          © 2026 CO OP. The operating system for small businesses.
        </p>
        <nav className="nav nav-footer" aria-label="Footer">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <a href={ISSUES_URL} target="_blank" rel="noreferrer">
            Support
          </a>
        </nav>
      </div>
    </footer>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>(() => {
    // Respect the OS on first paint and remember an explicit choice, instead of
    // snapping everyone back to light on every reload.
    try {
      const stored = window.localStorage.getItem('coop-web:theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      /* private mode */
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  });

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const toggle = () => {
    const next: Mode = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    try {
      window.localStorage.setItem('coop-web:theme', next);
    } catch {
      /* private mode: the choice just does not persist */
    }
  };

  return (
    <div id="top">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar mode={mode} onToggle={toggle} />
      <main id="main">
        <Hero />
        <Features />
        <ProductTour />
        <AiBand />
        <FoundersVideo />
        <Pricing />
        <Faq />
        <Contact />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
