/* ============================================================
   BUDGET PWA — Service Worker v7
   Uses individual caching so one failed file won't break install
   ============================================================ */

const CACHE = 'budget-v11';

const ASSETS = [
  '/budget-app/',
  '/budget-app/index.html',
  '/budget-app/style.css',
  '/budget-app/categories.js',
  '/budget-app/app.js',
  '/budget-app/manifest.json',
  '/budget-app/favicon.ico',
  '/budget-app/icons/icon-192.png',
  '/budget-app/icons/icon-512.png',
];

// Cache each asset individually — if one fails it won't break the whole install
async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.allSettled(
    ASSETS.map(url =>
      cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
    )
  );
}

self.addEventListener('install', e => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Never intercept Google API calls
  if (url.includes('script.google.com') || url.includes('googleapis.com')) {
    return;
  }

  // For navigation requests, always try network first then fall back to cached index
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/budget-app/index.html'))
    );
    return;
  }

  // Cache-first for all other assets
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache successful responses for future use
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match('/budget-app/index.html'));
    })
  );
});
