// service worker 版本号，更新代码时必须修改此版本号才能触发更新
const CACHE_NAME = "neural-train-v1";

// 需要缓存的核心文件列表
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js'
];

// 安装阶段：缓存核心文件
self.addEventListener('install', (event) => {
  console.log('[Service Worker] 正在安装...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] 缓存所有核心文件');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// 激活阶段：清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] 正在激活...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求：优先使用缓存，无缓存则请求网络
self.addEventListener('fetch', (event) => {
  // 忽略非 GET 请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 缓存命中，直接返回缓存
        if (response) {
          return response;
        }
        // 缓存未命中，发起网络请求并缓存结果
        return fetch(event.request).then((res) => {
          if (!res || res.status !== 200 || res.type !== 'basic') {
            return res;
          }
          const responseToCache = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return res;
        });
      })
  );
});

