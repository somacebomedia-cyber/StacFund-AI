
const CACHE_NAME = 'stacfund-v29';
const ASSETS = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force new service worker to activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim(); // Take control of all pages immediately
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests to our own origin, and bypass service worker for API requests and external domains (e.g. Firebase, Google APIs)
  try {
    const url = new URL(event.request.url);
    if (
      event.request.method !== 'GET' || 
      url.origin !== self.location.origin || 
      url.pathname.startsWith('/api/')
    ) {
      return;
    }

    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  } catch (e) {
    // If URL parsing or anything else fails, fallback to direct fetch
  }
});