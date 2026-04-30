// 优化版 sw.js - v3.1
const CACHE_VERSION = 'neuro-remodel-v3.1';
const CACHE_NAME = CACHE_VERSION;
const RUNTIME_CACHE = 'neuro-runtime-v3.1';

// 核心资源（使用相对路径）
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js'
];

// 音频文件扩展名
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i;

// ========== 安装事件 ==========
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 缓存核心资源');
        return Promise.allSettled(
          CORE_ASSETS.map(asset => {
            try {
              const url = new URL(asset, self.location.origin);
              return cache.add(url.href).catch(err => {
                console.warn('[SW] 资源缓存失败（可忽略）:', asset, err.message);
              });
            } catch (e) {
              console.warn('[SW] 无效URL:', asset);
              return Promise.resolve();
            }
          })
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
            .filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE && key !== CACHE_VERSION)
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
  const { request } = event;
  
  // 仅处理 HTTP/HTTPS 请求
  if (!request.url.startsWith('http')) return;
  
  const url = new URL(request.url);
  
  // 对音频文件使用 Network First 策略
  if (AUDIO_EXTENSIONS.test(url.pathname)) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }
  
  // 对导航请求使用 Network First
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstStrategy(request, './index.html'));
    return;
  }
  
  // 对其他资源使用 Cache First 策略
  event.respondWith(cacheFirstStrategy(request));
});

// ========== 缓存策略 ==========

// Cache First（优先使用缓存）
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // 后台更新缓存
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, response.clone());
          });
        }
      })
      .catch(() => {});
      
    return cachedResponse;
  }
  
  // 无缓存，请求网络
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.warn('[SW] 网络请求失败:', request.url, error.message);
    return new Response('离线不可用', { status: 503 });
  }
}

// Network First（优先使用网络，适合音频文件）
async function networkFirstStrategy(request, fallbackUrl) {
  try {
    const networkResponse = await fetch(request, { 
      cache: 'no-cache',
      // 音频文件设置超时
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
    });
    
    if (networkResponse && networkResponse.status === 200) {
      // 更新缓存
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    console.warn('[SW] 网络请求失败，尝试缓存:', request.url, error.message);
  }
  
  // 网络失败，尝试缓存
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // 如果有 fallback URL，尝试返回
  if (fallbackUrl) {
    const fallback = await caches.match(fallbackUrl);
    if (fallback) return fallback;
  }
  
  return new Response('离线不可用', { status: 503 });
}

// ========== 消息处理 ==========
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => caches.delete(key)));
    }).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});
