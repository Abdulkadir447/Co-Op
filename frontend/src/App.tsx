import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { message } from 'antd';
import CoopLoader from './components/ui/CoopLoader';
import { InfoCircleFilled } from '@ant-design/icons';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';

// Electron loads the app over file:// where BrowserRouter has no usable
// path — HashRouter keeps routing identical in that context (Stage 2.4 QA).
const Router =
  typeof window !== 'undefined' && window.location.protocol === 'file:' ? HashRouter : BrowserRouter;
import { useAuth, useClerk, useUser, SignIn, SignUp } from '@clerk/react';
import { radius, type } from './theme';
import { tint } from './theme/colors';
import { CoopThemeProvider, useCoopTheme } from './theme-provider';
import { coopAuthAppearance } from './auth/appearance';
import { CoopOfflineBanner } from './auth';
import { AppShell } from './components/layout';
import { CoopMark } from './components/brand/CoopLogo';
import { startSyncEngine } from './sync/engine';
import { isLocalAvailable } from './sync/localDb';
import { fetchIdentity } from './repositories/identity';
import type { TeamInviteIdentity } from './repositories/identity';
import InviteJoinCard from './pages/Team/InviteJoinCard';

// Route-level code splitting (Stage 2.4 performance QA): each module loads
// on demand instead of shipping everything in one initial bundle.
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const ReportsPage = lazy(() => import('./pages/Reports'));
const ProductsPage = lazy(() => import('./pages/Products'));
const InventoryPage = lazy(() => import('./pages/Inventory'));
const CustomersPage = lazy(() => import('./pages/Customers'));
const CustomerProfilePage = lazy(() => import('./pages/Customers/CustomerProfilePage'));
const OrdersPage = lazy(() => import('./pages/Orders'));
const InvoicesPage = lazy(() => import('./pages/Invoices'));
const CreateOrderPage = lazy(() => import('./pages/Orders/CreateOrderPage'));
const OrderDetailsPage = lazy(() => import('./pages/Orders/OrderDetailsPage'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const ImportPage = lazy(() => import('./imports/pages/ImportPage'));
const WelcomePage = lazy(() => import('./pages/Welcome'));
const BriefingPage = lazy(() => import('./pages/Briefing'));
const NotFoundPage = lazy(() => import('./pages/NotFound'));
const CoopAiPage = lazy(() => import('./pages/CoopAi'));
const BillingPage = lazy(() => import('./pages/Billing'));
const SyncPage = lazy(() => import('./pages/Sync'));
const AdminPage = lazy(() => import('./pages/Admin'));

const RouteFallback = () => (
  <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <CoopLoader />
  </div>
);
import { setCurrency } from './services/currency';
import { useApiClient } from './services/api/client';

// ---------------------------------------------------------------------------
// Splash Screen (AFD Ch1.10 — lifecycle: Launch -> Splash -> Login)
// ---------------------------------------------------------------------------
const SplashScreen: React.FC = () => {
  const { colors } = useCoopTheme();
  return (
  <div
    style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      background: colors.surface,
      transition: 'background-color 300ms',
    }}
  >
    <CoopMark size={64} title="CO OP" />
    <div style={{ textAlign: 'center' }}>
      <div style={{ ...type.sectionHeading, color: colors.primary, fontSize: 26, lineHeight: '34px' }}>CO OP</div>
      <div style={{ ...type.labelCaps, color: colors.onSurfaceVariant, marginTop: 2, letterSpacing: '0.1em' }}>
        Better business, together.
      </div>
    </div>
    <CoopLoader />
  </div>
  );
};

// ---------------------------------------------------------------------------
// Full-screen loader shown while Clerk resolves the session. Auth state must
// NEVER be evaluated before `isLoaded` — redirecting on unresolved state is
// what caused the / <-> /sign-in redirect loop.
// ---------------------------------------------------------------------------
const AuthLoadingScreen: React.FC = () => {
  const { colors } = useCoopTheme();
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.surface,
      }}
    >
      <CoopLoader />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Protected Route Component using Clerk auth
// ---------------------------------------------------------------------------
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn } = useAuth();
  // Wait for Clerk to resolve before evaluating the session (Clerk docs:
  // isSignedIn is undefined until isLoaded is true).
  if (!isLoaded) return <AuthLoadingScreen />;
  return isSignedIn ? <>{children}</> : <Navigate to="/sign-in" replace />;
};

// ---------------------------------------------------------------------------
// Auth page frame (Stitch sign-in/sign-up screens).
//
// Canvas + centered column. The brand mark lives INSIDE the Clerk card via
// the logo slot (auth/appearance.ts), exactly as the designs show; this
// frame adds the copyright line and the page-level notices (offline,
// session-expired) above the card. Mobile: full-bleed via .coop-auth-frame.
// ---------------------------------------------------------------------------
const AuthPage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors } = useCoopTheme();
  const year = new Date().getFullYear();
  return (
    <div
      className="coop-auth-frame"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '40px 16px',
        background: colors.surface,
        transition: 'background-color 300ms',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {children}
      </div>
      <div style={{ ...type.bodyCompact, fontSize: 13, color: colors.outline }}>
        © {year} CO OP SaaS. All rights reserved.
      </div>
    </div>
  );
};

/** Small info notice (session expired) shown above the sign-in card. */
const SessionExpiredNotice: React.FC = () => {
  const { colors, isDark } = useCoopTheme();
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: radius.lg,
        background: tint(colors.primary, isDark ? 0.16 : 0.08),
        border: `1px solid ${tint(colors.primary, isDark ? 0.4 : 0.25)}`,
        ...type.bodyCompact,
        color: colors.onSurfaceVariant,
      }}
    >
      <InfoCircleFilled style={{ color: colors.primary, flexShrink: 0 }} />
      Your session has expired. Please sign in again.
    </div>
  );
};

const SESSION_EXPIRED_KEY = 'coop:session-expired';

/**
 * Sign In page using Clerk (STITCH SIGN-IN SKIN).
 *
 * Logic is untouched — Clerk's hosted SignIn (email code, password, SSO,
 * account recovery, inline errors, loading) — only the `appearance` prop
 * applies the Co-op design (coop_sign_in_refactored /
 * coop_recover_account_refactored / mobile). Page-level states added here:
 * offline banner + one-shot "session expired" notice.
 */
const SignInPage = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const { isDark } = useCoopTheme();
  const [sessionExpired] = useState<boolean>(() => {
    try {
      const seen = window.sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1';
      if (seen) window.sessionStorage.removeItem(SESSION_EXPIRED_KEY);
      return seen;
    } catch {
      return false;
    }
  });

  // While Clerk resolves, hold the route — never bounce on unresolved state.
  if (!isLoaded) return <AuthLoadingScreen />;
  // Already authenticated: leave /sign-in exactly once, deterministically.
  if (isSignedIn) return <Navigate to="/" replace />;

  return (
    <AuthPage>
      <CoopOfflineBanner />
      {sessionExpired && <SessionExpiredNotice />}
      <SignIn appearance={coopAuthAppearance(isDark, 'signin')} />
    </AuthPage>
  );
};

/**
 * Sign Up page using Clerk (STITCH SIGN-UP SKIN) — same contract as
 * SignInPage: Clerk logic untouched, appearance-only presentation.
 */
const SignUpPage: React.FC = () => {
  const { isDark } = useCoopTheme();
  return (
    <AuthPage>
      <CoopOfflineBanner />
      <SignUp
        afterSignOutUrl="/"
        fallbackRedirectUrl="/"
        appearance={coopAuthAppearance(isDark, 'signup')}
      />
    </AuthPage>
  );
};

/**
 * Session-expiry guard (Task 11 / audit H6).
 *
 * The API client dispatches a `coop:unauthorized` event whenever the backend
 * rejects a request with 401 (session expired/revoked — a case Clerk's normal
 * token refresh does not cover). This component signs the user out exactly
 * once in response, after which Clerk's state flips to signed-out and the
 * ProtectedRoute deterministically navigates to /sign-in. The `handled` ref is
 * the loop guard: repeated 401s cannot trigger repeated sign-outs or a
 * sign-in <-> redirect bounce.
 */
const SessionExpiryGuard: React.FC = () => {
  const { signOut } = useClerk();
  const handled = useRef(false);

  useEffect(() => {
    const onUnauthorized = () => {
      if (handled.current) return;
      handled.current = true;
      // Flag the sign-in screen so the user knows why they were signed out.
      try {
        window.sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
      } catch {
        /* non-fatal */
      }
      signOut().catch(() => undefined);
    };
    window.addEventListener('coop:unauthorized', onUnauthorized);
    return () => window.removeEventListener('coop:unauthorized', onUnauthorized);
  }, [signOut]);

  return null;
};

/**
 * Seeds the app-wide currency store from the caller's business settings
 * (Task 9) so money formatting follows the company setting. Runs once per
 * signed-in session inside the protected layout; failures are silent.
 */
const CurrencySeeder: React.FC = () => {
  const api = useApiClient();
  useEffect(() => {
    let cancelled = false;
    api
      .get('/business/settings')
      .then((r) => !cancelled && setCurrency(r.data.currency))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api]);
  return null;
};

// ---------------------------------------------------------------------------
// First-run gate — the "/" route.
//
// A tenant with no business data yet (no products, customers or orders —
// imported or live) is routed to the Welcome screen, where the Intelligent
// Importer is the hero CTA. Tenants with data go straight to the Dashboard.
// The check is a single cheap count query (backend /onboarding/state).
// ---------------------------------------------------------------------------
const RootGate: React.FC = () => {
  const api = useApiClient();
  const [invite, setInvite] = useState<TeamInviteIdentity | null>(null);
  const [identityResolved, setIdentityResolved] = useState(false);
  const [hasData, setHasData] = useState<boolean | null>(null);

  // The owner can explicitly choose "Start from scratch" on /welcome —
  // respect that choice instead of re-routing them to /welcome on every "/"
  // visit while the business is still empty (the empty dashboard renders
  // real zeros and native no-data states).
  const startedManual = () => {
    try {
      return window.localStorage.getItem('coop:started-manual') === '1';
    } catch {
      return false;
    }
  };

  // Identity first: a pending invitation takes over the gate — the invitee
  // has no business yet and must not touch business endpoints (they 409).
  useEffect(() => {
    let cancelled = false;
    fetchIdentity(api)
      .then((me) => {
        if (cancelled) return;
        if (me.pending_invitation) setInvite(me.pending_invitation);
        setIdentityResolved(true);
      })
      .catch(() => !cancelled && setIdentityResolved(true));
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!identityResolved || invite) return undefined;
    let cancelled = false;
    api
      .get<{ has_data: boolean }>('/onboarding/state')
      .then((r) => !cancelled && setHasData(r.data.has_data))
      .catch(() => !cancelled && setHasData(true)); // unreachable API -> normal app, errors surface per-page
    return () => {
      cancelled = true;
    };
  }, [api, identityResolved, invite]);

  if (!identityResolved || hasData === null) return <RouteFallback />;
  if (invite) {
    return (
      <InviteJoinCard
        invite={invite}
        onDone={() => {
          setInvite(null);
          setIdentityResolved(false);
          setHasData(null);
          fetchIdentity(api).catch(() => undefined); // re-cache under the new identity
        }}
      />
    );
  }
  if (!hasData && !startedManual()) return <Navigate to="/welcome" replace />;
  return <DashboardPage />;
};

// ---------------------------------------------------------------------------
// Main app shell — wraps the routed pages in the Co-op chrome (Stitch
// Stage 1). Business pages own their data; the shell owns navigation,
// search slots and the account menu (logout lives in the TopBar menu).
// ---------------------------------------------------------------------------
/**
 * OFFLINE 3 — starts the sync engine (initial pull → mirror ready →
 * local reads; push on startup / reconnect / interval / manual). No-op in
 * a plain browser (no local data layer). Stopped on sign-out (unmount).
 */
const SyncEngineRunner: React.FC = () => {
  const api = useApiClient();
  useEffect(() => {
    if (!isLocalAvailable()) return undefined;
    return startSyncEngine(api);
  }, [api]);
  return null;
};

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const { signOut } = useClerk();

  const handleLogout = async () => {
    await signOut();
    message.info('Logged out successfully');
  };

  return (
    <AppShell
      user={{
        fullName: user?.fullName,
        firstName: user?.firstName,
        email: user?.primaryEmailAddress?.emailAddress,
        imageUrl: user?.imageUrl,
      }}
      onSignOut={() => {
        void handleLogout();
      }}
    >
      <SyncEngineRunner />
      {children}
    </AppShell>
  );
};

// Main App Component
const App: React.FC = () => {
  const [booting, setBooting] = useState(true);

  // Splash screen on launch (AFD Ch1.10 lifecycle).
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <CoopThemeProvider>
      {booting ? (
        <SplashScreen />
      ) : (
        <Router>
          <SessionExpiryGuard />
          <Routes>
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <CurrencySeeder />
                  <AppLayout>
                    <Suspense fallback={<RouteFallback />}>
                      <Routes>
                        <Route path="/" element={<RootGate />} />
                        <Route path="/welcome" element={<WelcomePage />} />
                        <Route path="/reports" element={<ReportsPage />} />
                        <Route path="/products" element={<ProductsPage />} />
                        <Route path="/inventory" element={<InventoryPage />} />
                        <Route path="/customers" element={<CustomersPage />} />
                        <Route path="/customers/:id" element={<CustomerProfilePage />} />
                        <Route path="/orders" element={<OrdersPage />} />
                        <Route path="/orders/new" element={<CreateOrderPage />} />
                        <Route path="/orders/:id" element={<OrderDetailsPage />} />
                        <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/coop-ai" element={<CoopAiPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/sync" element={<SyncPage />} />
                        <Route path="/import" element={<ImportPage />} />
                        <Route path="/briefing" element={<BriefingPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/admin" element={<AdminPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                      </Routes>
                    </Suspense>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Router>
      )}
    </CoopThemeProvider>
  );
};

export default App;
