/* ============================================================
   BUDGET PWA v2 — Service Worker
   ============================================================ */

const CACHE = 'budget-v2';
const ASSETS = [
  '/budget/',
  '/budget/index.html',
  '/budget/style.css',
  '/budget/app.js',
  '/budget/manifest.json',
  '/budget/icons/icon-192.png',
  '/budget/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // For Sheets API calls — always go to network, never cache
  if (e.request.url.includes('script.google.com')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // For everything else — cache first, fallback to network
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request)
        .catch(() => caches.match('/budget/index.html'))
      )
  );
});
