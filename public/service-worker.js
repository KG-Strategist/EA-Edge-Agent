const CACHE_NAME = 'ea-edge-agent-v7';
const OFFLINE_URL = '/';
// BUG-008 FIX: Only cache shell assets — binary corpus/models managed by OPFS/IndexedDB
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // BUG-008 FIX: Only cache shell assets; skip binary failures gracefully
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('PWA Pre-cache partial skip:', err);
        // Individually cache each asset so one failure doesn't block others
        return Promise.allSettled(ASSETS_TO_CACHE.map(url => cache.add(url)));
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
           if (cacheName !== CACHE_NAME) {
             return caches.delete(cacheName);
           }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  if (event.request.url.startsWith('chrome-extension') || event.request.url.includes('extension')) {
     return;
  }

  if (event.request.url.includes('/api/')) return;

  // BUG-008 FIX: Never cache binary assets — they live in OPFS/IndexedDB
  const url = event.request.url;
  if (url.endsWith('.gguf') || url.endsWith('.bin.gz') || url.endsWith('.bin')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        // BUG-008 FIX: Only cache small text-based assets (JS/CSS/HTML/JSON/SVG/WOFF2)
        const contentType = networkResponse.headers.get('content-type') || '';
        const isCacheable = contentType.includes('text') || contentType.includes('javascript') ||
          contentType.includes('json') || contentType.includes('font') || contentType.includes('svg');
        const isSmall = (networkResponse.headers.get('content-length') || 0) < 15 * 1024 * 1024;

        if (isCacheable && isSmall) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});
