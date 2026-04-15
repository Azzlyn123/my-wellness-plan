const CACHE = 'wellness-v1';
const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';

// On install: cache the app shell and Chart.js so it works offline
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(['./index.html', './manifest.json', CHART_CDN])
        .catch(() => cache.add('./index.html'))
    )
  );
  self.skipWaiting();
});

// On activate: clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// On fetch: serve from cache first, fall back to network
self.addEventListener('fetch', e => {
  // Only handle GET requests
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(response => {
        // Cache Chart.js and the app itself
        if (
          e.request.url.includes('chart.js') ||
          e.request.url.endsWith('index.html') ||
          e.request.url.endsWith('manifest.json')
        ) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback — return cached app shell
        if (e.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
