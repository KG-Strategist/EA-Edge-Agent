const CACHE_NAME = 'ea-edge-agent-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  // We will add bundled JS/CSS and model weights here in later phases
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      self.registration.unregister();
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Do nothing, let the browser handle it
});
