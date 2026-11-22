import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The repo root holds the single .env (see `envDir` below).
const ENV_DIR = fileURLToPath(new URL('..', import.meta.url));

// Where the FastAPI backend listens in development (see the proxy below).
const PROXY_TARGET = 'http://127.0.0.1:8000';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ENV_DIR, '');
  const publishableKey = env.VITE_CLERK_PUBLISHABLE_KEY;

  // Fail the production build when the Clerk publishable key is missing,
  // instead of shipping a bundle that throws on load.
  //
  // Why this is a build error and not a runtime check: `main.tsx` reads
  // `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY`, which Vite replaces with a
  // literal. Without a key that literal is `undefined`, so `if (!key) throw`
  // folds to an unconditional top-level throw, every statement after it
  // becomes unreachable, and the bundler tree-shakes the whole app away.
  // The result was a 51 kB entry chunk with no screens in it — a white page
  // and no error explaining why. `scripts/check-node.js`, `Dockerfile` and
  // the desktop workflow already treat the key as a hard requirement; this
  // makes the plain `pnpm build` path agree with them.
  if (command === 'build') {
    if (!publishableKey) {
      throw new Error(
        'VITE_CLERK_PUBLISHABLE_KEY is missing, so the build would produce a ' +
          'blank screen. Add it to the repo-root .env (copy .env.example to ' +
          '.env and fill in the pk_test_... / pk_live_... value from ' +
          'dashboard.clerk.com), or pass it inline for a one-off build.'
      );
    }
    if (!/^pk_(test|live)_/.test(publishableKey)) {
      throw new Error(
        'VITE_CLERK_PUBLISHABLE_KEY must start with pk_test_ or pk_live_. A ' +
          'secret key (sk_...) must never be put in the frontend bundle.'
      );
    }
  }

  // The dev proxy's default failure mode is a bare `502` with an empty body,
  // which surfaces in the browser as "Failed to load resource" and tells
  // nobody anything. The overwhelmingly common cause is that the API process
  // was never started (or crashed), so say that once per outage with the exact
  // command, and answer in JSON so the app's own error handling can show the
  // same sentence instead of "Request failed with status code 502".
  const apiHint =
    'The Co-op API is not answering on ' + PROXY_TARGET + '. ' +
    'Start it with `pnpm dev:api` (or `pnpm dev:all`), then reload.';

  return {
    plugins: [react()],
    // One .env for the whole repo (the root `.env`, documented by the committed
    // `.env.example`). Vite would otherwise look in this directory and tempt a
    // second `frontend/.env` into existence — a duplicate source of truth.
    envDir: '..',
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true, // allow preview/tunnel hosts in development
      // Backend proxy: the browser calls same-origin /api/*, Vite forwards to
      // the FastAPI backend. Keeps embedded previews working (the user's
      // browser cannot reach the sandbox's localhost directly).
      proxy: {
        '/api': {
          // 127.0.0.1, not "localhost": on Windows (Node >= 17) "localhost"
          // can resolve to ::1, while uvicorn binds 127.0.0.1 by default —
          // that mismatch makes every proxied call fail with 502.
          target: PROXY_TARGET,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
          configure: (proxy) => {
            let reported = false;
            proxy.on('error', (err) => {
              if (reported) return; // one line per outage, not one per request
              reported = true;
              console.error(
                `\n[vite] \u2717 ${apiHint}\n[vite]   cause: ${err.message}\n` +
                  '[vite]   docs: docs/RUN_LOCAL.md \u00a74\n'
              );
              setTimeout(() => {
                reported = false;
              }, 5000).unref?.();
            });
            // Registered after Vite's own handler would be too late to set a
            // body, so write the response here; Vite skips its empty 502 when
            // headers are already sent.
            proxy.on('error', (_err, _req, res) => {
              if (!('req' in res) || res.headersSent || res.writableEnded) return;
              res
                .writeHead(502, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ detail: apiHint }));
            });
          },
        },
      },
    },
    // ApexCharts: we use the full `react-apexcharts` bundle (see
    // src/components/dashboard/chart.ts). Pre-bundle it once so the dev server
    // doesn't split it into duplicate copies.
    optimizeDeps: {
      include: ['react-apexcharts', 'apexcharts'],
    },
    base: './', // This tells Vite to use relative paths
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: 'assets', // Keeps assets in a subfolder
      rollupOptions: {
        output: {
          // This ensures consistent asset naming
          assetFileNames: 'assets/[name]-[hash].[ext]',
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
        },
      },
    },
  };
});
