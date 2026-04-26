const CACHE = "player-pwa-final";
const files = [
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(files).then(() => self.skipWaiting()))
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(list => Promise.all(list.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
});

self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))
});

