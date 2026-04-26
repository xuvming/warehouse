const CACHE_NAME = 'player-pwa-v1';
// 只缓存核心页面+清单，不用缓存外部图标
const urlsToCache = [
  "/warehouse/index.html",
  "/warehouse/manifest.json"
];

// 安装缓存
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// 激活清理旧缓存
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 离线请求拦截
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(cacheRes => cacheRes || fetch(event.request))
  );
});

