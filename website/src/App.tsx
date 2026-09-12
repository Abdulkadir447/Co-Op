import { useState } from 'react';
import { type as t } from '../../frontend/src/theme/typography';
import { colors } from '../../frontend/src/theme/colors';
import {
  PLAN_CATALOG,
  displayPrice,
  type Plan,
} from '../../frontend/src/billing/plans';
import { applyTheme, type Mode } from './theme';

const caps = { ...t.labelCaps, textTransform: 'uppercase' as const };

function Logo() {
  return (
    <a className="logo" href="#top">
      <span className="logo-tile">C</span> Co-op
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
          <a href="#ai">Co-op AI</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
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
            Co-op brings inventory, orders, customers and invoicing together — plus an AI
            assistant that explains your numbers and tells you what to do next. It keeps
            working when the internet doesn't.
          </p>
          <div className="hero-cta">
            <a className="btn btn-primary" href="#pricing">Start 10-day free trial</a>
            <a className="btn btn-ghost" href="#features">See how it works</a>
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
  { icon: '✨', title: 'Co-op AI', body: 'Reports, explanations, forecasts and recommended restocks — grounded in your real data.' },
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
  { q: 'What happens when the trial ends?', a: 'The 10-day trial runs to the end and cannot be cancelled early. Subscribe to keep using Co-op.' },
  { q: 'Which platforms?', a: 'Co-op v1 is a Windows desktop app (Electron), with your data backed by the cloud.' },
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
        <p style={{ ...t.bodyCompact, margin: 0 }}>© 2026 Co-op. The operating system for small businesses.</p>
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
        <AiBand />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
