const CACHE_NAME = 'neuro-v8.0.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './cover.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.protocol === 'chrome-extension:' || url.protocol === 'blob:' || url.protocol === 'data:') return;
  if (request.destination === 'audio' || url.pathname.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok && networkResponse.status !== 206) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
