const CACHE_NAME = 'ea-edge-agent-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  // Note: Vite will bundle actual assets into /assets/.
  // In production, workbox or vite-plugin-pwa usually auto-injects these.
  // For local PWA offline support, we cache root explicitly.
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.warn('PWA Pre-cache skip:', err));
    })
  );
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
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignore cross-origin completely (like WebLLM chunks fetching from HF)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  // Ignore chrome extensions or data URIs
  if (event.request.url.startsWith('chrome-extension') || event.request.url.includes('extension')) {
     return;
  }
  
  // Ignore API calls if any exist in the future
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached asset if found
      if (cachedResponse) return cachedResponse;
      
      // Otherwise fetch from network and cache
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback for offline if not found in cache (e.g., SPA routing)
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});
