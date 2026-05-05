// Luncher PE — Service Worker (PWA shell cache).
// Standalone repo `luncher` (od 2026-05-05) — wrapper kolem GAS app
// (script.google.com/.../macros/...) v iframu. Shell cache = jen statické
// soubory v tomto repu, GAS content je cross-origin (necachuje SW).
//
// Bump CACHE_NAME při změně shell content (index.html, manifest, ikony).
// Activate handler smaže staré cache klíče → user dostane fresh shell.
var CACHE_NAME = 'luncher-shell-v1';
var CORE_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'icon.svg?v=20260504',
  'apple-touch-icon.png?v=20260504',
  'icon-192.png?v=20260504',
  'icon-512.png?v=20260504',
];

// Install — cache jen minimální core shell (idempotentní, robustní)
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CORE_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — lokální shell = cache-first + on-demand fill. Cizí origin (GAS iframe)
// necháme projít na síť (nelze cachovat cross-origin content).
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;  // GAS, Google, QR API

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      // Pokus se stáhnout a uložit do cache (pro offline zásobu ikon, pngek)
      return fetch(e.request).then(function(response) {
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, copy); });
        }
        return response;
      }).catch(function() {
        // Offline a neexistuje v cache — vrať co jde (neblokuj SW)
        return new Response('', { status: 503 });
      });
    })
  );
});
