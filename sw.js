// 优化版 sw.js（仅调整 CORE_ASSETS 消除冗余缓存）
const CACHE_NAME = 'neuro-remodel-v3';
// 优化点：删除重复的 '/' 路径，仅保留 '/index.html' 作为首页入口
const CORE_ASSETS = [
  '/index.html',          // 首页（替代原有的 '/' 和 '/index.html' 重复项）
  '/manifest.json',       // 应用元数据
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',  // 图表库
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js'     // 拖拽库
];

// ========== 安装事件 ==========
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 缓存核心资源');
        // 逐个缓存，失败不阻断安装
        return Promise.allSettled(
          CORE_ASSETS.map(asset =>
            cache.add(asset).catch(err => {
              console.warn('[SW] 资源缓存失败（可忽略）:', asset, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] 安装完成，立即激活');
        return self.skipWaiting();
      })
  );
});

// ========== 激活事件 ==========
self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log('[SW] 清理旧缓存:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => {
        console.log('[SW] 接管所有页面');
        return self.clients.claim();
      })
  );
});

// ========== 请求拦截 ==========
self.addEventListener('fetch', (event) => {
  // 仅处理 HTTP/HTTPS 请求
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 有缓存：立即返回，同时后台更新
      if (cachedResponse) {
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse.clone());
              });
            }
          })
          .catch(() => {}); // 后台更新失败不影响
        return cachedResponse;
      }

      // 无缓存：请求网络
      return fetch(event.request)
        .then((networkResponse) => {
          // 缓存成功的响应
          if (networkResponse && networkResponse.status === 200) {
            const cloned = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, cloned);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // 完全离线且无缓存
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html'); //  fallback 到缓存的首页
          }
          return new Response('离线不可用', { status: 503 });
        });
    })
  );
});

