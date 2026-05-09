/* ============================================================
   BUDGET PWA — Service Worker
   Static file — never needs to change.
   Cache version and asset list are sent from index.html
   via postMessage on every page load.
   ============================================================ */

let activeCacheName = null;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// ── CONFIGURE ─────────────────────────────────────────────────
// index.html sends { type:'CONFIGURE', cache, assets } on load.
// If that cache name already exists, we're up to date — do nothing.
// If it's new, cache all assets, purge old caches, tell all tabs to reload.
self.addEventListener('message', async event => {
  const { type, cache, assets } = event.data || {};
  if (type !== 'CONFIGURE') return;

  activeCacheName = cache;

  const already = await caches.has(cache);
  if (already) return; // already on this version

  // Fetch and cache all assets for the new version
  const c = await caches.open(cache);
  await Promise.allSettled(
    assets.map(url =>
      c.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
    )
  );

  // Remove every old cache
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k !== cache).map(k => caches.delete(k)));

  // Tell every open tab to reload so they pick up the fresh assets
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage({ type: 'RELOAD' }));
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Never intercept Google API calls
  if (url.includes('script.google.com') || url.includes('googleapis.com')) return;

  // Navigation requests: network first, fall back to cached index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/budget/index.html'))
    );
    return;
  }

  // Everything else: cache first, then network (and cache the response)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.status === 200 && activeCacheName) {
          const clone = response.clone();
          caches.open(activeCacheName).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match('/budget/index.html'));
    })
  );
});
