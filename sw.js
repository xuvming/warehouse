// Service Worker v3.2 - 神经重塑训练
const CACHE_VERSION = 'neuro-remodel-v3.5';
const CACHE_NAME = CACHE_VERSION;
const RUNTIME_CACHE = 'neuro-runtime-v3.5';

// 核心资源列表 - 使用相对路径适配任何部署位置
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js'
];

// 音频文件扩展名匹配（更精确的匹配）
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|flac|webm|oga|opus)(\?.*)?$/i;

// 安装事件
self.addEventListener('install', (event) => {
  console.log('[SW v3.5] 安装中...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 缓存核心资源...');
        return Promise.allSettled(
          CORE_ASSETS.map(asset => {
            // 处理相对路径和绝对路径
            let url;
            try {
              url = new URL(asset, self.location.origin).href;
            } catch (e) {
              url = asset;
            }
            
            return cache.add(url).catch(err => {
              console.warn('[SW] 资源缓存失败:', asset, err.message);
            });
          })
        );
      })
      .then(() => {
        console.log('[SW] 核心资源缓存完成，跳过等待');
        return self.skipWaiting();
      })
  );
});

// 激活事件
self.addEventListener('activate', (event) => {
  console.log('[SW v3.5] 激活中...');
  
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        // 清理旧版本缓存
        const deletePromises = keys
          .filter(key => {
            return key !== CACHE_NAME && 
                   key !== RUNTIME_CACHE && 
                   !key.includes('neuro-remodel');
          })
          .map(key => {
            console.log('[SW] 清理旧缓存:', key);
            return caches.delete(key);
          });
        
        return Promise.all(deletePromises);
      })
      .then(() => {
        console.log('[SW] 激活完成，接管客户端');
        return self.clients.claim();
      })
  );
});

// 请求拦截
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // 只处理 HTTP/HTTPS 请求
  if (!request.url.startsWith('http')) return;
  
  // 跳过 chrome-extension 等非标准协议
  if (!request.url.startsWith('https://') && !request.url.startsWith('http://')) return;
  
  const url = new URL(request.url);
  
  // 音频文件使用网络优先策略
  if (AUDIO_EXTENSIONS.test(url.pathname)) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }
  
  // 页面导航使用网络优先策略
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstStrategy(request, './index.html'));
    return;
  }
  
  // CDN 资源使用缓存优先策略
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirstStrategy(request, CACHE_NAME));
    return;
  }
  
  // 其他资源使用缓存优先策略
  event.respondWith(cacheFirstStrategy(request, CACHE_NAME));
});

// 缓存优先策略
async function cacheFirstStrategy(request, cacheName = CACHE_NAME) {
  // 先尝试从缓存获取
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // 后台更新缓存
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          caches.open(cacheName).then(cache => {
            cache.put(request, response.clone());
          });
        }
      })
      .catch(() => {
        // 后台更新失败，不影响使用缓存
      });
    
    return cachedResponse;
  }
  
  // 缓存未命中，请求网络
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.warn('[SW] 网络请求失败:', request.url);
    
    // 返回离线页面或错误响应
    return new Response('离线状态，资源不可用', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// 网络优先策略
async function networkFirstStrategy(request, fallbackUrl = null) {
  try {
    // 尝试从网络获取
    const networkResponse = await fetch(request, { 
      cache: 'no-cache',
      credentials: 'same-origin'
    });
    
    if (networkResponse && networkResponse.status === 200) {
      // 更新运行时缓存
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    console.log('[SW] 网络请求失败，尝试缓存:', request.url);
  }
  
  // 网络失败，尝试从缓存获取
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // 如果有回退URL，尝试获取
  if (fallbackUrl) {
    try {
      const fullFallbackUrl = new URL(fallbackUrl, self.location.origin).href;
      const fallbackResponse = await caches.match(fullFallbackUrl);
      if (fallbackResponse) {
        return fallbackResponse;
      }
    } catch (e) {
      // 回退URL无效
    }
  }
  
  // 所有策略都失败
  return new Response('离线状态，请连接网络后重试', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

// 消息处理
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

// 通知点击处理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    })
    .then((clientList) => {
      // 如果已有打开的窗口，聚焦它
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // 否则打开新窗口
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});

// 推送事件处理（预留）
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body || '训练提醒',
      icon: data.icon || 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">' +
        '<rect width="192" height="192" rx="32" fill="#00d4aa"/>' +
        '<text x="50%" y="50%" font-size="100" text-anchor="middle" dominant-baseline="middle" fill="#1a1a2e">🧠</text>' +
        '</svg>'
      ),
      badge: data.badge,
      tag: data.tag || 'neuro-training',
      data: data.data || {},
      vibrate: data.vibrate || [200, 100, 200],
      requireInteraction: data.requireInteraction || false
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || '神经重塑训练', options)
    );
  } catch (e) {
    console.error('[SW] 推送通知处理失败:', e);
  }
});

console.log('[SW v3.5] Service Worker 已加载');
