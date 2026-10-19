// Luncher PE — Service Worker (PWA shell cache).
// Standalone repo `luncher` (od 2026-05-05) — wrapper kolem GAS app
// (script.google.com/.../macros/...) v iframu. Shell cache = jen statické
// soubory v tomto repu, GAS content je cross-origin (necachuje SW).
//
// Bump CACHE_NAME při změně shell content (index.html, manifest, ikony).
// Activate handler smaže staré cache klíče → user dostane fresh shell.
//
// v11 — 2026-10-19: stejná kúra jako Jídlogic SW v33 (menza-jidlog 38e354c),
// kde mrtvá položka v CORE_SHELL přes atomický cache.addAll() zablokovala
// instalaci každé nové verze SW. Tady žádná mrtvá položka nebyla, ale
// prevence:
//   1. install cachuje soubory PO JEDNOM (jeden 404 nezablokuje aktualizaci),
//   2. navigace NETWORK-FIRST (cache jen offline fallback): nový index.html
//      hned, bez „1-2 restartů navíc" jako dřív u cache-first.
var CACHE_NAME = 'luncher-shell-v11';
var CORE_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'icon.svg?v=20260504',
  'apple-touch-icon.png?v=20260504',
  'icon-192.png?v=20260504',
  'icon-512.png?v=20260504',
];

// Install — cache core shell PO JEDNOM (ne atomický addAll): chybějící soubor
// se jen zaloguje a nikdy nezablokuje instalaci nového SW.
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(CORE_SHELL.map(function(url) {
        return cache.add(url).catch(function(err) {
          console.warn('SW install: nepodařilo se cachovat ' + url, err);
        });
      }));
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

// Fetch — navigace (HTML shell) NETWORK-FIRST s cache fallbackem pro offline;
// ostatní lokální assety cache-first + on-demand fill. Cizí origin (GAS iframe)
// necháme projít na síť (nelze cachovat cross-origin content).
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;  // GAS, Google, QR API

  // Navigace: vždy zkusit síť (GH Pages posílá max-age=600, takže rychlé).
  // Do cache pod adresou BEZ query: ?vote=ID by jinak pro každé hlasování
  // založilo vlastní záznam. Offline se vrátí uložený shell.
  if (e.request.mode === 'navigate') {
    var shellKey = url.origin + url.pathname;
    e.respondWith(
      fetch(e.request).then(function(response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(shellKey, copy); });
        }
        return response;
      }).catch(function() {
        return caches.match(shellKey).then(function(cached) {
          return cached || caches.match('index.html');
        });
      })
    );
    return;
  }

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
