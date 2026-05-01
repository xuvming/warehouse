// Service Worker v4.0 - 神经重塑训练（华为锁屏控制最终版）
const CACHE_VERSION = 'neuro-v4.0';
const CACHE_NAME = CACHE_VERSION;
const RUNTIME_CACHE = 'neuro-runtime-v4.0';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js'
];

const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|flac|webm|oga|opus)(\?.*)?$/i;

// ========== 安装 ==========
self.addEventListener('install', (event) => {
  console.log('[SW v4.0] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 缓存核心资源...');
        return Promise.allSettled(
          CORE_ASSETS.map(asset => {
            try {
              const url = new URL(asset, self.location.origin).href;
              return cache.add(url).catch(err => console.warn('[SW] 缓存失败:', asset, err.message));
            } catch (e) {
              return Promise.resolve();
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] 核心资源缓存完成，跳过等待');
        return self.skipWaiting();
      })
  );
});

// ========== 激活 ==========
self.addEventListener('activate', (event) => {
  console.log('[SW v4.0] 激活中...');
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
            .map(key => {
              console.log('[SW] 清理旧缓存:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => {
        console.log('[SW] 激活完成，接管客户端');
        return self.clients.claim();
      })
  );
});

// ========== 请求拦截 ==========
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // 只处理 HTTP/HTTPS 请求
  if (!request.url.startsWith('http')) return;
  
  const url = new URL(request.url);
  
  // 音频文件使用网络优先策略
  if (AUDIO_EXTENSIONS.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // 页面导航使用网络优先策略
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }
  
  // 其他资源使用缓存优先策略
  event.respondWith(cacheFirst(request));
});

// ========== 缓存优先策略 ==========
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // 后台更新缓存
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
      })
      .catch(() => {});
    
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.warn('[SW] 网络请求失败:', request.url);
    return new Response('离线状态，资源不可用', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// ========== 网络优先策略 ==========
async function networkFirst(request, fallbackUrl = null) {
  try {
    const networkResponse = await fetch(request, {
      cache: 'no-cache',
      credentials: 'same-origin'
    });
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    console.log('[SW] 网络请求失败，尝试缓存:', request.url);
  }
  
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;
  
  if (fallbackUrl) {
    try {
      const fallback = await caches.match(new URL(fallbackUrl, self.location.origin).href);
      if (fallback) return fallback;
    } catch (e) {}
  }
  
  return new Response('离线状态，请连接网络后重试', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

// ========== 通知点击处理 ==========
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 通知被点击:', event.action);
  event.notification.close();
  
  const action = event.action || 'default';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // 查找主窗口
        let target = clientList.find(c => c.url.includes(self.location.origin));
        
        if (target && 'focus' in target) {
          target.focus();
        } else if (clients.openWindow) {
          target = clients.openWindow('./index.html');
        }
        
        // 发送媒体操作命令到客户端
        if (target) {
          (target.then ? target : Promise.resolve(target)).then(client => {
            if (client) {
              client.postMessage({
                type: 'MEDIA_ACTION',
                action: action,
                timestamp: Date.now()
              });
            }
          });
        }
      })
  );
});

// ========== 消息处理 ==========
self.addEventListener('message', (event) => {
  if (!event.data) return;
  
  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      caches.keys()
        .then(keys => Promise.all(keys.map(key => caches.delete(key))))
        .then(() => {
          console.log('[SW] 所有缓存已清除');
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ success: true });
          }
        })
        .catch(err => {
          console.error('[SW] 清除缓存失败:', err);
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ success: false, error: err.message });
          }
        });
      break;
      
    case 'GET_VERSION':
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ version: CACHE_VERSION });
      }
      break;
      
    default:
      console.log('[SW] 未知消息类型:', event.data.type);
  }
});

console.log('[SW v4.0] Service Worker 已加载');
