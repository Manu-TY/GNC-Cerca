const CACHE_NAME = 'gnc-cerca-v2'; // Incrementamos versión
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

// Instalación inmediata
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Borrar archivos viejos de versiones anteriores
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Buscar primero la versión más nueva en internet (Network First)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
