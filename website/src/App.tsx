import { useRef, useState } from 'react';
import { type as t } from '../../frontend/src/theme/typography';
import { colors } from '../../frontend/src/theme/colors';
import {
  PLAN_CATALOG,
  displayPrice,
  type Plan,
} from '../../frontend/src/billing/plans';
import { applyTheme, type Mode } from './theme';

const caps = { ...t.labelCaps, textTransform: 'uppercase' as const };

// --- Site config (fill these in when ready) -------------------------------
const CONTACT = {
  // Set when the domain email is ready, e.g. "hello@coop.app".
  email: '',
  // Optional — a call/WhatsApp number converts well for this audience.
  phone: '',
  whatsapp: '',
};
// Prefer a YouTube/Vimeo embed for the founders story? Paste the embed URL here
// (e.g. "https://www.youtube.com/embed/VIDEO_ID") and it wins over the mp4.
const FOUNDERS_EMBED = '';
// Where the desktop installer is published. Swap for your own release/download URL.
const DOWNLOAD_URL = 'https://github.com/Abdulkadir447/Co-Op/releases';

// Product tour — one entry per app page. Assets live in public/ (see
// public/README.md): screenshots/<id>.png and videos/<id>.mp4.
const PAGES = [
  { id: 'dashboard', name: 'Dashboard', blurb: 'KPIs, revenue and low-stock at a glance.' },
  { id: 'products', name: 'Products', blurb: 'Your catalog, prices, stock and SKUs.' },
  { id: 'inventory', name: 'Inventory', blurb: 'Adjust stock and read the movement ledger.' },
  { id: 'orders', name: 'Orders', blurb: 'Create, track and fulfil orders in one flow.' },
  { id: 'customers', name: 'Customers', blurb: 'Add, sort and search; see purchase history.' },
  { id: 'invoices', name: 'Invoices', blurb: 'Generate and export invoices as PDF.' },
  { id: 'ai', name: 'CO OP AI', blurb: 'Ask Zeno to explain, forecast and draft.' },
];

/** Shows a page's video (on hover) over its screenshot, or a styled placeholder
 *  until the real asset is dropped into public/. */
function Shot({ id, name }: { id: string; name: string }) {
  const img = `screenshots/${id}.png`;
  const vid = `videos/${id}.mp4`;
  const [imgFailed, setImgFailed] = useState(false);
  const [vidFailed, setVidFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const play = () => videoRef.current?.play().catch(() => {});
  const pause = () => videoRef.current?.pause();

  return (
    <div
      className="shot"
      onMouseEnter={play}
      onMouseLeave={pause}
      onClick={play}
      role="img"
      aria-label={`${name} screenshot`}
    >
      {!vidFailed && (
        <video
          ref={videoRef}
          src={vid}
          poster={img}
          muted
          loop
          playsInline
          preload="none"
          onError={() => setVidFailed(true)}
          className="shot-media"
        />
      )}
      {vidFailed && !imgFailed && (
        <img src={img} alt={name} className="shot-media" onError={() => setImgFailed(true)} />
      )}
      {(vidFailed && imgFailed) && (
        <div className="shot-placeholder">
          <span style={caps}>{name}</span>
          <small style={t.bodyCompact}>screenshot / clip goes here</small>
        </div>
      )}
    </div>
  );
}

function WeaveMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="CO OP">
      <defs>
        <linearGradient id="wmA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5b5fef" /><stop offset="1" stopColor="#4143d5" /></linearGradient>
        <linearGradient id="wmB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8a4cfc" /><stop offset="1" stopColor="#712ae2" /></linearGradient>
        <linearGradient id="wmC" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c0c1ff" /><stop offset="1" stopColor="#8a8df5" /></linearGradient>
      </defs>
      <rect x="14" y="5" width="20" height="21" rx="9" fill="url(#wmA)" />
      <rect x="6" y="19" width="20" height="21" rx="9" fill="url(#wmB)" opacity="0.94" />
      <rect x="22" y="19" width="20" height="21" rx="9" fill="url(#wmC)" opacity="0.9" />
      <path d="M24 17 Q26.6 22.4 30.5 25 Q26.6 27.6 24 33 Q21.4 27.6 17.5 25 Q21.4 22.4 24 17 Z" fill="#ffffff" opacity="0.96" />
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

function TopBar({ mode, onToggle }: { mode: Mode; onToggle: () => void }) {
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Logo />
        <nav className="nav">
          <a href="#features">Features</a>
          <a href="#tour">Tour</a>
          <a href="#ai">CO OP AI</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Contact</a>
          <a href={DOWNLOAD_URL} target="_blank" rel="noreferrer">Download</a>
        </nav>
        <button className="theme-toggle" onClick={onToggle} aria-label="Toggle dark mode">
          {mode === 'dark' ? '☀' : '◐'}
        </button>
        <a className="btn btn-primary btn-sm" href="#pricing">Start free trial</a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-glow" />
      <div className="container hero-inner">
        <div>
          <span className="eyebrow" style={caps}>Offline-first · AI-assisted</span>
          <h1 style={{ ...t.pageTitle, fontSize: 48, lineHeight: '56px' }}>
            Run your whole business from <span className="grad">one calm place</span>
          </h1>
          <p className="lede">
            CO OP brings inventory, orders, customers and invoicing together — plus an AI
            assistant that explains your numbers and tells you what to do next. It keeps
            working when the internet doesn't.
          </p>
          <div className="hero-cta">
            <a className="btn btn-primary" href="#pricing">Start 10-day free trial</a>
            <a className="btn btn-ghost" href="#features">See how it works</a>
            <a className="btn btn-ghost" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">Download for Windows</a>
          </div>
          <p className="hero-note">No credit card required · Windows desktop app · Your data, backed up and encrypted</p>
        </div>
        <div className="preview" aria-hidden="true">
          <div className="preview-bar"><span /><span /><span /></div>
          <div className="kpis">
            <div className="kpi"><div style={caps}>Revenue today</div><div className="k-value">$2,845</div><div style={{ ...caps, color: colors.success }}>▲ 12.4%</div></div>
            <div className="kpi"><div style={caps}>Orders</div><div className="k-value">37</div><div style={{ ...caps, color: colors.success }}>▲ 5</div></div>
            <div className="kpi"><div style={caps}>Low stock</div><div className="k-value">6</div><div style={{ ...caps, color: colors.warning }}>reorder</div></div>
          </div>
          <div className="chart" />
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: '▦', title: 'Dashboard', body: 'KPIs, revenue charts, inventory summaries and customer growth — your whole business at a glance.' },
  { icon: '🧾', title: 'Orders & invoices', body: 'Create orders, track status, and generate invoices and PDFs in one flow.' },
  { icon: '📦', title: 'Inventory', body: 'Products, categories, low-stock alerts, valuation and a full movement ledger.' },
  { icon: '👥', title: 'Customers', body: 'A central database with purchase history and spending analysis per customer.' },
  { icon: '✨', title: 'CO OP AI', body: 'Reports, explanations, forecasts and recommended restocks — grounded in your real data.' },
  { icon: '🔌', title: 'Works offline', body: 'Core operations run locally and sync automatically when you are back online.' },
];

function Features() {
  return (
    <section id="features">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>Everything in v1</span>
          <h2 style={t.pageTitle}>Five systems, one workspace</h2>
          <p className="muted" style={t.bodyDefault}>Built for owners with little time and no patience for enterprise software.</p>
        </div>
        <div className="grid-3">
          {FEATURES.map((f) => (
            <div className="card" key={f.title}>
              <div className="icon">{f.icon}</div>
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
  { title: 'Explain the numbers', body: 'Ask why revenue moved and get a plain-English answer from your own data — never invented.' },
  { title: 'Forecast & restock', body: 'Statistical sales forecasts plus recommended reorder actions before you run out.' },
  { title: 'Draft in seconds', body: 'Generate reports and invoices from a sentence, scoped to what you are allowed to see.' },
];

function AiBand() {
  return (
    <section id="ai" className="ai-band">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>The defining feature</span>
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

function PlanCard({ plan, annual }: { plan: Plan; annual: boolean }) {
  const price = displayPrice(plan, annual);
  return (
    <div className={`card plan${plan.highlight ? ' featured' : ''}`}>
      {plan.highlight && <span className="badge" style={caps}>Best value</span>}
      <h3 style={t.sectionHeading}>{plan.name}</h3>
      <div className="price">
        <span className="amount">{price.amount}</span>
        {plan.priceMonthly != null && <span className="per">/mo</span>}
      </div>
      <p className="muted" style={t.bodyCompact}>{price.note} · {plan.tagline}</p>
      <ul style={t.bodyCompact}>
        {plan.features.map((f) => (
          <li key={f.label} className={f.included ? '' : 'off'}>
            <span className="tick">{f.included ? '✓' : '—'}</span> {f.label}
          </li>
        ))}
      </ul>
      <a className={`btn ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`} href="#top">{plan.cta}</a>
    </div>
  );
}

function Pricing() {
  const [annual, setAnnual] = useState(true);
  return (
    <section id="pricing">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>Pricing</span>
          <h2 style={t.pageTitle}>Simple plans that scale with you</h2>
          <p className="muted" style={t.bodyDefault}>
            Every paid plan starts with a 10-day free trial. The trial runs to the end — subscribe to keep going.
          </p>
          <label style={{ ...t.bodyCompact, display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={annual} onChange={(e) => setAnnual(e.target.checked)} />
            Bill annually (save 20%)
          </label>
        </div>
        <div className="plans">
          {PLAN_CATALOG.map((plan) => (
            <PlanCard key={plan.id} plan={plan} annual={annual} />
          ))}
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  { q: 'Does it work without internet?', a: 'Yes. Inventory, orders, customers and dashboards run locally; everything syncs when you reconnect.' },
  { q: 'What happens when the trial ends?', a: 'The 10-day trial runs to the end and cannot be cancelled early. Subscribe to keep using CO OP.' },
  { q: 'Which platforms?', a: 'CO OP v1 is a Windows desktop app (Electron), with your data backed by the cloud.' },
  { q: 'Is my data safe?', a: 'Tenant isolation, encrypted backups and strict security headers are on by default.' },
];

function Faq() {
  return (
    <section id="faq">
      <div className="container">
        <div className="section-head"><span className="caps" style={caps}>FAQ</span><h2 style={t.pageTitle}>Good to know</h2></div>
        <div className="grid-2">
          {FAQ.map((f) => (
            <div className="card" key={f.q}><h3 style={t.titleMd}>{f.q}</h3><p style={t.bodyDefault}>{f.a}</p></div>
          ))}
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
          <p style={{ ...t.bodyDefault, opacity: 0.92, margin: '0 0 24px' }}>Set up in minutes. No credit card required.</p>
          <a className="btn" href="#top">Get started free</a>
          <a className="btn btn-ghost" href={DOWNLOAD_URL} target="_blank" rel="noreferrer" style={{ marginLeft: 12 }}>Download the app</a>
        </div>
      </div>
    </section>
  );
}

function ProductTour() {
  return (
    <section id="tour">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>Product tour</span>
          <h2 style={t.pageTitle}>See every page</h2>
          <p className="muted" style={t.bodyDefault}>
            Hover a page to watch it in action — adding a customer, sorting, creating an order.
          </p>
        </div>
        <div className="tour-grid">
          {PAGES.map((p) => (
            <div className="card tour-card" key={p.id}>
              <Shot id={p.id} name={p.name} />
              <h3 style={t.titleMd}>{p.name}</h3>
              <p style={t.bodyCompact}>{p.blurb}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FoundersVideo() {
  return (
    <section id="founders" className="ai-band">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>From the founders</span>
          <h2 style={t.pageTitle}>Why we built CO OP</h2>
          <p className="muted" style={t.bodyDefault}>
            A short word from the team behind CO OP.
          </p>
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
              src="videos/founders.mp4"
              poster="screenshots/founders-poster.jpg"
              controls
              playsInline
              preload="none"
            />
          )}
          <div className="video-hint" style={t.bodyCompact}>
            Founders video slot — drop <code>videos/founders.mp4</code> (or set the embed) to play it here.
          </div>
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const hasEmail = Boolean(CONTACT.email);
  const hasPhone = Boolean(CONTACT.phone || CONTACT.whatsapp);
  const wa = CONTACT.whatsapp || CONTACT.phone;
  return (
    <section id="contact">
      <div className="container">
        <div className="section-head">
          <span className="caps" style={caps}>Contact</span>
          <h2 style={t.pageTitle}>Talk to a human</h2>
          <p className="muted" style={t.bodyDefault}>
            Questions about plans, onboarding or migrating your data? Reach us any time.
          </p>
        </div>
        <div className="contact-grid">
          <div className="card contact-item">
            <div className="icon">✉</div>
            <h3 style={t.titleMd}>Email</h3>
            {hasEmail ? (
              <a className="contact-link" style={t.bodyDefault} href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
            ) : (
              <p style={t.bodyCompact}>Support email coming soon.</p>
            )}
          </div>
          <div className="card contact-item">
            <div className="icon">{wa ? '💬' : '📞'}</div>
            <h3 style={t.titleMd}>{wa ? 'Call / WhatsApp' : 'Phone'}</h3>
            {hasPhone ? (
              <a
                className="contact-link"
                style={t.bodyDefault}
                href={CONTACT.whatsapp ? `https://wa.me/${CONTACT.whatsapp.replace(/[^0-9]/g, '')}` : `tel:${CONTACT.phone}`}
              >
                {CONTACT.phone || CONTACT.whatsapp}
              </a>
            ) : (
              <p style={t.bodyCompact}>Add a number in <code>CONTACT</code> to enable this.</p>
            )}
          </div>
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
        <p style={{ ...t.bodyCompact, margin: 0 }}>© 2026 CO OP. The operating system for small businesses.</p>
        <nav className="nav" style={{ margin: 0 }}><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a></nav>
      </div>
    </footer>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('light');
  const toggle = () => {
    const next: Mode = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    applyTheme(next);
  };
  return (
    <div id="top">
      <TopBar mode={mode} onToggle={toggle} />
      <main>
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
