/* ============================================================
   BUDGET PWA — Service Worker v15
   Paths use /budget/ (renamed from /budget-app/)
   ============================================================ */

const CACHE = 'budget-v15';

const ASSETS = [
  '/budget/',
  '/budget/index.html',
  '/budget/style.css',
  '/budget/categories.js',
  '/budget/app.js',
  '/budget/manifest.json',
  '/budget/favicon.ico',
  '/budget/icons/icon-192.png',
  '/budget/icons/icon-512.png',
];

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

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/budget/index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match('/budget/index.html'));
    })
  );
});
