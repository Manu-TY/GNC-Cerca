const CACHE_NAME = 'gnc-cerca-v7'; // Versión 5 para forzar la actualización
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

// Instalación inmediata del Service Worker
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Borrar automáticamente archivos guardados de versiones anteriores
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

// Estrategia Network First: Prioriza siempre buscar la versión más nueva en internet
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
