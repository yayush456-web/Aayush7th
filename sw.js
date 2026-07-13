// BPKIHS MedPlanner Service Worker
// Bump CACHE_VERSION any time index.html/manifest/icons change to force an update.
const CACHE_VERSION = 'medplanner-v1';
const CACHE_NAME = CACHE_VERSION;

// Files that make up the app shell (same-origin).
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Third-party libraries the app needs to run (loaded from CDNs).
// Cached opaque (no-cors) so the app still works with no internet.
const CDN_ASSETS = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.tailwindcss.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Same-origin files: normal fetch.
      await cache.addAll(APP_SHELL);
      // Cross-origin CDN files: fetch individually with no-cors so a single
      // failure (e.g. offline during install) doesn't break the whole install.
      await Promise.all(
        CDN_ASSETS.map(async (url) => {
          try {
            const req = new Request(url, { mode: 'no-cors' });
            const res = await fetch(req);
            await cache.put(req, res);
          } catch (err) {
            // Ignore — will be cached on first successful fetch at runtime instead.
          }
        })
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      // Cache-first for everything: instant load, works fully offline.
      // Update the cache in the background when a network is available.
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        // Serve cached copy immediately; refresh cache silently in background.
        networkFetch;
        return cached;
      }

      const networkResponse = await networkFetch;
      if (networkResponse) return networkResponse;

      // Nothing cached and no network: fall back to the app shell for
      // navigation requests so the app still opens offline.
      if (request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }

      return new Response('Offline and not cached.', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    })()
  );
});
