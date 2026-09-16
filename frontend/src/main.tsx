import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { ClerkErrorBoundary } from './auth/ClerkErrorBoundary';
import './styles.css';
import App from './App';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error(
    'Missing VITE_CLERK_PUBLISHABLE_KEY environment variable. ' +
    'Set it in your .env file to configure Clerk authentication.'
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    {/* Stage 3: if Clerk cannot initialise, show the CO OP error state
        instead of a white screen. */}
    <ClerkErrorBoundary>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <App />
      </ClerkProvider>
    </ClerkErrorBoundary>
  </React.StrictMode>
);

// Offline app shell: cache the built app so a signed-in user can re-open it
// without a network. Production builds only (dev needs fresh modules).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline caching is best-effort; ignore registration errors */
    });
  });
}
