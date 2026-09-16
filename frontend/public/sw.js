/*
 * CO OP — app-shell service worker.
 *
 * Goal: let a signed-in user re-open the app offline. After the first online
 * load, the app shell (index.html + hashed JS/CSS/assets) is cached, so a
 * later visit with no network still boots the UI. Live data still needs the
 * API — when offline, use the built-in local (SQLite) mode; those requests are
 * never intercepted here.
 *
 * Strategies:
 *   - navigations (index.html): network-first, fall back to cache when offline.
 *   - same-origin assets: cache-first, populate the cache in the background.
 *   - /api/*: never intercepted (always hit the network / local mode).
 */
const CACHE = 'coop-app-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache API traffic

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
    )
  );
});
