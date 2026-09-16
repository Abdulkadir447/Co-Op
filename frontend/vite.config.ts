import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
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
});