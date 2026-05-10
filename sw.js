// 神经重塑训练 - Service Worker v6.3 (纯净版)
const CACHE_NAME = 'neuro-v63';
const STATIC_ASSETS = [
  './', './index.html', './manifest.json',
  './icons/icon-192x192.png', './icons/icon-512x512.png',
  './icons/maskable-192x192.png', './icons/maskable-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
    .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (url.startsWith('blob:') || url.startsWith('data:')) return;
  if (!url.startsWith(self.location.origin)) return;
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request).catch(() => caches.match('./index.html')))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
