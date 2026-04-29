const CACHE_NAME = 'neural-remodel-v1';
// 需要缓存的核心文件（因为是根目录，直接用相对路径或绝对路径 / ）
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
                console.log('[Service Worker] 缓存已打开');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                // 跳过等待，强制激活
                return self.skipWaiting();
            })
    );
});

// 激活阶段：清理旧缓存
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] 已激活');
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
        }).then(() => self.clients.claim()) // 立即接管页面
    );
});

// 拦截网络请求：优先使用缓存，离线也能显示
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // 如果缓存里有，直接返回缓存
                if (response) {
                    return response;
                }
                
                // 如果没有缓存，去网络获取
                return fetch(event.request)
                    .then((networkResponse) => {
                        // 检查是否是有效的响应
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }
                        
                        // 克隆响应（因为流只能读取一次）
                        const responseToCache = networkResponse.clone();
                        
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                            
                        return networkResponse;
                    });
            })
    );
});

