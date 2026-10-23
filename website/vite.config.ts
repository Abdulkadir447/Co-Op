import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The website imports the app's real design tokens from
// ../../frontend/src/theme/*, so fs.allow is widened to the repo root and the
// dev server binds 0.0.0.0 (the preview is proxied under an external host).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5178,
    allowedHosts: true,
    fs: { allow: ['../..'] },
  },
  preview: {
    host: '0.0.0.0',
    port: 5178,
    allowedHosts: true,
  },
});
