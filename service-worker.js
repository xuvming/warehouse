const CACHE_NAME = "music-app-v1";
const STATIC_FILES = [
  "./",
  "./index.html",
  "./manifest.json"
];

// 安装
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
    .then(cache => cache.addAll(STATIC_FILES))
    .then(() => self.skipWaiting())
  );
});

// 激活接管
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 离线拦截
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});

