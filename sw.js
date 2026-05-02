/* ============================================================
   BUDGET PWA — Service Worker v3
   Bumped cache version to force refresh of all cached files
   ============================================================ */

const CACHE = 'budget-v6';
const ASSETS = [
  '/budget-app/',
  '/budget-app/index.html',
  '/budget-app/style.css',
  '/budget-app/categories.js',
  '/budget-app/app.js',
  '/budget-app/manifest.json',
  '/budget-app/icons/icon-192.png',
  '/budget-app/icons/icon-512.png',
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
  const url = e.request.url;

  // Never intercept Google API calls — pass straight to network
  if (url.includes('script.google.com') || url.includes('googleapis.com')) {
    return; // Let browser handle it natively — no e.respondWith()
  }

  // Cache-first for all app assets
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request)
        .catch(() => caches.match('/budget-app/index.html'))
      )
  );
});
